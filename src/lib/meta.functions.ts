import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listMyMetaAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("meta_accounts")
      .select("id, company_id, client_id, business_name, ad_account_id, ad_account_name, currency, timezone, status, last_synced_at, last_sync_error, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listPendingBusinesses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rowId: string }) => z.object({ rowId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("meta_accounts").select("id, access_token").eq("id", data.rowId).maybeSingle();
    if (error || !row?.access_token) throw new Error("Account not connected");
    const meta = await import("./meta-api.server");
    const [businesses, accounts] = await Promise.all([
      meta.listBusinesses(row.access_token).catch(() => []),
      meta.listAllAdAccounts(row.access_token).catch(() => []),
    ]);
    return { businesses, accounts };
  });

export const listBusinessAdAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rowId: string; businessId: string }) =>
    z.object({ rowId: z.string().uuid(), businessId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("meta_accounts").select("access_token").eq("id", data.rowId).maybeSingle();
    if (error || !row?.access_token) throw new Error("Account not connected");
    const meta = await import("./meta-api.server");
    return meta.listAdAccountsForBusiness(row.access_token, data.businessId);
  });

export const selectAdAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    rowId: string; businessId?: string | null; businessName?: string | null;
    adAccountId: string; adAccountName: string; currency: string; timezone?: string | null;
  }) => z.object({
    rowId: z.string().uuid(),
    businessId: z.string().nullable().optional(),
    businessName: z.string().nullable().optional(),
    adAccountId: z.string(),
    adAccountName: z.string(),
    currency: z.string(),
    timezone: z.string().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("meta_accounts").update({
      business_id: data.businessId ?? null,
      business_name: data.businessName ?? null,
      ad_account_id: data.adAccountId,
      ad_account_name: data.adAccountName,
      currency: data.currency,
      timezone: data.timezone ?? null,
      status: "active",
    }).eq("id", data.rowId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const disconnectMetaAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rowId: string }) => z.object({ rowId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("meta_accounts")
      .update({ status: "disconnected", access_token: null }).eq("id", data.rowId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const linkClientToMetaAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rowId: string; clientId: string | null }) =>
    z.object({ rowId: z.string().uuid(), clientId: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("meta_accounts")
      .update({ client_id: data.clientId }).eq("id", data.rowId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const syncMetaAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rowId: string; days?: number }) =>
    z.object({ rowId: z.string().uuid(), days: z.number().int().min(1).max(180).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const days = data.days ?? 30;
    const { data: row, error } = await context.supabase
      .from("meta_accounts")
      .select("id, access_token, ad_account_id, currency, status")
      .eq("id", data.rowId).maybeSingle();
    if (error || !row) throw new Error("Account not found");
    if (!row.access_token || !row.ad_account_id) throw new Error("Account not fully connected");

    const meta = await import("./meta-api.server");
    const db = context.supabase;

    const { data: logRow } = await db.from("meta_sync_log").insert({
      meta_account_id: row.id, status: "running",
    }).select("id").single();

    await db.from("meta_accounts").update({ last_sync_error: null }).eq("id", row.id);

    try {
      const campaigns = await meta.listCampaigns(row.access_token, row.ad_account_id).catch(() => []);
      let rows = 0;

      // upsert campaigns
      if (campaigns.length) {
        const payload = campaigns.map(c => ({
          meta_account_id: row.id,
          campaign_id: c.id,
          name: c.name,
          objective: c.objective,
          status: c.status,
          daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
          lifetime_budget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
          start_time: c.start_time ?? null,
          stop_time: c.stop_time ?? null,
        }));
        const { error: upErr } = await db.from("meta_campaigns")
          .upsert(payload, { onConflict: "meta_account_id,campaign_id" });
        if (upErr) throw upErr;
        rows += payload.length;
      }

      // load id map
      const { data: dbCampaigns } = await db.from("meta_campaigns")
        .select("id, campaign_id").eq("meta_account_id", row.id);
      const idMap = new Map((dbCampaigns ?? []).map((c: { campaign_id: string; id: string }) => [c.campaign_id, c.id]));

      // insights (campaign-level)
      let insightsWarning: string | null = null;
      const insights = await meta.getCampaignInsights(row.access_token, row.ad_account_id, days)
        .catch((e: unknown) => {
          insightsWarning = `campaign insights: ${e instanceof Error ? e.message : String(e)}`;
          console.error("[meta-sync] campaign insights failed", row.ad_account_id, e);
          return [] as Awaited<ReturnType<typeof meta.getCampaignInsights>>;
        });
      console.log("[meta-sync]", row.ad_account_id, "campaigns:", campaigns.length, "insights rows:", insights.length);
      if (insights.length) {
        const payload = insights.map(i => {
          const leads = meta.leadsFromActions(i.actions);
          const spend = Number(i.spend ?? 0);
          return {
            meta_account_id: row.id,
            campaign_id: idMap.get(i.campaign_id)!,
            date: i.date_start,
            spend,
            reach: Number(i.reach ?? 0),
            impressions: Number(i.impressions ?? 0),
            clicks: Number(i.clicks ?? 0),
            ctr: Number(i.ctr ?? 0),
            cpc: Number(i.cpc ?? 0),
            cpm: Number(i.cpm ?? 0),
            leads,
            cost_per_lead: leads > 0 ? spend / leads : 0,
            purchase_value: meta.purchaseValueFromActions(i.action_values),
            actions: i.actions ?? null,
          };
        }).filter(p => p.campaign_id);
        if (payload.length) {
          const { error: insErr } = await db.from("meta_campaign_insights")
            .upsert(payload, { onConflict: "campaign_id,date" });
          if (insErr) throw insErr;
          rows += payload.length;
        }
      }

      // account-level daily spend (90 days)
      const daily = await meta.getAccountDailySpend(row.access_token, row.ad_account_id, 90).catch(() => []);
      if (daily.length) {
        const payload = daily.map(d => ({
          meta_account_id: row.id,
          date: d.date_start,
          spend: Number(d.spend ?? 0),
          impressions: Number(d.impressions ?? 0),
          clicks: Number(d.clicks ?? 0),
          reach: Number(d.reach ?? 0),
          leads: meta.leadsFromActions(d.actions),
          currency: row.currency,
        }));
        const { error: spErr } = await db.from("meta_ad_spend_history")
          .upsert(payload, { onConflict: "meta_account_id,date" });
        if (spErr) throw spErr;
        rows += payload.length;
      }

      await db.from("meta_accounts")
        .update({ last_synced_at: new Date().toISOString(), last_sync_error: null }).eq("id", row.id);
      if (logRow) await db.from("meta_sync_log")
        .update({ status: "success", finished_at: new Date().toISOString(), rows_synced: rows }).eq("id", logRow.id);

      return { ok: true, rows };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.from("meta_accounts")
        .update({ last_sync_error: msg }).eq("id", row.id);
      if (logRow) await db.from("meta_sync_log")
        .update({ status: "error", error: msg, finished_at: new Date().toISOString() }).eq("id", logRow.id);
      throw new Error(msg);
    }
  });

export const getMetaDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rowId: string; days?: number }) =>
    z.object({ rowId: z.string().uuid(), days: z.number().int().min(1).max(180).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const days = data.days ?? 30;
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    const [accRes, campRes, insRes, spendRes] = await Promise.all([
      context.supabase.from("meta_accounts").select("*").eq("id", data.rowId).maybeSingle(),
      context.supabase.from("meta_campaigns").select("*").eq("meta_account_id", data.rowId),
      context.supabase.from("meta_campaign_insights").select("*").eq("meta_account_id", data.rowId).gte("date", since).order("date"),
      context.supabase.from("meta_ad_spend_history").select("*").eq("meta_account_id", data.rowId).order("date"),
    ]);
    if (accRes.error) throw new Error(accRes.error.message);

    const insights = insRes.data ?? [];
    const spendHistory = (spendRes.data ?? []).filter(r => r.date >= since);
    const sumI = (k: keyof typeof insights[number]) => insights.reduce((a, r) => a + Number(r[k] ?? 0), 0);
    const sumS = (k: keyof typeof spendHistory[number]) => spendHistory.reduce((a, r) => a + Number(r[k] ?? 0), 0);

    // Prefer account-level spend_history when insights are missing (large accounts often return empty campaign insights).
    const hasInsights = insights.length > 0;
    const spend = hasInsights ? sumI("spend") : sumS("spend");
    const reach = hasInsights ? sumI("reach") : sumS("reach");
    const impressions = hasInsights ? sumI("impressions") : sumS("impressions");
    const clicks = hasInsights ? sumI("clicks") : sumS("clicks");
    const leads = hasInsights ? sumI("leads") : sumS("leads");
    const purchaseValue = hasInsights ? sumI("purchase_value") : 0;

    return {
      account: accRes.data,
      campaigns: campRes.data ?? [],
      insights,
      spendHistory: spendRes.data ?? [],
      kpis: {
        spend,
        activeCampaigns: (campRes.data ?? []).filter(c => c.status === "ACTIVE").length,
        reach,
        impressions,
        clicks,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        leads,
        cpl: leads > 0 ? spend / leads : 0,
        roas: spend > 0 ? purchaseValue / spend : 0,
      },
    };
  });

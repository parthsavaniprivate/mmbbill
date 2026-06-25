// Server-only Meta Graph API helpers. Never import from client code.
const GRAPH = "https://graph.facebook.com/v21.0";

export type FbBusiness = { id: string; name: string };
export type FbAdAccount = {
  id: string;            // act_XXXX
  account_id: string;    // XXXX
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number;
};

async function gget<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${GRAPH}${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok || j.error) {
    const msg = j.error?.message || `Meta API ${r.status}`;
    console.error("[meta-api]", path, r.status, JSON.stringify(j.error ?? j).slice(0, 500));
    throw new Error(msg);
  }
  return j as T;
}

// Paginate through Graph API `data` arrays via the `paging.next` cursor.
async function ggetAll<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T[]> {
  const first = new URL(`${GRAPH}${path}`);
  first.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) first.searchParams.set(k, v);
  let next: string | null = first.toString();
  const out: T[] = [];
  let pages = 0;
  while (next && pages < 50) {
    const r = await fetch(next);
    const j: { data?: T[]; error?: { message?: string }; paging?: { next?: string } } = await r.json();
    if (!r.ok || j.error) {
      console.error("[meta-api]", path, r.status, JSON.stringify(j.error ?? j).slice(0, 500));
      throw new Error(j.error?.message || `Meta API ${r.status}`);
    }
    if (j.data?.length) out.push(...j.data);
    next = j.paging?.next ?? null;
    pages++;
  }
  return out;
}

export async function exchangeCodeForToken(opts: {
  code: string; redirectUri: string; appId: string; appSecret: string;
}): Promise<{ access_token: string; expires_in?: number }> {
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set("client_id", opts.appId);
  url.searchParams.set("client_secret", opts.appSecret);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("code", opts.code);
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error?.message || "Token exchange failed");
  return j;
}

export async function exchangeLongLivedToken(opts: {
  shortToken: string; appId: string; appSecret: string;
}): Promise<{ access_token: string; expires_in?: number }> {
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", opts.appId);
  url.searchParams.set("client_secret", opts.appSecret);
  url.searchParams.set("fb_exchange_token", opts.shortToken);
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error?.message || "Long-lived token failed");
  return j;
}

export async function getMe(token: string) {
  return gget<{ id: string; name: string }>(`/me`, token, { fields: "id,name" });
}

export async function listBusinesses(token: string) {
  const j = await gget<{ data: FbBusiness[] }>(`/me/businesses`, token, { fields: "id,name", limit: "100" });
  return j.data ?? [];
}

export async function listAdAccountsForBusiness(token: string, businessId: string) {
  const fields = "id,account_id,name,currency,timezone_name,account_status";
  const owned = await gget<{ data: FbAdAccount[] }>(`/${businessId}/owned_ad_accounts`, token, { fields, limit: "200" });
  const client = await gget<{ data: FbAdAccount[] }>(`/${businessId}/client_ad_accounts`, token, { fields, limit: "200" })
    .catch(() => ({ data: [] as FbAdAccount[] }));
  const all = [...(owned.data ?? []), ...(client.data ?? [])];
  const dedup = new Map(all.map(a => [a.id, a]));
  return Array.from(dedup.values());
}

export async function listAllAdAccounts(token: string) {
  const fields = "id,account_id,name,currency,timezone_name,account_status";
  const j = await gget<{ data: FbAdAccount[] }>(`/me/adaccounts`, token, { fields, limit: "200" });
  return j.data ?? [];
}

export type CampaignRow = {
  id: string; name: string; objective: string; status: string;
  daily_budget?: string; lifetime_budget?: string;
  start_time?: string; stop_time?: string;
};

export async function listCampaigns(token: string, adAccountId: string) {
  const fields = "id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time";
  const j = await gget<{ data: CampaignRow[] }>(`/${adAccountId}/campaigns`, token, { fields, limit: "500" });
  return j.data ?? [];
}

export type InsightRow = {
  campaign_id: string;
  date_start: string;
  spend?: string;
  reach?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
};

export async function getCampaignInsights(token: string, adAccountId: string, days = 30) {
  const fields = "campaign_id,spend,reach,impressions,clicks,ctr,cpc,cpm,actions,action_values,cost_per_action_type";
  return ggetAll<InsightRow>(`/${adAccountId}/insights`, token, {
    level: "campaign",
    fields,
    time_increment: "1",
    date_preset: days <= 7 ? "last_7d" : days <= 30 ? "last_30d" : "last_90d",
    limit: "500",
  });
}

export async function getAccountDailySpend(token: string, adAccountId: string, days = 90) {
  return ggetAll<InsightRow>(`/${adAccountId}/insights`, token, {
    fields: "spend,impressions,clicks,reach,actions,cost_per_action_type",
    time_increment: "1",
    date_preset: days <= 30 ? "last_30d" : days <= 90 ? "last_90d" : "maximum",
    limit: "500",
  });
}

export function leadsFromActions(actions?: { action_type: string; value: string }[]) {
  if (!actions) return 0;
  let total = 0;
  for (const a of actions) {
    if (a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped" || a.action_type.endsWith(".lead")) {
      total += Number(a.value) || 0;
    }
  }
  return total;
}

export function purchaseValueFromActions(actions?: { action_type: string; value: string }[]) {
  if (!actions) return 0;
  let total = 0;
  for (const a of actions) {
    if (a.action_type === "purchase" || a.action_type === "omni_purchase") {
      total += Number(a.value) || 0;
    }
  }
  return total;
}

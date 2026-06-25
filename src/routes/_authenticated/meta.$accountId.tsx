import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMetaDashboard, syncMetaAccount } from "@/lib/meta.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from "recharts";
import {
  ArrowLeft, RefreshCw, Download, Wallet, Megaphone, Eye, BarChart3, MousePointerClick,
  TrendingUp, TrendingDown, DollarSign, Radio, Target, Flame, Rocket, Trophy, Activity,
  Search, Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { formatDate, downloadCSV } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/meta/$accountId")({
  component: MetaDashboard,
});

function fmtMoney(n: number, currency = "INR") {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(n); }
  catch { return n.toFixed(0); }
}
function fmtNum(n: number) { return new Intl.NumberFormat("en-IN").format(Math.round(n)); }
function pct(n: number) { return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`; }

// Card chrome
const glass = "border-border/60 bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/50 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_8px_24px_-12px_rgba(0,0,0,0.5)]";

function EmptyChart({ label = "No data available" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-muted-foreground py-10 gap-2">
      <div className="size-12 rounded-full bg-muted/50 grid place-items-center">
        <Inbox className="size-5 opacity-60" />
      </div>
      <div className="text-xs">{label}</div>
    </div>
  );
}

function scoreColor(score: number) {
  if (score >= 75) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (score >= 50) return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  if (score >= 25) return "bg-orange-500/15 text-orange-400 border-orange-500/30";
  return "bg-rose-500/15 text-rose-400 border-rose-500/30";
}

function spendBarColor(spend: number, max: number) {
  const r = max > 0 ? spend / max : 0;
  if (r >= 0.66) return "#22c55e";
  if (r >= 0.33) return "#eab308";
  return "#ef4444";
}

function MetaDashboard() {
  const { accountId } = Route.useParams();
  const [days, setDays] = useState<number>(30);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"spend" | "leads" | "ctr" | "cpl">("spend");

  const dash = useServerFn(getMetaDashboard);
  const sync = useServerFn(syncMetaAccount);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["meta-dash", accountId, days],
    queryFn: () => dash({ data: { rowId: accountId, days } }),
  });

  const syncMut = useMutation({
    mutationFn: () => sync({ data: { rowId: accountId, days } }),
    onSuccess: (r) => { toast.success(`Synced ${r.rows} rows`); qc.invalidateQueries({ queryKey: ["meta-dash", accountId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const derived = useMemo(() => {
    if (!data) return null;
    const { campaigns, insights, spendHistory } = data;

    // Aggregate per-day across campaigns (from insights — current period)
    const daily = new Map<string, { date: string; spend: number; leads: number; clicks: number; impressions: number }>();
    for (const r of insights) {
      const cur = daily.get(r.date) || { date: r.date, spend: 0, leads: 0, clicks: 0, impressions: 0 };
      cur.spend += Number(r.spend ?? 0);
      cur.leads += Number(r.leads ?? 0);
      cur.clicks += Number(r.clicks ?? 0);
      cur.impressions += Number(r.impressions ?? 0);
      daily.set(r.date, cur);
    }
    let dailyArr = Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date));
    // Fall back to account-level spend history when insights are empty
    if (!dailyArr.length) {
      dailyArr = (spendHistory ?? [])
        .map(r => ({
          date: r.date,
          spend: Number(r.spend ?? 0),
          leads: Number(r.leads ?? 0),
          clicks: Number(r.clicks ?? 0),
          impressions: Number(r.impressions ?? 0),
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-days);
    }

    // Period buckets from spendHistory
    const today = new Date().toISOString().slice(0, 10);
    const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const since7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const since30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    let todaySpend = 0, yestSpend = 0, last7 = 0, last30 = 0, lifetime = 0;
    for (const r of spendHistory ?? []) {
      const s = Number(r.spend ?? 0);
      lifetime += s;
      if (r.date === today) todaySpend += s;
      if (r.date === yest) yestSpend += s;
      if (r.date >= since7) last7 += s;
      if (r.date >= since30) last30 += s;
    }

    // Monthly
    const monthly = new Map<string, { month: string; spend: number; leads: number }>();
    for (const r of spendHistory ?? []) {
      const m = r.date.slice(0, 7);
      const cur = monthly.get(m) || { month: m, spend: 0, leads: 0 };
      cur.spend += Number(r.spend ?? 0);
      cur.leads += Number(r.leads ?? 0);
      monthly.set(m, cur);
    }
    const monthlyArr = Array.from(monthly.values()).sort((a, b) => a.month.localeCompare(b.month));

    // Previous period comparison (for trend %)
    const half = Math.max(1, Math.floor(dailyArr.length / 2));
    const recent = dailyArr.slice(-half);
    const prior = dailyArr.slice(0, dailyArr.length - half);
    const sumK = (arr: typeof dailyArr, k: keyof (typeof dailyArr)[number]) =>
      arr.reduce((a, r) => a + Number(r[k] as number ?? 0), 0);
    const trend = (k: keyof (typeof dailyArr)[number]) => {
      const a = sumK(recent, k), b = sumK(prior, k);
      if (!b) return a > 0 ? 100 : 0;
      return ((a - b) / b) * 100;
    };

    // Per campaign
    const perCamp = new Map<string, { name: string; spend: number; leads: number; clicks: number; impressions: number; status: string }>();
    for (const c of campaigns) perCamp.set(c.id, { name: c.name ?? "—", spend: 0, leads: 0, clicks: 0, impressions: 0, status: c.status ?? "—" });
    for (const r of insights) {
      const c = perCamp.get(r.campaign_id);
      if (!c) continue;
      c.spend += Number(r.spend ?? 0);
      c.leads += Number(r.leads ?? 0);
      c.clicks += Number(r.clicks ?? 0);
      c.impressions += Number(r.impressions ?? 0);
    }
    const campArr = Array.from(perCamp.entries()).map(([id, v]) => {
      const ctr = v.impressions ? (v.clicks / v.impressions) * 100 : 0;
      const cpl = v.leads ? v.spend / v.leads : 0;
      // Heuristic performance score 0-100: 60% CTR + 40% lead efficiency
      const ctrScore = Math.min(100, ctr * 25); // 4% CTR -> 100
      const cplScore = v.leads > 0 ? Math.max(0, 100 - Math.min(100, cpl / 5)) : 0; // 500 cpl -> 0
      const score = Math.round(ctrScore * 0.6 + cplScore * 0.4);
      return { id, ...v, ctr, cpl, score };
    });

    const withSpend = campArr.filter(c => c.spend > 0);
    const withLeads = campArr.filter(c => c.leads > 0);
    const highlights = {
      topSpend: withSpend.sort((a, b) => b.spend - a.spend)[0],
      topCTR: campArr.slice().sort((a, b) => b.ctr - a.ctr).find(c => c.impressions > 0),
      topLeads: withLeads.slice().sort((a, b) => b.leads - a.leads)[0],
      bestCPL: withLeads.slice().sort((a, b) => a.cpl - b.cpl)[0],
      worst: withSpend.slice().sort((a, b) => a.score - b.score)[0],
    };

    return {
      dailyArr, monthlyArr, campArr,
      periods: { todaySpend, yestSpend, last7, last30, lifetime },
      trends: {
        spend: trend("spend"),
        clicks: trend("clicks"),
        leads: trend("leads"),
        impressions: trend("impressions"),
      },
      highlights,
    };
  }, [data, days]);

  if (isLoading || !data || !derived) return <div className="text-muted-foreground">Loading…</div>;
  const { account, kpis, insights, campaigns } = data;
  if (!account) return <div>Account not found</div>;
  const currency = account.currency || "INR";
  const { dailyArr, monthlyArr, campArr, periods, trends, highlights } = derived;

  const maxCampSpend = Math.max(0, ...campArr.map(c => c.spend));
  const topCamps = campArr.slice().sort((a, b) => b.spend - a.spend).slice(0, 12)
    .map(c => ({ ...c, fill: spendBarColor(c.spend, maxCampSpend) }));

  // KPI cards w/ icons + trend + sparkline source
  const sparkData = dailyArr.length ? dailyArr : [];
  const kpiCards: { label: string; value: string; icon: typeof Wallet; trendVal?: number; sparkKey?: keyof (typeof dailyArr)[number]; tint: string }[] = [
    { label: "Total Spend", value: fmtMoney(kpis.spend, currency), icon: Wallet, trendVal: trends.spend, sparkKey: "spend", tint: "#3b82f6" },
    { label: "Active Campaigns", value: fmtNum(kpis.activeCampaigns), icon: Megaphone, tint: "#a78bfa" },
    { label: "Reach", value: fmtNum(kpis.reach), icon: Eye, tint: "#06b6d4" },
    { label: "Impressions", value: fmtNum(kpis.impressions), icon: BarChart3, trendVal: trends.impressions, sparkKey: "impressions", tint: "#0ea5e9" },
    { label: "Clicks", value: fmtNum(kpis.clicks), icon: MousePointerClick, trendVal: trends.clicks, sparkKey: "clicks", tint: "#22d3ee" },
    { label: "CTR", value: `${kpis.ctr.toFixed(2)}%`, icon: TrendingUp, tint: "#10b981" },
    { label: "CPC", value: fmtMoney(kpis.cpc, currency), icon: DollarSign, tint: "#f59e0b" },
    { label: "CPM", value: fmtMoney(kpis.cpm, currency), icon: Radio, tint: "#f97316" },
    { label: "Leads", value: fmtNum(kpis.leads), icon: Target, trendVal: trends.leads, sparkKey: "leads", tint: "#22c55e" },
    { label: "Cost / Lead", value: kpis.leads ? fmtMoney(kpis.cpl, currency) : "—", icon: Flame, tint: "#ef4444" },
    { label: "ROAS", value: `${kpis.roas.toFixed(2)}x`, icon: Rocket, tint: "#8b5cf6" },
  ];

  // Campaign table filter/sort
  const filteredCamps = campArr
    .filter(c => (statusFilter === "all" ? true : c.status === statusFilter))
    .filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "spend") return b.spend - a.spend;
      if (sortBy === "leads") return b.leads - a.leads;
      if (sortBy === "ctr") return b.ctr - a.ctr;
      return (a.cpl || Infinity) - (b.cpl || Infinity);
    });

  const statusBadge = (s: string) => {
    if (s === "ACTIVE") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    if (s === "PAUSED") return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    return "bg-muted/40 text-muted-foreground border-border/60";
  };

  const chartAxisColor = "var(--muted-foreground)";
  const chartGridColor = "var(--border)";
  const chartLabelColor = "var(--foreground)";
  const tooltipStyle = {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--popover-foreground)",
    fontSize: 12,
  };
  const tooltipTextStyle = { color: "var(--popover-foreground)" };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link to="/meta"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{account.ad_account_name || account.ad_account_id}</h1>
            <p className="text-sm text-muted-foreground">
              {account.business_name ?? "Personal"} · {currency} · Last synced {account.last_synced_at ? formatDate(account.last_synced_at) : "never"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
            <RefreshCw className={`w-4 h-4 ${syncMut.isPending ? "animate-spin" : ""}`} /> Sync now
          </Button>
        </div>
      </div>

      {/* Period spend row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Today", val: periods.todaySpend },
          { label: "Yesterday", val: periods.yestSpend },
          { label: "Last 7 days", val: periods.last7 },
          { label: "Last 30 days", val: periods.last30 },
          { label: "Lifetime", val: periods.lifetime },
        ].map(p => (
          <Card key={p.label} className={glass}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{p.label}</div>
              <div className="text-lg font-semibold mt-1 tabular-nums">{fmtMoney(p.val, currency)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* KPI cards w/ icons + sparkline */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {kpiCards.map((c) => {
          const Icon = c.icon;
          const trendUp = (c.trendVal ?? 0) >= 0;
          return (
            <Card key={c.label} className={glass + " overflow-hidden relative"}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="size-8 rounded-md grid place-items-center" style={{ background: `${c.tint}22`, color: c.tint }}>
                    <Icon className="size-4" />
                  </div>
                  {typeof c.trendVal === "number" && (
                    <span className={`text-[10px] inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border ${trendUp ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-rose-400 border-rose-500/30 bg-rose-500/10"}`}>
                      {trendUp ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                      {pct(c.trendVal)}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-3">{c.label}</div>
                <div className="text-xl font-semibold mt-0.5 tabular-nums">{c.value}</div>
                {c.sparkKey && sparkData.length > 1 && (
                  <div className="h-8 -mx-1 mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={sparkData}>
                        <Line type="monotone" dataKey={c.sparkKey} stroke={c.tint} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="debug">Debug</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: "Top Performing", c: highlights.topSpend, icon: Trophy, tint: "#22c55e", metric: highlights.topSpend && fmtMoney(highlights.topSpend.spend, currency) },
              { label: "Highest CTR", c: highlights.topCTR, icon: TrendingUp, tint: "#06b6d4", metric: highlights.topCTR && `${highlights.topCTR.ctr.toFixed(2)}%` },
              { label: "Most Leads", c: highlights.topLeads, icon: Target, tint: "#a78bfa", metric: highlights.topLeads && fmtNum(highlights.topLeads.leads) },
              { label: "Best CPL", c: highlights.bestCPL, icon: Flame, tint: "#f59e0b", metric: highlights.bestCPL && fmtMoney(highlights.bestCPL.cpl, currency) },
              { label: "Needs Attention", c: highlights.worst, icon: Activity, tint: "#ef4444", metric: highlights.worst && `Score ${highlights.worst.score}` },
            ].map(h => {
              const Icon = h.icon;
              return (
                <Card key={h.label} className={glass}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon className="size-3.5" style={{ color: h.tint }} /> {h.label}
                    </div>
                    <div className="mt-2 text-sm font-medium line-clamp-2 min-h-[2.5rem]">{h.c?.name ?? "—"}</div>
                    <div className="text-lg font-semibold tabular-nums" style={{ color: h.tint }}>{h.metric ?? "—"}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card className={glass}>
              <CardContent className="p-4">
                <div className="text-sm font-medium mb-2">Daily Spend</div>
                {dailyArr.length ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={dailyArr} margin={{ left: -10, right: 8, top: 8 }}>
                      <defs>
                        <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.7} />
                          <stop offset="100%" stopColor="#06B6D4" stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="spendStroke" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#3B82F6" />
                          <stop offset="100%" stopColor="#06B6D4" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} opacity={0.45} />
                      <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} stroke={chartAxisColor} tick={{ fill: chartAxisColor }} />
                      <YAxis fontSize={11} tickLine={false} axisLine={false} stroke={chartAxisColor} tick={{ fill: chartAxisColor }} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipTextStyle} itemStyle={tooltipTextStyle} formatter={(v: number) => fmtMoney(v, currency)} />
                      <Area type="monotone" dataKey="spend" stroke="url(#spendStroke)" strokeWidth={2.5} fill="url(#spendGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <EmptyChart />}
              </CardContent>
            </Card>

            <Card className={glass}>
              <CardContent className="p-4">
                <div className="text-sm font-medium mb-2">Leads Generated</div>
                {dailyArr.length ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={dailyArr} margin={{ left: -10, right: 8, top: 16 }}>
                      <defs>
                        <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22C55E" />
                          <stop offset="100%" stopColor="#10B981" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} opacity={0.45} />
                      <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} stroke={chartAxisColor} tick={{ fill: chartAxisColor }} />
                      <YAxis fontSize={11} tickLine={false} axisLine={false} stroke={chartAxisColor} tick={{ fill: chartAxisColor }} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipTextStyle} itemStyle={tooltipTextStyle} />
                      <Bar dataKey="leads" fill="url(#leadsGrad)" radius={[6, 6, 0, 0]} animationDuration={700}>
                        <LabelList dataKey="leads" position="top" fontSize={10} fill={chartLabelColor} formatter={(v: number) => v > 0 ? v : ""} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyChart />}
              </CardContent>
            </Card>
          </div>

          <Card className={glass}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium">Campaign Performance (Spend)</div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-500" /> High</span>
                  <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-amber-500" /> Medium</span>
                  <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-rose-500" /> Low</span>
                </div>
              </div>
              {topCamps.length ? (
                <ResponsiveContainer width="100%" height={Math.max(260, topCamps.length * 28)}>
                  <BarChart data={topCamps} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} opacity={0.45} horizontal={false} />
                    <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} stroke={chartAxisColor} tick={{ fill: chartAxisColor }} />
                    <YAxis type="category" dataKey="name" width={220} fontSize={11} tickLine={false} axisLine={false} stroke={chartAxisColor} tick={{ fill: chartLabelColor }} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipTextStyle} itemStyle={tooltipTextStyle} formatter={(v: number) => fmtMoney(v, currency)} />
                    <Bar dataKey="spend" radius={[0, 6, 6, 0]} animationDuration={700}>
                      {topCamps.map((c) => <Cell key={c.id} fill={c.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-3">
          <Card className={glass}>
            <CardContent className="p-3 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search campaigns…" className="pl-8" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="PAUSED">Paused</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="spend">Sort: Spend</SelectItem>
                  <SelectItem value="leads">Sort: Leads</SelectItem>
                  <SelectItem value="ctr">Sort: CTR</SelectItem>
                  <SelectItem value="cpl">Sort: CPL</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card className={glass}>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Impressions</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">CPL</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filteredCamps.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="max-w-[280px]">
                        <div className="flex items-center gap-2">
                          <div className="size-8 shrink-0 rounded-md grid place-items-center text-[10px] font-semibold text-white"
                            style={{ background: `linear-gradient(135deg, ${spendBarColor(c.spend, maxCampSpend)}, ${spendBarColor(c.spend, maxCampSpend)}aa)` }}>
                            {c.name.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="truncate">{c.name}</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className={statusBadge(c.status)}>{c.status}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className={scoreColor(c.score)}>{c.score}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMoney(c.spend, currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(c.impressions)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(c.clicks)}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.ctr.toFixed(2)}%</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(c.leads)}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.leads ? fmtMoney(c.cpl, currency) : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {!filteredCamps.length && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No campaigns match.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <Card className={glass}><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Current Month</div>
              <div className="text-2xl font-semibold mt-1">{fmtMoney(periods.last30, currency)}</div>
            </CardContent></Card>
            <Card className={glass}><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Last 7 Days</div>
              <div className="text-2xl font-semibold mt-1">{fmtMoney(periods.last7, currency)}</div>
            </CardContent></Card>
            <Card className={glass}><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Lifetime</div>
              <div className="text-2xl font-semibold mt-1">{fmtMoney(periods.lifetime, currency)}</div>
            </CardContent></Card>
          </div>
          <Card className={glass}>
            <CardContent className="p-4">
              <div className="text-sm font-medium mb-2">Monthly Spend Trend</div>
              {monthlyArr.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthlyArr} margin={{ left: -10 }}>
                    <defs>
                      <linearGradient id="monthGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" />
                        <stop offset="100%" stopColor="#3b82f6" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} opacity={0.45} />
                    <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} stroke={chartAxisColor} tick={{ fill: chartAxisColor }} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} stroke={chartAxisColor} tick={{ fill: chartAxisColor }} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipTextStyle} itemStyle={tooltipTextStyle} formatter={(v: number) => fmtMoney(v, currency)} />
                    <Bar dataKey="spend" fill="url(#monthGrad)" radius={[6, 6, 0, 0]} animationDuration={700} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card className={glass}><CardContent className="p-4 space-y-3">
            <div className="text-sm text-muted-foreground">Export current view as CSV (PDF coming soon — use browser Print for now).</div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={() => downloadCSV(`meta-daily-${accountId}.csv`, dailyArr)}>
                <Download className="w-4 h-4" /> Daily report (CSV)
              </Button>
              <Button variant="outline" onClick={() => downloadCSV(`meta-monthly-${accountId}.csv`, monthlyArr)}>
                <Download className="w-4 h-4" /> Monthly report (CSV)
              </Button>
              <Button variant="outline" onClick={() => downloadCSV(`meta-campaigns-${accountId}.csv`, campArr)}>
                <Download className="w-4 h-4" /> Campaigns (CSV)
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Download className="w-4 h-4" /> Print / PDF
              </Button>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="debug" className="space-y-4">
          <Card className={glass}><CardContent className="p-4 space-y-3">
            <div className="text-sm font-medium">Raw Meta insights actions (per campaign / day)</div>
            <div className="text-xs text-muted-foreground">
              Leads counter maps: <code>lead</code>, <code>onsite_conversion.lead_grouped</code>,
              <code> onsite_conversion.messaging_conversation_started_7d</code>,
              <code> messaging_conversation_started</code>, <code>whatsapp_conversation_started</code>,
              <code> messaging_first_reply</code>, <code>messaging_conversation</code>, and anything ending in <code>.lead</code>.
            </div>
            <div className="max-h-[600px] overflow-auto rounded border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr><th className="text-left p-2">Campaign</th><th className="text-left p-2">Date</th><th className="text-left p-2">Spend</th><th className="text-left p-2">Leads</th><th className="text-left p-2">actions[]</th></tr>
                </thead>
                <tbody>
                  {insights.slice(0, 200).map((r) => {
                    const c = campaigns.find((x) => x.id === r.campaign_id);
                    return (
                      <tr key={`${r.campaign_id}-${r.date}`} className="border-t align-top">
                        <td className="p-2">{c?.name ?? r.campaign_id}</td>
                        <td className="p-2">{r.date}</td>
                        <td className="p-2">{Number(r.spend ?? 0).toFixed(2)}</td>
                        <td className="p-2">{r.leads ?? 0}</td>
                        <td className="p-2"><pre className="whitespace-pre-wrap break-all">{JSON.stringify(r.actions ?? [], null, 2)}</pre></td>
                      </tr>
                    );
                  })}
                  {insights.length === 0 && (
                    <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No insights rows yet — click Sync now.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

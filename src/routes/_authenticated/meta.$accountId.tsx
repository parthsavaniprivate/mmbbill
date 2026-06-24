import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMetaDashboard, syncMetaAccount } from "@/lib/meta.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { ArrowLeft, RefreshCw, Download } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { formatDate, downloadCSV } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/meta/$accountId")({
  component: MetaDashboard,
});

function fmtMoney(n: number, currency = "INR") {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(n); }
  catch { return n.toFixed(0); }
}
function fmtNum(n: number) { return new Intl.NumberFormat("en-IN").format(Math.round(n)); }

function MetaDashboard() {
  const { accountId } = Route.useParams();
  const [days, setDays] = useState<number>(30);
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

  if (isLoading || !data) return <div className="text-muted-foreground">Loading…</div>;
  const { account, campaigns, insights, spendHistory, kpis } = data;
  if (!account) return <div>Account not found</div>;
  const currency = account.currency || "INR";

  // Aggregate per-day across campaigns
  const daily = new Map<string, { date: string; spend: number; leads: number; clicks: number; impressions: number }>();
  for (const r of insights) {
    const d = r.date;
    const cur = daily.get(d) || { date: d, spend: 0, leads: 0, clicks: 0, impressions: 0 };
    cur.spend += Number(r.spend ?? 0);
    cur.leads += Number(r.leads ?? 0);
    cur.clicks += Number(r.clicks ?? 0);
    cur.impressions += Number(r.impressions ?? 0);
    daily.set(d, cur);
  }
  const dailyArr = Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Monthly
  const monthly = new Map<string, { month: string; spend: number; leads: number }>();
  for (const r of spendHistory) {
    const m = r.date.slice(0, 7);
    const cur = monthly.get(m) || { month: m, spend: 0, leads: 0 };
    cur.spend += Number(r.spend ?? 0);
    cur.leads += Number(r.leads ?? 0);
    monthly.set(m, cur);
  }
  const monthlyArr = Array.from(monthly.values()).sort((a, b) => a.month.localeCompare(b.month));

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
  const campArr = Array.from(perCamp.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.spend - a.spend);

  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = lastMonthDate.toISOString().slice(0, 7);
  const currentMonthSpend = spendHistory.filter(r => r.date.startsWith(thisMonth)).reduce((s, r) => s + Number(r.spend ?? 0), 0);
  const lastMonthSpend = spendHistory.filter(r => r.date.startsWith(lastMonth)).reduce((s, r) => s + Number(r.spend ?? 0), 0);
  const lifetimeSpend = spendHistory.reduce((s, r) => s + Number(r.spend ?? 0), 0);

  const cards = [
    { label: "Total Spend", value: fmtMoney(kpis.spend, currency) },
    { label: "Active Campaigns", value: fmtNum(kpis.activeCampaigns) },
    { label: "Reach", value: fmtNum(kpis.reach) },
    { label: "Impressions", value: fmtNum(kpis.impressions) },
    { label: "Clicks", value: fmtNum(kpis.clicks) },
    { label: "CTR", value: `${kpis.ctr.toFixed(2)}%` },
    { label: "CPC", value: fmtMoney(kpis.cpc, currency) },
    { label: "CPM", value: fmtMoney(kpis.cpm, currency) },
    { label: "Leads", value: fmtNum(kpis.leads) },
    { label: "Cost / Lead", value: fmtMoney(kpis.cpl, currency) },
    { label: "ROAS", value: `${kpis.roas.toFixed(2)}x` },
  ];

  return (
    <div className="space-y-6">
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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map(c => (
          <Card key={c.label}><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="text-xl font-semibold mt-1 tabular-nums">{c.value}</div>
          </CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card><CardContent className="p-4">
              <div className="text-sm font-medium mb-2">Daily Spend</div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={dailyArr}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                  <Line type="monotone" dataKey="spend" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-sm font-medium mb-2">Leads Generated</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dailyArr}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="leads" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent></Card>
          </div>
          <Card><CardContent className="p-4">
            <div className="text-sm font-medium mb-2">Campaign Performance (Spend)</div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={campArr.slice(0, 12)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" fontSize={11} />
                <YAxis type="category" dataKey="name" width={180} fontSize={11} />
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                <Legend />
                <Bar dataKey="spend" fill="hsl(var(--primary))" name="Spend" />
                <Bar dataKey="leads" fill="hsl(var(--accent))" name="Leads" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="campaigns">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Campaign</TableHead><TableHead>Status</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">CPL</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {campArr.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-[280px] truncate">{c.name}</TableCell>
                    <TableCell><Badge variant={c.status === "ACTIVE" ? "default" : "secondary"}>{c.status}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(c.spend, currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(c.impressions)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(c.clicks)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.impressions ? ((c.clicks / c.impressions) * 100).toFixed(2) : "0.00"}%</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(c.leads)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.leads ? fmtMoney(c.spend / c.leads, currency) : "—"}</TableCell>
                  </TableRow>
                ))}
                {!campArr.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No campaigns yet — run Sync</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Current Month</div>
              <div className="text-2xl font-semibold mt-1">{fmtMoney(currentMonthSpend, currency)}</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Last Month</div>
              <div className="text-2xl font-semibold mt-1">{fmtMoney(lastMonthSpend, currency)}</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Lifetime</div>
              <div className="text-2xl font-semibold mt-1">{fmtMoney(lifetimeSpend, currency)}</div>
            </CardContent></Card>
          </div>
          <Card><CardContent className="p-4">
            <div className="text-sm font-medium mb-2">Monthly Spend Trend</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyArr}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }} />
                <Bar dataKey="spend" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-sm font-medium mb-2">Campaign-Wise Spend</div>
            <Table>
              <TableHeader><TableRow><TableHead>Campaign</TableHead><TableHead className="text-right">Spend</TableHead></TableRow></TableHeader>
              <TableBody>
                {campArr.map(c => (
                  <TableRow key={c.id}><TableCell className="max-w-md truncate">{c.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(c.spend, currency)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card><CardContent className="p-4 space-y-3">
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
      </Tabs>
    </div>
  );
}

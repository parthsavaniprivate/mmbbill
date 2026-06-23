import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { inr, formatDate, monthKey } from "@/lib/format";
import {
  TrendingUp, TrendingDown, Users, UserCheck, Clock, IndianRupee,
  Wallet, BarChart3, CalendarIcon,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

type RangeKey = "1m" | "3m" | "6m" | "12m" | "2y" | "3y" | "custom";
const RANGE_PRESETS: { key: RangeKey; label: string; months: number }[] = [
  { key: "1m", label: "1M", months: 1 },
  { key: "3m", label: "3M", months: 3 },
  { key: "6m", label: "6M", months: 6 },
  { key: "12m", label: "12M", months: 12 },
  { key: "2y", label: "2Y", months: 24 },
  { key: "3y", label: "3Y", months: 36 },
];

function useAll() {
  return useQuery({
    queryKey: ["dashboard-data"],
    queryFn: async () => {
      const [invoices, payments, expenses, clients, packages, companies] = await Promise.all([
        supabase.from("invoices").select("*"),
        supabase.from("payments").select("*, invoices(company_id, client_id, total)"),
        supabase.from("expenses").select("*"),
        supabase.from("clients").select("*"),
        supabase.from("packages").select("*, clients(company_id, client_name, business_name)"),
        supabase.from("companies").select("id, name"),
      ]);
      return {
        invoices: invoices.data ?? [],
        payments: payments.data ?? [],
        expenses: expenses.data ?? [],
        clients: clients.data ?? [],
        packages: packages.data ?? [],
        companies: companies.data ?? [],
      };
    },
  });
}

function Kpi({ title, value, icon: Icon, sub, trend }: {
  title: string; value: string; icon: React.ElementType; sub?: string; trend?: "up" | "down" | "neutral";
}) {
  return (
    <Card className="shadow-card border-border/60 hover:border-primary/40 transition-colors">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{title}</p>
            <p className="text-2xl font-bold mt-2 tracking-tight">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            trend === "up" ? "bg-success/10 text-success" :
            trend === "down" ? "bg-destructive/10 text-destructive" :
            "bg-primary/10 text-primary"
          }`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { selected, isAll, companies } = useCompany();
  const { data, isLoading } = useAll();

  // Analytics chart filters
  const [rangeKey, setRangeKey] = useState<RangeKey>("6m");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [chartCompany, setChartCompany] = useState<string>("all");

  const { from, to } = useMemo(() => {
    const end = new Date();
    if (rangeKey === "custom") {
      return { from: customFrom, to: customTo ?? end };
    }
    const preset = RANGE_PRESETS.find((p) => p.key === rangeKey)!;
    const start = new Date(end.getFullYear(), end.getMonth() - (preset.months - 1), 1);
    return { from: start, to: end };
  }, [rangeKey, customFrom, customTo]);

  if (isLoading || !data) return <div className="text-muted-foreground">Loading dashboard…</div>;

  const filtCompany = <T extends { company_id?: string | null }>(rows: T[]) =>
    isAll ? rows : rows.filter((r) => r.company_id === selected);

  const invoices = filtCompany(data.invoices);
  const expenses = filtCompany(data.expenses);
  const clients = filtCompany(data.clients);
  const packages = data.packages.filter((p) => isAll ? true : (p.clients as { company_id: string } | null)?.company_id === selected);

  const totalRevenue = invoices.reduce((s, i) => s + Number(i.amount_paid || 0), 0);
  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.total || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const netProfit = totalRevenue - totalExpenses;
  const activeClients = clients.filter((c) => c.status === "active").length;
  const pending = invoices.reduce((s, i) => s + Math.max(0, Number(i.total || 0) - Number(i.amount_paid || 0)), 0);

  const thisMonth = monthKey(new Date());
  const monthRev = invoices.filter((i) => monthKey(i.invoice_date) === thisMonth)
    .reduce((s, i) => s + Number(i.amount_paid || 0), 0);
  const monthExp = expenses.filter((e) => monthKey(e.expense_date) === thisMonth)
    .reduce((s, e) => s + Number(e.amount || 0), 0);

  // ----- Analytics chart data (respects rangeKey + chartCompany) -----
  const chartInvoices = chartCompany === "all" ? data.invoices : data.invoices.filter((i) => i.company_id === chartCompany);
  const chartExpenses = chartCompany === "all" ? data.expenses : data.expenses.filter((e) => e.company_id === chartCompany);

  const inRange = (d: string | Date) => {
    if (!from || !to) return true;
    const dt = new Date(d);
    return dt >= new Date(from.getFullYear(), from.getMonth(), from.getDate()) &&
      dt <= new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59);
  };

  const rangedInvoices = chartInvoices.filter((i) => inRange(i.invoice_date));
  const rangedExpenses = chartExpenses.filter((e) => inRange(e.expense_date));

  const startMonth = from ?? new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1);
  const endMonth = to ?? new Date();
  const chartMonths: string[] = [];
  const cursor = new Date(startMonth.getFullYear(), startMonth.getMonth(), 1);
  const last = new Date(endMonth.getFullYear(), endMonth.getMonth(), 1);
  while (cursor <= last) {
    chartMonths.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const chartData = chartMonths.map((m) => {
    const rev = rangedInvoices.filter((i) => monthKey(i.invoice_date) === m)
      .reduce((s, i) => s + Number(i.amount_paid || 0), 0);
    const exp = rangedExpenses.filter((e) => monthKey(e.expense_date) === m)
      .reduce((s, e) => s + Number(e.amount || 0), 0);
    return { month: m.slice(5) + "/" + m.slice(2, 4), revenue: rev, expenses: exp, profit: rev - exp };
  });

  const chartTotals = chartData.reduce(
    (acc, d) => ({ revenue: acc.revenue + d.revenue, expenses: acc.expenses + d.expenses, profit: acc.profit + d.profit }),
    { revenue: 0, expenses: 0, profit: 0 },
  );
  const half = Math.floor(chartData.length / 2);
  const firstHalfRev = chartData.slice(0, half).reduce((s, d) => s + d.revenue, 0);
  const secondHalfRev = chartData.slice(half).reduce((s, d) => s + d.revenue, 0);
  const growthPct = firstHalfRev > 0 ? ((secondHalfRev - firstHalfRev) / firstHalfRev) * 100 : (secondHalfRev > 0 ? 100 : 0);

  // Monthly aggregations (last 6 months) for other charts
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(monthKey(d));
  }
  const monthly = months.map((m) => {
    const rev = invoices.filter((i) => monthKey(i.invoice_date) === m)
      .reduce((s, i) => s + Number(i.amount_paid || 0), 0);
    const exp = expenses.filter((e) => monthKey(e.expense_date) === m)
      .reduce((s, e) => s + Number(e.amount || 0), 0);
    return { month: m.slice(5) + "/" + m.slice(2, 4), revenue: rev, expenses: exp, profit: rev - exp };
  });

  // Revenue by company
  const byCompany = companies.map((c) => {
    const rev = data.invoices.filter((i) => i.company_id === c.id)
      .reduce((s, i) => s + Number(i.amount_paid || 0), 0);
    return { name: c.name, revenue: rev };
  });

  // Top clients
  const clientRev = new Map<string, { name: string; rev: number }>();
  for (const inv of invoices) {
    const cl = data.clients.find((c) => c.id === inv.client_id);
    if (!cl) continue;
    const cur = clientRev.get(inv.client_id) ?? { name: cl.business_name || cl.client_name, rev: 0 };
    cur.rev += Number(inv.amount_paid || 0);
    clientRev.set(inv.client_id, cur);
  }
  const topClients = [...clientRev.values()].sort((a, b) => b.rev - a.rev).slice(0, 5);

  // Upcoming renewals (next 30 days)
  const today = new Date();
  const in30 = new Date(today.getTime() + 30 * 86400000);
  const upcoming = packages
    .filter((p) => p.renewal_date && new Date(p.renewal_date) >= today && new Date(p.renewal_date) <= in30)
    .sort((a, b) => (a.renewal_date! < b.renewal_date! ? -1 : 1))
    .slice(0, 5);

  const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
  const REV_COLOR = "#3b82f6";   // blue
  const EXP_COLOR = "#f97316";   // orange/red
  const PROFIT_COLOR = "#10b981"; // green

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          {isAll ? "Combined view across all companies" : companies.find((c) => c.id === selected)?.name}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi title="Total Revenue" value={inr(totalRevenue)} icon={IndianRupee} trend="up" />
        <Kpi title="Total Expenses" value={inr(totalExpenses)} icon={TrendingDown} trend="down" />
        <Kpi title="Net Profit" value={inr(netProfit)} icon={TrendingUp} trend={netProfit >= 0 ? "up" : "down"} />
        <Kpi title="Pending Payments" value={inr(pending)} icon={Clock} sub={`of ${inr(totalInvoiced)} invoiced`} />
        <Kpi title="Active Clients" value={String(activeClients)} icon={UserCheck} trend="up" />
        <Kpi title="Total Clients" value={String(clients.length)} icon={Users} />
        <Kpi title="This Month Revenue" value={inr(monthRev)} icon={Wallet} trend="up" />
        <Kpi title="This Month Profit" value={inr(monthRev - monthExp)} icon={BarChart3} trend={monthRev - monthExp >= 0 ? "up" : "down"} />
      </div>

      {/* Analytics: Revenue vs Expenses vs Profit */}
      <Card className="shadow-card">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Revenue, Expenses & Profit</CardTitle>
              <CardDescription>Trend analysis with growth comparison</CardDescription>
            </div>
            <Select value={chartCompany} onValueChange={setChartCompany}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Companies</SelectItem>
                {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {RANGE_PRESETS.map((p) => (
              <Button
                key={p.key}
                variant={rangeKey === p.key ? "default" : "outline"}
                size="sm"
                onClick={() => setRangeKey(p.key)}
              >
                {p.label}
              </Button>
            ))}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={rangeKey === "custom" ? "default" : "outline"}
                  size="sm"
                  className="gap-2"
                >
                  <CalendarIcon className="w-4 h-4" />
                  {rangeKey === "custom" && customFrom
                    ? `${formatDate(customFrom)} – ${customTo ? formatDate(customTo) : "…"}`
                    : "Custom"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="end">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div>
                    <p className="text-xs font-medium mb-1 text-muted-foreground">Start date</p>
                    <Calendar mode="single" selected={customFrom} onSelect={(d) => { setCustomFrom(d); setRangeKey("custom"); }} className={cn("p-0 pointer-events-auto")} />
                  </div>
                  <div>
                    <p className="text-xs font-medium mb-1 text-muted-foreground">End date</p>
                    <Calendar mode="single" selected={customTo} onSelect={(d) => { setCustomTo(d); setRangeKey("custom"); }} className={cn("p-0 pointer-events-auto")} />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Total Revenue</p>
              <p className="text-lg font-bold" style={{ color: REV_COLOR }}>{inr(chartTotals.revenue)}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Total Expenses</p>
              <p className="text-lg font-bold" style={{ color: EXP_COLOR }}>{inr(chartTotals.expenses)}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Net Profit</p>
              <p className="text-lg font-bold" style={{ color: PROFIT_COLOR }}>{inr(chartTotals.profit)}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Revenue Growth</p>
              <p className={`text-lg font-bold ${growthPct >= 0 ? "text-success" : "text-destructive"}`}>
                {growthPct >= 0 ? "▲" : "▼"} {Math.abs(growthPct).toFixed(1)}%
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="grad-rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={REV_COLOR} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={REV_COLOR} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="grad-exp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={EXP_COLOR} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={EXP_COLOR} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="grad-profit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PROFIT_COLOR} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={PROFIT_COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)" }}
                formatter={(v: number, name: string) => [inr(v), name.charAt(0).toUpperCase() + name.slice(1)]}
              />
              <Legend wrapperStyle={{ paddingTop: 8 }} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke={REV_COLOR} fill="url(#grad-rev)" strokeWidth={2.5} animationDuration={800} />
              <Area type="monotone" dataKey="expenses" name="Expenses" stroke={EXP_COLOR} fill="url(#grad-exp)" strokeWidth={2.5} animationDuration={800} />
              <Area type="monotone" dataKey="profit" name="Profit" stroke={PROFIT_COLOR} fill="url(#grad-profit)" strokeWidth={2.5} animationDuration={800} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">


        <Card className="shadow-card">
          <CardHeader><CardTitle>Monthly Profit</CardTitle><CardDescription>Net profit trend</CardDescription></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }}
                  formatter={(v: number) => inr(v)} />
                <Line type="monotone" dataKey="profit" stroke="var(--chart-2)" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader><CardTitle>Revenue by Company</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCompany}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }}
                  formatter={(v: number) => inr(v)} />
                <Bar dataKey="revenue" fill="var(--chart-1)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader><CardTitle>Top Clients by Revenue</CardTitle></CardHeader>
          <CardContent className="h-72">
            {topClients.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={topClients} dataKey="rev" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {topClients.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => inr(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Upcoming Renewals</CardTitle>
            <CardDescription>Next 30 days</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm"><Link to="/renewals">View all</Link></Button>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No renewals coming up.</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map((p) => {
                const cl = p.clients as { client_name: string; business_name: string | null } | null;
                return (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div>
                      <p className="font-medium">{cl?.business_name || cl?.client_name}</p>
                      <p className="text-xs text-muted-foreground">{p.name} · {inr(Number(p.monthly_amount))}</p>
                    </div>
                    <Badge variant="outline">{formatDate(p.renewal_date)}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

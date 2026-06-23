import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { inr, formatDate, monthKey } from "@/lib/format";
import {
  TrendingUp, TrendingDown, UserCheck, Clock, IndianRupee,
  Wallet, CalendarIcon, AlertCircle, CheckCircle2, Bell,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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

const FIXED_CATS = new Set(["employee_salary", "office", "internet", "software_subscriptions"]);
const CAT_LABEL: Record<string, string> = {
  employee_salary: "Salary",
  office: "Rent / Office",
  internet: "Internet",
  software_subscriptions: "Software",
  facebook_ads: "Facebook Ads",
  instagram_ads: "Instagram Ads",
  google_ads: "Google Ads",
  travel: "Travel",
  other: "Miscellaneous",
};

function useAll() {
  return useQuery({
    queryKey: ["dashboard-data"],
    queryFn: async () => {
      const [invoices, payments, expenses, clients, packages, companies] = await Promise.all([
        supabase.from("invoices").select("*"),
        supabase.from("payments").select("*, invoices(company_id, client_id, total, clients(client_name, business_name))"),
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

function HeroKpi({ title, value, sub, accent, icon: Icon, children }: {
  title: string; value: string; sub?: string;
  accent: "primary" | "expense" | "balance-pos" | "balance-neg";
  icon: React.ElementType;
  children?: React.ReactNode;
}) {
  const styles = {
    primary:      { ring: "from-blue-500/20 to-blue-500/0",   text: "text-blue-500",  iconBg: "bg-blue-500/15 text-blue-500" },
    expense:      { ring: "from-orange-500/20 to-orange-500/0", text: "text-orange-500", iconBg: "bg-orange-500/15 text-orange-500" },
    "balance-pos":{ ring: "from-emerald-500/20 to-emerald-500/0", text: "text-emerald-500", iconBg: "bg-emerald-500/15 text-emerald-500" },
    "balance-neg":{ ring: "from-red-500/20 to-red-500/0",     text: "text-red-500",   iconBg: "bg-red-500/15 text-red-500" },
  }[accent];
  return (
    <Card className={cn("relative overflow-hidden border-border/60 shadow-card backdrop-blur",
      "bg-gradient-to-br", styles.ring)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{title}</p>
            <p className={cn("text-3xl md:text-4xl font-extrabold mt-2 tracking-tight", styles.text)}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", styles.iconBg)}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
        {children && <div className="mt-4">{children}</div>}
      </CardContent>
    </Card>
  );
}

function MiniKpi({ title, value, icon: Icon, tone = "default" }: {
  title: string; value: string; icon: React.ElementType; tone?: "default" | "warn" | "danger" | "ok";
}) {
  const toneCls = {
    default: "bg-primary/10 text-primary",
    warn: "bg-amber-500/15 text-amber-500",
    danger: "bg-red-500/15 text-red-500",
    ok: "bg-emerald-500/15 text-emerald-500",
  }[tone];
  return (
    <Card className="shadow-card border-border/60">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", toneCls)}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{title}</p>
          <p className="text-lg font-bold truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { selected, isAll, companies } = useCompany();
  const { data, isLoading } = useAll();

  const [rangeKey, setRangeKey] = useState<RangeKey>("6m");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [chartCompany, setChartCompany] = useState<string>("all");

  const { from, to } = useMemo(() => {
    const end = new Date();
    if (rangeKey === "custom") return { from: customFrom, to: customTo ?? end };
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

  const thisMonth = monthKey(new Date());
  const monthInvoices = invoices.filter((i) => monthKey(i.invoice_date) === thisMonth);
  const monthExpRows = expenses.filter((e) => monthKey(e.expense_date) === thisMonth);

  // Collection (current month)
  const monthTotalBilled = monthInvoices.reduce((s, i) => s + Number(i.total || 0), 0);
  const monthCleared = monthInvoices.reduce((s, i) => s + Number(i.amount_paid || 0), 0);
  const monthDue = Math.max(0, monthTotalBilled - monthCleared);
  const collectionPct = monthTotalBilled > 0 ? (monthCleared / monthTotalBilled) * 100 : 0;

  // Expenses (current month) split
  const monthExpTotal = monthExpRows.reduce((s, e) => s + Number(e.amount || 0), 0);
  const monthFixed = monthExpRows.filter((e) => FIXED_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount || 0), 0);
  const monthVariable = monthExpTotal - monthFixed;

  // Company balance (overall cleared - overall expenses, current month)
  const companyBalance = monthCleared - monthExpTotal;

  // Overdue
  const today = new Date();
  const overdue = invoices
    .filter((i) => i.due_date && new Date(i.due_date) < today && Number(i.amount_paid || 0) < Number(i.total || 0))
    .reduce((s, i) => s + (Number(i.total || 0) - Number(i.amount_paid || 0)), 0);

  // Renewals (30 days)
  const in30 = new Date(today.getTime() + 30 * 86400000);
  const upcoming = packages
    .filter((p) => p.renewal_date && new Date(p.renewal_date) >= today && new Date(p.renewal_date) <= in30)
    .sort((a, b) => (a.renewal_date! < b.renewal_date! ? -1 : 1));

  const activeClients = clients.filter((c) => c.status === "active").length;

  // Category breakdown (current month)
  const catBreakdown = new Map<string, number>();
  for (const e of monthExpRows) {
    catBreakdown.set(e.category, (catBreakdown.get(e.category) || 0) + Number(e.amount || 0));
  }
  const fixedRows = [...catBreakdown.entries()].filter(([c]) => FIXED_CATS.has(c)).sort((a, b) => b[1] - a[1]);
  const variableRows = [...catBreakdown.entries()].filter(([c]) => !FIXED_CATS.has(c)).sort((a, b) => b[1] - a[1]);

  // ----- Analytics chart -----
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
    return { month: m.slice(5) + "/" + m.slice(2, 4), revenue: rev, expenses: exp, balance: rev - exp };
  });

  const chartTotals = chartData.reduce(
    (acc, d) => ({ revenue: acc.revenue + d.revenue, expenses: acc.expenses + d.expenses, balance: acc.balance + d.balance }),
    { revenue: 0, expenses: 0, balance: 0 },
  );


  // Financial health
  const profitMargin = monthCleared > 0 ? (companyBalance / monthCleared) * 100 : 0;
  const balancePositive = companyBalance >= 0;

  const REV_COLOR = "#3b82f6";
  const EXP_COLOR = "#ef4444";
  const BAL_COLOR = "#10b981";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financial Overview</h1>
          <p className="text-muted-foreground">
            {isAll ? "All companies" : companies.find((c) => c.id === selected)?.name} · {new Date().toLocaleString("en-IN", { month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      {/* HERO: Collection · Expenses · Balance */}
      <div className="grid gap-4 md:grid-cols-3">
        <HeroKpi title="Total Bill Collection" value={inr(monthTotalBilled)} sub="Current month" accent="primary" icon={IndianRupee}>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg bg-background/80 border border-border/80 p-2.5 shadow-sm">
              <p className="text-muted-foreground">Cleared</p>
              <p className="font-semibold text-emerald-500">{inr(monthCleared)}</p>
            </div>
            <div className="rounded-lg bg-background/80 border border-border/80 p-2.5 shadow-sm">
              <p className="text-muted-foreground">Due</p>
              <p className="font-semibold text-amber-500">{inr(monthDue)}</p>
            </div>
            <div className="rounded-lg bg-background/80 border border-border/80 p-2.5 shadow-sm">
              <p className="text-muted-foreground">Collected</p>
              <p className="font-semibold">{collectionPct.toFixed(1)}%</p>
            </div>
          </div>
        </HeroKpi>

        <HeroKpi title="Total Expenses" value={inr(monthExpTotal)} sub="Current month" accent="expense" icon={TrendingDown}>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-background/80 border border-border/80 p-2.5 shadow-sm">
              <p className="text-muted-foreground">Fixed</p>
              <p className="font-semibold">{inr(monthFixed)}</p>
            </div>
            <div className="rounded-lg bg-background/80 border border-border/80 p-2.5 shadow-sm">
              <p className="text-muted-foreground">Variable</p>
              <p className="font-semibold">{inr(monthVariable)}</p>
            </div>
          </div>
        </HeroKpi>

        <HeroKpi
          title="Company Balance"
          value={inr(companyBalance)}
          sub={balancePositive ? "Profit (Cleared − Expenses)" : "Loss (Cleared − Expenses)"}
          accent={balancePositive ? "balance-pos" : "balance-neg"}
          icon={balancePositive ? TrendingUp : AlertCircle}
        >
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-background/80 border border-border/80 p-2.5 shadow-sm">
              <p className="text-muted-foreground">Margin</p>
              <p className="font-semibold">{profitMargin.toFixed(1)}%</p>
            </div>
            <div className="rounded-lg bg-background/80 border border-border/80 p-2.5 shadow-sm">
              <p className="text-muted-foreground">Status</p>
              <p className={cn("font-semibold", balancePositive ? "text-emerald-500" : "text-red-500")}>
                {balancePositive ? "Healthy" : "Negative"}
              </p>
            </div>
          </div>
        </HeroKpi>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MiniKpi title="Active Clients" value={String(activeClients)} icon={UserCheck} tone="ok" />
        <MiniKpi title="Pending Renewals" value={String(upcoming.length)} icon={Bell} tone="warn" />
        <MiniKpi title="Overdue Payments" value={inr(overdue)} icon={AlertCircle} tone="danger" />
      </div>

      {/* Analytics chart */}
      <Card className="shadow-card">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Revenue vs Expenses vs Balance</CardTitle>
              <CardDescription>Trend analysis</CardDescription>
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
              <Button key={p.key} variant={rangeKey === p.key ? "default" : "outline"} size="sm" onClick={() => setRangeKey(p.key)}>
                {p.label}
              </Button>
            ))}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant={rangeKey === "custom" ? "default" : "outline"} size="sm" className="gap-2">
                  <CalendarIcon className="w-4 h-4" />
                  {rangeKey === "custom" && customFrom ? `${formatDate(customFrom)} – ${customTo ? formatDate(customTo) : "…"}` : "Custom"}
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

          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Revenue</p>
              <p className="text-lg font-bold" style={{ color: REV_COLOR }}>{inr(chartTotals.revenue)}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Expenses</p>
              <p className="text-lg font-bold" style={{ color: EXP_COLOR }}>{inr(chartTotals.expenses)}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Balance</p>
              <p className="text-lg font-bold" style={{ color: BAL_COLOR }}>{inr(chartTotals.balance)}</p>
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
                <linearGradient id="grad-bal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BAL_COLOR} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={BAL_COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)" }}
                formatter={(v: number, name: string) => [inr(v), name]}
              />
              <Legend wrapperStyle={{ paddingTop: 8 }} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke={REV_COLOR} fill="url(#grad-rev)" strokeWidth={2.5} />
              <Area type="monotone" dataKey="expenses" name="Expenses" stroke={EXP_COLOR} fill="url(#grad-exp)" strokeWidth={2.5} />
              <Area type="monotone" dataKey="balance" name="Balance" stroke={BAL_COLOR} fill="url(#grad-bal)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Breakdown widgets */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Collection Breakdown</CardTitle>
            <CardDescription>Current month</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <span className="font-semibold">Total Collection</span>
              <span className="font-bold text-blue-500">{inr(monthTotalBilled)}</span>
            </div>
            <div className="pl-6 space-y-2">
              <div className="flex items-center justify-between p-2.5 rounded-md border bg-card">
                <span className="text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Cleared Amount</span>
                <span className="font-semibold text-emerald-500">{inr(monthCleared)}</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-md border bg-card">
                <span className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-amber-500" /> Due Amount</span>
                <span className="font-semibold text-amber-500">{inr(monthDue)}</span>
              </div>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden mt-2">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, collectionPct)}%` }} />
            </div>
            <p className="text-xs text-muted-foreground text-right">Collection rate: {collectionPct.toFixed(1)}%</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Expense Breakdown</CardTitle>
            <CardDescription>Current month</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <span className="font-semibold">Total Expenses</span>
              <span className="font-bold text-orange-500">{inr(monthExpTotal)}</span>
            </div>
            <div className="pl-4 space-y-3">
              <div>
                <div className="flex items-center justify-between text-sm font-medium mb-1.5">
                  <span>Fixed Expenses</span>
                  <span>{inr(monthFixed)}</span>
                </div>
                <div className="pl-3 space-y-1">
                  {fixedRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No fixed expenses this month.</p>
                  ) : fixedRows.map(([cat, amt]) => (
                    <div key={cat} className="flex items-center justify-between text-xs py-1">
                      <span className="text-muted-foreground">└ {CAT_LABEL[cat] ?? cat}</span>
                      <span className="font-medium">{inr(amt)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-sm font-medium mb-1.5">
                  <span>Variable Expenses</span>
                  <span>{inr(monthVariable)}</span>
                </div>
                <div className="pl-3 space-y-1">
                  {variableRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No variable expenses this month.</p>
                  ) : variableRows.map(([cat, amt]) => (
                    <div key={cat} className="flex items-center justify-between text-xs py-1">
                      <span className="text-muted-foreground">└ {CAT_LABEL[cat] ?? cat}</span>
                      <span className="font-medium">{inr(amt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Payments + Upcoming Renewals */}
      <div className="grid gap-4">


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
                {upcoming.slice(0, 6).map((p) => {
                  const cl = p.clients as { client_name: string; business_name: string | null } | null;
                  return (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{cl?.business_name || cl?.client_name}</p>
                        <p className="text-xs text-muted-foreground">{p.name} · {inr(Number(p.monthly_amount))}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline">{formatDate(p.renewal_date)}</Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => toast.success(`Reminder set for ${cl?.business_name || cl?.client_name}`)}
                        >
                          <Bell className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Financial Health */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Financial Health</CardTitle>
          <CardDescription>Current month indicators</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Monthly Revenue</p>
            <p className="text-lg font-bold text-blue-500">{inr(monthCleared)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Monthly Expenses</p>
            <p className="text-lg font-bold text-orange-500">{inr(monthExpTotal)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Monthly Profit</p>
            <p className={cn("text-lg font-bold", balancePositive ? "text-emerald-500" : "text-red-500")}>{inr(companyBalance)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Profit Margin</p>
            <p className={cn("text-lg font-bold", profitMargin >= 0 ? "text-emerald-500" : "text-red-500")}>{profitMargin.toFixed(1)}%</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Collection Rate</p>
            <p className="text-lg font-bold flex items-center gap-1">
              <Wallet className="w-4 h-4 text-muted-foreground" />
              {collectionPct.toFixed(1)}%
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

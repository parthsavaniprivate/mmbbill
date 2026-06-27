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
  ResponsiveContainer, BarChart, Bar,
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

type RangeKey = "tm" | "1m" | "3m" | "6m" | "12m" | "2y" | "3y" | "custom";
const RANGE_PRESETS: { key: RangeKey; label: string; months: number }[] = [
  { key: "tm", label: "This Month", months: 0 },
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
    staleTime: 30_000,
    queryFn: async () => {
      const [invoices, payments, expenses, clients, packages, companies, recurring, quotations, salarySlips] = await Promise.all([
        supabase.from("invoices").select("*"),
        supabase.from("payments").select("*, invoices(company_id, client_id, total, clients(client_name, business_name))"),
        supabase.from("expenses").select("*"),
        supabase.from("clients").select("*"),
        supabase.from("packages").select("*, clients(company_id, client_name, business_name)"),
        supabase.from("companies").select("id, name"),
        supabase.from("recurring_expenses").select("*"),
        supabase.from("quotations").select("id, company_id, quotation_date, status, total"),
        supabase.from("salary_slips").select("id, company_id, month, year, net"),
      ]);
      return {
        invoices: invoices.data ?? [],
        payments: payments.data ?? [],
        expenses: expenses.data ?? [],
        clients: clients.data ?? [],
        packages: packages.data ?? [],
        companies: companies.data ?? [],
        recurring: recurring.data ?? [],
        quotations: quotations.data ?? [],
        salarySlips: salarySlips.data ?? [],
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
  const { selected, isAll, companies, setSelected } = useCompany();
  const { data, isLoading } = useAll();

  const [rangeKey, setRangeKey] = useState<RangeKey>("tm");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  const { from, to } = useMemo(() => {
    const end = new Date();
    if (rangeKey === "custom") return { from: customFrom, to: customTo ?? end };
    if (rangeKey === "tm") {
      const start = new Date(end.getFullYear(), end.getMonth(), 1);
      const last = new Date(end.getFullYear(), end.getMonth() + 1, 0);
      return { from: start, to: last };
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

  const inDateRange = (d: string | Date | null | undefined) => {
    if (!d) return false;
    if (!from || !to) return true;
    const dt = new Date(d);
    return dt >= new Date(from.getFullYear(), from.getMonth(), from.getDate()) &&
      dt <= new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59);
  };
  const monthInvoices = invoices.filter((i) => inDateRange(i.invoice_date));
  const monthExpRows = expenses.filter((e) => inDateRange(e.expense_date));

  // Collection (current month)
  const monthTotalBilled = monthInvoices.reduce((s, i) => s + Number(i.total || 0), 0);
  const monthCleared = monthInvoices.reduce((s, i) => s + Number(i.amount_paid || 0), 0);
  const monthDue = Math.max(0, monthTotalBilled - monthCleared);
  const collectionPct = monthTotalBilled > 0 ? (monthCleared / monthTotalBilled) * 100 : 0;

  // Projected fixed expenses (active recurring whose next_due_date falls in the selected range,
  // but no expense row was generated yet for that schedule in this range).
  const recurring = (data.recurring ?? []).filter((r) => isAll ? true : r.company_id === selected);
  const projectedFixed = recurring.reduce((sum, r) => {
    if (!r.is_active) return sum;
    if (!r.next_due_date) return sum;
    if (!inDateRange(r.next_due_date)) return sum;
    const alreadyBooked = monthExpRows.some(
      (e) => e.recurring_id === r.id && inDateRange(e.expense_date),
    );
    return alreadyBooked ? sum : sum + Number(r.amount || 0);
  }, 0);

  // Expenses (current month) split
  const bookedTotal = monthExpRows.reduce((s, e) => s + Number(e.amount || 0), 0);
  const bookedFixed = monthExpRows.filter((e) => FIXED_CATS.has(e.category)).reduce((s, e) => s + Number(e.amount || 0), 0);
  const monthFixed = bookedFixed + projectedFixed;
  const monthExpTotal = bookedTotal + projectedFixed;
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

  // ----- Analytics chart (uses global company filter) -----
  const chartInvoices = invoices;
  const chartExpenses = expenses;


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
            {isAll ? "All companies" : companies.find((c) => c.id === selected)?.name}
            {from && to ? ` · ${formatDate(from)} – ${formatDate(to)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Companies</SelectItem>
              {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
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
      </div>

      {/* HERO: Collection · Expenses · Balance */}
      <div className="grid gap-4 md:grid-cols-3">
        <HeroKpi title="Total Bill Collection" value={inr(monthTotalBilled)} sub="Selected range" accent="primary" icon={IndianRupee}>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-background/80 border border-border/80 p-2.5 shadow-sm">
              <p className="text-muted-foreground">Cleared</p>
              <p className="font-semibold text-emerald-500">{inr(monthCleared)}</p>
            </div>
            <div className="rounded-lg bg-background/80 border border-border/80 p-2.5 shadow-sm">
              <p className="text-muted-foreground">Due</p>
              <p className="font-semibold text-amber-500">{inr(monthDue)}</p>
            </div>
          </div>
        </HeroKpi>

        <HeroKpi title="Total Expenses" value={inr(monthExpTotal)} sub={projectedFixed > 0 ? `Incl. ${inr(projectedFixed)} projected fixed` : "Selected range"} accent="expense" icon={TrendingDown}>
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
        </HeroKpi>
      </div>

      {/* Financial summary: 4 cards bracketed into Total Balance */}
      {(() => {
        const totalCollection = monthDue + monthCleared;
        const totalExpenses = monthFixed + monthVariable;
        const totalBalance = totalCollection - totalExpenses;
        const positive = totalBalance >= 0;

        const miniCard = (label: string, value: string, color: string, borderColor: string) => (
          <div className={cn(
            "relative rounded-xl border bg-card/60 backdrop-blur p-2.5 sm:p-4 shadow-card transition-all hover:scale-[1.02] hover:shadow-lg min-w-0",
            borderColor,
          )}>
            <p className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground font-semibold truncate">{label}</p>
            <p className={cn("text-sm sm:text-xl md:text-2xl font-extrabold mt-1 sm:mt-1.5 tracking-tight truncate", color)}>{value}</p>
          </div>
        );

        return (
          <div className="grid gap-4 md:grid-cols-[1fr_auto_1.1fr] md:items-stretch">
            {/* Left: Row 1 = Due + Cleared = Total Amount, Row 2 = Fixed + Variable = Total Expense */}
            <div className="flex flex-col gap-3 min-w-0">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 sm:gap-2">
                {miniCard("Due", inr(monthDue), "text-amber-500", "border-amber-500/40")}
                <span className="text-muted-foreground font-bold text-base sm:text-lg">+</span>
                {miniCard("Cleared", inr(monthCleared), "text-emerald-500", "border-emerald-500/40")}
                <span className="text-muted-foreground font-bold text-base sm:text-lg">=</span>
                {miniCard("Total", inr(totalCollection), "text-blue-500", "border-blue-500/50 bg-blue-500/5")}
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 sm:gap-2">
                {miniCard("Fixed", inr(monthFixed), "text-orange-500", "border-orange-500/40")}
                <span className="text-muted-foreground font-bold text-base sm:text-lg">+</span>
                {miniCard("Variable", inr(monthVariable), "text-purple-500", "border-purple-500/40")}
                <span className="text-muted-foreground font-bold text-base sm:text-lg">=</span>
                {miniCard("Total Exp", inr(totalExpenses), "text-red-500", "border-red-500/50 bg-red-500/5")}
              </div>
            </div>

            {/* Bracket: SVG on md+, horizontal arrow on mobile */}
            <div className="hidden md:flex items-center justify-center px-1">
              <svg viewBox="0 0 40 200" preserveAspectRatio="none" className="h-full w-10 text-border" aria-hidden>
                <path
                  d="M 4 4 Q 28 4 28 50 Q 28 100 36 100 Q 28 100 28 150 Q 28 196 4 196"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="flex md:hidden items-center justify-center py-1 text-muted-foreground text-2xl">↓</div>

            {/* Right: Total Balance hero */}
            <div className={cn(
              "relative overflow-hidden rounded-2xl border-2 p-6 md:p-8 backdrop-blur-xl flex flex-col justify-center",
              "bg-gradient-to-br shadow-xl transition-all animate-fade-in",
              positive
                ? "from-emerald-500/20 via-emerald-500/5 to-transparent border-emerald-500/50 shadow-emerald-500/20"
                : "from-red-500/20 via-red-500/5 to-transparent border-red-500/50 shadow-red-500/20",
            )}>
              <div className={cn(
                "absolute -inset-1 rounded-2xl blur-2xl opacity-30 -z-10",
                positive ? "bg-emerald-500/40" : "bg-red-500/40",
              )} />
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-bold">Total Balance</p>
              <p className={cn(
                "text-4xl md:text-5xl font-extrabold mt-2 tracking-tight",
                positive ? "text-emerald-500" : "text-red-500",
              )}>
                {inr(totalBalance)}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm">
                <span className="text-muted-foreground">Collection</span>
                <span className="font-semibold text-emerald-500">{inr(totalCollection)}</span>
                <span className="text-muted-foreground">−</span>
                <span className="text-muted-foreground">Expenses</span>
                <span className="font-semibold text-orange-500">{inr(totalExpenses)}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {positive ? "Net Profit this month" : "Net Loss this month"}
              </p>
            </div>
          </div>
        );
      })()}









      {/* Analytics chart */}
      <Card className="shadow-card">

        <CardHeader className="space-y-4">
          <div>
            <CardTitle>Revenue vs Expenses vs Balance</CardTitle>
            <CardDescription>Trend analysis</CardDescription>
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
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
              <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)" }}
                formatter={(v: number, name: string) => [inr(v), name]}
              />
              <Legend wrapperStyle={{ paddingTop: 8 }} />
              <Bar dataKey="revenue" name="Revenue" fill={REV_COLOR} radius={[6, 6, 0, 0]} />
              <Bar dataKey="expenses" name="Expenses" fill={EXP_COLOR} radius={[6, 6, 0, 0]} />
              <Bar dataKey="balance" name="Balance" fill={BAL_COLOR} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>


    </div>
  );
}

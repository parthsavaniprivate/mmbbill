import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { inr, formatDate, monthKey } from "@/lib/format";
import {
  TrendingUp, TrendingDown, Users, UserCheck, Clock, IndianRupee,
  Wallet, BarChart3,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

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

  // Monthly aggregations (last 6 months)
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

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="shadow-card">
          <CardHeader><CardTitle>Revenue vs Expenses</CardTitle><CardDescription>Last 6 months</CardDescription></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthly}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }}
                  formatter={(v: number) => inr(v)} />
                <Area type="monotone" dataKey="revenue" stroke="var(--chart-1)" fill="url(#rev)" strokeWidth={2} />
                <Area type="monotone" dataKey="expenses" stroke="var(--chart-4)" fill="url(#exp)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

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

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDown, Printer } from "lucide-react";
import { inr, formatDate, downloadCSV } from "@/lib/format";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, LineChart, Line } from "recharts";

export const Route = createFileRoute("/_authenticated/reports")({ component: ReportsPage });

const RANGES: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };

function ReportsPage() {
  const { selected, isAll, companies } = useCompany();
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [range, setRange] = useState<string>("30d");
  const [companyFilter, setCompanyFilter] = useState<string>("all");

  const setQuick = (key: string) => {
    setRange(key);
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - RANGES[key]);
    setFrom(start.toISOString().slice(0, 10));
    setTo(end.toISOString().slice(0, 10));
  };

  const { data } = useQuery({
    queryKey: ["report", from, to],
    queryFn: async () => {
      const [invoices, payments, expenses, salaries, allInvoices] = await Promise.all([
        supabase.from("invoices").select("*, clients(client_name, business_name)").gte("invoice_date", from).lte("invoice_date", to),
        supabase.from("payments").select("*, invoices(company_id, invoice_number, clients(client_name, business_name))").gte("payment_date", from).lte("payment_date", to),
        supabase.from("expenses").select("*").gte("expense_date", from).lte("expense_date", to),
        supabase.from("salary_slips").select("company_id, net, pay_date, month").gte("pay_date", from).lte("pay_date", to),
        supabase.from("invoices").select("id,company_id,invoice_number,invoice_date,due_date,total,amount_paid,status,clients(client_name,business_name)").neq("status", "cancelled"),
      ]);
      return {
        invoices: invoices.data ?? [], payments: payments.data ?? [],
        expenses: expenses.data ?? [], salaries: salaries.data ?? [], allInvoices: allInvoices.data ?? [],
      };
    },
  });

  const safe = data ?? { invoices: [], payments: [], expenses: [], salaries: [], allInvoices: [] };

  const filtCompany = <T extends { company_id?: string | null }>(rows: T[]) => {
    const byGlobal = isAll ? rows : rows.filter((r) => r.company_id === selected);
    return companyFilter === "all" ? byGlobal : byGlobal.filter((r) => r.company_id === companyFilter);
  };

  const invoices = filtCompany(safe.invoices);
  const expenses = filtCompany(safe.expenses);
  const salaries = filtCompany(safe.salaries);
  const openInvoices = filtCompany(safe.allInvoices).filter((i) => Number(i.total) - Number(i.amount_paid) > 0);
  const payments = safe.payments.filter((p) => {
    const inv = p.invoices as { company_id: string } | null;
    if (!isAll && inv?.company_id !== selected) return false;
    if (companyFilter !== "all" && inv?.company_id !== companyFilter) return false;
    return true;
  });

  const totRev = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totExp = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totSal = salaries.reduce((s, x) => s + Number(x.net || 0), 0);
  const totBilled = invoices.reduce((s, i) => s + Number(i.total), 0);
  const netProfit = totRev - totExp - totSal;

  const trend = useMemo(() => {
    const map = new Map<string, { month: string; revenue: number; expense: number; salary: number; profit: number }>();
    const key = (d: string) => d.slice(0, 7);
    const get = (k: string) => map.get(k) ?? { month: k, revenue: 0, expense: 0, salary: 0, profit: 0 };
    for (const p of payments) { const k = key(p.payment_date); const e = get(k); e.revenue += Number(p.amount); map.set(k, e); }
    for (const x of expenses) { const k = key(x.expense_date); const e = get(k); e.expense += Number(x.amount); map.set(k, e); }
    for (const s of salaries) { if (!s.pay_date) continue; const k = key(s.pay_date); const e = get(k); e.salary += Number(s.net || 0); map.set(k, e); }
    return [...map.values()].map((v) => ({ ...v, profit: v.revenue - v.expense - v.salary })).sort((a, b) => a.month.localeCompare(b.month));
  }, [payments, expenses, salaries]);

  const topClients = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; count: number }>();
    for (const p of payments) {
      const inv = p.invoices as { clients: { client_name: string; business_name: string | null } | null } | null;
      const name = inv?.clients?.business_name || inv?.clients?.client_name || "—";
      const e = map.get(name) ?? { name, revenue: 0, count: 0 };
      e.revenue += Number(p.amount); e.count += 1; map.set(name, e);
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [payments]);

  const topExpenseCats = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) map.set(e.category, (map.get(e.category) ?? 0) + Number(e.amount));
    return [...map.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [expenses]);

  const aging = useMemo(() => {
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
    const rows: { client: string; invoice: string; due: string | null; days: number; balance: number }[] = [];
    const now = Date.now();
    for (const i of openInvoices) {
      const bal = Number(i.total) - Number(i.amount_paid);
      const cl = i.clients as { client_name: string; business_name: string | null } | null;
      const dueMs = i.due_date ? new Date(i.due_date).getTime() : new Date(i.invoice_date).getTime();
      const days = Math.floor((now - dueMs) / 86400000);
      rows.push({ client: cl?.business_name || cl?.client_name || "—", invoice: i.invoice_number, due: i.due_date, days, balance: bal });
      if (days <= 0) buckets.current += bal;
      else if (days <= 30) buckets.d30 += bal;
      else if (days <= 60) buckets.d60 += bal;
      else if (days <= 90) buckets.d90 += bal;
      else buckets.d90p += bal;
    }
    rows.sort((a, b) => b.days - a.days);
    return { buckets, rows: rows.slice(0, 5), totalOpen: rows.length };
  }, [openInvoices]);

  const exportAll = () => {
    downloadCSV(`summary-${from}-to-${to}.csv`, [
      { metric: "Total Billed", amount: totBilled },
      { metric: "Collected", amount: totRev },
      { metric: "Expenses", amount: totExp },
      { metric: "Salaries", amount: totSal },
      { metric: "Net Profit", amount: netProfit },
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">{formatDate(from)} – {formatDate(to)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4" />Print</Button>
          <Button onClick={exportAll}><FileDown className="w-4 h-4" />Export Summary</Button>
        </div>
      </div>

      {/* Compact filter bar */}
      <Card className="no-print">
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            {Object.keys(RANGES).map((k) => (
              <Button key={k} size="sm" variant={range === k ? "default" : "outline"} onClick={() => setQuick(k)}>{k}</Button>
            ))}
          </div>
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setRange(""); }} className="h-8 w-36" />
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setRange(""); }} className="h-8 w-36" />
          </div>
          <div className="h-6 w-px bg-border" />
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Companies</SelectItem>
              {companies.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Stat label="Total Billed" value={inr(totBilled)} />
        <Stat label="Collected" value={inr(totRev)} accent="text-green-600" />
        <Stat label="Expenses" value={inr(totExp)} accent="text-red-600" />
        <Stat label="Salaries" value={inr(totSal)} accent="text-amber-600" />
        <Stat label="Net Profit" value={inr(netProfit)} accent={netProfit >= 0 ? "text-green-600" : "text-red-600"} />
      </div>

      {/* Trend + Profit line side-by-side */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Monthly Trend</CardTitle><CardDescription>Revenue vs Expense vs Salary</CardDescription></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => inr(v)} />
                <Legend />
                <Bar dataKey="revenue" fill="#16a34a" name="Revenue" />
                <Bar dataKey="expense" fill="#ef4444" name="Expense" />
                <Bar dataKey="salary" fill="#f59e0b" name="Salary" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Net Profit</CardTitle><CardDescription>Month-over-month</CardDescription></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => inr(v)} />
                <Line type="monotone" dataKey="profit" stroke="#2563eb" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Aging */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Receivables Aging</CardTitle><CardDescription>{aging.totalOpen} open invoices</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="Current" value={inr(aging.buckets.current)} small />
            <Stat label="1–30d" value={inr(aging.buckets.d30)} accent="text-yellow-600" small />
            <Stat label="31–60d" value={inr(aging.buckets.d60)} accent="text-orange-600" small />
            <Stat label="61–90d" value={inr(aging.buckets.d90)} accent="text-red-600" small />
            <Stat label="90+d" value={inr(aging.buckets.d90p)} accent="text-red-900" small />
          </div>
          {aging.rows.length > 0 && (
            <ReportTable headers={["Client", "Invoice", "Due", "Overdue", "Balance"]}
              rows={aging.rows.map((r) => [r.client, r.invoice, formatDate(r.due) || "—", r.days > 0 ? `${r.days}d` : "—", inr(r.balance)])} />
          )}
        </CardContent>
      </Card>

      {/* Top clients + Top expenses */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Top 5 Clients</CardTitle><CardDescription>By collected revenue</CardDescription></CardHeader>
          <CardContent>
            {topClients.length === 0 ? <p className="text-sm text-muted-foreground py-4">No payments in range.</p> :
              <ReportTable headers={["Client", "Payments", "Revenue"]}
                rows={topClients.map((c) => [c.name, String(c.count), inr(c.revenue)])} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Top 5 Expense Categories</CardTitle></CardHeader>
          <CardContent>
            {topExpenseCats.length === 0 ? <p className="text-sm text-muted-foreground py-4">No expenses in range.</p> :
              <ReportTable headers={["Category", "Amount"]}
                rows={topExpenseCats.map((c) => [c.category, inr(c.amount)])} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, accent, small }: { label: string; value: string; accent?: string; small?: boolean }) {
  return (
    <Card><CardContent className={small ? "p-3" : "p-4"}>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`${small ? "text-lg" : "text-2xl"} font-bold mt-1 ${accent ?? ""}`}>{value}</p>
    </CardContent></Card>
  );
}

function ReportTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b">{headers.map((h) => <th key={h} className="p-2 text-left font-medium text-muted-foreground">{h}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} className="p-8 text-center text-muted-foreground">No data.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              {r.map((c, j) => <td key={j} className="p-2">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

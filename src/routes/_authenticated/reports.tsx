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

type ReportType = "revenue" | "expense" | "profit" | "client" | "payment" | "aging" | "top";

function ReportsPage() {
  const { selected, isAll, companies } = useCompany();
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [reportType, setReportType] = useState<ReportType>("revenue");
  const [companyFilter, setCompanyFilter] = useState<string>("all");

  const { data } = useQuery({
    queryKey: ["report", from, to],
    queryFn: async () => {
      const [invoices, payments, expenses, clients, salaries, allInvoices] = await Promise.all([
        supabase.from("invoices").select("*, clients(client_name, business_name)").gte("invoice_date", from).lte("invoice_date", to),
        supabase.from("payments").select("*, invoices(company_id, invoice_number, clients(client_name, business_name))").gte("payment_date", from).lte("payment_date", to),
        supabase.from("expenses").select("*").gte("expense_date", from).lte("expense_date", to),
        supabase.from("clients").select("*"),
        supabase.from("salary_slips").select("company_id, net, pay_date, month").gte("pay_date", from).lte("pay_date", to),
        // For aging: all non-cancelled invoices with a balance, any date
        supabase.from("invoices").select("id,company_id,client_id,invoice_number,invoice_date,due_date,total,amount_paid,status,clients(client_name,business_name)").neq("status", "cancelled"),
      ]);
      return {
        invoices: invoices.data ?? [], payments: payments.data ?? [],
        expenses: expenses.data ?? [], clients: clients.data ?? [],
        salaries: salaries.data ?? [], allInvoices: allInvoices.data ?? [],
      };
    },
  });

  const safe = data ?? { invoices: [], payments: [], expenses: [], clients: [], salaries: [], allInvoices: [] };

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
  const clients = filtCompany(safe.clients);

  const totRev = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totExp = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totSal = salaries.reduce((s, x) => s + Number(x.net || 0), 0);
  const totBilled = invoices.reduce((s, i) => s + Number(i.total), 0);
  const netProfit = totRev - totExp - totSal;

  // Monthly trend
  const trend = useMemo(() => {
    const map = new Map<string, { month: string; revenue: number; expense: number; salary: number }>();
    const key = (d: string) => d.slice(0, 7);
    for (const p of payments) {
      const k = key(p.payment_date);
      const e = map.get(k) ?? { month: k, revenue: 0, expense: 0, salary: 0 };
      e.revenue += Number(p.amount); map.set(k, e);
    }
    for (const x of expenses) {
      const k = key(x.expense_date);
      const e = map.get(k) ?? { month: k, revenue: 0, expense: 0, salary: 0 };
      e.expense += Number(x.amount); map.set(k, e);
    }
    for (const s of salaries) {
      if (!s.pay_date) continue;
      const k = key(s.pay_date);
      const e = map.get(k) ?? { month: k, revenue: 0, expense: 0, salary: 0 };
      e.salary += Number(s.net || 0); map.set(k, e);
    }
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [payments, expenses, salaries]);

  // Top clients by revenue
  const topClients = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; count: number }>();
    for (const p of payments) {
      const inv = p.invoices as { clients: { client_name: string; business_name: string | null } | null } | null;
      const name = inv?.clients?.business_name || inv?.clients?.client_name || "—";
      const e = map.get(name) ?? { name, revenue: 0, count: 0 };
      e.revenue += Number(p.amount); e.count += 1; map.set(name, e);
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [payments]);

  // Top expense categories
  const topExpenseCats = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) map.set(e.category, (map.get(e.category) ?? 0) + Number(e.amount));
    return [...map.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  // Aging buckets
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
    return { buckets, rows };
  }, [openInvoices]);

  const exportCurrent = () => {
    const fname = `${reportType}-report-${from}-to-${to}.csv`;
    if (reportType === "revenue" || reportType === "profit") {
      downloadCSV(fname, invoices.map((i) => {
        const cl = i.clients as { client_name: string; business_name: string | null } | null;
        return { date: i.invoice_date, number: i.invoice_number, client: cl?.business_name || cl?.client_name, total: i.total, paid: i.amount_paid, status: i.status };
      }));
    } else if (reportType === "expense") {
      downloadCSV(fname, expenses.map((e) => ({ date: e.expense_date, category: e.category, vendor: e.vendor, amount: e.amount, description: e.description })));
    } else if (reportType === "payment") {
      downloadCSV(fname, payments.map((p) => {
        const inv = p.invoices as { invoice_number: string; clients: { client_name: string; business_name: string | null } | null } | null;
        return { date: p.payment_date, invoice: inv?.invoice_number, client: inv?.clients?.business_name || inv?.clients?.client_name, amount: p.amount, method: p.method };
      }));
    } else if (reportType === "aging") {
      downloadCSV(fname, aging.rows.map((r) => ({ client: r.client, invoice: r.invoice, due_date: r.due, days_overdue: r.days, balance: r.balance })));
    } else if (reportType === "top") {
      downloadCSV(fname, topClients.map((c) => ({ client: c.name, revenue: c.revenue, payments: c.count })));
    } else {
      downloadCSV(fname, clients.map((c) => ({
        company: companies.find((co) => co.id === c.company_id)?.name,
        name: c.client_name, business: c.business_name, status: c.status, email: c.email, mobile: c.mobile,
      })));
    }
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
          <Button onClick={exportCurrent}><FileDown className="w-4 h-4" />Export CSV</Button>
        </div>
      </div>

      <Card className="no-print"><CardContent className="p-4 flex flex-wrap gap-3 items-end">
        <div className="space-y-1.5"><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Quick Range</Label>
          <Select onValueChange={(v) => {
            const end = new Date();
            const start = new Date();
            if (v === "today") {/* keep */ }
            else if (v === "week") start.setDate(end.getDate() - 7);
            else if (v === "month") start.setDate(end.getDate() - 30);
            else if (v === "quarter") start.setDate(end.getDate() - 90);
            else if (v === "year") start.setFullYear(end.getFullYear() - 1);
            setFrom(start.toISOString().slice(0, 10)); setTo(end.toISOString().slice(0, 10));
          }}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 days</SelectItem>
              <SelectItem value="month">Last 30 days</SelectItem>
              <SelectItem value="quarter">Last 90 days</SelectItem>
              <SelectItem value="year">Last 1 year</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Report Type</Label>
          <Select value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="revenue">Revenue Report</SelectItem>
              <SelectItem value="expense">Expense Report</SelectItem>
              <SelectItem value="profit">Profit / P&L</SelectItem>
              <SelectItem value="payment">Payment Report</SelectItem>
              <SelectItem value="aging">Receivables Aging</SelectItem>
              <SelectItem value="top">Top Clients</SelectItem>
              <SelectItem value="client">Client Report</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Company</Label>
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Companies</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent></Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Stat label="Total Billed" value={inr(totBilled)} />
        <Stat label="Collected" value={inr(totRev)} />
        <Stat label="Expenses" value={inr(totExp)} />
        <Stat label="Salaries" value={inr(totSal)} />
        <Stat label="Net Profit" value={inr(netProfit)} accent={netProfit >= 0 ? "text-green-600" : "text-red-600"} />
      </div>

      {(reportType === "revenue" || reportType === "profit") && trend.length > 0 && (
        <Card><CardHeader><CardTitle>Monthly Trend</CardTitle><CardDescription>Revenue vs Expenses vs Salaries</CardDescription></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
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
          </CardContent></Card>
      )}

      {(reportType === "revenue" || reportType === "profit") && (
        <Card><CardHeader><CardTitle>Invoice Summary</CardTitle><CardDescription>{invoices.length} invoices</CardDescription></CardHeader>
          <CardContent>
            <ReportTable headers={["Date", "Number", "Client", "Total", "Paid", "Status"]}
              rows={invoices.map((i) => {
                const cl = i.clients as { client_name: string; business_name: string | null } | null;
                return [formatDate(i.invoice_date), i.invoice_number, cl?.business_name || cl?.client_name || "", inr(Number(i.total)), inr(Number(i.amount_paid)), i.status];
              })} />
          </CardContent></Card>
      )}

      {reportType === "expense" && (
        <>
          {topExpenseCats.length > 0 && (
            <Card><CardHeader><CardTitle>By Category</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={topExpenseCats} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis type="number" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="category" fontSize={12} width={110} />
                    <Tooltip formatter={(v: number) => inr(v)} />
                    <Bar dataKey="amount" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent></Card>
          )}
          <Card><CardHeader><CardTitle>Expense Breakdown</CardTitle></CardHeader>
            <CardContent>
              <ReportTable headers={["Date", "Category", "Vendor", "Amount", "Description"]}
                rows={expenses.map((e) => [formatDate(e.expense_date), e.category, e.vendor || "—", inr(Number(e.amount)), e.description || "—"])} />
            </CardContent></Card>
        </>
      )}

      {reportType === "payment" && (
        <Card><CardHeader><CardTitle>Payments</CardTitle></CardHeader>
          <CardContent>
            <ReportTable headers={["Date", "Invoice", "Client", "Method", "Amount"]}
              rows={payments.map((p) => {
                const inv = p.invoices as { invoice_number: string; clients: { client_name: string; business_name: string | null } | null } | null;
                return [formatDate(p.payment_date), inv?.invoice_number || "", inv?.clients?.business_name || inv?.clients?.client_name || "", p.method, inr(Number(p.amount))];
              })} />
          </CardContent></Card>
      )}

      {reportType === "aging" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="Current" value={inr(aging.buckets.current)} />
            <Stat label="1–30 days" value={inr(aging.buckets.d30)} accent="text-yellow-600" />
            <Stat label="31–60 days" value={inr(aging.buckets.d60)} accent="text-orange-600" />
            <Stat label="61–90 days" value={inr(aging.buckets.d90)} accent="text-red-600" />
            <Stat label="90+ days" value={inr(aging.buckets.d90p)} accent="text-red-900" />
          </div>
          <Card><CardHeader><CardTitle>Outstanding Invoices</CardTitle><CardDescription>{aging.rows.length} open · sorted by most overdue</CardDescription></CardHeader>
            <CardContent>
              <ReportTable headers={["Client", "Invoice", "Due Date", "Days Overdue", "Balance"]}
                rows={aging.rows.map((r) => [r.client, r.invoice, formatDate(r.due) || "—", r.days > 0 ? `${r.days}d` : "—", inr(r.balance)])} />
            </CardContent></Card>
        </>
      )}

      {reportType === "top" && (
        <>
          {topClients.length > 0 && (
            <Card><CardHeader><CardTitle>Top Clients by Revenue</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(220, topClients.length * 32)}>
                  <BarChart data={topClients} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis type="number" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" fontSize={12} width={140} />
                    <Tooltip formatter={(v: number) => inr(v)} />
                    <Bar dataKey="revenue" fill="#16a34a" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent></Card>
          )}
          <Card><CardHeader><CardTitle>Ranking</CardTitle></CardHeader>
            <CardContent>
              <ReportTable headers={["#", "Client", "Payments", "Revenue"]}
                rows={topClients.map((c, i) => [String(i + 1), c.name, String(c.count), inr(c.revenue)])} />
            </CardContent></Card>
        </>
      )}

      {reportType === "profit" && trend.length > 0 && (
        <Card><CardHeader><CardTitle>Net Profit Trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trend.map((t) => ({ month: t.month, profit: t.revenue - t.expense - t.salary }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => inr(v)} />
                <Line type="monotone" dataKey="profit" stroke="#2563eb" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent></Card>
      )}

      {reportType === "client" && (
        <Card><CardHeader><CardTitle>Clients</CardTitle></CardHeader>
          <CardContent>
            <ReportTable headers={["Company", "Client", "Business", "Status", "Mobile", "Email"]}
              rows={clients.map((c) => [companies.find((co) => co.id === c.company_id)?.name || "", c.client_name, c.business_name || "—", c.status, c.mobile || "—", c.email || "—"])} />
          </CardContent></Card>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card><CardContent className="p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent ?? ""}`}>{value}</p>
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

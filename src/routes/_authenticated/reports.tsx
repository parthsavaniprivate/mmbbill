import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDown, Printer } from "lucide-react";
import { inr, formatDate, downloadCSV } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/reports")({ component: ReportsPage });

function ReportsPage() {
  const { selected, isAll, companies } = useCompany();
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [reportType, setReportType] = useState<"revenue" | "expense" | "profit" | "client" | "payment">("revenue");

  const { data } = useQuery({
    queryKey: ["report", from, to],
    queryFn: async () => {
      const [invoices, payments, expenses, clients] = await Promise.all([
        supabase.from("invoices").select("*, clients(client_name, business_name)").gte("invoice_date", from).lte("invoice_date", to),
        supabase.from("payments").select("*, invoices(company_id, invoice_number, clients(client_name, business_name))").gte("payment_date", from).lte("payment_date", to),
        supabase.from("expenses").select("*").gte("expense_date", from).lte("expense_date", to),
        supabase.from("clients").select("*"),
      ]);
      return { invoices: invoices.data ?? [], payments: payments.data ?? [], expenses: expenses.data ?? [], clients: clients.data ?? [] };
    },
  });

  if (!data) return <div className="text-muted-foreground">Loading…</div>;

  const filtCompany = <T extends { company_id?: string | null }>(rows: T[]) =>
    isAll ? rows : rows.filter((r) => r.company_id === selected);

  const invoices = filtCompany(data.invoices);
  const expenses = filtCompany(data.expenses);
  const payments = data.payments.filter((p) => {
    const inv = p.invoices as { company_id: string } | null;
    return isAll ? true : inv?.company_id === selected;
  });
  const clients = filtCompany(data.clients);

  const totRev = invoices.reduce((s, i) => s + Number(i.amount_paid), 0);
  const totExp = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totBilled = invoices.reduce((s, i) => s + Number(i.total), 0);

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
    } else {
      downloadCSV(fname, clients.map((c) => ({
        company: companies.find((co) => co.id === c.company_id)?.name,
        name: c.client_name, business: c.business_name, status: c.status, email: c.email, mobile: c.mobile, gst: c.gst_number,
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
            else if (v === "year") start.setFullYear(end.getFullYear() - 1);
            setFrom(start.toISOString().slice(0, 10)); setTo(end.toISOString().slice(0, 10));
          }}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 days</SelectItem>
              <SelectItem value="month">Last 30 days</SelectItem>
              <SelectItem value="year">Last 1 year</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Report Type</Label>
          <Select value={reportType} onValueChange={(v) => setReportType(v as typeof reportType)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="revenue">Revenue Report</SelectItem>
              <SelectItem value="expense">Expense Report</SelectItem>
              <SelectItem value="profit">Profit Report</SelectItem>
              <SelectItem value="client">Client Report</SelectItem>
              <SelectItem value="payment">Payment Report</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent></Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Total Billed" value={inr(totBilled)} />
        <Stat label="Total Revenue" value={inr(totRev)} />
        <Stat label="Total Expenses" value={inr(totExp)} />
        <Stat label="Net Profit" value={inr(totRev - totExp)} />
      </div>

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
        <Card><CardHeader><CardTitle>Expense Breakdown</CardTitle></CardHeader>
          <CardContent>
            <ReportTable headers={["Date", "Category", "Vendor", "Amount", "Description"]}
              rows={expenses.map((e) => [formatDate(e.expense_date), e.category, e.vendor || "—", inr(Number(e.amount)), e.description || "—"])} />
          </CardContent></Card>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </CardContent></Card>
  );
}

function ReportTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
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

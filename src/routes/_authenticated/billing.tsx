import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inr, downloadCSV } from "@/lib/format";
import { FileDown, AlertTriangle, TrendingUp, Wallet, Receipt } from "lucide-react";

export const Route = createFileRoute("/_authenticated/billing")({ component: BillingDashboard });

type ClientRow = {
  id: string;
  company_id: string;
  client_name: string;
  business_name: string | null;
  status: string | null;
  credit_limit: number | null;
  service_charge_type: string | null;
  service_charge_amount: number | null;
  billing_cycle: string | null;
  last_invoice_date: string | null;
};

type InvoiceRow = {
  id: string;
  company_id: string;
  client_id: string | null;
  total: number;
  amount_paid: number;
  status: string;
  invoice_date: string;
  due_date: string | null;
};

function BillingDashboard() {
  const { selected, isAll } = useCompany();

  const { data, isLoading } = useQuery({
    queryKey: ["billing-dashboard", selected, isAll],
    queryFn: async () => {
      const clientsQ = supabase
        .from("clients")
        .select(
          "id, company_id, client_name, business_name, status, credit_limit, service_charge_type, service_charge_amount, billing_cycle, last_invoice_date",
        );
      const invoicesQ = supabase
        .from("invoices")
        .select(
          "id, company_id, client_id, total, amount_paid, status, invoice_date, due_date",
        );

      const [c, i] = await Promise.all([clientsQ, invoicesQ]);
      if (c.error) throw c.error;
      if (i.error) throw i.error;
      return {
        clients: (c.data ?? []) as ClientRow[],
        invoices: (i.data ?? []) as InvoiceRow[],
      };
    },
  });

  if (isLoading || !data) return <div className="text-muted-foreground">Loading…</div>;

  const inScope = <T extends { company_id: string }>(rows: T[]) =>
    isAll ? rows : rows.filter((r) => r.company_id === selected);

  const clients = inScope(data.clients);
  const invoices = inScope(data.invoices);

  const rows = clients.map((c) => {
    const cInvoices = invoices.filter((i) => i.client_id === c.id);
    const billed = cInvoices.reduce((s, i) => s + Number(i.total ?? 0), 0);
    const collected = cInvoices.reduce((s, i) => s + Number(i.amount_paid ?? 0), 0);
    const outstanding = billed - collected;
    const overdue = cInvoices
      .filter((i) => i.status === "overdue" || (i.due_date && new Date(i.due_date) < new Date() && Number(i.amount_paid) < Number(i.total)))
      .reduce((s, i) => s + (Number(i.total) - Number(i.amount_paid)), 0);
    const creditLeft = c.credit_limit != null ? Number(c.credit_limit) - outstanding : null;
    return { client: c, billed, collected, outstanding, overdue, creditLeft, invoiceCount: cInvoices.length };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      billed: acc.billed + r.billed,
      collected: acc.collected + r.collected,
      outstanding: acc.outstanding + r.outstanding,
      overdue: acc.overdue + r.overdue,
    }),
    { billed: 0, collected: 0, outstanding: 0, overdue: 0 },
  );

  const overLimit = rows.filter((r) => r.creditLeft != null && r.creditLeft < 0);
  const overdueRows = rows.filter((r) => r.overdue > 0).sort((a, b) => b.overdue - a.overdue);

  const exportCsv = () => {
    downloadCSV(
      `billing-summary-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((r) => ({
        client: r.client.business_name || r.client.client_name,
        invoices: r.invoiceCount,
        billed: r.billed,
        collected: r.collected,
        outstanding: r.outstanding,
        overdue: r.overdue,
        credit_limit: r.client.credit_limit ?? "",
        credit_left: r.creditLeft ?? "",
        last_invoice: r.client.last_invoice_date ?? "",
      })),
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing Dashboard</h1>
          <p className="text-sm text-muted-foreground">Invoices, outstanding & credit per client.</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <FileDown className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Receipt} label="Total Billed" value={inr(totals.billed)} />
        <StatCard icon={Wallet} label="Collected" value={inr(totals.collected)} tone="success" />
        <StatCard icon={AlertTriangle} label="Outstanding" value={inr(totals.outstanding)} tone="warning" />
        <StatCard icon={TrendingUp} label="Overdue" value={inr(totals.overdue)} tone="accent" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Overdue Invoices by Client</CardTitle>
            <CardDescription>Outstanding past due date.</CardDescription>
          </CardHeader>
          <CardContent>
            {overdueRows.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">No overdue invoices.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Overdue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overdueRows.slice(0, 10).map((r) => (
                    <TableRow key={r.client.id}>
                      <TableCell>
                        <Link to="/clients/$id" params={{ id: r.client.id }} className="hover:underline">
                          {r.client.business_name || r.client.client_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right text-destructive font-semibold">{inr(r.overdue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Over Credit Limit</CardTitle>
            <CardDescription>Outstanding exceeds the configured credit limit.</CardDescription>
          </CardHeader>
          <CardContent>
            {overLimit.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">All clients within their credit limit.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Limit</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Over By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overLimit.map((r) => (
                    <TableRow key={r.client.id}>
                      <TableCell>
                        <Link to="/clients/$id" params={{ id: r.client.id }} className="hover:underline">
                          {r.client.business_name || r.client.client_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{inr(Number(r.client.credit_limit ?? 0))}</TableCell>
                      <TableCell className="text-right">{inr(r.outstanding)}</TableCell>
                      <TableCell className="text-right text-destructive font-semibold">{inr(-(r.creditLeft ?? 0))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Clients</CardTitle>
          <CardDescription>Full billing snapshot per client.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Credit Left</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.client.id}>
                    <TableCell>
                      <Link to="/clients/$id" params={{ id: r.client.id }} className="hover:underline font-medium">
                        {r.client.business_name || r.client.client_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.client.status === "active" ? "default" : "secondary"}>{r.client.status ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground capitalize">{r.client.billing_cycle ?? "—"}</TableCell>
                    <TableCell className="text-right">{inr(r.billed)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{inr(r.collected)}</TableCell>
                    <TableCell className="text-right font-medium">{inr(r.outstanding)}</TableCell>
                    <TableCell className={`text-right ${r.creditLeft != null && r.creditLeft < 0 ? "text-destructive font-semibold" : ""}`}>
                      {r.creditLeft == null ? "—" : inr(r.creditLeft)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "success" | "warning" | "accent";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-500"
      : tone === "warning"
        ? "text-amber-500"
        : tone === "accent"
          ? "text-primary"
          : "text-muted-foreground";
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`w-10 h-10 rounded-lg bg-muted flex items-center justify-center ${toneClass}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold truncate">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

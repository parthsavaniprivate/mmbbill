import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inr, downloadCSV } from "@/lib/format";
import { FileDown, AlertTriangle, TrendingUp, Wallet, Receipt, Percent, Search, ArrowUpDown } from "lucide-react";

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

type SortKey = "name" | "billed" | "collected" | "outstanding" | "overdue";
type FilterKey = "all" | "overdue" | "overlimit" | "active";

function BillingDashboard() {
  const { selected, isAll } = useCompany();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("outstanding");
  const [sortDesc, setSortDesc] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["billing-dashboard", selected, isAll],
    queryFn: async () => {
      const [c, i] = await Promise.all([
        supabase.from("clients").select(
          "id, company_id, client_name, business_name, status, credit_limit, service_charge_type, service_charge_amount, billing_cycle, last_invoice_date",
        ),
        supabase.from("invoices").select(
          "id, company_id, client_id, total, amount_paid, status, invoice_date, due_date",
        ),
      ]);
      if (c.error) throw c.error;
      if (i.error) throw i.error;
      return { clients: (c.data ?? []) as ClientRow[], invoices: (i.data ?? []) as InvoiceRow[] };
    },
  });

  const inScope = <T extends { company_id: string }>(rows: T[]) =>
    isAll ? rows : rows.filter((r) => r.company_id === selected);

  const clients = inScope(data?.clients ?? []);
  const invoices = inScope(data?.invoices ?? []);
  const now = Date.now();

  const rows = useMemo(() => clients.map((c) => {
    const cInvoices = invoices.filter((i) => i.client_id === c.id);
    const billed = cInvoices.reduce((s, i) => s + Number(i.total ?? 0), 0);
    const collected = cInvoices.reduce((s, i) => s + Number(i.amount_paid ?? 0), 0);
    const outstanding = billed - collected;
    let overdue = 0;
    let oldestDays = 0;
    for (const i of cInvoices) {
      const bal = Number(i.total) - Number(i.amount_paid);
      if (bal <= 0) continue;
      const dueMs = i.due_date ? new Date(i.due_date).getTime() : new Date(i.invoice_date).getTime();
      const days = Math.floor((now - dueMs) / 86400000);
      if (days > 0) { overdue += bal; if (days > oldestDays) oldestDays = days; }
    }
    const creditLeft = c.credit_limit != null ? Number(c.credit_limit) - outstanding : null;
    return { client: c, billed, collected, outstanding, overdue, creditLeft, invoiceCount: cInvoices.length, oldestDays };
  }), [clients, invoices, now]);

  const totals = rows.reduce(
    (acc, r) => ({ billed: acc.billed + r.billed, collected: acc.collected + r.collected, outstanding: acc.outstanding + r.outstanding, overdue: acc.overdue + r.overdue }),
    { billed: 0, collected: 0, outstanding: 0, overdue: 0 },
  );
  const collectionRate = totals.billed > 0 ? (totals.collected / totals.billed) * 100 : 0;

  const overLimit = rows.filter((r) => r.creditLeft != null && r.creditLeft < 0);
  const overdueRows = rows.filter((r) => r.overdue > 0).sort((a, b) => b.overdue - a.overdue);

  const filtered = useMemo(() => {
    let out = rows;
    if (filter === "overdue") out = out.filter((r) => r.overdue > 0);
    else if (filter === "overlimit") out = out.filter((r) => r.creditLeft != null && r.creditLeft < 0);
    else if (filter === "active") out = out.filter((r) => r.client.status === "active");
    const q = search.trim().toLowerCase();
    if (q) out = out.filter((r) => (r.client.business_name || r.client.client_name || "").toLowerCase().includes(q));
    const sorted = [...out].sort((a, b) => {
      if (sortKey === "name") return (a.client.business_name || a.client.client_name || "").localeCompare(b.client.business_name || b.client.client_name || "");
      return a[sortKey] - b[sortKey];
    });
    if (sortDesc && sortKey !== "name") sorted.reverse();
    if (sortDesc && sortKey === "name") sorted.reverse();
    return sorted;
  }, [rows, filter, search, sortKey, sortDesc]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDesc((d) => !d);
    else { setSortKey(k); setSortDesc(k !== "name"); }
  };

  const exportCsv = () => {
    downloadCSV(
      `billing-summary-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        client: r.client.business_name || r.client.client_name,
        invoices: r.invoiceCount,
        billed: r.billed, collected: r.collected, outstanding: r.outstanding, overdue: r.overdue,
        credit_limit: r.client.credit_limit ?? "", credit_left: r.creditLeft ?? "",
        oldest_overdue_days: r.oldestDays || "", last_invoice: r.client.last_invoice_date ?? "",
      })),
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const agingBadge = (days: number) => {
    if (!days) return null;
    const cls = days <= 30 ? "bg-yellow-500/15 text-yellow-700" : days <= 60 ? "bg-orange-500/15 text-orange-700" : "bg-red-500/15 text-red-700";
    return <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${cls}`}>{days}d</span>;
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={Receipt} label="Total Billed" value={inr(totals.billed)} />
        <StatCard icon={Wallet} label="Collected" value={inr(totals.collected)} tone="success" />
        <StatCard icon={Percent} label="Collection Rate" value={`${collectionRate.toFixed(1)}%`} tone={collectionRate >= 80 ? "success" : collectionRate >= 50 ? "warning" : "accent"} />
        <StatCard icon={AlertTriangle} label="Outstanding" value={inr(totals.outstanding)} tone="warning" />
        <StatCard icon={TrendingUp} label="Overdue" value={inr(totals.overdue)} tone="accent" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Overdue Invoices by Client</CardTitle><CardDescription>Outstanding past due date.</CardDescription></CardHeader>
          <CardContent>
            {overdueRows.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">No overdue invoices.</div>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Client</TableHead><TableHead className="text-right">Overdue</TableHead></TableRow></TableHeader>
                <TableBody>
                  {overdueRows.slice(0, 10).map((r) => (
                    <TableRow key={r.client.id}>
                      <TableCell>
                        <Link to="/clients/$id" params={{ id: r.client.id }} className="hover:underline">
                          {r.client.business_name || r.client.client_name}
                        </Link>
                        {agingBadge(r.oldestDays)}
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
          <CardHeader><CardTitle>Over Credit Limit</CardTitle><CardDescription>Outstanding exceeds credit limit.</CardDescription></CardHeader>
          <CardContent>
            {overLimit.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">All clients within their credit limit.</div>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Client</TableHead><TableHead className="text-right">Limit</TableHead><TableHead className="text-right">Outstanding</TableHead><TableHead className="text-right">Over By</TableHead></TableRow></TableHeader>
                <TableBody>
                  {overLimit.map((r) => (
                    <TableRow key={r.client.id}>
                      <TableCell><Link to="/clients/$id" params={{ id: r.client.id }} className="hover:underline">{r.client.business_name || r.client.client_name}</Link></TableCell>
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>All Clients</CardTitle>
              <CardDescription>{filtered.length} of {rows.length} clients</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search client…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pl-8 w-56" />
              </div>
              <div className="flex gap-1">
                {(["all", "overdue", "overlimit", "active"] as FilterKey[]).map((k) => (
                  <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)} className="capitalize">
                    {k === "overlimit" ? "Over Limit" : k}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground py-10 text-center">No clients match.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead label="Client" k="name" sortKey={sortKey} sortDesc={sortDesc} onClick={toggleSort} />
                    <TableHead>Status</TableHead>
                    <TableHead>Cycle</TableHead>
                    <SortHead label="Billed" k="billed" sortKey={sortKey} sortDesc={sortDesc} onClick={toggleSort} align="right" />
                    <SortHead label="Collected" k="collected" sortKey={sortKey} sortDesc={sortDesc} onClick={toggleSort} align="right" />
                    <SortHead label="Outstanding" k="outstanding" sortKey={sortKey} sortDesc={sortDesc} onClick={toggleSort} align="right" />
                    <SortHead label="Overdue" k="overdue" sortKey={sortKey} sortDesc={sortDesc} onClick={toggleSort} align="right" />
                    <TableHead className="text-right">Credit Left</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.client.id}>
                      <TableCell>
                        <Link to="/clients/$id" params={{ id: r.client.id }} className="hover:underline font-medium">
                          {r.client.business_name || r.client.client_name}
                        </Link>
                      </TableCell>
                      <TableCell><Badge variant={r.client.status === "active" ? "default" : "secondary"}>{r.client.status ?? "—"}</Badge></TableCell>
                      <TableCell className="text-muted-foreground capitalize">{r.client.billing_cycle ?? "—"}</TableCell>
                      <TableCell className="text-right">{inr(r.billed)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{inr(r.collected)}</TableCell>
                      <TableCell className="text-right font-medium">{inr(r.outstanding)}</TableCell>
                      <TableCell className="text-right">
                        {r.overdue > 0 ? <span className="text-destructive font-semibold">{inr(r.overdue)}{agingBadge(r.oldestDays)}</span> : "—"}
                      </TableCell>
                      <TableCell className={`text-right ${r.creditLeft != null && r.creditLeft < 0 ? "text-destructive font-semibold" : ""}`}>
                        {r.creditLeft == null ? "—" : inr(r.creditLeft)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SortHead({ label, k, sortKey, sortDesc, onClick, align }: { label: string; k: SortKey; sortKey: SortKey; sortDesc: boolean; onClick: (k: SortKey) => void; align?: "right" }) {
  const active = sortKey === k;
  return (
    <TableHead className={align === "right" ? "text-right" : ""}>
      <button onClick={() => onClick(k)} className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}>
        {label}<ArrowUpDown className={`w-3 h-3 ${active ? "opacity-100" : "opacity-40"} ${active && !sortDesc ? "rotate-180" : ""}`} />
      </button>
    </TableHead>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone?: "success" | "warning" | "accent" }) {
  const toneClass = tone === "success" ? "text-emerald-500" : tone === "warning" ? "text-amber-500" : tone === "accent" ? "text-primary" : "text-muted-foreground";
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

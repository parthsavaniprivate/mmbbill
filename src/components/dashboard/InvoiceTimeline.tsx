import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Link } from "@tanstack/react-router";
import {
  Eye, Pencil, Wallet, Download, MessageCircle, Mail, Search, FileText,
} from "lucide-react";
import { inr, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SendReminderDialog } from "@/components/invoices/SendReminderDialog";
import { toast } from "sonner";

type Invoice = {
  id: string;
  invoice_number: string;
  client_id: string;
  company_id: string;
  invoice_date: string;
  due_date: string | null;
  total: number;
  amount_paid: number;
  status: string;
  reminders_sent: number | null;
};
type Client = {
  id: string;
  client_name: string;
  business_name?: string | null;
  whatsapp?: string | null;
  mobile?: string | null;
  email?: string | null;
  company_id?: string | null;
};
type Payment = {
  id: string; invoice_id: string; amount: number; payment_date: string; method: string | null;
};
type Company = { id: string; name: string };

type Granularity = "day" | "week" | "month";

const STATUS_META: Record<string, { label: string; bar: string; text: string; ring: string }> = {
  pending:        { label: "Pending",   bar: "bg-amber-500/85 hover:bg-amber-400",     text: "text-amber-500",   ring: "ring-amber-500/40" },
  overdue:        { label: "Overdue",   bar: "bg-red-500/85 hover:bg-red-400",         text: "text-red-500",     ring: "ring-red-500/40" },
  partially_paid: { label: "Partial",   bar: "bg-blue-500/85 hover:bg-blue-400",       text: "text-blue-500",    ring: "ring-blue-500/40" },
  paid:           { label: "Paid",      bar: "bg-emerald-500/85 hover:bg-emerald-400", text: "text-emerald-500", ring: "ring-emerald-500/40" },
  cancelled:      { label: "Cancelled", bar: "bg-zinc-500/70 hover:bg-zinc-400",       text: "text-zinc-400",    ring: "ring-zinc-500/40" },
  draft:          { label: "Draft",     bar: "bg-zinc-500/60 hover:bg-zinc-400",       text: "text-zinc-400",    ring: "ring-zinc-500/40" },
};

function effectiveStatus(inv: Invoice, today: Date): keyof typeof STATUS_META {
  if (inv.status === "cancelled" || inv.status === "draft" || inv.status === "paid") return inv.status as keyof typeof STATUS_META;
  const paid = Number(inv.amount_paid || 0);
  const total = Number(inv.total || 0);
  if (paid >= total && total > 0) return "paid";
  if (inv.due_date && new Date(inv.due_date) < today && paid < total) return "overdue";
  if (paid > 0 && paid < total) return "partially_paid";
  return "pending";
}

function startOf(d: Date, g: Granularity): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (g === "week") {
    const day = x.getDay();
    x.setDate(x.getDate() - day);
  } else if (g === "month") {
    x.setDate(1);
  }
  return x;
}
function addUnit(d: Date, g: Granularity, n = 1): Date {
  const x = new Date(d);
  if (g === "day") x.setDate(x.getDate() + n);
  else if (g === "week") x.setDate(x.getDate() + 7 * n);
  else x.setMonth(x.getMonth() + n);
  return x;
}
function tickLabel(d: Date, g: Granularity): string {
  if (g === "day") return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  if (g === "week") return `W${Math.ceil(d.getDate() / 7)} ${d.toLocaleDateString("en-IN", { month: "short" })}`;
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

const ROW_H = 44;
const CLIENT_COL = 220;

type Props = {
  invoices: Invoice[];
  clients: Client[];
  companies: Company[];
  payments: Payment[];
  from?: Date;
  to?: Date;
  selectedCompany: string;
  isAll: boolean;
};

export function InvoiceTimeline({ invoices, clients, companies, payments, from, to, selectedCompany, isAll }: Props) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const today = useMemo(() => new Date(), []);

  // Live updates: refetch dashboard when invoices or payments change.
  useEffect(() => {
    const ch = supabase
      .channel("invoice-timeline")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => {
        qc.invalidateQueries({ queryKey: ["dashboard-data"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
        qc.invalidateQueries({ queryKey: ["dashboard-data"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  // Monthly Gantt scale: start from the earliest invoice month, end at the latest
  // invoice month (or current month, whichever is later). No empty leading months.
  const granularity: Granularity = "month";
  const now = new Date();
  const invoiceDates = invoices.map((i) => +new Date(i.invoice_date)).filter((n) => !Number.isNaN(n));
  const firstInvoice = invoiceDates.length ? new Date(Math.min(...invoiceDates)) : now;
  const lastInvoice = invoiceDates.length ? new Date(Math.max(...invoiceDates)) : now;
  const gStart = startOf(firstInvoice, granularity);
  const gEnd = startOf(lastInvoice > now ? lastInvoice : now, granularity);
  const monthCount = Math.max(1, (gEnd.getFullYear() - gStart.getFullYear()) * 12 + (gEnd.getMonth() - gStart.getMonth()) + 1);
  const ticks: Date[] = [];
  for (let i = 0; i < monthCount; i++) ticks.push(addUnit(gStart, granularity, i));
  const tickWidth = 120;
  const totalWidth = ticks.length * tickWidth;
  const totalMs = Math.max(1, +addUnit(gStart, granularity, ticks.length) - +gStart);
  const spanDays = Math.max(1, Math.round(totalMs / 86400000));

  const xFor = (d: Date) => {
    const ms = Math.max(0, +d - +gStart);
    return Math.min(totalWidth, (ms / totalMs) * totalWidth);
  };

  // Filter invoices
  const filtered = useMemo(() => {
    return invoices.filter((i) => {
      if (companyFilter !== "all" && i.company_id !== companyFilter) return false;
      if (clientFilter !== "all" && i.client_id !== clientFilter) return false;
      if (invoiceSearch && !i.invoice_number.toLowerCase().includes(invoiceSearch.toLowerCase())) return false;
      const eff = effectiveStatus(i, today);
      if (eff === "partially_paid" || eff === "cancelled" || eff === "draft") return false;
      if (statusFilter !== "all" && eff !== statusFilter) return false;
      // Range: keep invoices that overlap the window
      const s = new Date(i.invoice_date);
      const e = i.due_date ? new Date(i.due_date) : addUnit(s, "day", 1);
      const winEnd = addUnit(gStart, granularity, ticks.length);
      if (e < gStart || s > winEnd) return false;
      return true;
    });
  }, [invoices, companyFilter, clientFilter, invoiceSearch, statusFilter, today, gStart, granularity, ticks.length]);

  // Group by client
  const clientRows = useMemo(() => {
    const byId = new Map<string, Client>();
    for (const c of clients) byId.set(c.id, c);
    const groups = new Map<string, Invoice[]>();
    for (const inv of filtered) {
      const arr = groups.get(inv.client_id) ?? [];
      arr.push(inv);
      groups.set(inv.client_id, arr);
    }
    const rows = [...groups.entries()].map(([cid, invs]) => ({
      client: byId.get(cid) ?? ({ id: cid, client_name: "Unknown" } as Client),
      invoices: invs.sort((a, b) => +new Date(a.invoice_date) - +new Date(b.invoice_date)),
    }));
    return rows
      .filter((r) => !clientSearch || (r.client.client_name + " " + (r.client.business_name ?? "")).toLowerCase().includes(clientSearch.toLowerCase()))
      .sort((a, b) => a.client.client_name.localeCompare(b.client.client_name));
  }, [filtered, clients, clientSearch]);

  const activeInvoice = activeId ? invoices.find((i) => i.id === activeId) ?? null : null;
  const activeClient = activeInvoice ? clients.find((c) => c.id === activeInvoice.client_id) ?? null : null;
  const activeCompany = activeInvoice ? companies.find((c) => c.id === activeInvoice.company_id) ?? null : null;
  const activePayments = activeInvoice ? payments.filter((p) => p.invoice_id === activeInvoice.id).sort((a, b) => +new Date(b.payment_date) - +new Date(a.payment_date)) : [];

  const legend: Array<{ key: string; label: string; cls: string }> = [
    { key: "pending", label: "Pending", cls: "bg-amber-500" },
    { key: "overdue", label: "Overdue", cls: "bg-red-500" },
    { key: "paid", label: "Paid", cls: "bg-emerald-500" },
  ];

  const bodyHeight = Math.max(240, clientRows.length * ROW_H + 8);

  return (
    <Card className="shadow-card">
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Invoice Timeline</CardTitle>
            <CardDescription>
              Gantt-style view · 12-month scale · live updates
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {legend.map((l) => (
              <span key={l.key} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("w-3 h-3 rounded-sm", l.cls)} />
                {l.label}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-[repeat(2,minmax(0,1fr))_repeat(3,auto)]">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Search client…" className="pl-8" />
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)} placeholder="Search invoice #…" className="pl-8" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Client" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All clients</SelectItem>
              {clients
                .filter((c) => isAll || c.company_id === selectedCompany)
                .sort((a, b) => a.client_name.localeCompare(b.client_name))
                .map((c) => <SelectItem key={c.id} value={c.id}>{c.client_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Company" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {clientRows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No invoices match the current filters.</div>
        ) : (
          <div ref={scrollRef} className="relative overflow-auto rounded-b-xl border-t border-border/60 bg-background/40" style={{ maxHeight: 560 }}>
            <div style={{ width: CLIENT_COL + totalWidth, minWidth: "100%" }}>
              {/* Sticky header row */}
              <div className="sticky top-0 z-20 flex bg-card/95 backdrop-blur border-b border-border/60">
                <div
                  className="sticky left-0 z-30 bg-card/95 backdrop-blur border-r border-border/60 px-3 flex items-center text-xs uppercase tracking-wider text-muted-foreground font-semibold"
                  style={{ width: CLIENT_COL, minWidth: CLIENT_COL, height: 40 }}
                >
                  Client
                </div>
                <div className="relative" style={{ width: totalWidth, height: 40 }}>
                  {ticks.map((t, idx) => (
                    <div
                      key={idx}
                      className="absolute top-0 h-full border-l border-border/40 text-[10px] text-muted-foreground pl-1 pt-1"
                      style={{ left: idx * tickWidth, width: tickWidth }}
                    >
                      {tickLabel(t, granularity)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Body */}
              <div className="relative" style={{ height: bodyHeight }}>
                {clientRows.map((row, rowIdx) => (
                  <div
                    key={row.client.id}
                    className="flex border-b border-border/40"
                    style={{ height: ROW_H }}
                  >
                    <div
                      className="sticky left-0 z-10 bg-card/95 backdrop-blur border-r border-border/60 px-3 flex items-center gap-2 text-sm"
                      style={{ width: CLIENT_COL, minWidth: CLIENT_COL }}
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{row.client.client_name}</p>
                        {row.client.business_name && (
                          <p className="text-[10px] text-muted-foreground truncate">{row.client.business_name}</p>
                        )}
                      </div>
                    </div>
                    <div className="relative flex-1" style={{ width: totalWidth }}>
                      {/* vertical gridlines */}
                      {ticks.map((_, idx) => (
                        <div
                          key={idx}
                          className={cn("absolute top-0 bottom-0 border-l border-border/25", rowIdx === 0 && "border-border/40")}
                          style={{ left: idx * tickWidth }}
                        />
                      ))}
                      {/* today marker on first row area (drawn per row for simplicity) */}
                      {today >= gStart && today <= addUnit(gStart, granularity, ticks.length) && (
                        <div
                          className="absolute top-0 bottom-0 w-px bg-primary/60"
                          style={{ left: xFor(today) }}
                        />
                      )}
                      {row.invoices.map((inv) => {
                        const eff = effectiveStatus(inv, today);
                        const meta = STATUS_META[eff];
                        const s = new Date(inv.invoice_date);
                        const e = inv.due_date ? new Date(inv.due_date) : addUnit(s, "day", Math.max(1, Math.round(spanDays / 30)));
                        const left = xFor(s);
                        const right = xFor(e < s ? addUnit(s, "day", 1) : e);
                        const width = Math.max(48, right - left);
                        return (
                          <button
                            key={inv.id}
                            onClick={() => setActiveId(inv.id)}
                            title={`${inv.invoice_number} · ${inr(inv.total)}`}
                            className={cn(
                              "absolute top-1.5 h-8 rounded-md text-[11px] font-medium text-white shadow-sm transition-all",
                              "flex items-center gap-2 px-2 overflow-hidden ring-1 ring-inset",
                              meta.bar, meta.ring,
                              activeId === inv.id && "ring-2 ring-primary scale-[1.02]",
                            )}
                            style={{ left, width }}
                          >
                            <span className="truncate">{inv.invoice_number}</span>
                            <span className="ml-auto shrink-0 opacity-90">{inr(inv.total)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={!!activeId} onOpenChange={(o) => !o && setActiveId(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {activeInvoice && (
            <>
              <DialogHeader className="text-left">
                <div className="flex items-center justify-between gap-2">
                  <DialogTitle className="text-xl">{activeInvoice.invoice_number}</DialogTitle>
                  <Badge className={cn("border-0", STATUS_META[effectiveStatus(activeInvoice, today)].text, "bg-transparent border border-current")}>
                    {STATUS_META[effectiveStatus(activeInvoice, today)].label}
                  </Badge>
                </div>
                <DialogDescription>
                  {activeClient?.client_name}{activeClient?.business_name ? ` · ${activeClient.business_name}` : ""}
                  {activeCompany ? ` · ${activeCompany.name}` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="mt-6 space-y-5">
                {/* Summary */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Invoice Date</p>
                    <p className="font-semibold">{formatDate(activeInvoice.invoice_date)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Due Date</p>
                    <p className="font-semibold">{activeInvoice.due_date ? formatDate(activeInvoice.due_date) : "—"}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="font-semibold">{inr(activeInvoice.total)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Paid</p>
                    <p className="font-semibold text-emerald-500">{inr(activeInvoice.amount_paid)}</p>
                  </div>
                  <div className="rounded-lg border p-3 col-span-2">
                    <p className="text-xs text-muted-foreground">Remaining Balance</p>
                    <p className="font-bold text-amber-500">{inr(Math.max(0, Number(activeInvoice.total) - Number(activeInvoice.amount_paid)))}</p>
                    <Progress
                      value={Number(activeInvoice.total) > 0 ? Math.min(100, (Number(activeInvoice.amount_paid) / Number(activeInvoice.total)) * 100) : 0}
                      className="mt-2 h-2"
                    />
                  </div>
                  <div className="rounded-lg border p-3 col-span-2">
                    <p className="text-xs text-muted-foreground">
                      {activeInvoice.due_date && new Date(activeInvoice.due_date) < today
                        ? "Days Overdue"
                        : "Days Remaining"}
                    </p>
                    <p className="font-semibold">
                      {activeInvoice.due_date
                        ? Math.abs(Math.round((+new Date(activeInvoice.due_date) - +today) / 86400000)) + " days"
                        : "—"}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link to="/invoices/$id" params={{ id: activeInvoice.id }}>
                      <Eye className="w-4 h-4 mr-1" /> View
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/invoices/$id/edit" params={{ id: activeInvoice.id }}>
                      <Pencil className="w-4 h-4 mr-1" /> Edit
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/invoices/$id" params={{ id: activeInvoice.id }}>
                      <Wallet className="w-4 h-4 mr-1" /> Record Payment
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/invoices/$id" params={{ id: activeInvoice.id }}>
                      <FileText className="w-4 h-4 mr-1" /> PDF Preview
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/invoices/$id" params={{ id: activeInvoice.id }}>
                      <Download className="w-4 h-4 mr-1" /> Download PDF
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setReminderOpen(true)}>
                    <MessageCircle className="w-4 h-4 mr-1" /> WhatsApp
                  </Button>
                </div>

                {/* Payment history */}
                <div>
                  <p className="text-sm font-semibold mb-2">Payment History</p>
                  {activePayments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No payments recorded yet.</p>
                  ) : (
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-xs text-muted-foreground">
                          <tr>
                            <th className="text-left px-3 py-2">Date</th>
                            <th className="text-left px-3 py-2">Method</th>
                            <th className="text-right px-3 py-2">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activePayments.map((p) => (
                            <tr key={p.id} className="border-t border-border/50">
                              <td className="px-3 py-2">{formatDate(p.payment_date)}</td>
                              <td className="px-3 py-2 capitalize">{p.method ?? "—"}</td>
                              <td className="px-3 py-2 text-right font-medium text-emerald-500">{inr(p.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {activeClient && (
                <SendReminderDialog
                  open={reminderOpen}
                  onOpenChange={setReminderOpen}
                  invoice={{
                    id: activeInvoice.id,
                    invoice_number: activeInvoice.invoice_number,
                    total: Number(activeInvoice.total),
                    amount_paid: Number(activeInvoice.amount_paid),
                    due_date: activeInvoice.due_date,
                    status: activeInvoice.status,
                    reminders_sent: activeInvoice.reminders_sent,
                  }}
                  client={{
                    client_name: activeClient.client_name,
                    whatsapp: activeClient.whatsapp ?? null,
                    mobile: activeClient.mobile ?? null,
                  }}
                  companyName={activeCompany?.name}
                />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

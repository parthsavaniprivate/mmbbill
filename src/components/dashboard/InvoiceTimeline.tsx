import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "@tanstack/react-router";
import {
  Eye, Pencil, Wallet, Download, MessageCircle, Search, FileText,
  Activity, Calendar, Zap, Clock, AlertTriangle, CheckCircle2, TrendingUp,
} from "lucide-react";
import { inr, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SendReminderDialog } from "@/components/invoices/SendReminderDialog";

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

const STATUS_META: Record<string, { label: string; grad: string; ring: string; text: string; dot: string }> = {
  pending:        { label: "Pending",   grad: "from-amber-500/90 to-amber-400/70",     ring: "ring-amber-400/40",   text: "text-amber-300",   dot: "bg-amber-400" },
  overdue:        { label: "Overdue",   grad: "from-red-500/90 to-rose-400/70",        ring: "ring-red-400/40",     text: "text-red-300",     dot: "bg-red-400" },
  partially_paid: { label: "Partial",   grad: "from-blue-500/90 to-sky-400/70",        ring: "ring-blue-400/40",    text: "text-blue-300",    dot: "bg-blue-400" },
  paid:           { label: "Paid",      grad: "from-emerald-500/90 to-teal-400/70",    ring: "ring-emerald-400/40", text: "text-emerald-300", dot: "bg-emerald-400" },
  cancelled:      { label: "Cancelled", grad: "from-zinc-500/70 to-zinc-400/60",       ring: "ring-zinc-400/30",    text: "text-zinc-300",    dot: "bg-zinc-400" },
  draft:          { label: "Draft",     grad: "from-zinc-500/60 to-zinc-400/50",       ring: "ring-zinc-400/30",    text: "text-zinc-300",    dot: "bg-zinc-400" },
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

const ROW_H = 56;
const CLIENT_COL = 240;

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

export function InvoiceTimeline({ invoices, clients, companies, payments, from: _from, to, selectedCompany, isAll }: Props) {
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
  const tickWidth = 140;
  const totalWidth = ticks.length * tickWidth;
  const totalMs = Math.max(1, +addUnit(gStart, granularity, ticks.length) - +gStart);
  const spanDays = Math.max(1, Math.round(totalMs / 86400000));

  const xFor = (d: Date) => {
    const ms = Math.max(0, +d - +gStart);
    return Math.min(totalWidth, (ms / totalMs) * totalWidth);
  };

  const filtered = useMemo(() => {
    return invoices.filter((i) => {
      if (companyFilter !== "all" && i.company_id !== companyFilter) return false;
      if (clientFilter !== "all" && i.client_id !== clientFilter) return false;
      if (invoiceSearch && !i.invoice_number.toLowerCase().includes(invoiceSearch.toLowerCase())) return false;
      const eff = effectiveStatus(i, today);
      if (eff === "partially_paid" || eff === "cancelled" || eff === "draft") return false;
      if (statusFilter !== "all" && eff !== statusFilter) return false;
      const s = new Date(i.invoice_date);
      const e = i.due_date ? new Date(i.due_date) : addUnit(s, "day", 1);
      const winEnd = addUnit(gStart, granularity, ticks.length);
      if (e < gStart || s > winEnd) return false;
      return true;
    });
  }, [invoices, companyFilter, clientFilter, invoiceSearch, statusFilter, today, gStart, granularity, ticks.length]);

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
  const activePayments = activeInvoice
    ? payments.filter((p) => p.invoice_id === activeInvoice.id).sort((a, b) => +new Date(b.payment_date) - +new Date(a.payment_date))
    : [];

  // Summary metrics from the filtered set
  const summary = useMemo(() => {
    let pendAmt = 0, pendCount = 0, overAmt = 0, overCount = 0, paidAmt = 0, paidCount = 0, invoiced = 0, collected = 0;
    for (const i of filtered) {
      const eff = effectiveStatus(i, today);
      const t = Number(i.total || 0);
      const p = Number(i.amount_paid || 0);
      invoiced += t;
      collected += p;
      if (eff === "pending") { pendAmt += (t - p); pendCount += 1; }
      else if (eff === "overdue") { overAmt += (t - p); overCount += 1; }
      else if (eff === "paid") { paidAmt += t; paidCount += 1; }
    }
    const rate = invoiced > 0 ? (collected / invoiced) * 100 : 0;
    return { pendAmt, pendCount, overAmt, overCount, paidAmt, paidCount, rate };
  }, [filtered, today]);

  const bodyHeight = Math.max(240, clientRows.length * ROW_H + 8);

  return (
    <Card className="overflow-hidden border-border/60 bg-gradient-to-b from-card via-card to-card/60 shadow-xl backdrop-blur">
      {/* HEADER */}
      <div className="border-b border-border/60 bg-gradient-to-r from-card/80 via-card/60 to-card/80 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/20">
                <Activity className="h-4 w-4" />
              </span>
              Invoice Timeline
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Track all invoices, payments and collections in real time.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Live Updates
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" /> {monthCount} Month Timeline
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-300">
              <Zap className="h-3.5 w-3.5" /> Realtime
            </span>
          </div>
        </div>

        {/* SUMMARY CARDS */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            icon={<Clock className="h-4 w-4" />}
            label="Pending"
            value={inr(summary.pendAmt)}
            hint={`${summary.pendCount} invoice${summary.pendCount === 1 ? "" : "s"}`}
            tone="amber"
          />
          <SummaryCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Overdue"
            value={inr(summary.overAmt)}
            hint={`${summary.overCount} invoice${summary.overCount === 1 ? "" : "s"}`}
            tone="red"
          />
          <SummaryCard
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Paid"
            value={inr(summary.paidAmt)}
            hint={`${summary.paidCount} invoice${summary.paidCount === 1 ? "" : "s"}`}
            tone="emerald"
          />
          <SummaryCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Collection Rate"
            value={`${summary.rate.toFixed(1)}%`}
            hint="of invoiced amount"
            tone="blue"
            progress={Math.min(100, summary.rate)}
          />
        </div>

        {/* FILTER BAR */}
        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-background/40 p-2 backdrop-blur">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Search client…"
              className="h-9 border-transparent bg-transparent pl-8 focus-visible:ring-1"
            />
          </div>
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
              placeholder="Search invoice #…"
              className="h-9 border-transparent bg-transparent pl-8 focus-visible:ring-1"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Client" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All clients</SelectItem>
              {clients
                .filter((c) => isAll || c.company_id === selectedCompany)
                .sort((a, b) => a.client_name.localeCompare(b.client_name))
                .map((c) => <SelectItem key={c.id} value={c.id}>{c.client_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Company" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* TIMELINE BODY */}
      <div className="p-0">
        {clientRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-16 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40 text-muted-foreground">
              <Activity className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium">No invoices in this window</p>
            <p className="text-xs text-muted-foreground">Adjust your filters or create a new invoice.</p>
          </div>
        ) : (
          <TooltipProvider delayDuration={120}>
            <div
              ref={scrollRef}
              className="timeline-scroll relative overflow-auto border-t border-border/60 bg-background/30"
              style={{ maxHeight: 620 }}
            >
              <div style={{ width: CLIENT_COL + totalWidth, minWidth: "100%" }}>
                {/* Sticky header */}
                <div className="sticky top-0 z-20 flex border-b border-border/60 bg-card/85 backdrop-blur-md">
                  <div
                    className="sticky left-0 z-30 flex items-center border-r border-border/60 bg-card/90 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-md"
                    style={{ width: CLIENT_COL, minWidth: CLIENT_COL, height: 44 }}
                  >
                    Client
                  </div>
                  <div className="relative" style={{ width: totalWidth, height: 44 }}>
                    {ticks.map((t, idx) => (
                      <div
                        key={idx}
                        className="absolute top-0 flex h-full flex-col justify-center border-l border-border/40 pl-2"
                        style={{ left: idx * tickWidth, width: tickWidth }}
                      >
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
                          {t.toLocaleDateString("en-IN", { month: "short" })}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {t.toLocaleDateString("en-IN", { year: "numeric" })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rows */}
                <div className="relative" style={{ height: bodyHeight }}>
                  {clientRows.map((row, rowIdx) => (
                    <div
                      key={row.client.id}
                      className={cn(
                        "group/row flex border-b border-border/40 transition-colors",
                        rowIdx % 2 === 1 && "bg-muted/10",
                        "hover:bg-primary/[0.04]",
                      )}
                      style={{ height: ROW_H }}
                    >
                      <div
                        className="sticky left-0 z-10 flex items-center gap-3 border-r border-border/60 bg-card/90 px-4 backdrop-blur-md"
                        style={{ width: CLIENT_COL, minWidth: CLIENT_COL }}
                      >
                        <div
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 text-[11px] font-semibold text-primary ring-1 ring-primary/15"
                          aria-hidden
                        >
                          {row.client.client_name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{row.client.client_name}</p>
                          {row.client.business_name && (
                            <p className="truncate text-[11px] text-muted-foreground">{row.client.business_name}</p>
                          )}
                        </div>
                      </div>
                      <div className="relative flex-1" style={{ width: totalWidth }}>
                        {ticks.map((_, idx) => (
                          <div
                            key={idx}
                            className="absolute top-0 bottom-0 border-l border-border/25"
                            style={{ left: idx * tickWidth }}
                          />
                        ))}
                        {today >= gStart && today <= addUnit(gStart, granularity, ticks.length) && (
                          <div
                            className="pointer-events-none absolute top-0 bottom-0 w-px bg-blue-400/70 shadow-[0_0_10px_2px_rgba(96,165,250,0.55)]"
                            style={{ left: xFor(today) }}
                          />
                        )}
                        {row.invoices.map((inv) => {
                          const eff = effectiveStatus(inv, today);
                          const meta = STATUS_META[eff];
                          const s = new Date(inv.invoice_date);
                          const e = inv.due_date
                            ? new Date(inv.due_date)
                            : addUnit(s, "day", Math.max(1, Math.round(spanDays / 30)));
                          const left = xFor(s);
                          const right = xFor(e < s ? addUnit(s, "day", 1) : e);
                          const width = Math.max(170, right - left);
                          const total = Number(inv.total || 0);
                          const paid = Number(inv.amount_paid || 0);
                          const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
                          const remaining = Math.max(0, total - paid);
                          const daysLeft = inv.due_date
                            ? Math.round((+new Date(inv.due_date) - +today) / 86400000)
                            : null;

                          return (
                            <Tooltip key={inv.id}>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => setActiveId(inv.id)}
                                  className={cn(
                                    "group/bar absolute flex items-center overflow-hidden rounded-xl text-left text-white shadow-md ring-1 ring-inset transition-all duration-200",
                                    "bg-gradient-to-r hover:-translate-y-0.5 hover:shadow-lg",
                                    meta.grad, meta.ring,
                                    activeId === inv.id && "ring-2 ring-primary/70",
                                  )}
                                  style={{ left, width, top: 10, height: 36 }}
                                >
                                  {/* progress fill overlay */}
                                  <span
                                    className="pointer-events-none absolute inset-y-0 left-0 bg-white/20 transition-[width] duration-500 ease-out group-hover/bar:bg-white/25"
                                    style={{ width: `${pct}%` }}
                                  />
                                  <div className="relative z-10 flex w-full items-center gap-2 px-2.5">
                                    <span className="truncate text-[11px] font-semibold tracking-tight">
                                      {inv.invoice_number}
                                    </span>
                                    <span className="ml-auto shrink-0 text-[11px] font-medium opacity-95">
                                      {inr(total)}
                                    </span>
                                    <span className="shrink-0 rounded-md bg-black/25 px-1.5 py-0.5 text-[10px] font-semibold">
                                      {pct}%
                                    </span>
                                  </div>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs border border-border/60 bg-popover/95 p-3 shadow-xl backdrop-blur">
                                <div className="space-y-1.5 text-xs">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="font-semibold">{row.client.client_name}</span>
                                    <span className={cn("inline-flex items-center gap-1", meta.text)}>
                                      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                                      {meta.label}
                                    </span>
                                  </div>
                                  <div className="text-muted-foreground">{inv.invoice_number}</div>
                                  <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
                                    <span className="text-muted-foreground">Amount</span>
                                    <span className="text-right font-medium">{inr(total)}</span>
                                    <span className="text-muted-foreground">Paid</span>
                                    <span className="text-right font-medium text-emerald-300">{inr(paid)}</span>
                                    <span className="text-muted-foreground">Remaining</span>
                                    <span className="text-right font-medium text-amber-300">{inr(remaining)}</span>
                                    <span className="text-muted-foreground">Invoice date</span>
                                    <span className="text-right">{formatDate(inv.invoice_date)}</span>
                                    <span className="text-muted-foreground">Due date</span>
                                    <span className="text-right">{inv.due_date ? formatDate(inv.due_date) : "—"}</span>
                                    {daysLeft !== null && (
                                      <>
                                        <span className="text-muted-foreground">
                                          {daysLeft < 0 ? "Days overdue" : "Days remaining"}
                                        </span>
                                        <span className="text-right font-medium">{Math.abs(daysLeft)}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TooltipProvider>
        )}
      </div>

      {/* DRAWER */}
      <Sheet open={!!activeId} onOpenChange={(o) => !o && setActiveId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {activeInvoice && (
            <>
              <SheetHeader className="text-left">
                <div className="flex items-center justify-between gap-2">
                  <SheetTitle className="text-xl">{activeInvoice.invoice_number}</SheetTitle>
                  <Badge variant="outline" className={cn("border-current", STATUS_META[effectiveStatus(activeInvoice, today)].text)}>
                    {STATUS_META[effectiveStatus(activeInvoice, today)].label}
                  </Badge>
                </div>
                <SheetDescription>
                  {activeClient?.client_name}{activeClient?.business_name ? ` · ${activeClient.business_name}` : ""}
                  {activeCompany ? ` · ${activeCompany.name}` : ""}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                    <p className="text-xs text-muted-foreground">Invoice Date</p>
                    <p className="font-semibold">{formatDate(activeInvoice.invoice_date)}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                    <p className="text-xs text-muted-foreground">Due Date</p>
                    <p className="font-semibold">{activeInvoice.due_date ? formatDate(activeInvoice.due_date) : "—"}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="font-semibold">{inr(activeInvoice.total)}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                    <p className="text-xs text-muted-foreground">Paid</p>
                    <p className="font-semibold text-emerald-400">{inr(activeInvoice.amount_paid)}</p>
                  </div>
                  <div className="col-span-2 rounded-xl border border-border/60 bg-background/40 p-3">
                    <p className="text-xs text-muted-foreground">Remaining Balance</p>
                    <p className="text-lg font-bold text-amber-400">
                      {inr(Math.max(0, Number(activeInvoice.total) - Number(activeInvoice.amount_paid)))}
                    </p>
                    <Progress
                      value={Number(activeInvoice.total) > 0 ? Math.min(100, (Number(activeInvoice.amount_paid) / Number(activeInvoice.total)) * 100) : 0}
                      className="mt-2 h-2"
                    />
                  </div>
                  <div className="col-span-2 rounded-xl border border-border/60 bg-background/40 p-3">
                    <p className="text-xs text-muted-foreground">
                      {activeInvoice.due_date && new Date(activeInvoice.due_date) < today ? "Days Overdue" : "Days Remaining"}
                    </p>
                    <p className="font-semibold">
                      {activeInvoice.due_date
                        ? Math.abs(Math.round((+new Date(activeInvoice.due_date) - +today) / 86400000)) + " days"
                        : "—"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link to="/invoices/$id" params={{ id: activeInvoice.id }}>
                      <Eye className="mr-1 h-4 w-4" /> View
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/invoices/$id/edit" params={{ id: activeInvoice.id }}>
                      <Pencil className="mr-1 h-4 w-4" /> Edit
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/invoices/$id" params={{ id: activeInvoice.id }}>
                      <Wallet className="mr-1 h-4 w-4" /> Record Payment
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/invoices/$id" params={{ id: activeInvoice.id }}>
                      <FileText className="mr-1 h-4 w-4" /> PDF Preview
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/invoices/$id" params={{ id: activeInvoice.id }}>
                      <Download className="mr-1 h-4 w-4" /> Download PDF
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setReminderOpen(true)}>
                    <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp
                  </Button>
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold">Payment History</p>
                  {activePayments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No payments recorded yet.</p>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-border/60">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-xs text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 text-left">Date</th>
                            <th className="px-3 py-2 text-left">Method</th>
                            <th className="px-3 py-2 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activePayments.map((p) => (
                            <tr key={p.id} className="border-t border-border/50">
                              <td className="px-3 py-2">{formatDate(p.payment_date)}</td>
                              <td className="px-3 py-2 capitalize">{p.method ?? "—"}</td>
                              <td className="px-3 py-2 text-right font-medium text-emerald-400">{inr(p.amount)}</td>
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
        </SheetContent>
      </Sheet>
    </Card>
  );
}

/* -------------------------------------------------- */

const TONE: Record<string, { ring: string; icon: string; grad: string; bar: string }> = {
  amber:   { ring: "ring-amber-500/20",   icon: "bg-amber-500/15 text-amber-300",     grad: "from-amber-500/10 to-transparent",   bar: "bg-amber-400" },
  red:     { ring: "ring-red-500/20",     icon: "bg-red-500/15 text-red-300",         grad: "from-red-500/10 to-transparent",     bar: "bg-red-400" },
  emerald: { ring: "ring-emerald-500/20", icon: "bg-emerald-500/15 text-emerald-300", grad: "from-emerald-500/10 to-transparent", bar: "bg-emerald-400" },
  blue:    { ring: "ring-blue-500/20",    icon: "bg-blue-500/15 text-blue-300",       grad: "from-blue-500/10 to-transparent",    bar: "bg-blue-400" },
};

function SummaryCard({
  icon, label, value, hint, tone, progress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone: keyof typeof TONE;
  progress?: number;
}) {
  const t = TONE[tone];
  return (
    <div className={cn(
      "group relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br p-4 ring-1 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
      t.grad, t.ring,
    )}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-lg", t.icon)}>{icon}</span>
      </div>
      <div className="mt-2 text-xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      {typeof progress === "number" && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
          <div
            className={cn("h-full rounded-full transition-[width] duration-500 ease-out", t.bar)}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

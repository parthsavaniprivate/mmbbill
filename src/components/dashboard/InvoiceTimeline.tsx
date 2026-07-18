import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useIsMobile } from "@/hooks/use-mobile";

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
  logo_url?: string | null;
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

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

const SECONDARY_PERIOD_ITEM_RE = /\b(meta\s*ads?|ad\s*spend|advertising|boosting|paid\s*ads?)\b/i;

function parseItemPeriod(desc: string | null | undefined): { from: Date; to: Date } | null {
  if (!desc) return null;
  const rest = desc.split("\n").slice(1).join(" ").trim();
  const range = rest.match(/For\s+(\w+)\s+(\d{4})\s*[-\u2013]\s*(\w+)\s+(\d{4})/i);
  if (range) {
    const fm = MONTH_MAP[range[1].toLowerCase()]; const tm = MONTH_MAP[range[3].toLowerCase()];
    if (fm === undefined || tm === undefined) return null;
    const from = new Date(+range[2], fm, 1);
    const to = new Date(+range[4], tm + 1, 0); // last day of month
    return { from, to };
  }
  const single = rest.match(/For\s+(\w+)\s+(\d{4})/i);
  if (single) {
    const m = MONTH_MAP[single[1].toLowerCase()];
    if (m === undefined) return null;
    const y = +single[2];
    return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0) };
  }
  return null;
}


const ROW_H = 56;

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
  const isMobile = useIsMobile();
  const CLIENT_COL = isMobile ? 180 : 240;
  const tickWidth = isMobile ? 84 : 110;
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
      .on("postgres_changes", { event: "*", schema: "public", table: "invoice_items" }, () => {
        qc.invalidateQueries({ queryKey: ["timeline-first-items"] });
        qc.invalidateQueries({ queryKey: ["dashboard-data"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  // First-item period per invoice (drives bar start/end)
  const invoiceIds = useMemo(() => invoices.map((i) => i.id), [invoices]);
  const invoiceIdsKey = useMemo(() => [...invoiceIds].sort().join("|"), [invoiceIds]);
  const { data: firstItems = [] } = useQuery({
    queryKey: ["timeline-first-items", invoiceIdsKey],
    enabled: invoiceIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("invoice_items")
        .select("invoice_id, description, position")
        .in("invoice_id", invoiceIds)
        .order("position", { ascending: true });
      return data ?? [];
    },
  });
  const periodByInvoice = useMemo(() => {
    // Use the invoice's primary service line as the bar range. Secondary lines
    // like Meta ADS/ad-spend can have a longer service window, but they should
    // not stretch a one-month invoice across multiple month blocks.
    const chosen = new Map<string, { rank: number; pos: number; period: { from: Date; to: Date } }>();
    for (const it of firstItems) {
      const p = parseItemPeriod(it.description);
      if (!p) continue;
      const rank = SECONDARY_PERIOD_ITEM_RE.test(it.description ?? "") ? 1 : 0;
      const pos = Number.isFinite(Number(it.position)) ? Number(it.position) : Number.MAX_SAFE_INTEGER;
      const prev = chosen.get(it.invoice_id);
      if (!prev || rank < prev.rank || (rank === prev.rank && pos < prev.pos)) {
        chosen.set(it.invoice_id, { rank, pos, period: p });
      }
    }
    const m = new Map<string, { from: Date; to: Date }>();
    for (const [k, v] of chosen) m.set(k, v.period);
    return m;
  }, [firstItems]);
  const startFor = (inv: Invoice) => periodByInvoice.get(inv.id)?.from ?? new Date(inv.invoice_date);
  const endFor = (inv: Invoice) => periodByInvoice.get(inv.id)?.to ?? (inv.due_date ? new Date(inv.due_date) : addUnit(new Date(inv.invoice_date), "day", 1));


  // Monthly Gantt scale. Start with the dashboard range, but always expand it
  // to include every invoice billing period so future-month bars never vanish.
  const granularity: Granularity = "month";
  const now = new Date();

  const allStarts: number[] = [];
  const allEnds: number[] = [];
  for (const inv of invoices) {
    const s = periodByInvoice.get(inv.id)?.from ?? new Date(inv.invoice_date);
    const e = periodByInvoice.get(inv.id)?.to
      ?? (inv.due_date ? new Date(inv.due_date) : new Date(inv.invoice_date));
    if (!Number.isNaN(+s)) allStarts.push(+s);
    if (!Number.isNaN(+e)) allEnds.push(+e);
  }
  const earliest = allStarts.length ? new Date(Math.min(...allStarts)) : now;
  const latest = allEnds.length ? new Date(Math.max(...allEnds)) : now;

  const rangeStart = _from ? new Date(Math.min(+_from, +earliest)) : earliest;
  const rangeEnd = to ? new Date(Math.max(+to, +latest)) : latest;

  const gStart = startOf(rangeStart, "month");
  const endMonth = startOf(rangeEnd, "month");
  const monthCount = Math.max(
    1,
    (endMonth.getFullYear() - gStart.getFullYear()) * 12
      + (endMonth.getMonth() - gStart.getMonth()) + 1,
  );
  const ticks: Date[] = [];
  for (let i = 0; i < monthCount; i++) ticks.push(addUnit(gStart, granularity, i));
  // tickWidth defined above based on viewport
  const totalWidth = ticks.length * tickWidth;
  const totalMs = Math.max(1, +addUnit(gStart, granularity, ticks.length) - +gStart);
  const spanDays = Math.max(1, Math.round(totalMs / 86400000));


  const xFor = (d: Date) => {
    const ms = Math.max(0, +d - +gStart);
    return Math.min(totalWidth, (ms / totalMs) * totalWidth);
  };

  const filtered = useMemo(() => {
    return invoices.filter((i) => {
      if (!isAll && i.company_id !== selectedCompany) return false;
      if (companyFilter !== "all" && i.company_id !== companyFilter) return false;
      if (clientFilter !== "all" && i.client_id !== clientFilter) return false;
      if (invoiceSearch && !i.invoice_number.toLowerCase().includes(invoiceSearch.toLowerCase())) return false;
      const eff = effectiveStatus(i, today);
      if (eff === "cancelled" || eff === "draft") return false;
      if (statusFilter !== "all" && eff !== statusFilter) return false;
      const s = startFor(i);
      const e = endFor(i);
      const winEnd = addUnit(gStart, granularity, ticks.length);
      if (e < gStart || s > winEnd) return false;
      return true;
    });
  }, [invoices, isAll, selectedCompany, companyFilter, clientFilter, invoiceSearch, statusFilter, today, gStart, granularity, ticks.length, periodByInvoice]);

  const clientRows = useMemo(() => {
    const byId = new Map<string, Client>();
    for (const c of clients) byId.set(c.id, c);
    const groups = new Map<string, Invoice[]>();
    for (const inv of filtered) {
      const arr = groups.get(inv.client_id) ?? [];
      arr.push(inv);
      groups.set(inv.client_id, arr);
    }
    const monthIndexOf = (d: Date) => {
      const dt = startOf(d, granularity);
      return (dt.getFullYear() - gStart.getFullYear()) * 12 + (dt.getMonth() - gStart.getMonth());
    };
    // Include ALL clients (respecting top-switcher company + local filters), even without invoices.
    const allClients = clients.filter((c) => {
      if (!isAll && c.company_id !== selectedCompany) return false;
      if (companyFilter !== "all" && c.company_id && c.company_id !== companyFilter) return false;
      if (clientFilter !== "all" && c.id !== clientFilter) return false;
      return true;
    });
    const rows = allClients.map((client) => {
      const invs = groups.get(client.id) ?? [];
      const sorted = invs.sort((a, b) => +startFor(a) - +startFor(b));
      // Lane assignment based on month-span overlap.
      const startOf_ = new Map<string, number>();
      const endOf_ = new Map<string, number>();
      const laneOf = new Map<string, number>();
      const laneEnds: number[] = []; // last endMonth used per lane
      for (const inv of sorted) {
        const sIdx = monthIndexOf(startFor(inv));
        const eIdx = monthIndexOf(endFor(inv));
        const s = Math.max(0, Math.min(ticks.length - 1, Math.min(sIdx, eIdx)));
        const e = Math.max(0, Math.min(ticks.length - 1, Math.max(sIdx, eIdx)));
        startOf_.set(inv.id, s);
        endOf_.set(inv.id, e);
        let lane = laneEnds.findIndex((last) => last < s);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(e); }
        else laneEnds[lane] = e;
        laneOf.set(inv.id, lane);
      }
      const laneCount = Math.max(1, laneEnds.length);
      return {
        client: byId.get(client.id) ?? client,
        invoices: sorted,
        startOf: startOf_,
        endOf: endOf_,
        laneOf,
        laneCount,
      };
    });
    return rows
      .filter((r) => !clientSearch || (r.client.client_name + " " + (r.client.business_name ?? "")).toLowerCase().includes(clientSearch.toLowerCase()))
      .sort((a, b) => a.client.client_name.localeCompare(b.client.client_name));
  }, [filtered, clients, clientSearch, companyFilter, clientFilter, isAll, selectedCompany]);

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

  const LANE_H = 52;
  const ROW_PAD = 12;
  const BAR_W = 96;
  const BAR_H = 32;
  const rowHeightOf = (laneCount: number) => Math.max(ROW_H, laneCount * LANE_H + ROW_PAD);
  const bodyHeight = Math.max(240, clientRows.reduce((sum, r) => sum + rowHeightOf(r.laneCount), 0) + 8);

  return (
    <Card className="min-w-0 max-w-full overflow-hidden border-border/60 bg-gradient-to-b from-card via-card to-card/60 shadow-xl backdrop-blur">
      {/* HEADER */}
      <div className="border-b border-border/60 bg-gradient-to-r from-card/80 via-card/60 to-card/80 p-3 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
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
              className="timeline-scroll relative w-full overflow-auto overscroll-contain border-t border-border/60 bg-background/30"
              style={{ maxHeight: isMobile ? 480 : 620, WebkitOverflowScrolling: "touch" }}
            >
              <div style={{ width: CLIENT_COL + totalWidth }}>
                {/* Sticky header */}
                <div className="sticky top-0 z-20 flex border-b border-border/60 bg-card/85 backdrop-blur-md">
                  <div
                    className="sticky left-0 z-30 flex items-center border-r border-border/60 bg-card/90 px-2 sm:px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-md"
                    style={{ width: CLIENT_COL, minWidth: CLIENT_COL, height: 44 }}
                  >
                    Client
                  </div>
                  <div className="relative" style={{ width: totalWidth, height: 44 }}>
                    {ticks.map((t, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "absolute top-0 flex h-full flex-col items-center justify-center border-l-2",
                          idx === 0 ? "border-transparent" : "border-border",
                        )}
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
                        rowIdx % 2 === 1 ? "bg-muted/40" : "bg-background/20",
                        "hover:bg-primary/[0.06]",
                      )}
                      style={{ height: rowHeightOf(row.laneCount) }}
                    >
                      <div
                        className="sticky left-0 z-10 flex items-center gap-2 border-r border-border/60 bg-card/90 px-2 sm:gap-3 sm:px-4 backdrop-blur-md"
                        style={{ width: CLIENT_COL, minWidth: CLIENT_COL }}
                      >
                        <div
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 text-[10px] font-semibold text-primary ring-1 ring-primary/15 sm:h-8 sm:w-8 sm:text-[11px]"
                          aria-hidden
                        >
                          {row.client.client_name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium leading-tight sm:text-sm" title={row.client.client_name}>{row.client.client_name}</p>
                          {row.client.business_name && (
                            <p className="truncate text-[10px] leading-tight text-muted-foreground sm:text-[11px]" title={row.client.business_name}>{row.client.business_name}</p>
                          )}
                        </div>
                      </div>
                      <div className="relative flex-1" style={{ width: totalWidth }}>
                        {ticks.map((_, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              "absolute top-0 bottom-0 border-l",
                              idx === 0 ? "border-transparent" : "border-border/20",
                            )}
                            style={{ left: idx * tickWidth }}
                          />
                        ))}
                        {today >= gStart && today <= addUnit(gStart, granularity, ticks.length) && (
                          <div
                            className="it-today pointer-events-none absolute top-0 bottom-0 w-[2px] rounded-full bg-blue-400"
                            style={{ left: xFor(today) - 1 }}
                          />
                        )}
                        {row.invoices.map((inv) => {
                          const eff = effectiveStatus(inv, today);
                          const meta = STATUS_META[eff];
                          const total = Number(inv.total || 0);
                          const paid = Number(inv.amount_paid || 0);
                          const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
                          const remaining = Math.max(0, total - paid);
                          const daysLeft = inv.due_date
                            ? Math.round((+new Date(inv.due_date) - +today) / 86400000)
                            : null;
                          const sMi = row.startOf.get(inv.id) ?? 0;
                          const eMi = row.endOf.get(inv.id) ?? sMi;
                          const lane = row.laneOf.get(inv.id) ?? 0;
                          const pad = 6;
                          const left = sMi * tickWidth + pad;
                          const width = Math.max(48, (eMi - sMi + 1) * tickWidth - pad * 2);
                          const monthCenter = left + width / 2;
                          const top = ROW_PAD / 2 + lane * LANE_H + (LANE_H - BAR_H) / 2;
                          const isActive = activeId === inv.id;
                          const label = inv.invoice_number.length > 14
                            ? inv.invoice_number.slice(0, 12) + "…"
                            : inv.invoice_number;

                          return (
                            <div key={inv.id}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => setActiveId(inv.id)}
                                    className={cn(
                                      "it-bar group/bar absolute flex items-center overflow-hidden text-left text-white transition-[transform,box-shadow,filter] duration-200",
                                      "bg-gradient-to-r shadow-[0_4px_14px_-6px_rgba(0,0,0,0.55)] ring-1 ring-inset",
                                      "hover:scale-[1.03] hover:shadow-[0_10px_28px_-8px_rgba(0,0,0,0.65)] hover:brightness-110",
                                      meta.grad, meta.ring,
                                      isActive && "shadow-[0_0_0_2px_rgba(96,165,250,0.9),0_10px_30px_-6px_rgba(96,165,250,0.55)] ring-blue-400/70 brightness-110",
                                    )}
                                    style={{ left, top, width, height: BAR_H, borderRadius: 18 }}
                                  >
                                    <span
                                      className="pointer-events-none absolute inset-y-0 left-0 bg-white/15 transition-[width] duration-500 ease-out group-hover/bar:bg-white/20"
                                      style={{ width: `${pct}%` }}
                                    />
                                    <div className="relative z-10 flex w-full min-w-0 items-center justify-center px-3">
                                      <span className="truncate text-[12px] font-semibold tracking-tight">
                                        {label}
                                      </span>
                                    </div>
                                  </button>
                                </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                align="center"
                                sideOffset={10}
                                collisionPadding={12}
                                className="z-[60] w-64 max-w-[280px] rounded-xl border border-border bg-popover p-3.5 text-popover-foreground shadow-2xl"
                              >
                                <div className="space-y-2 text-xs">
                                  <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
                                    <span className="truncate font-semibold text-foreground">{row.client.client_name}</span>
                                    <span className={cn("inline-flex shrink-0 items-center gap-1 font-medium", meta.text)}>
                                      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                                      {meta.label}
                                    </span>
                                  </div>
                                  <div className="font-mono text-[11px] text-muted-foreground">{inv.invoice_number}</div>
                                  <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                                    <span className="text-muted-foreground">Amount</span>
                                    <span className="text-right font-semibold text-foreground">{inr(total)}</span>
                                    <span className="text-muted-foreground">Paid</span>
                                    <span className="text-right font-semibold text-emerald-500 dark:text-emerald-400">{inr(paid)}</span>
                                    <span className="text-muted-foreground">Remaining</span>
                                    <span className="text-right font-semibold text-amber-500 dark:text-amber-400">{inr(remaining)}</span>
                                    <span className="text-muted-foreground">Invoice date</span>
                                    <span className="text-right text-foreground">{formatDate(inv.invoice_date)}</span>
                                    <span className="text-muted-foreground">Due date</span>
                                    <span className="text-right text-foreground">{inv.due_date ? formatDate(inv.due_date) : "—"}</span>
                                    {daysLeft !== null && (
                                      <>
                                        <span className="text-muted-foreground">
                                          {daysLeft < 0 ? "Days overdue" : "Days remaining"}
                                        </span>
                                        <span className={cn("text-right font-semibold", daysLeft < 0 ? "text-red-500 dark:text-red-400" : "text-foreground")}>
                                          {Math.abs(daysLeft)}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                </TooltipContent>
                              </Tooltip>
                            </div>
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

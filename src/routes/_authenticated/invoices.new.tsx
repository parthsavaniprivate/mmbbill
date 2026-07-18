import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { intervalMonths as _intervalMonths, addMonths as _addMonths, BILLING_TYPE_OPTIONS } from "@/lib/billing/cycle";
import { ServiceCombobox } from "@/components/billing/ServiceCombobox";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/invoices/new")({
  validateSearch: (s: Record<string, unknown>): { client?: string; schedule?: string } => ({
    ...(typeof s.client === "string" && s.client ? { client: s.client } : {}),
    ...(typeof s.schedule === "string" && s.schedule ? { schedule: s.schedule } : {}),
  }),
  component: NewInvoicePage,
});

type Item = { description: string; quantity: number | ""; rate: number | ""; gstRate?: number | ""; fromDate?: string; toDate?: string; oneTime?: boolean };

const fmtMonth = (s: string) => {
  const d = new Date(s);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};
const monthsInclusive = (from: string, to: string) => {
  const a = new Date(from), b = new Date(to);
  const m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
  return Math.max(1, m);
};

function NewInvoicePage() {
  const { client: presetClient, schedule: scheduleId } = Route.useSearch();
  const navigate = useNavigate();
  const { companies, selected, isAll } = useCompany();
  const qc = useQueryClient();

  const [companyId, setCompanyId] = useState(isAll ? companies[0]?.id ?? "" : selected);
  const [clientId, setClientId] = useState(presetClient);
  const addMonth = (d: string) => { const dt = new Date(d); dt.setMonth(dt.getMonth() + 1); return dt.toISOString().slice(0, 10); };
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(addMonth(new Date().toISOString().slice(0, 10)));
  const [discount, setDiscount] = useState("0");
  const [gstRate, setGstRate] = useState("18");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("Payment due within 30 days.");
  const [items, setItems] = useState<Item[]>([{ description: "", quantity: "", rate: "" }]);

  useEffect(() => { if (!companyId && companies[0]) setCompanyId(companies[0].id); }, [companies, companyId]);

  const { data: clients = [] } = useQuery({
    queryKey: ["all-clients", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("clients")
        .select("id, client_name, business_name, company_id")
        .eq("company_id", companyId)
        .order("business_name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: companyMeta } = useQuery({
    queryKey: ["company-meta", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("gst_enabled, default_gst_rate").eq("id", companyId).maybeSingle();
      return data;
    },
  });

  // Load billing schedule when navigated from BillingReminder / Scheduler
  const { data: schedule } = useQuery({
    queryKey: ["schedule-prefill", scheduleId],
    enabled: !!scheduleId,
    queryFn: async () => {
      const { data } = await supabase
        .from("billing_schedules")
        .select("id, client_id, company_id, billing_type, custom_interval_months, next_billing_date, billing_schedule_services(service_name, price, gst_rate, unit, position)")
        .eq("id", scheduleId!)
        .maybeSingle();
      return data;
    },
  });

  // Fetch the client's active billing schedule (for the Early Billing Warning)
  const { data: clientSchedule } = useQuery({
    queryKey: ["client-schedule-warning", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("billing_schedules")
        .select("id, billing_type, custom_interval_months, next_billing_date, is_active")
        .eq("client_id", clientId!)
        .eq("is_active", true)
        .order("next_billing_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (!schedule || prefilled) return;
    if (schedule.company_id) setCompanyId(schedule.company_id);
    if (schedule.client_id) setClientId(schedule.client_id);
    const svcs = (schedule.billing_schedule_services ?? []).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    if (svcs.length) {
      setItems(svcs.map((s) => ({
        description: s.service_name,
        quantity: 1,
        rate: Number(s.price || 0),
        gstRate: s.gst_rate != null ? Number(s.gst_rate) : "",
      })));
    }
    setPrefilled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule]);

  const filteredClients = clients.filter((c) => c.company_id === companyId);
  const gstEnabled = companyMeta?.gst_enabled ?? true;
  const defaultGst = Number(companyMeta?.default_gst_rate ?? 18);

  useEffect(() => {
    if (!gstEnabled) {
      setGstRate("0");
      setItems((prev) => prev.map((x) => ({ ...x, gstRate: undefined })));
    }
  }, [gstEnabled]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.rate || 0), 0);
    const afterDisc = Math.max(0, subtotal - Number(discount || 0));
    let gstAmount = 0;
    if (gstEnabled) {
      const hasPerItem = items.some((it) => it.gstRate !== undefined && it.gstRate !== "");
      if (hasPerItem && subtotal > 0) {
        const factor = afterDisc / subtotal;
        gstAmount = items.reduce((s, it) => {
          const amt = Number(it.quantity || 0) * Number(it.rate || 0);
          const rt = Number(it.gstRate || 0);
          return s + amt * factor * rt / 100;
        }, 0);
      } else {
        gstAmount = afterDisc * Number(gstRate || 0) / 100;
      }
      gstAmount = +gstAmount.toFixed(2);
    }
    return { subtotal, gstAmount, total: afterDisc + gstAmount };
  }, [items, discount, gstRate, gstEnabled]);



  const create = useMutation({
    mutationFn: async () => {
      if (!companyId || !clientId) throw new Error("Select company and client");
      const userItems = items.filter(i => i.description || i.quantity || i.rate);
      if (userItems.some((i) => !i.description)) throw new Error("All items need a description");
      if (!userItems.length) throw new Error("Add at least one line item");

      const { data: numData, error: numErr } = await supabase.rpc("next_invoice_number", {
        _company_id: companyId, _type: "gst",
      });
      if (numErr) throw numErr;

      const { data: inv, error } = await supabase.from("invoices").insert({
        company_id: companyId, client_id: clientId,
        invoice_number: numData as string,
        invoice_type: "gst", invoice_date: date,
        due_date: dueDate || null,
        gst_rate: Number(gstRate || 0),
        discount: Number(discount || 0),
        notes: notes.trim() || null, terms: terms.trim() || null,
        source_schedule_id: scheduleId ?? null,
      }).select().single();
      if (error) throw error;

      let pos = 0;
      const { error: itErr } = await supabase.from("invoice_items").insert(
        userItems.map((it) => {
          const q = Number(it.quantity || 0);
          const r = Number(it.rate || 0);
          const fmtFull = (s: string) => new Date(s).toLocaleDateString("en-US", { month: "long", year: "numeric" });
          const period = !it.oneTime && it.fromDate && it.toDate
            ? (it.fromDate.slice(0, 7) === it.toDate.slice(0, 7)
                ? `\nFor ${fmtFull(it.fromDate)}`
                : `\nFor ${fmtMonth(it.fromDate)} - ${fmtMonth(it.toDate)}`)
            : "";
          return {
            invoice_id: inv.id, description: it.description + period,
            quantity: q, rate: r,
            gst_rate: gstEnabled && it.gstRate !== undefined && it.gstRate !== "" ? Number(it.gstRate) : null,
            amount: +(q * r).toFixed(2), position: pos++,
          };
        })
      );
      if (itErr) throw itErr;

      await supabase.from("clients").update({ last_invoice_date: date }).eq("id", clientId);

      // Advance the billing schedule (originating schedule OR the client's active schedule)
      const advanceId = scheduleId ?? clientSchedule?.id;
      const advanceSrc = scheduleId ? schedule : clientSchedule;
      if (advanceId && advanceSrc) {
        const step = _intervalMonths(advanceSrc.billing_type as never, advanceSrc.custom_interval_months);
        const nextDate = _addMonths(advanceSrc.next_billing_date ?? date, step);
        await supabase.from("billing_schedules").update({
          last_generated_date: date,
          next_billing_date: nextDate,
        }).eq("id", advanceId);
      }

      return inv.id;
    },
    onSuccess: (id) => {
      toast.success("Invoice created");
      qc.invalidateQueries({ queryKey: ["billing-schedules-all"] });
      qc.invalidateQueries({ queryKey: ["billing-schedule"] });
      qc.invalidateQueries({ queryKey: ["dashboard-data"] });
      navigate({ to: "/invoices/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <div className="space-y-4 max-w-5xl">
      <Link to="/invoices" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">New Invoice</h1>

      <Card><CardContent className="p-5 grid md:grid-cols-3 gap-3">
        <div className="space-y-1.5"><Label>Company</Label>
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Client</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
            <SelectContent>
              {filteredClients.map((c) => <SelectItem key={c.id} value={c.id}>{c.business_name || c.client_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Invoice Date</Label><Input type="date" value={date} onChange={(e) => { setDate(e.target.value); if (e.target.value) setDueDate(addMonth(e.target.value)); }} /></div>
        <div className="space-y-1.5"><Label>Due Date</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
      </CardContent></Card>
      {clientId && clientSchedule?.next_billing_date && (
        <BillingWarningCard
          nextBillingDate={clientSchedule.next_billing_date}
          billingType={clientSchedule.billing_type}
          customMonths={clientSchedule.custom_interval_months}
          invoiceDate={date}
        />
      )}



      <Card><CardHeader><CardTitle>Items</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {items.map((it, idx) => {
            const updateRange = (from?: string, to?: string) => {
              setItems(items.map((x, i) => {
                if (i !== idx) return x;
                const next = { ...x, fromDate: from, toDate: to };
                if (from && to) next.quantity = monthsInclusive(from, to);
                return next;
              }));
            };
            const months = it.fromDate && it.toDate ? monthsInclusive(it.fromDate, it.toDate) : 0;
            return (
              <div key={idx} className="rounded-xl border border-border/60 bg-gradient-to-br from-card to-muted/30 p-4 space-y-3 shadow-sm hover:shadow-md hover:border-primary/30 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item #{idx + 1}</span>
                  <div className="flex items-center gap-2">
                    {!it.oneTime && months > 0 && (
                      <span className="text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                        {months} Month{months > 1 ? "s" : ""}
                      </span>
                    )}
                    <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded border-border"
                        checked={!!it.oneTime}
                        onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, oneTime: e.target.checked, fromDate: e.target.checked ? undefined : x.fromDate, toDate: e.target.checked ? undefined : x.toDate, quantity: e.target.checked ? 1 : x.quantity } : x))}
                      />
                      One-time
                    </label>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Service / Description</Label>
                  <ServiceCombobox
                    value={it.description}
                    companyId={companyId}
                    clientId={clientId}
                    placeholder="e.g. Social Media Management"
                    onChange={(v) => setItems(items.map((x, i) => i === idx ? { ...x, description: v } : x))}
                    onSelect={(svc) => setItems(items.map((x, i) => {
                      if (i !== idx) return x;
                      return {
                        ...x,
                        description: svc.name,
                        rate: svc.default_price != null ? Number(svc.default_price) : x.rate,
                        gstRate: gstEnabled && svc.default_gst_rate != null ? Number(svc.default_gst_rate) : x.gstRate,
                        quantity: (x.oneTime || !x.fromDate || !x.toDate)
                          ? (svc.default_quantity != null ? Number(svc.default_quantity) : (x.quantity === "" ? 1 : x.quantity))
                          : x.quantity,
                      };
                    }))}
                  />
                </div>

                {/* Row 2 */}
                <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
                  {!it.oneTime && (
                    <>
                      <div className="col-span-1 md:col-span-3 space-y-1.5">
                        <Label className="text-xs font-medium">From Month</Label>
                        <Input
                          type="month"
                          className="[color-scheme:light] dark:[color-scheme:dark]"
                          value={it.fromDate ? it.fromDate.slice(0, 7) : ""}
                          onChange={(e) => updateRange(e.target.value ? `${e.target.value}-01` : undefined, it.toDate)}
                        />
                      </div>
                      <div className="col-span-1 md:col-span-3 space-y-1.5">
                        <Label className="text-xs font-medium">To Month</Label>
                        <Input
                          type="month"
                          className="[color-scheme:light] dark:[color-scheme:dark]"
                          value={it.toDate ? it.toDate.slice(0, 7) : ""}
                          onChange={(e) => updateRange(it.fromDate, e.target.value ? `${e.target.value}-01` : undefined)}
                        />
                      </div>
                    </>
                  )}
                  <div className="col-span-1 md:col-span-1 space-y-1.5">
                    <Label className="text-xs font-medium">{it.oneTime ? "Unit" : "Qty"}</Label>
                    <Input type="number" placeholder="0" value={it.quantity} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, quantity: e.target.value === "" ? "" : Number(e.target.value) } : x))} />
                  </div>
                  <div className="col-span-1 md:col-span-2 space-y-1.5">
                    <Label className="text-xs font-medium">Rate</Label>
                    <Input type="number" placeholder="0" value={it.rate} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, rate: e.target.value === "" ? "" : Number(e.target.value) } : x))} />
                  </div>
                  <div className="col-span-2 md:col-span-2 space-y-1.5">
                    <Label className="text-xs font-medium">Total{!it.oneTime ? " (÷ months)" : ""}</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={+(Number(it.quantity || 0) * Number(it.rate || 0)).toFixed(2) || ""}
                      onChange={(e) => {
                        const total = e.target.value === "" ? 0 : Number(e.target.value);
                        const m = it.fromDate && it.toDate ? monthsInclusive(it.fromDate, it.toDate) : 0;
                        const q = m || Number(it.quantity || 0) || 1;
                        setItems(items.map((x, i) => i === idx ? { ...x, quantity: q, rate: total / q } : x));
                      }}
                    />
                  </div>
                  {gstEnabled && (
                    <div className="col-span-1 md:col-span-1 space-y-1.5">
                      <Label className="text-xs font-medium">GST %</Label>
                      <Input
                        type="number"
                        placeholder={String(defaultGst)}
                        value={it.gstRate ?? ""}
                        onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, gstRate: e.target.value === "" ? "" : Number(e.target.value) } : x))}
                      />
                    </div>
                  )}
                  <div className="col-span-2 md:col-span-1 flex justify-end">
                    <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => setItems(items.filter((_, i) => i !== idx))} disabled={items.length === 1}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

              </div>
            );
          })}
          <Button variant="outline" size="sm" onClick={() => setItems([...items, { description: "", quantity: "", rate: "" }])}>
            <Plus className="w-4 h-4" />Add Item
          </Button>
        </CardContent>
      </Card>

      <Card><CardContent className="p-5 grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Discount (₹)</Label><Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
          <div className="space-y-1.5"><Label>Terms & Conditions</Label><Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} /></div>
        </div>
        <div className="space-y-2 p-4 rounded-lg bg-muted/40 self-start">
          <Row label="Subtotal" value={inr(totals.subtotal)} />
          {Number(discount) > 0 && <Row label="Discount" value={`- ${inr(Number(discount))}`} />}
          {gstEnabled && totals.gstAmount > 0 && <Row label="GST" value={inr(totals.gstAmount)} />}
          <div className="border-t pt-2"><Row label="Total" value={inr(totals.total)} bold /></div>
        </div>
      </CardContent></Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild><Link to="/invoices">Cancel</Link></Button>
        <Button data-shortcut="save" onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Saving…" : "Create Invoice"}</Button>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? "font-bold text-base" : ""}`}>
      <span className="text-muted-foreground">{label}</span><span>{value}</span>
    </div>
  );
}

function BillingWarningCard({
  nextBillingDate, billingType, customMonths, invoiceDate,
}: { nextBillingDate: string; billingType: string; customMonths: number | null; invoiceDate: string }) {
  const fmt = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const today = invoiceDate || new Date().toISOString().slice(0, 10);
  const diffDays = Math.round(
    (new Date(nextBillingDate + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86400000
  );
  const cycleLabel =
    billingType === "custom"
      ? `Every ${customMonths || 1} Month${(customMonths || 1) > 1 ? "s" : ""}`
      : (BILLING_TYPE_OPTIONS.find((o) => o.value === billingType)?.label ?? billingType);

  if (diffDays > 0) {
    return (
      <div className="rounded-xl border border-amber-400/60 bg-amber-50 dark:bg-amber-500/10 p-4 flex gap-3 shadow-sm">
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-sm">
          <div className="font-semibold text-amber-900 dark:text-amber-200">Billing Cycle Warning</div>
          <div className="text-amber-800 dark:text-amber-100/90">This client is not yet due for billing.</div>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 pt-1 text-amber-900 dark:text-amber-100">
            <div><span className="opacity-70">Next Billing Date:</span> <span className="font-medium">{fmt(nextBillingDate)}</span></div>
            <div><span className="opacity-70">Billing Cycle:</span> <span className="font-medium">{cycleLabel}</span></div>
          </div>
          <div className="text-amber-800 dark:text-amber-100/90 pt-1">
            You are creating this invoice <span className="font-semibold">{diffDays} day{diffDays > 1 ? "s" : ""} early</span>. This invoice can still be created if required.
          </div>
        </div>
      </div>
    );
  }

  const overdue = -diffDays;
  return (
    <div className="rounded-xl border border-emerald-400/60 bg-emerald-50 dark:bg-emerald-500/10 p-4 flex gap-3 shadow-sm">
      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
      <div className="space-y-1 text-sm">
        <div className="font-semibold text-emerald-900 dark:text-emerald-200">Ready for Billing</div>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 pt-1 text-emerald-900 dark:text-emerald-100">
          <div>
            <span className="opacity-70">Next Billing Date:</span>{" "}
            <span className="font-medium">{overdue === 0 ? "Today" : `Overdue by ${overdue} day${overdue > 1 ? "s" : ""}`}</span>
          </div>
          <div><span className="opacity-70">Billing Cycle:</span> <span className="font-medium">{cycleLabel}</span></div>
        </div>
      </div>
    </div>
  );
}



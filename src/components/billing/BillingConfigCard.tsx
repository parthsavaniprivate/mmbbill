import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, CalendarClock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { BILLING_TYPE_OPTIONS, computeNextBillingDate, computeServiceAmount, intervalMonths as scheduleIntervalMonths, type BillingType, todayISO } from "@/lib/billing/cycle";
import { ServiceCombobox } from "./ServiceCombobox";
import { inr, formatDate } from "@/lib/format";

type Service = { id?: string; service_name: string; price: number | ""; gst_rate: number | "" | null; unit: string; interval_months: number | "" };

export function BillingConfigCard({ clientId, companyId }: { clientId: string; companyId: string }) {
  const qc = useQueryClient();

  const { data: schedule } = useQuery({
    queryKey: ["billing-schedule", clientId],
    queryFn: async () => {
      const { data } = await supabase.from("billing_schedules").select("*").eq("client_id", clientId).maybeSingle();
      return data;
    },
  });

  const { data: existingServices = [] } = useQuery({
    queryKey: ["billing-schedule-services", schedule?.id ?? null],
    enabled: !!schedule?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("billing_schedule_services")
        .select("*")
        .eq("schedule_id", schedule!.id)
        .order("position", { ascending: true });
      return data ?? [];
    },
  });

  const [billingType, setBillingType] = useState<BillingType>("monthly");
  const [customMonths, setCustomMonths] = useState<number>(1);
  const [startDate, setStartDate] = useState<string>(todayISO());
  const [nextDate, setNextDate] = useState<string>(todayISO());
  const [autoReminder, setAutoReminder] = useState(true);
  const [autoSuggest, setAutoSuggest] = useState(true);
  const [invoicePrefix, setInvoicePrefix] = useState("");
  const [defaultGst, setDefaultGst] = useState<string>("");
  const [services, setServices] = useState<Service[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (schedule && !hydrated) {
      setBillingType(schedule.billing_type as BillingType);
      setCustomMonths(schedule.custom_interval_months ?? 1);
      setStartDate(schedule.start_date);
      setNextDate(schedule.next_billing_date);
      setAutoReminder(schedule.auto_reminder);
      setAutoSuggest(schedule.auto_suggest);
      setInvoicePrefix(schedule.invoice_prefix ?? "");
      setDefaultGst(schedule.default_gst_rate != null ? String(schedule.default_gst_rate) : "");
      setHydrated(true);
    }
  }, [schedule, hydrated]);

  useEffect(() => {
    if (schedule && existingServices.length) {
      const fallback = scheduleIntervalMonths(schedule.billing_type as BillingType, schedule.custom_interval_months);
      setServices(
        existingServices.map((s) => ({
          id: s.id,
          service_name: s.service_name,
          price: Number(s.price),
          gst_rate: s.gst_rate != null ? Number(s.gst_rate) : null,
          unit: s.unit ?? "month",
          interval_months: (s as { interval_months?: number | null }).interval_months ?? fallback,
        })),
      );
    }
  }, [schedule, existingServices]);

  // Auto-compute next when type / start changes and user hasn't set one manually yet
  useEffect(() => {
    if (!startDate) return;
    const next = computeNextBillingDate(startDate, billingType, customMonths);
    setNextDate(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, billingType, customMonths]);

  const scheduleInterval = scheduleIntervalMonths(billingType, customMonths);

  const invoiceTotal = useMemo(() => {
    return services.reduce((s, x) => {
      const p = Number(x.price || 0);
      const iv = Number(x.interval_months || scheduleInterval || 1);
      return s + (x.unit === "one_time" ? p : computeServiceAmount(p, iv));
    }, 0);
  }, [services, scheduleInterval]);

  const save = useMutation({
    mutationFn: async () => {
      if (!startDate || !nextDate) throw new Error("Start and next billing date required");
      const payload = {
        company_id: companyId,
        client_id: clientId,
        billing_type: billingType,
        custom_interval_months: billingType === "custom" ? customMonths : null,
        start_date: startDate,
        next_billing_date: nextDate,
        auto_reminder: autoReminder,
        auto_suggest: autoSuggest,
        invoice_prefix: invoicePrefix.trim() || null,
        default_gst_rate: defaultGst ? Number(defaultGst) : null,
      };

      let scheduleId = schedule?.id;
      if (scheduleId) {
        const { error } = await supabase.from("billing_schedules").update(payload).eq("id", scheduleId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("billing_schedules").insert(payload).select("id").single();
        if (error) throw error;
        scheduleId = data.id;
      }

      // Replace services (simple full replace)
      await supabase.from("billing_schedule_services").delete().eq("schedule_id", scheduleId);
      const rows = services
        .filter((s) => s.service_name.trim())
        .map((s, i) => ({
          schedule_id: scheduleId!,
          service_name: s.service_name.trim(),
          price: Number(s.price || 0),
          gst_rate: s.gst_rate === "" || s.gst_rate == null ? null : Number(s.gst_rate),
          unit: s.unit || "month",
          interval_months: s.interval_months === "" || s.interval_months == null ? scheduleInterval : Number(s.interval_months),
          position: i,
        }));
      if (rows.length) {
        const { error } = await supabase.from("billing_schedule_services").insert(rows);
        if (error) throw error;

        // Upsert catalog
        for (const r of rows) {
          await supabase.from("service_catalog").upsert(
            {
              company_id: companyId,
              name: r.service_name,
              default_price: r.price,
              default_gst_rate: r.gst_rate,
              last_used_at: new Date().toISOString(),
            },
            { onConflict: "company_id,name" },
          );
        }
      }
    },
    onSuccess: () => {
      toast.success("Billing configuration saved");
      qc.invalidateQueries({ queryKey: ["billing-schedule", clientId] });
      qc.invalidateQueries({ queryKey: ["billing-schedules-all"] });
      qc.invalidateQueries({ queryKey: ["service-catalog"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-primary" />
          <CardTitle className="text-base">Billing Configuration</CardTitle>
        </div>
        {schedule && (
          <Badge variant="outline" className="gap-1">
            <Sparkles className="w-3 h-3" /> Next: {formatDate(nextDate)}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label>Billing Type</Label>
            <Select value={billingType} onValueChange={(v) => setBillingType(v as BillingType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BILLING_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {billingType === "custom" && (
            <div className="space-y-1.5">
              <Label>Interval (months)</Label>
              <Input type="number" min={1} value={customMonths} onChange={(e) => setCustomMonths(Number(e.target.value || 1))} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Start Date</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Next Billing Date</Label>
            <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Invoice Prefix (optional)</Label>
            <Input value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} placeholder="e.g. INV" />
          </div>
          <div className="space-y-1.5">
            <Label>Default GST %</Label>
            <Input type="number" value={defaultGst} onChange={(e) => setDefaultGst(e.target.value)} placeholder="18" />
          </div>
          <div className="flex items-end gap-6 sm:col-span-2 lg:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={autoReminder} onCheckedChange={setAutoReminder} /> Auto Reminder
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={autoSuggest} onCheckedChange={setAutoSuggest} /> Auto Invoice Suggestion
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Service Plan</Label>
            <span className="text-xs text-muted-foreground">
              Monthly value: <b className="text-foreground">{inr(monthlyValue)}</b>
            </span>
          </div>
          {services.map((s, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-12 sm:col-span-5">
                <ServiceCombobox
                  companyId={companyId}
                  value={s.service_name}
                  onChange={(v) => setServices(services.map((x, j) => j === i ? { ...x, service_name: v } : x))}
                  onSelect={(sug) => setServices(services.map((x, j) => j === i ? {
                    ...x,
                    service_name: sug.name,
                    price: sug.default_price ?? x.price,
                    gst_rate: sug.default_gst_rate ?? x.gst_rate,
                  } : x))}
                />
              </div>
              <Input
                className="col-span-4 sm:col-span-2"
                type="number" placeholder="Price"
                value={s.price}
                onChange={(e) => setServices(services.map((x, j) => j === i ? { ...x, price: e.target.value === "" ? "" : Number(e.target.value) } : x))}
              />
              <Input
                className="col-span-3 sm:col-span-2"
                type="number" placeholder="GST %"
                value={s.gst_rate ?? ""}
                onChange={(e) => setServices(services.map((x, j) => j === i ? { ...x, gst_rate: e.target.value === "" ? null : Number(e.target.value) } : x))}
              />
              <Select
                value={s.unit}
                onValueChange={(v) => setServices(services.map((x, j) => j === i ? { ...x, unit: v } : x))}
              >
                <SelectTrigger className="col-span-3 sm:col-span-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">/ month</SelectItem>
                  <SelectItem value="year">/ year</SelectItem>
                  <SelectItem value="one_time">one-time</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost" size="icon"
                className="col-span-2 sm:col-span-1 justify-self-end text-muted-foreground hover:text-destructive"
                onClick={() => setServices(services.filter((_, j) => j !== i))}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setServices([...services, { service_name: "", price: "", gst_rate: defaultGst ? Number(defaultGst) : 18, unit: "month" }])}>
            <Plus className="w-4 h-4" /> Add Service
          </Button>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save Billing Configuration"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

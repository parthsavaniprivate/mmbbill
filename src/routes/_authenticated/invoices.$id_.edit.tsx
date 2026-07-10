import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { inr } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/invoices/$id_/edit")({ component: EditInvoicePage });

type Item = { id?: string; description: string; quantity: number | ""; rate: number | ""; fromDate?: string; toDate?: string; oneTime?: boolean };

const fmtMonth = (s: string) => new Date(s).toLocaleDateString("en-US", { month: "short", year: "numeric" });
const fmtFull = (s: string) => new Date(s).toLocaleDateString("en-US", { month: "long", year: "numeric" });
const monthsInclusive = (from: string, to: string) => {
  const a = new Date(from), b = new Date(to);
  const m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
  return Math.max(1, m);
};

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const toIso = (mon: string, year: string) => {
  const m = MONTH_MAP[mon.toLowerCase()];
  if (m === undefined) return undefined;
  return `${year}-${String(m + 1).padStart(2, "0")}-01`;
};
const parseDescription = (desc: string): { main: string; fromDate?: string; toDate?: string } => {
  const lines = desc.split("\n");
  const main = lines[0] ?? "";
  const rest = lines.slice(1).join(" ").trim();
  const range = rest.match(/For\s+(\w+)\s+(\d{4})\s*[-–]\s*(\w+)\s+(\d{4})/i);
  if (range) return { main, fromDate: toIso(range[1], range[2]), toDate: toIso(range[3], range[4]) };
  const single = rest.match(/For\s+(\w+)\s+(\d{4})/i);
  if (single) { const iso = toIso(single[1], single[2]); return { main, fromDate: iso, toDate: iso }; }
  return { main };
};

function EditInvoicePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["invoice-edit", id],
    queryFn: async () => {
      const { data: inv } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
      const { data: items } = await supabase.from("invoice_items").select("*").eq("invoice_id", id).order("position");
      return { inv, items: items ?? [] };
    },
  });

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [clientId, setClientId] = useState("");
  const [date, setDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [discount, setDiscount] = useState("0");
  const [gstRate, setGstRate] = useState("0");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [items, setItems] = useState<Item[]>([]);

  const { data: companies = [] } = useQuery({
    queryKey: ["all-companies-edit"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: clients = [] } = useQuery({
    queryKey: ["all-clients-edit", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("clients")
        .select("id, client_name, business_name")
        .eq("company_id", companyId).order("business_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!data?.inv) return;
    setInvoiceNumber(data.inv.invoice_number ?? "");
    setCompanyId(data.inv.company_id ?? "");
    setClientId(data.inv.client_id ?? "");
    setDate(data.inv.invoice_date);
    setDueDate(data.inv.due_date ?? "");
    setDiscount(String(data.inv.discount ?? 0));
    setGstRate(String(data.inv.gst_rate ?? 0));
    setNotes(data.inv.notes ?? "");
    setTerms(data.inv.terms ?? "");
    setItems(
      (data.items.length ? data.items : [{ id: undefined, description: "", quantity: 1, rate: 0 }]).map((it) => {
        const parsed = parseDescription(it.description);
        return {
          id: (it as { id?: string }).id,
          description: parsed.main,
          fromDate: parsed.fromDate,
          toDate: parsed.toDate,
          oneTime: !parsed.fromDate && !parsed.toDate,
          quantity: Number(it.quantity),
          rate: Number(it.rate),
        };
      }),
    );
  }, [data]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.rate || 0), 0);
    const afterDisc = Math.max(0, subtotal - Number(discount || 0));
    const gstAmount = +(afterDisc * Number(gstRate || 0) / 100).toFixed(2);
    return { subtotal, gstAmount, total: afterDisc + gstAmount };
  }, [items, discount, gstRate]);

  const save = useMutation({
    mutationFn: async () => {
      const clean = items.filter((i) => i.description.trim());
      if (!clean.length) throw new Error("Add at least one line item");

      const { error: uErr } = await supabase.from("invoices").update({
        invoice_number: invoiceNumber.trim(),
        company_id: companyId,
        client_id: clientId || undefined,
        invoice_date: date,
        due_date: dueDate || null,
        discount: Number(discount || 0),
        gst_rate: Number(gstRate || 0),
        notes: notes.trim() || null,
        terms: terms.trim() || null,
      }).eq("id", id);
      if (uErr) throw uErr;

      const { error: dErr } = await supabase.from("invoice_items").delete().eq("invoice_id", id);
      if (dErr) throw dErr;
      const { error: iErr } = await supabase.from("invoice_items").insert(
        clean.map((it, idx) => {
          const q = Number(it.quantity || 0);
          const r = Number(it.rate || 0);
          const period = !it.oneTime && it.fromDate && it.toDate
            ? (it.fromDate.slice(0, 7) === it.toDate.slice(0, 7)
                ? `\nFor ${fmtFull(it.fromDate)}`
                : `\nFor ${fmtMonth(it.fromDate)} - ${fmtMonth(it.toDate)}`)
            : "";
          return {
            invoice_id: id,
            description: it.description + period,
            quantity: q,
            rate: r,
            amount: +(q * r).toFixed(2),
            position: idx,
          };
        }),
      );
      if (iErr) throw iErr;
      await supabase.rpc("recalc_invoice_totals", { _invoice_id: id });
    },
    onSuccess: () => {
      toast.success("Invoice updated");
      qc.invalidateQueries({ queryKey: ["invoice", id] });
      qc.invalidateQueries({ queryKey: ["invoice-edit", id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dashboard-data"] });
      qc.invalidateQueries({ queryKey: ["timeline-first-items"] });
      qc.invalidateQueries({ queryKey: ["timeline-invoices"] });
      // Invalidate every client-scoped cache so both the old and the new client refresh.
      qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("client-") });
      navigate({ to: "/invoices/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <div className="text-muted-foreground">Loading…</div>;
  if (!data.inv) return <div className="text-muted-foreground">Invoice not found.</div>;

  return (
    <div className="space-y-4 max-w-5xl">
      <Link to="/invoices/$id" params={{ id }} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">Edit Invoice {data.inv.invoice_number}</h1>

      <Card>
        <CardContent className="p-5 grid md:grid-cols-3 gap-3">
          <div className="space-y-1.5"><Label>Invoice Number</Label>
            <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </div>
          <div className="space-y-1.5"><Label>Company</Label>
            <Select value={companyId} onValueChange={(v) => { setCompanyId(v); setClientId(""); }}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.business_name || c.client_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Invoice Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5"><Label>Due Date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Items</CardTitle></CardHeader>
        <CardContent className="space-y-3">
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
                  <Input
                    placeholder="e.g. Social Media Management"
                    value={it.description}
                    onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))}
                  />
                </div>

                <div className="grid grid-cols-12 gap-2 items-end">
                  {!it.oneTime && (
                    <>
                      <div className="col-span-3 space-y-1.5">
                        <Label className="text-xs font-medium">From Month</Label>
                        <Input
                          type="month"
                          className="[color-scheme:light] dark:[color-scheme:dark]"
                          value={it.fromDate ? it.fromDate.slice(0, 7) : ""}
                          onChange={(e) => updateRange(e.target.value ? `${e.target.value}-01` : undefined, it.toDate)}
                        />
                      </div>
                      <div className="col-span-3 space-y-1.5">
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
                  <div className="col-span-1 space-y-1.5">
                    <Label className="text-xs font-medium">{it.oneTime ? "Unit" : "Qty"}</Label>
                    <Input type="number" placeholder="0" value={it.quantity} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, quantity: e.target.value === "" ? "" : Number(e.target.value) } : x))} />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-xs font-medium">Rate</Label>
                    <Input type="number" placeholder="0" value={it.rate} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, rate: e.target.value === "" ? "" : Number(e.target.value) } : x))} />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-xs font-medium">Total{!it.oneTime ? " (÷ months)" : ""}</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={Number(it.quantity || 0) * Number(it.rate || 0) || ""}
                      onChange={(e) => {
                        const total = e.target.value === "" ? 0 : Number(e.target.value);
                        const m = !it.oneTime && it.fromDate && it.toDate ? monthsInclusive(it.fromDate, it.toDate) : 0;
                        const q = m || Number(it.quantity || 0) || 1;
                        setItems(items.map((x, i) => i === idx ? { ...x, quantity: q, rate: +(total / q).toFixed(2) } : x));
                      }}
                    />
                  </div>
                  <div className="col-span-1 flex justify-end">
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

      <Card>
        <CardContent className="p-5 grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Discount (₹)</Label><Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>GST Rate (%)</Label><Input type="number" value={gstRate} onChange={(e) => setGstRate(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
            <div className="space-y-1.5"><Label>Terms & Conditions</Label><Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} /></div>
          </div>
          <div className="space-y-2 p-4 rounded-lg bg-muted/40 self-start">
            <Row label="Subtotal" value={inr(totals.subtotal)} />
            {Number(discount) > 0 && <Row label="Discount" value={`- ${inr(Number(discount))}`} />}
            {totals.gstAmount > 0 && <Row label={`GST (${gstRate}%)`} value={inr(totals.gstAmount)} />}
            <div className="border-t pt-2"><Row label="Total" value={inr(totals.total)} bold /></div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild><Link to="/invoices/$id" params={{ id }}>Cancel</Link></Button>
        <Button data-shortcut="save" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save Changes"}</Button>
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

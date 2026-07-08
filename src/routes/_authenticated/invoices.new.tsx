import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, Plus, Trash2, CalendarIcon } from "lucide-react";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/invoices/new")({
  validateSearch: (s: Record<string, unknown>): { client?: string } =>
    typeof s.client === "string" && s.client ? { client: s.client } : {},
  component: NewInvoicePage,
});

type Item = { description: string; quantity: number; rate: number; fromDate?: string; toDate?: string };

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
  const { client: presetClient } = Route.useSearch();
  const navigate = useNavigate();
  const { companies, selected, isAll } = useCompany();

  const [companyId, setCompanyId] = useState(isAll ? companies[0]?.id ?? "" : selected);
  const [clientId, setClientId] = useState(presetClient);
  const addMonth = (d: string) => { const dt = new Date(d); dt.setMonth(dt.getMonth() + 1); return dt.toISOString().slice(0, 10); };
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(addMonth(new Date().toISOString().slice(0, 10)));
  const [discount, setDiscount] = useState("0");
  const [gstRate, setGstRate] = useState("18");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("Payment due within 30 days.");
  const [items, setItems] = useState<Item[]>([{ description: "", quantity: 1, rate: 0 }]);

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

  const filteredClients = clients.filter((c) => c.company_id === companyId);

  const totals = useMemo(() => {
    const subtotal = items.reduce((s, it) => s + it.quantity * it.rate, 0);
    const afterDisc = Math.max(0, subtotal - Number(discount || 0));
    const gstAmount = +(afterDisc * Number(gstRate || 0) / 100).toFixed(2);
    return { subtotal, gstAmount, total: afterDisc + gstAmount };
  }, [items, discount, gstRate]);



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
      }).select().single();
      if (error) throw error;

      let pos = 0;
      const { error: itErr } = await supabase.from("invoice_items").insert(
        userItems.map((it) => ({
          invoice_id: inv.id, description: it.description,
          quantity: it.quantity, rate: it.rate,
          amount: +(it.quantity * it.rate).toFixed(2), position: pos++,
        }))
      );
      if (itErr) throw itErr;

      await supabase.from("clients").update({ last_invoice_date: date }).eq("id", clientId);
      return inv.id;
    },
    onSuccess: (id) => { toast.success("Invoice created"); navigate({ to: "/invoices/$id", params: { id } }); },
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



      <Card><CardHeader><CardTitle>Items</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {items.map((it, idx) => {
            const updateRange = (from?: string, to?: string) => {
              setItems(items.map((x, i) => {
                if (i !== idx) return x;
                const next = { ...x, fromDate: from, toDate: to };
                if (from && to) {
                  next.quantity = monthsInclusive(from, to);
                  const suffix = ` (${fmtMonth(from)} - ${fmtMonth(to)})`;
                  const base = x.description.replace(/\s*\([A-Za-z]{3}\s\d{4}\s-\s[A-Za-z]{3}\s\d{4}\)\s*$/, "");
                  next.description = base + suffix;
                }
                return next;
              }));
            };
            return (
            <div key={idx} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-6 space-y-1"><Label className="text-xs">Description</Label>
                <Input value={it.description} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal h-8", !it.fromDate && "text-muted-foreground")}>
                      <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
                      {it.fromDate && it.toDate ? `${fmtMonth(it.fromDate)} - ${fmtMonth(it.toDate)} (${monthsInclusive(it.fromDate, it.toDate)} mo)` : "Pick billing period"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3 space-y-2" align="start">
                    <div className="space-y-1"><Label className="text-xs">From month</Label>
                      <Input type="month" value={it.fromDate ? it.fromDate.slice(0, 7) : ""} onChange={(e) => updateRange(e.target.value ? `${e.target.value}-01` : undefined, it.toDate)} />
                    </div>
                    <div className="space-y-1"><Label className="text-xs">To month</Label>
                      <Input type="month" value={it.toDate ? it.toDate.slice(0, 7) : ""} onChange={(e) => updateRange(it.fromDate, e.target.value ? `${e.target.value}-01` : undefined)} />
                    </div>
                    {it.fromDate && it.toDate && (
                      <div className="text-xs text-muted-foreground pt-1 border-t">
                        {monthsInclusive(it.fromDate, it.toDate)} months
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
              <div className="col-span-2 space-y-1"><Label className="text-xs">Months / Qty</Label>
                <Input type="number" value={it.quantity} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, quantity: Number(e.target.value) } : x))} />
              </div>
              <div className="col-span-2 space-y-1"><Label className="text-xs">Rate</Label>
                <Input type="number" value={it.rate} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, rate: Number(e.target.value) } : x))} />
              </div>
              <div className="col-span-1 text-right text-sm font-medium pb-2">{inr(it.quantity * it.rate)}</div>
              <div className="col-span-1">
                <Button size="icon" variant="ghost" onClick={() => setItems(items.filter((_, i) => i !== idx))} disabled={items.length === 1}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            );
          })}
          <Button variant="outline" size="sm" onClick={() => setItems([...items, { description: "", quantity: 1, rate: 0 }])}>
            <Plus className="w-4 h-4" />Add Item
          </Button>
        </CardContent>
      </Card>

      <Card><CardContent className="p-5 grid md:grid-cols-2 gap-4">
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
      </CardContent></Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild><Link to="/invoices">Cancel</Link></Button>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Saving…" : "Create Invoice"}</Button>
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



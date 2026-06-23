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
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { inr } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/invoices/new")({
  validateSearch: (s: Record<string, unknown>) => ({ client: typeof s.client === "string" ? s.client : "" }),
  component: NewInvoicePage,
});

type Item = { description: string; quantity: number; rate: number };

function NewInvoicePage() {
  const { client: presetClient } = Route.useSearch();
  const navigate = useNavigate();
  const { companies, selected, isAll } = useCompany();

  const [companyId, setCompanyId] = useState(isAll ? companies[0]?.id ?? "" : selected);
  const [clientId, setClientId] = useState(presetClient);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("Payment due within 7 days.");
  const [items, setItems] = useState<Item[]>([{ description: "", quantity: 1, rate: 0 }]);

  useEffect(() => { if (!companyId && companies[0]) setCompanyId(companies[0].id); }, [companies, companyId]);

  const { data: clients = [] } = useQuery({
    queryKey: ["all-clients"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, client_name, business_name, company_id");
      return data ?? [];
    },
  });

  const filteredClients = clients.filter((c) => c.company_id === companyId);

  const totals = useMemo(() => {
    const subtotal = items.reduce((s, it) => s + it.quantity * it.rate, 0);
    const afterDisc = Math.max(0, subtotal - Number(discount || 0));
    return { subtotal, total: afterDisc };
  }, [items, discount]);

  const create = useMutation({
    mutationFn: async () => {
      if (!companyId || !clientId) throw new Error("Select company and client");
      if (items.some((i) => !i.description)) throw new Error("All items need a description");

      const { data: numData, error: numErr } = await supabase.rpc("next_invoice_number", {
        _company_id: companyId, _type: "gst",
      });
      if (numErr) throw numErr;

      const { data: inv, error } = await supabase.from("invoices").insert({
        company_id: companyId, client_id: clientId,
        invoice_number: numData as string,
        invoice_type: "gst", invoice_date: date,
        due_date: dueDate || null,
        gst_rate: 0,
        discount: Number(discount || 0),
        notes, terms,
      }).select().single();
      if (error) throw error;

      const { error: itErr } = await supabase.from("invoice_items").insert(
        items.map((it, idx) => ({
          invoice_id: inv.id, description: it.description,
          quantity: it.quantity, rate: it.rate,
          amount: +(it.quantity * it.rate).toFixed(2), position: idx,
        }))
      );
      if (itErr) throw itErr;
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
        <div className="space-y-1.5"><Label>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as "gst" | "proforma")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="gst">GST Invoice</SelectItem>
              <SelectItem value="proforma">Proforma Invoice</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Invoice Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Due Date</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
        {type === "gst" && <div className="space-y-1.5"><Label>GST Rate (%)</Label><Input type="number" value={gstRate} onChange={(e) => setGstRate(e.target.value)} /></div>}
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Items</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-6 space-y-1"><Label className="text-xs">Description</Label>
                <Input value={it.description} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} />
              </div>
              <div className="col-span-2 space-y-1"><Label className="text-xs">Qty</Label>
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
          ))}
          <Button variant="outline" size="sm" onClick={() => setItems([...items, { description: "", quantity: 1, rate: 0 }])}>
            <Plus className="w-4 h-4" />Add Item
          </Button>
        </CardContent>
      </Card>

      <Card><CardContent className="p-5 grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Discount (₹)</Label><Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
          <div className="space-y-1.5"><Label>Terms & Conditions</Label><Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} /></div>
        </div>
        <div className="space-y-2 p-4 rounded-lg bg-muted/40 self-start">
          <Row label="Subtotal" value={inr(totals.subtotal)} />
          <Row label="Discount" value={`- ${inr(Number(discount || 0))}`} />
          {type === "gst" && <Row label={`GST (${gstRate}%)`} value={inr(totals.gst)} />}
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

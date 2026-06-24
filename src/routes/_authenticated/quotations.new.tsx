import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
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

export const Route = createFileRoute("/_authenticated/quotations/new")({ component: NewQuotationPage });

type Item = { item_name: string; description: string; amount: number };

function NewQuotationPage() {
  const navigate = useNavigate();
  const { companies, selected, isAll } = useCompany();

  const [companyId, setCompanyId] = useState(isAll ? companies[0]?.id ?? "" : selected);
  const [customClientName, setCustomClientName] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("Quotation valid for 15 days. Prices subject to change.");
  const [items, setItems] = useState<Item[]>([{ item_name: "", description: "", quantity: 1, unit_price: 0 }]);

  useEffect(() => {
    const makeMe = companies.find((c) => c.name.toLowerCase().includes("make me"));
    if (makeMe) { setCompanyId(makeMe.id); return; }
    if (!companyId && companies[0]) setCompanyId(companies[0].id);
  }, [companies, companyId]);



  const totals = useMemo(() => {
    const subtotal = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
    return { subtotal, total: subtotal };
  }, [items]);

  const create = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Select company");
      if (!customClientName.trim()) throw new Error("Enter client name");
      if (items.some((i) => !i.item_name)) throw new Error("All items need a name");

      const { data: num, error: numErr } = await supabase.rpc("next_quotation_number", { _company_id: companyId });
      if (numErr) throw numErr;

      const { data: q, error } = await supabase.from("quotations").insert({
        company_id: companyId,
        client_id: null,
        custom_client_name: customClientName.trim(),
        quotation_number: num as string,
        quotation_date: date,
        valid_until: null,
        gst_rate: 0,
        discount: 0,
        notes, terms, status: "draft",
      }).select().single();
      if (error) throw error;

      const { error: itErr } = await supabase.from("quotation_items").insert(
        items.map((it, idx) => ({
          quotation_id: q.id, item_name: it.item_name, description: it.description,
          quantity: it.quantity, unit_price: it.unit_price,
          amount: +(it.quantity * it.unit_price).toFixed(2), position: idx,
        }))
      );
      if (itErr) throw itErr;
      return q.id;
    },
    onSuccess: (id) => { toast.success("Quotation created"); navigate({ to: "/quotations/$id", params: { id } }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 max-w-5xl">
      <Link to="/quotations" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">New Quotation</h1>

      <Card><CardContent className="p-5 grid md:grid-cols-3 gap-3">
        <div className="space-y-1.5"><Label>Company</Label>
          <Input value={companies.find((c) => c.id === companyId)?.name ?? ""} readOnly disabled />
        </div>
        <div className="space-y-1.5">
          <Label>Client / Brand Name</Label>
          <Input placeholder="Type client or brand name" value={customClientName} onChange={(e) => setCustomClientName(e.target.value)} />
        </div>
        <div className="space-y-1.5"><Label>Quotation Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Items</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-12 md:col-span-4 space-y-1"><Label className="text-xs">Item</Label>
                <Input value={it.item_name} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, item_name: e.target.value } : x))} />
              </div>
              <div className="col-span-12 md:col-span-3 space-y-1"><Label className="text-xs">Description</Label>
                <Input value={it.description} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} />
              </div>
              <div className="col-span-4 md:col-span-1 space-y-1"><Label className="text-xs">Qty</Label>
                <Input type="number" value={it.quantity} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, quantity: Number(e.target.value) } : x))} />
              </div>
              <div className="col-span-4 md:col-span-2 space-y-1"><Label className="text-xs">Unit Price</Label>
                <Input type="number" value={it.unit_price} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, unit_price: Number(e.target.value) } : x))} />
              </div>
              <div className="col-span-3 md:col-span-1 text-right text-sm font-medium pb-2">{inr(it.quantity * it.unit_price)}</div>
              <div className="col-span-1">
                <Button size="icon" variant="ghost" onClick={() => setItems(items.filter((_, i) => i !== idx))} disabled={items.length === 1}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setItems([...items, { item_name: "", description: "", quantity: 1, unit_price: 0 }])}>
            <Plus className="w-4 h-4" />Add Item
          </Button>
        </CardContent>
      </Card>

      <Card><CardContent className="p-5 grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
          <div className="space-y-1.5"><Label>Terms & Conditions</Label><Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} /></div>
        </div>
        <div className="space-y-2 p-4 rounded-lg bg-muted/40 self-start">
          <Row label="Subtotal" value={inr(totals.subtotal)} />
          <div className="border-t pt-2"><Row label="Grand Total" value={inr(totals.total)} bold /></div>
        </div>
      </CardContent></Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild><Link to="/quotations">Cancel</Link></Button>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Saving…" : "Create Quotation"}</Button>
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

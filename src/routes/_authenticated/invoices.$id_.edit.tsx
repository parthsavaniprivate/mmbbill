import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { inr } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/invoices/$id_/edit")({ component: EditInvoicePage });

type Item = { id?: string; description: string; quantity: number; rate: number };

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

  const [date, setDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [discount, setDiscount] = useState("0");
  const [gstRate, setGstRate] = useState("0");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    if (!data?.inv) return;
    setDate(data.inv.invoice_date);
    setDueDate(data.inv.due_date ?? "");
    setDiscount(String(data.inv.discount ?? 0));
    setGstRate(String(data.inv.gst_rate ?? 0));
    setNotes(data.inv.notes ?? "");
    setTerms(data.inv.terms ?? "");
    setItems(
      (data.items.length ? data.items : [{ description: "", quantity: 1, rate: 0 }]).map((it) => ({
        id: (it as { id?: string }).id,
        description: it.description,
        quantity: Number(it.quantity),
        rate: Number(it.rate),
      })),
    );
  }, [data]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((s, it) => s + it.quantity * it.rate, 0);
    const afterDisc = Math.max(0, subtotal - Number(discount || 0));
    const gstAmount = +(afterDisc * Number(gstRate || 0) / 100).toFixed(2);
    return { subtotal, gstAmount, total: afterDisc + gstAmount };
  }, [items, discount, gstRate]);

  const save = useMutation({
    mutationFn: async () => {
      const clean = items.filter((i) => i.description.trim());
      if (!clean.length) throw new Error("Add at least one line item");

      const { error: uErr } = await supabase.from("invoices").update({
        invoice_date: date,
        due_date: dueDate || null,
        discount: Number(discount || 0),
        gst_rate: Number(gstRate || 0),
        notes: notes || null,
        terms: terms || null,
      }).eq("id", id);
      if (uErr) throw uErr;

      // Replace items: simplest reliable strategy
      const { error: dErr } = await supabase.from("invoice_items").delete().eq("invoice_id", id);
      if (dErr) throw dErr;
      const { error: iErr } = await supabase.from("invoice_items").insert(
        clean.map((it, idx) => ({
          invoice_id: id,
          description: it.description,
          quantity: it.quantity,
          rate: it.rate,
          amount: +(it.quantity * it.rate).toFixed(2),
          position: idx,
        })),
      );
      if (iErr) throw iErr;
    },
    onSuccess: () => {
      toast.success("Invoice updated");
      qc.invalidateQueries({ queryKey: ["invoice", id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
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
        <CardContent className="p-5 grid md:grid-cols-2 gap-3">
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
        <CardContent className="space-y-2">
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-6 space-y-1"><Label className="text-xs">Description</Label>
                <Input value={it.description} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} />
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
          ))}
          <Button variant="outline" size="sm" onClick={() => setItems([...items, { description: "", quantity: 1, rate: 0 }])}>
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
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save Changes"}</Button>
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

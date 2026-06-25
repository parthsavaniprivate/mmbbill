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
  validateSearch: (s: Record<string, unknown>): { client?: string } =>
    typeof s.client === "string" && s.client ? { client: s.client } : {},
  component: NewInvoicePage,
});

type Item = { description: string; quantity: number; rate: number };

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
  const [includeMeta, setIncludeMeta] = useState(true);

  useEffect(() => { if (!companyId && companies[0]) setCompanyId(companies[0].id); }, [companies, companyId]);

  const { data: clients = [] } = useQuery({
    queryKey: ["all-clients"],
    queryFn: async () => {
      const { data } = await supabase.from("clients")
        .select("id, client_name, business_name, company_id, service_charge_type, service_charge_amount, last_billed_spend");
      return data ?? [];
    },
  });

  const filteredClients = clients.filter((c) => c.company_id === companyId);
  const selectedClient = clients.find((c) => c.id === clientId);

  // Meta billing preview — cumulative lifetime spend minus already-billed.
  const { data: metaBilling } = useQuery({
    enabled: !!clientId,
    queryKey: ["meta-billable", clientId],
    queryFn: async () => {
      const { data: acc } = await supabase.from("meta_accounts")
        .select("id, ad_account_name, ad_account_id, last_synced_at, currency")
        .eq("client_id", clientId!).maybeSingle();
      if (!acc) return null;
      const [{ data: hist }, { data: ins }] = await Promise.all([
        supabase.from("meta_ad_spend_history").select("spend").eq("meta_account_id", acc.id),
        supabase.from("meta_campaign_insights").select("spend").eq("meta_account_id", acc.id),
      ]);
      const histSum = (hist ?? []).reduce((a, r) => a + Number(r.spend ?? 0), 0);
      const insSum = (ins ?? []).reduce((a, r) => a + Number(r.spend ?? 0), 0);
      const cumulative = histSum > 0 ? histSum : insSum;
      return { account: acc, cumulative };
    },
  });

  const lastBilled = Number(selectedClient?.last_billed_spend ?? 0);
  const cumulativeSpend = Number(metaBilling?.cumulative ?? 0);
  const billableSpend = includeMeta ? Math.max(0, cumulativeSpend - lastBilled) : 0;
  const managementFee = (() => {
    if (!selectedClient || !includeMeta) return 0;
    const amt = Number(selectedClient.service_charge_amount ?? 0);
    if (selectedClient.service_charge_type === "percent_of_spend") return +(billableSpend * amt / 100).toFixed(2);
    return amt; // fixed_monthly or custom — flat amount
  })();

  const totals = useMemo(() => {
    const itemsSubtotal = items.reduce((s, it) => s + it.quantity * it.rate, 0);
    const subtotal = itemsSubtotal + billableSpend + managementFee;
    const afterDisc = Math.max(0, subtotal - Number(discount || 0));
    const gstAmount = +(afterDisc * Number(gstRate || 0) / 100).toFixed(2);
    return { subtotal, gstAmount, total: afterDisc + gstAmount };
  }, [items, discount, billableSpend, managementFee, gstRate]);


  const create = useMutation({
    mutationFn: async () => {
      if (!companyId || !clientId) throw new Error("Select company and client");
      const userItems = items.filter(i => i.description || i.quantity || i.rate);
      if (userItems.some((i) => !i.description)) throw new Error("All items need a description");
      if (!userItems.length && billableSpend <= 0 && managementFee <= 0)
        throw new Error("Add at least one line item or enable Meta billing");

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
        meta_spend_billed: billableSpend,
        meta_spend_cumulative_at_invoice: cumulativeSpend,
        management_fee: managementFee,
        notes, terms,
      }).select().single();
      if (error) throw error;

      // Compose item rows: Meta spend → Management fee → user-entered items
      let pos = 0;
      const allItems: { description: string; quantity: number; rate: number }[] = [];
      if (billableSpend > 0) allItems.push({ description: "Meta Ad Spend (new since last invoice)", quantity: 1, rate: billableSpend });
      if (managementFee > 0) allItems.push({ description: "Agency Management Fee", quantity: 1, rate: managementFee });
      for (const it of userItems) allItems.push(it);

      const { error: itErr } = await supabase.from("invoice_items").insert(
        allItems.map((it) => ({
          invoice_id: inv.id, description: it.description,
          quantity: it.quantity, rate: it.rate,
          amount: +(it.quantity * it.rate).toFixed(2), position: pos++,
        }))
      );
      if (itErr) throw itErr;

      // Update client's cumulative billed spend so the next invoice only bills new spend.
      if (includeMeta && billableSpend > 0) {
        await supabase.from("clients").update({
          last_billed_spend: cumulativeSpend,
          last_invoice_date: date,
        }).eq("id", clientId);
      }
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

      {clientId && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Meta Ad Spend Billing</CardTitle></CardHeader>
          <CardContent className="p-5 pt-2 space-y-3 text-sm">
            {!metaBilling ? (
              <p className="text-muted-foreground">No Meta account linked to this client.</p>
            ) : (
              <>
                <div className="grid sm:grid-cols-4 gap-3">
                  <KV label="Ad Account" value={metaBilling.account.ad_account_name || metaBilling.account.ad_account_id || "—"} />
                  <KV label="Cumulative Spend" value={inr(cumulativeSpend)} />
                  <KV label="Already Billed" value={inr(lastBilled)} />
                  <KV label="New Billable" value={inr(Math.max(0, cumulativeSpend - lastBilled))} highlight />
                </div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={includeMeta} onChange={(e) => setIncludeMeta(e.target.checked)} />
                  Bill new Meta ad spend on this invoice
                </label>
                {includeMeta && selectedClient && (
                  <p className="text-muted-foreground text-xs">
                    Management fee:{" "}
                    {selectedClient.service_charge_type === "percent_of_spend"
                      ? `${Number(selectedClient.service_charge_amount ?? 0)}% of new spend = ${inr(managementFee)}`
                      : `${inr(Number(selectedClient.service_charge_amount ?? 0))} (${selectedClient.service_charge_type.replace(/_/g, " ")})`}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}


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

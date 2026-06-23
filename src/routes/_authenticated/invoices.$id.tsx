import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Printer, MessageCircle, Plus } from "lucide-react";
import { inr, formatDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/invoices/$id")({ component: InvoiceDetail });

function InvoiceDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const { data: inv } = await supabase.from("invoices")
        .select("*, clients(*), companies(*)")
        .eq("id", id).maybeSingle();
      const { data: items } = await supabase.from("invoice_items").select("*").eq("invoice_id", id).order("position");
      const { data: payments } = await supabase.from("payments").select("*").eq("invoice_id", id).order("payment_date", { ascending: false });
      return { invoice: inv, items: items ?? [], payments: payments ?? [] };
    },
  });

  if (!data?.invoice) return <div className="text-muted-foreground">Loading…</div>;
  const inv = data.invoice;
  const cl = inv.clients as { client_name: string; business_name: string | null; gst_number: string | null; address: string | null; email: string | null; mobile: string | null; whatsapp: string | null } | null;
  const co = inv.companies as { name: string; address: string | null; gst_number: string | null; phone: string | null; email: string | null; invoice_terms: string | null; bank_name: string | null; bank_account: string | null; bank_ifsc: string | null } | null;
  const pending = Number(inv.total) - Number(inv.amount_paid);

  const waLink = (() => {
    if (!cl?.whatsapp) return null;
    const msg = `Hi ${cl.client_name},\n\nYour invoice *${inv.invoice_number}* for ${inr(Number(inv.total))} is ready.\nPending: ${inr(pending)}\nDue: ${formatDate(inv.due_date)}\n\nThanks,\n${co?.name}`;
    return `https://wa.me/${cl.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
  })();

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link to="/invoices" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4" />Print / PDF</Button>
          {waLink && (
            <AlertDialog open={waOpen} onOpenChange={setWaOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="outline"><MessageCircle className="w-4 h-4" />WhatsApp</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Send via WhatsApp?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Opens WhatsApp with a pre-filled message for {cl?.client_name}. You'll review and send manually.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => window.open(waLink, "_blank")}>Open WhatsApp</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Dialog open={payOpen} onOpenChange={setPayOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4" />Record Payment</Button></DialogTrigger>
            <PaymentForm invoiceId={id} pending={pending} onSaved={() => { setPayOpen(false); qc.invalidateQueries({ queryKey: ["invoice", id] }); }} />
          </Dialog>
        </div>
      </div>

      <Card className="shadow-card print:shadow-none">
        <CardContent className="p-8 space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold">{co?.name}</h2>
              {co?.address && <p className="text-sm text-muted-foreground whitespace-pre-line">{co.address}</p>}
              {co?.phone && <p className="text-sm">{co.phone} {co.email && `· ${co.email}`}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Invoice</p>
              <p className="text-2xl font-bold mt-1">{inv.invoice_number}</p>
              <Badge variant="outline" className="mt-2">{inv.status.replace("_", " ")}</Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 pt-4 border-t">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Bill To</p>
              <p className="font-semibold">{cl?.business_name || cl?.client_name}</p>
              {cl?.business_name && <p className="text-sm">{cl.client_name}</p>}
              {cl?.address && <p className="text-sm text-muted-foreground whitespace-pre-line">{cl.address}</p>}
              
            </div>
            <div className="text-right">
              <p className="text-sm"><span className="text-muted-foreground">Date:</span> {formatDate(inv.invoice_date)}</p>
              {inv.due_date && <p className="text-sm"><span className="text-muted-foreground">Due:</span> {formatDate(inv.due_date)}</p>}
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((it, i) => (
                <TableRow key={it.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>{it.description}</TableCell>
                  <TableCell className="text-right">{it.quantity}</TableCell>
                  <TableCell className="text-right">{inr(Number(it.rate))}</TableCell>
                  <TableCell className="text-right">{inr(Number(it.amount))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex justify-end">
            <div className="w-72 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{inr(Number(inv.subtotal))}</span></div>
              {Number(inv.discount) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>- {inr(Number(inv.discount))}</span></div>}
              {inv.invoice_type === "gst" && <div className="flex justify-between"><span className="text-muted-foreground">GST ({inv.gst_rate}%)</span><span>{inr(Number(inv.gst_amount))}</span></div>}
              <div className="flex justify-between font-bold text-base border-t pt-2"><span>Total</span><span>{inr(Number(inv.total))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="text-success">{inr(Number(inv.amount_paid))}</span></div>
              <div className="flex justify-between font-medium"><span>Balance</span><span className={pending > 0 ? "text-destructive" : ""}>{inr(pending)}</span></div>
            </div>
          </div>

          {(inv.notes || inv.terms || co?.bank_name) && (
            <div className="pt-4 border-t space-y-3 text-sm">
              {inv.notes && <div><p className="font-medium">Notes</p><p className="text-muted-foreground whitespace-pre-line">{inv.notes}</p></div>}
              {inv.terms && <div><p className="font-medium">Terms & Conditions</p><p className="text-muted-foreground whitespace-pre-line">{inv.terms}</p></div>}
              {co?.bank_name && (
                <div><p className="font-medium">Bank Details</p>
                  <p className="text-muted-foreground">{co.bank_name} · A/c: {co.bank_account} · IFSC: {co.bank_ifsc}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="no-print">
        <CardHeader><CardTitle>Payment History</CardTitle></CardHeader>
        <CardContent className="p-0">
          {data.payments.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No payments recorded.</div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead><TableHead>Reference</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDate(p.payment_date)}</TableCell>
                    <TableCell className="font-medium">{inr(Number(p.amount))}</TableCell>
                    <TableCell><Badge variant="outline">{p.method.replace("_", " ")}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{p.reference || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PaymentForm({ invoiceId, pending, onSaved }: { invoiceId: string; pending: number; onSaved: () => void }) {
  const [form, setForm] = useState({
    amount: String(pending), payment_date: new Date().toISOString().slice(0, 10),
    method: "bank_transfer", reference: "", notes: "",
  });
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("payments").insert({
        invoice_id: invoiceId, amount: Number(form.amount),
        payment_date: form.payment_date,
        method: form.method as "cash" | "bank_transfer" | "upi" | "card" | "cheque" | "other",
        reference: form.reference || null, notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Payment recorded"); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5"><Label>Amount (₹)</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Method</Label>
          <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
              <SelectItem value="upi">UPI</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="cheque">Cheque</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Reference</Label><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Txn ID, cheque no." /></div>
        <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
      </div>
      <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button></DialogFooter>
    </DialogContent>
  );
}

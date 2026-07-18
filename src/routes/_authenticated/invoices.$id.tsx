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
import { ArrowLeft, Printer, MessageCircle, Plus, Bell } from "lucide-react";
import { inr, formatDate, amountInWords } from "@/lib/format";
import { toast } from "sonner";
import { SendReminderDialog, MarkAsPaidButton, MarkAsUnpaidButton } from "@/components/invoices/SendReminderDialog";
import { BillOfSupplyTemplate, ModernPurpleTemplate } from "@/components/invoices/InvoiceTemplates";

const REMINDABLE = ["pending", "partially_paid", "overdue"];

export const Route = createFileRoute("/_authenticated/invoices/$id")({ component: InvoiceDetail });

function InvoiceDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const { data: inv } = await supabase.from("invoices")
        .select("*, clients(*), companies(*)")
        .eq("id", id).maybeSingle();
      const { data: items } = await supabase.from("invoice_items").select("*").eq("invoice_id", id).order("position");
      const { data: payments } = await supabase.from("payments").select("*").eq("invoice_id", id).order("payment_date", { ascending: false });
      const { data: reminders } = await supabase.from("invoice_reminders").select("*").eq("invoice_id", id).order("sent_at", { ascending: false });
      return { invoice: inv, items: items ?? [], payments: payments ?? [], reminders: reminders ?? [] };
    },
  });

  if (!data?.invoice) return <div className="text-muted-foreground">Loading…</div>;
  const inv = data.invoice;
  const cl = inv.clients as { client_name: string; business_name: string | null; gst_number: string | null; address: string | null; email: string | null; mobile: string | null; whatsapp: string | null } | null;
  const co = inv.companies as { name: string; address: string | null; gst_number: string | null; phone: string | null; email: string | null; invoice_terms: string | null; bank_name: string | null; bank_account: string | null; bank_ifsc: string | null; logo_url: string | null } | null;
  const pending = Number(inv.total) - Number(inv.amount_paid);

  const waLink = (() => {
    if (!cl?.whatsapp) return null;
    const msg = `Hi ${cl.client_name},\n\nYour invoice *${inv.invoice_number}* for ${inr(Number(inv.total))} is ready.\nPending: ${inr(pending)}\nDue: ${formatDate(inv.due_date)}\n\nThanks,\n${co?.name}`;
    return `https://wa.me/${cl.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
  })();

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="no-print grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <Link to="/invoices" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Link>
        <div className="col-span-2 flex flex-wrap gap-2 sm:col-auto">
          <Button variant="outline" onClick={() => {
            const name = (cl?.business_name || cl?.client_name || inv.invoice_number).replace(/[\\/:*?"<>|]/g, "").trim();
            const prev = document.title;
            document.title = `${name} Invoice`;
            const restore = () => { document.title = prev; window.removeEventListener("afterprint", restore); };
            window.addEventListener("afterprint", restore);
            window.print();
          }}><Printer className="w-4 h-4" />Print / PDF</Button>
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
          {REMINDABLE.includes(inv.status) && (
            <Button variant="outline" onClick={() => setRemindOpen(true)}>
              <Bell className="w-4 h-4" />Send Reminder
            </Button>
          )}
          {pending > 0 && inv.status !== "cancelled" && (
            <MarkAsPaidButton invoiceId={id} pending={pending} />
          )}
          {Number(inv.amount_paid) > 0 && inv.status !== "cancelled" && (
            <MarkAsUnpaidButton invoiceId={id} />
          )}
          {pending > 0 && inv.status !== "cancelled" && (
            <Dialog open={payOpen} onOpenChange={setPayOpen}>
              <DialogTrigger asChild><Button><Plus className="w-4 h-4" />Record Payment</Button></DialogTrigger>
              <PaymentForm invoiceId={id} pending={pending} onSaved={() => { setPayOpen(false); qc.invalidateQueries({ queryKey: ["invoice", id] }); }} />
            </Dialog>
          )}
        </div>
      </div>

      <SendReminderDialog
        open={remindOpen}
        onOpenChange={setRemindOpen}
        invoice={{
          id, invoice_number: inv.invoice_number,
          total: Number(inv.total), amount_paid: Number(inv.amount_paid),
          due_date: inv.due_date, status: inv.status,
          reminders_sent: inv.reminders_sent,
        }}
        client={cl ? { client_name: cl.client_name, whatsapp: cl.whatsapp, mobile: cl.mobile } : null}
        companyName={co?.name}
      />

      <Card className="shadow-card print:shadow-none overflow-hidden invoice-scroll">
        {(() => {
          // Fallback: if this invoice has no line items in DB (legacy/imported),
          // synthesize a single row from the invoice subtotal so the template
          // doesn't render blank service name / qty / rate columns.
          let displayItems = data.items;
          if (!displayItems.length) {
            const baseAmount = Number(inv.subtotal || 0);
            displayItems = [{
              id: `synthetic-${inv.id}`,
              invoice_id: inv.id,
              description: inv.notes?.trim() || "Professional Services",
              quantity: 1,
              rate: baseAmount,
              amount: baseAmount,
              position: 0,
              gst_rate: null,
              created_at: inv.created_at,
            }];
          }
          const tplData = {
            invoice: inv,
            items: displayItems,
            company: co,
            client: cl,
          } as Parameters<typeof BillOfSupplyTemplate>[0]["data"];
          const useModern = (co?.name || "").toLowerCase().includes("janki");
          return useModern
            ? <ModernPurpleTemplate data={tplData} />
            : <BillOfSupplyTemplate data={tplData} />;
        })()}
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

      <Card className="no-print">
        <CardHeader><CardTitle>Reminder History</CardTitle></CardHeader>
        <CardContent className="p-0">
          {data.reminders.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No reminders sent yet.</div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Sent</TableHead><TableHead>Template</TableHead><TableHead>Channel</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.reminders.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>#{r.reminder_no}</TableCell>
                    <TableCell>{formatDate(r.sent_at)}</TableCell>
                    <TableCell><Badge variant="outline">{r.template.replace("_", " ")}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{r.channel}</TableCell>
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
      const { data: inv, error: invErr } = await supabase
        .from("invoices").select("total, amount_paid").eq("id", invoiceId).single();
      if (invErr) throw invErr;
      const remaining = Number(inv.total) - Number(inv.amount_paid);
      if (remaining <= 0) throw new Error("Invoice is already fully paid");
      const amt = Number(form.amount);
      if (!(amt > 0)) throw new Error("Enter a valid amount");
      if (amt > remaining) throw new Error(`Amount cannot exceed pending ₹${remaining}`);
      const { error } = await supabase.from("payments").insert({
        invoice_id: invoiceId, amount: amt,
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

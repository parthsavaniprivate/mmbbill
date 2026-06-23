import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import {
  buildReminderMessage, pickReminderTone, waLink, REMINDER_LABEL, type ReminderTone,
} from "@/lib/reminders";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice: {
    id: string;
    invoice_number: string;
    total: number;
    amount_paid: number;
    due_date: string | null;
    status: string;
    reminders_sent: number | null;
  };
  client: { client_name: string; whatsapp: string | null; mobile: string | null } | null;
  companyName?: string | null;
}

export function SendReminderDialog({ open, onOpenChange, invoice, client, companyName }: Props) {
  const qc = useQueryClient();
  const pending = Number(invoice.total) - Number(invoice.amount_paid);
  const nextNo = (invoice.reminders_sent ?? 0) + 1;
  const isOverdue = invoice.status === "overdue";
  const defaultTone = pickReminderTone(nextNo, isOverdue);
  const [tone, setTone] = useState<ReminderTone>(defaultTone);

  const defaultMessage = useMemo(
    () => buildReminderMessage({
      clientName: client?.client_name ?? "there",
      invoiceNumber: invoice.invoice_number,
      pending, total: Number(invoice.total),
      dueDate: invoice.due_date, companyName, tone,
    }),
    [client, invoice, pending, companyName, tone],
  );
  const [message, setMessage] = useState(defaultMessage);
  // resync when tone changes
  useMemoSync(defaultMessage, setMessage, [tone]);

  const phone = client?.whatsapp || client?.mobile;
  const link = waLink(phone, message);

  const log = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("invoice_reminders").insert({
        invoice_id: invoice.id, reminder_no: nextNo, template: tone,
        channel: "whatsapp", message,
      });
      if (error) throw error;
      const { error: e2 } = await supabase.from("invoices").update({
        last_reminder_at: new Date().toISOString(),
        reminders_sent: nextNo,
      }).eq("id", invoice.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice", invoice.id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Reminder logged");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const send = () => {
    if (!link) {
      toast.error("Client has no WhatsApp / mobile number");
      return;
    }
    window.open(link, "_blank");
    log.mutate();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Send payment reminder?</AlertDialogTitle>
          <AlertDialogDescription>
            Reminder #{nextNo} for invoice {invoice.invoice_number}. Opens WhatsApp; you review and send.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Template</Label>
            <Select value={tone} onValueChange={(v) => setTone(v as ReminderTone)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["friendly", "follow_up", "overdue"] as ReminderTone[]).map((t) => (
                  <SelectItem key={t} value={t}>{REMINDER_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={9} />
          </div>
          {!phone && <p className="text-xs text-destructive">No WhatsApp/mobile number on file.</p>}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={send} disabled={!phone || log.isPending}>
            <MessageCircle className="w-4 h-4" />Send Reminder
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Tiny helper: when deps change, reset the textarea to the regenerated default.
import { useEffect } from "react";
function useMemoSync(value: string, setter: (v: string) => void, deps: unknown[]) {
  useEffect(() => { setter(value); /* eslint-disable-next-line */ }, deps);
}

export function MarkAsPaidButton({ invoiceId, pending, onDone }: {
  invoiceId: string; pending: number; onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const m = useMutation({
    mutationFn: async () => {
      if (pending <= 0) return;
      const { error } = await supabase.from("payments").insert({
        invoice_id: invoiceId, amount: pending,
        payment_date: new Date().toISOString().slice(0, 10),
        method: "bank_transfer", reference: "Marked as paid", notes: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Marked as paid");
      setOpen(false);
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={pending <= 0}>
        Mark as Paid
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark invoice as paid?</AlertDialogTitle>
          <AlertDialogDescription>
            This records a payment for the remaining balance and updates the invoice status.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => m.mutate()} disabled={m.isPending}>
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

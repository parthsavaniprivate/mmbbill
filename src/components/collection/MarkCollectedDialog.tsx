import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { inr } from "@/lib/format";

interface Props {
  invoiceId: string;
  invoiceNumber: string;
  pending: number;
  onDone?: () => void;
}

export function MarkCollectedButton({ invoiceId, invoiceNumber, pending, onDone }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(pending));
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");

  const m = useMutation({
    mutationFn: async () => {
      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .select("total, amount_paid")
        .eq("id", invoiceId)
        .single();
      if (invErr) throw invErr;
      const remaining = Number(inv.total) - Number(inv.amount_paid);
      const amt = Math.min(Number(amount) || 0, remaining);
      if (amt <= 0) throw new Error("Invalid amount");
      const { error } = await supabase.from("payments").insert({
        invoice_id: invoiceId,
        amount: amt,
        payment_date: new Date().toISOString().slice(0, 10),
        method,
        reference: reference || "Collected on field",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["cc-clients"] });
      qc.invalidateQueries({ queryKey: ["cc-invoices"] });
      qc.invalidateQueries({ queryKey: ["cc-today-pay"] });
      toast.success("Payment recorded");
      setOpen(false);
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)} disabled={pending <= 0}>
        <CheckCircle2 className="w-4 h-4" /> Mark Collected
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Collect payment for {invoiceNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            Pending balance: <b>{inr(pending)}</b>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} />
          </div>
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reference (optional)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI ref / cheque #" />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending ? "Saving…" : "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

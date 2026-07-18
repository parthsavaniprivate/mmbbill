import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  computeBehaviour,
  type BehaviourStats,
  type PaymentBehaviour,
  type InvoiceForBehaviour,
  type PaymentForBehaviour,
} from "@/lib/payment-behaviour";

/**
 * Fetches invoices + payments scoped by company and returns a map of
 * clientId -> BehaviourStats. Manual override on a client (if set) wins.
 *
 * One query per (companyId) key — result is memoised & cached by React Query.
 */
export function useClientBehaviours(
  companyId: string | null | undefined,
  overrides: Record<string, PaymentBehaviour | null> = {},
) {
  const { data: invoices = [] } = useQuery<InvoiceForBehaviour[]>({
    queryKey: ["behaviour-invoices", companyId ?? "all"],
    enabled: !!companyId,
    queryFn: async () => {
      let q = supabase
        .from("invoices")
        .select("id, client_id, due_date, invoice_date, total, amount_paid, status");
      if (companyId) q = q.eq("company_id", companyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as InvoiceForBehaviour[];
    },
    staleTime: 60_000,
  });

  const { data: payments = [] } = useQuery<PaymentForBehaviour[]>({
    queryKey: ["behaviour-payments", companyId ?? "all"],
    enabled: !!companyId,
    queryFn: async () => {
      let q = supabase
        .from("payments")
        .select("invoice_id, payment_date, invoices!inner(company_id)");
      if (companyId) q = q.eq("invoices.company_id", companyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((p) => ({
        invoice_id: p.invoice_id,
        payment_date: p.payment_date,
      })) as PaymentForBehaviour[];
    },
    staleTime: 60_000,
  });

  const byClient = useMemo(() => {
    const groupsInv = new Map<string, InvoiceForBehaviour[]>();
    for (const inv of invoices) {
      if (!inv.client_id) continue;
      const arr = groupsInv.get(inv.client_id) ?? [];
      arr.push(inv);
      groupsInv.set(inv.client_id, arr);
    }
    // invoice_id -> client_id
    const invClient = new Map<string, string>();
    for (const inv of invoices) if (inv.client_id) invClient.set(inv.id, inv.client_id);
    const groupsPay = new Map<string, PaymentForBehaviour[]>();
    for (const p of payments) {
      const cid = invClient.get(p.invoice_id);
      if (!cid) continue;
      const arr = groupsPay.get(cid) ?? [];
      arr.push(p);
      groupsPay.set(cid, arr);
    }

    const out = new Map<string, BehaviourStats>();
    for (const [cid, invs] of groupsInv) {
      const stats = computeBehaviour(invs, groupsPay.get(cid) ?? []);
      const override = overrides[cid];
      if (override) out.set(cid, { ...stats, behaviour: override });
      else out.set(cid, stats);
    }
    // Clients with overrides but no invoices yet — surface them too.
    for (const [cid, override] of Object.entries(overrides)) {
      if (override && !out.has(cid)) {
        out.set(cid, {
          behaviour: override,
          avgDelayDays: 0,
          overdueCount: 0,
          unpaidCount: 0,
          paidCount: 0,
          totalInvoices: 0,
          outstanding: 0,
          worstDelayDays: 0,
        });
      }
    }
    return out;
  }, [invoices, payments, overrides]);

  return byClient;
}

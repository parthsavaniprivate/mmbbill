// Client payment behaviour classification.
// Pure functions — no side effects, no data fetching.
//
// Simple 3-status model:
//   🟢 Excellent — payments received within 30 days of due date
//   🟡 Average   — payments received 31–45 days after due date
//   🔴 High Risk — payments received after 45 days, OR any unpaid invoice
//                  currently overdue by more than 45 days

export type PaymentBehaviour = "excellent" | "average" | "high_risk";

export const BEHAVIOUR_ORDER: PaymentBehaviour[] = [
  "excellent",
  "average",
  "high_risk",
];

export const BEHAVIOUR_LABEL: Record<PaymentBehaviour, string> = {
  excellent: "Excellent Client",
  average: "Average Client",
  high_risk: "High Risk Client",
};

export const BEHAVIOUR_SHORT: Record<PaymentBehaviour, string> = {
  excellent: "Excellent",
  average: "Average",
  high_risk: "High Risk",
};

export const BEHAVIOUR_DOT: Record<PaymentBehaviour, string> = {
  excellent: "#22c55e", // green-500
  average: "#eab308",   // yellow-500
  high_risk: "#ef4444", // red-500
};

export const BEHAVIOUR_BADGE: Record<PaymentBehaviour, string> = {
  excellent: "bg-green-500/15 text-green-600 border-green-500/30",
  average: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  high_risk: "bg-red-500/15 text-red-600 border-red-500/30",
};

export const BEHAVIOUR_HINT: Record<PaymentBehaviour, string> = {
  excellent: "Payments received within 30 days.",
  average: "Payments received in 31–45 days.",
  high_risk: "Payments received after 45 days or invoice overdue 45+ days.",
};

export interface InvoiceForBehaviour {
  id: string;
  client_id: string | null;
  due_date: string | null;
  invoice_date: string;
  total: number | null;
  amount_paid: number | null;
  status: string | null;
}

export interface PaymentForBehaviour {
  invoice_id: string;
  payment_date: string;
}

export interface BehaviourStats {
  behaviour: PaymentBehaviour;
  avgDelayDays: number;
  overdueCount: number;
  unpaidCount: number;
  paidCount: number;
  totalInvoices: number;
  outstanding: number;
  worstDelayDays: number;
}

const daysBetween = (a: string, b: string) => {
  const ms = new Date(a).getTime() - new Date(b).getTime();
  return Math.round(ms / 86_400_000);
};

export function computeBehaviour(
  invoices: InvoiceForBehaviour[],
  payments: PaymentForBehaviour[],
): BehaviourStats {
  const today = new Date().toISOString().slice(0, 10);

  const lastPay = new Map<string, string>();
  for (const p of payments) {
    const prev = lastPay.get(p.invoice_id);
    if (!prev || p.payment_date > prev) lastPay.set(p.invoice_id, p.payment_date);
  }

  const delays: number[] = [];
  let overdueCount = 0;
  let unpaidCount = 0;
  let paidCount = 0;
  let outstanding = 0;
  let worstDelayDays = 0;

  for (const inv of invoices) {
    if (inv.status === "cancelled") continue;
    const total = Number(inv.total || 0);
    const paid = Number(inv.amount_paid || 0);
    const isPaid = inv.status === "paid" || (total > 0 && paid >= total);

    if (isPaid) {
      paidCount++;
      const pd = lastPay.get(inv.id);
      if (pd && inv.due_date) delays.push(Math.max(0, daysBetween(pd, inv.due_date)));
    } else {
      unpaidCount++;
      outstanding += Math.max(0, total - paid);
      if (inv.due_date && inv.due_date < today) {
        overdueCount++;
        const d = daysBetween(today, inv.due_date);
        if (d > worstDelayDays) worstDelayDays = d;
      }
    }
  }

  const avgDelayDays = delays.length
    ? Math.round(delays.reduce((s, d) => s + d, 0) / delays.length)
    : 0;

  // Simple 3-tier classification.
  let behaviour: PaymentBehaviour = "excellent";
  if (avgDelayDays > 45 || worstDelayDays > 45) {
    behaviour = "high_risk";
  } else if (avgDelayDays > 30) {
    behaviour = "average";
  } else {
    behaviour = "excellent";
  }

  return {
    behaviour,
    avgDelayDays,
    overdueCount,
    unpaidCount,
    paidCount,
    totalInvoices: paidCount + unpaidCount,
    outstanding,
    worstDelayDays,
  };
}

export function behaviourDescription(s: BehaviourStats): string {
  if (s.totalInvoices === 0) return "No invoice history yet.";
  switch (s.behaviour) {
    case "excellent":
      return s.avgDelayDays > 0
        ? `Average payment delay: ${s.avgDelayDays} days`
        : "Payments received on time.";
    case "average":
      return `Average payment delay: ${s.avgDelayDays} days`;
    case "high_risk":
      return s.worstDelayDays > 45
        ? `Worst delay: ${s.worstDelayDays} days · ${s.overdueCount} overdue`
        : `Average payment delay: ${s.avgDelayDays} days`;
  }
}

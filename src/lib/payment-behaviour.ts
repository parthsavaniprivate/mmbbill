// Client payment behaviour classification.
// Pure functions — no side effects, no data fetching.

export type PaymentBehaviour =
  | "excellent"
  | "average"
  | "late"
  | "high_risk"
  | "defaulter";

export const BEHAVIOUR_ORDER: PaymentBehaviour[] = [
  "excellent",
  "average",
  "late",
  "high_risk",
  "defaulter",
];

export const BEHAVIOUR_LABEL: Record<PaymentBehaviour, string> = {
  excellent: "Excellent Payer",
  average: "Average Payer",
  late: "Late Payer",
  high_risk: "High Risk",
  defaulter: "Defaulter",
};

export const BEHAVIOUR_SHORT: Record<PaymentBehaviour, string> = {
  excellent: "Excellent",
  average: "Average",
  late: "Late",
  high_risk: "High Risk",
  defaulter: "Defaulter",
};

// Tailwind-friendly hex + class tokens. Kept explicit for both dot + badge use.
export const BEHAVIOUR_DOT: Record<PaymentBehaviour, string> = {
  excellent: "#22c55e", // green-500
  average: "#eab308",   // yellow-500
  late: "#f97316",      // orange-500
  high_risk: "#ef4444", // red-500
  defaulter: "#1f2937", // gray-800
};

export const BEHAVIOUR_BADGE: Record<PaymentBehaviour, string> = {
  excellent: "bg-green-500/15 text-green-600 border-green-500/30",
  average: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  late: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  high_risk: "bg-red-500/15 text-red-600 border-red-500/30",
  defaulter: "bg-gray-800/15 text-gray-800 border-gray-800/40 dark:text-gray-200",
};

export const BEHAVIOUR_HINT: Record<PaymentBehaviour, string> = {
  excellent: "Pays invoices on time.",
  average: "Usually pays within 1–15 days after due date.",
  late: "Usually pays 16–30 days late.",
  high_risk: "Usually pays after 30 days or has multiple overdue invoices.",
  defaulter: "Long overdue or repeated unpaid invoices.",
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
  avgDelayDays: number;    // average payment delay across fully paid invoices
  overdueCount: number;    // currently overdue invoices
  unpaidCount: number;     // pending + partially_paid + overdue
  paidCount: number;
  totalInvoices: number;
  outstanding: number;
  worstDelayDays: number;  // for still-unpaid: today - due
}

const daysBetween = (a: string, b: string) => {
  const ms = new Date(a).getTime() - new Date(b).getTime();
  return Math.round(ms / 86_400_000);
};

/**
 * Auto-calculate a client's payment behaviour from historical invoices/payments.
 * Reuses whatever data the caller already has — no additional queries.
 */
export function computeBehaviour(
  invoices: InvoiceForBehaviour[],
  payments: PaymentForBehaviour[],
): BehaviourStats {
  const today = new Date().toISOString().slice(0, 10);

  // Latest payment date per invoice
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
      if (pd && inv.due_date) delays.push(daysBetween(pd, inv.due_date));
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

  // Classification. Consider both historic avg delay and current overdue posture.
  let behaviour: PaymentBehaviour = "excellent";

  const hasHistory = paidCount > 0 || unpaidCount > 0;
  if (!hasHistory) {
    behaviour = "excellent"; // no data => assume good until proven otherwise
  } else if (worstDelayDays > 60 || (overdueCount >= 2 && worstDelayDays > 30)) {
    behaviour = "defaulter";
  } else if (avgDelayDays > 30 || worstDelayDays > 30 || overdueCount >= 2) {
    behaviour = "high_risk";
  } else if (avgDelayDays > 15 || worstDelayDays > 15) {
    behaviour = "late";
  } else if (avgDelayDays > 0 || overdueCount > 0) {
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
      return "Pays invoices on time.";
    case "average":
      return s.avgDelayDays > 0
        ? `Average payment delay: ${s.avgDelayDays} days`
        : `${s.overdueCount} invoice(s) currently overdue.`;
    case "late":
      return `Average payment delay: ${s.avgDelayDays} days`;
    case "high_risk":
      return s.avgDelayDays > 0
        ? `Average payment delay: ${s.avgDelayDays} days · ${s.overdueCount} overdue`
        : `${s.overdueCount} overdue invoice(s), worst ${s.worstDelayDays}d late`;
    case "defaulter":
      return `${s.overdueCount} overdue · worst ${s.worstDelayDays} days late`;
  }
}

export type BillingType =
  | "monthly"
  | "bi_monthly"
  | "quarterly"
  | "half_yearly"
  | "yearly"
  | "custom";

export const BILLING_TYPE_OPTIONS: { value: BillingType; label: string; months: number }[] = [
  { value: "monthly", label: "Monthly", months: 1 },
  { value: "bi_monthly", label: "Every 2 Months", months: 2 },
  { value: "quarterly", label: "Every 3 Months", months: 3 },
  { value: "half_yearly", label: "Every 6 Months", months: 6 },
  { value: "yearly", label: "Yearly", months: 12 },
  { value: "custom", label: "Custom", months: 1 },
];

export function intervalMonths(type: BillingType, custom?: number | null): number {
  if (type === "custom") return Math.max(1, Number(custom || 1));
  return BILLING_TYPE_OPTIONS.find((o) => o.value === type)?.months ?? 1;
}

/** Advance `from` by N months, preserving day-of-month where possible. */
export function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

/**
 * Given a start date and billing cycle, return the next billing date on/after `today`.
 * Used at first save and to advance after an invoice is generated.
 */
export function computeNextBillingDate(
  startDate: string,
  type: BillingType,
  custom?: number | null,
  reference?: string, // if provided (e.g. last_generated), next = reference + interval
): string {
  const step = intervalMonths(type, custom);
  if (reference) return addMonths(reference, step);
  const today = new Date().toISOString().slice(0, 10);
  let next = startDate;
  // If start is future, use it directly
  if (next >= today) return next;
  // Otherwise walk forward until on/after today (bounded loop for safety)
  for (let i = 0; i < 240 && next < today; i++) next = addMonths(next, step);
  return next;
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.round((db - da) / 86400000);
}

export function priorityForOverdue(days: number): "high" | "medium" | "low" {
  if (days > 14) return "high";
  if (days > 3) return "medium";
  return "low";
}

export const todayISO = () => new Date().toISOString().slice(0, 10);

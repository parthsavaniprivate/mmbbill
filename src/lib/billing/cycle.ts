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

/** Subtract one day from an ISO date (YYYY-MM-DD). */
export function subDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Compute the billing period for a service given a period-start date and interval (months).
 * period_end = start + interval months - 1 day
 * next_invoice_date = start + interval months (i.e. the day after period_end)
 */
export function computeBillingPeriod(startISO: string, intervalMonths: number) {
  const months = Math.max(1, Number(intervalMonths || 1));
  const nextStart = addMonths(startISO, months);
  const end = subDays(nextStart, 1);
  return { start: startISO, end, nextInvoiceDate: nextStart, months };
}

/**
 * Backward-looking billing period: bill AFTER providing the service.
 * Given next_billing_date (the day the next invoice is due), the period being
 * billed is the interval that just ended:
 *   end   = next_billing_date - 1 day
 *   start = last_generated_date + 1 day (if set), else next_billing_date - interval months
 */
export function computePriorBillingPeriod(
  nextBillingDate: string,
  intervalMonths: number,
  lastGeneratedDate?: string | null,
) {
  const months = Math.max(1, Number(intervalMonths || 1));
  const end = subDays(nextBillingDate, 1);
  const start = lastGeneratedDate
    ? addDaysISO(lastGeneratedDate, 1)
    : addMonths(nextBillingDate, -months);
  return { start, end, nextInvoiceDate: nextBillingDate, months };
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}


/** Invoice amount = monthly rate × interval months. */
export function computeServiceAmount(monthlyRate: number, intervalMonths: number): number {
  return +(Number(monthlyRate || 0) * Math.max(1, Number(intervalMonths || 1))).toFixed(2);
}

/** Short human label like "01 Jul 2026 → 31 Oct 2026". */
export function formatPeriodShort(startISO: string, endISO: string): string {
  const f = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return `${f(startISO)} → ${f(endISO)}`;
}

import { inr, formatDate } from "@/lib/format";

export type ReminderTone = "friendly" | "follow_up" | "overdue";

export const REMINDER_LABEL: Record<ReminderTone, string> = {
  friendly: "Friendly Reminder",
  follow_up: "Payment Follow-up",
  overdue: "Overdue Reminder",
};

export function pickReminderTone(reminderNo: number, isOverdue: boolean): ReminderTone {
  if (isOverdue || reminderNo >= 3) return "overdue";
  if (reminderNo === 2) return "follow_up";
  return "friendly";
}

interface BuildArgs {
  clientName: string;
  invoiceNumber: string;
  pending: number;
  total: number;
  dueDate: string | null;
  companyName?: string | null;
  tone: ReminderTone;
}

export function buildReminderMessage(a: BuildArgs): string {
  const intro = {
    friendly: `Hello ${a.clientName},\n\nThis is a friendly reminder regarding Invoice *${a.invoiceNumber}*.`,
    follow_up: `Hello ${a.clientName},\n\nWe would like to follow up regarding Invoice *${a.invoiceNumber}*.`,
    overdue: `Hello ${a.clientName},\n\nInvoice *${a.invoiceNumber}* is now overdue.`,
  }[a.tone];
  const closing = {
    friendly: "Kindly process the payment when convenient.",
    follow_up: "Please arrange payment at your earliest convenience.",
    overdue: "Kindly process payment as soon as possible.",
  }[a.tone];
  const due = a.dueDate ? `\nDue Date: ${formatDate(a.dueDate)}` : "";
  return `${intro}\n\nOutstanding Amount: ${inr(a.pending)}\nInvoice Total: ${inr(a.total)}${due}\n\n${closing}\n\nThank you${a.companyName ? `,\n${a.companyName}` : "."}`;
}

export function waLink(phone: string | null | undefined, message: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function daysBetween(from: string | Date, to: Date = new Date()): number {
  const a = typeof from === "string" ? new Date(from) : from;
  return Math.max(0, Math.floor((to.getTime() - a.getTime()) / 86400000));
}

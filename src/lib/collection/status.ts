export type CollectionStatus =
  | "overdue"
  | "dueToday"
  | "dueSoon"
  | "scheduled"
  | "paid"
  | "unknown";

export const STATUS_COLOR: Record<CollectionStatus, string> = {
  overdue: "#ef4444",
  dueToday: "#f97316",
  dueSoon: "#eab308",
  scheduled: "#3b82f6",
  paid: "#16a34a",
  unknown: "#9ca3af",
};

export const STATUS_LABEL: Record<CollectionStatus, string> = {
  overdue: "Overdue",
  dueToday: "Due Today",
  dueSoon: "Due Soon",
  scheduled: "Scheduled Visit",
  paid: "Paid",
  unknown: "Unknown Location",
};

export interface InvoiceLite {
  id: string;
  client_id: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  total: number;
  amount_paid: number;
  status: string;
}

export interface ClientLite {
  id: string;
  latitude: number | null;
  longitude: number | null;
}

export interface Aggregate {
  latest?: InvoiceLite;
  total: number;
  paid: number;
  pending: number;
  overdue: number;
  count: number;
  invoices: InvoiceLite[];
  soonestDue?: string | null;
  daysOverdue: number;
}

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export function aggregateInvoices(invoices: InvoiceLite[]): Map<string, Aggregate> {
  const map = new Map<string, Aggregate>();
  const today = startOfDay();
  for (const inv of invoices) {
    if (!inv.client_id) continue;
    const e =
      map.get(inv.client_id) ??
      ({
        total: 0,
        paid: 0,
        pending: 0,
        overdue: 0,
        count: 0,
        invoices: [],
        daysOverdue: 0,
      } as Aggregate);
    e.invoices.push(inv);
    e.total += Number(inv.total) || 0;
    e.paid += Number(inv.amount_paid) || 0;
    const pend = Math.max(0, Number(inv.total) - Number(inv.amount_paid));
    e.pending += pend;
    const due = inv.due_date ? new Date(inv.due_date) : null;
    if (due && due < today && pend > 0) {
      e.overdue += pend;
      const d = Math.floor((today.getTime() - due.getTime()) / 86400000);
      if (d > e.daysOverdue) e.daysOverdue = d;
    }
    e.count += 1;
    const unpaid = pend > 0;
    const isNewer = !e.latest || new Date(inv.invoice_date) > new Date(e.latest.invoice_date);
    if (!e.latest || (unpaid && isNewer)) e.latest = inv;
    if (unpaid && inv.due_date) {
      if (!e.soonestDue || new Date(inv.due_date) < new Date(e.soonestDue)) {
        e.soonestDue = inv.due_date;
      }
    }
    map.set(inv.client_id, e);
  }
  return map;
}

export function deriveStatus(
  client: ClientLite,
  agg: Aggregate | undefined,
  scheduled: boolean,
): CollectionStatus {
  if (client.latitude == null || client.longitude == null) return "unknown";
  if (scheduled) return "scheduled";
  if (!agg || agg.pending <= 0) return "paid";
  if (agg.overdue > 0) return "overdue";
  const today = startOfDay();
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 7);
  const due = agg.soonestDue ? new Date(agg.soonestDue) : null;
  if (due) {
    const dueDay = startOfDay(due);
    if (dueDay.getTime() === today.getTime()) return "dueToday";
    if (dueDay > today && dueDay <= in7) return "dueSoon";
  }
  return "dueSoon";
}

// Scheduled visits — stored locally per day
const VISITS_KEY = () => `collection:scheduled:${new Date().toISOString().slice(0, 10)}`;

export function loadScheduled(): Set<string> {
  try {
    const raw = localStorage.getItem(VISITS_KEY());
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function saveScheduled(ids: Set<string>) {
  try {
    localStorage.setItem(VISITS_KEY(), JSON.stringify(Array.from(ids)));
  } catch {
    /* ignore */
  }
}

// Today's collection target
const TARGET_KEY = (companyId: string) => `collection:target:${companyId}:${new Date().toISOString().slice(0, 10)}`;

export function loadTarget(companyId: string): number | null {
  try {
    const v = localStorage.getItem(TARGET_KEY(companyId));
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

export function saveTarget(companyId: string, amount: number) {
  try {
    localStorage.setItem(TARGET_KEY(companyId), String(amount));
  } catch {
    /* ignore */
  }
}

// Distance helper (Haversine, km)
export function haversineKm(a: [number, number], b: [number, number]) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}

export const SURAT_HQ: [number, number] = [21.1983666, 72.7704329];

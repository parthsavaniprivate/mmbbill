import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import {
  aggregateInvoices,
  deriveStatus,
  haversineKm,
  loadScheduled,
  saveScheduled,
  SURAT_HQ,
  type CollectionStatus,
  type InvoiceLite,
} from "@/lib/collection/status";
import { geocodeAddress } from "@/lib/geocode.functions";

export interface ClientRow {
  id: string;
  client_name: string;
  business_name: string | null;
  contact_person: string | null;
  mobile: string | null;
  whatsapp: string | null;
  address: string | null;
  company_id: string;
  latitude: number | null;
  longitude: number | null;
  geocoded_at: string | null;
}

export interface EnrichedClient {
  client: ClientRow;
  agg: ReturnType<typeof aggregateInvoices> extends Map<string, infer V> ? V : never;
  status: CollectionStatus;
  distanceKm: number | null;
  city: string | null;
  scheduled: boolean;
}

export interface CollectionFilters {
  status: "all" | CollectionStatus;
  search: string;
  city: string;
  minAmount: number | null;
  maxAmount: number | null;
  dueFrom: string | null;
  dueTo: string | null;
}

export const DEFAULT_FILTERS: CollectionFilters = {
  status: "all",
  search: "",
  city: "",
  minAmount: null,
  maxAmount: null,
  dueFrom: null,
  dueTo: null,
};

function extractCity(addr: string | null): string | null {
  if (!addr) return null;
  const parts = addr.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  // Second-to-last is usually the city; heuristic
  return parts[parts.length - 2] || null;
}

async function geocodeAddr(address: string) {
  try {
    const q = /surat|gujarat|india/i.test(address) ? address : `${address}, Surat, Gujarat, India`;
    const res = await geocodeAddress({ data: { address: q } });
    if (res.lat != null && res.lng != null) return { lat: res.lat, lng: res.lng };
  } catch {
    /* ignore */
  }
  return null;
}

export function useCollectionData(filters: CollectionFilters) {
  const { selected, isAll } = useCompany();
  const [scheduled, setScheduled] = useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set() : loadScheduled(),
  );
  const [geocoding, setGeocoding] = useState(false);
  const geocodeStarted = useRef(false);

  const toggleScheduled = (id: string) => {
    setScheduled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveScheduled(next);
      return next;
    });
  };

  const { data: clients = [], refetch: refetchClients } = useQuery({
    queryKey: ["cc-clients", selected],
    queryFn: async () => {
      let q = supabase
        .from("clients")
        .select(
          "id,client_name,business_name,contact_person,mobile,whatsapp,address,company_id,latitude,longitude,geocoded_at",
        );
      if (!isAll) q = q.eq("company_id", selected);
      const { data, error } = await q;
      if (error) throw error;
      return data as ClientRow[];
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["cc-invoices", selected],
    queryFn: async () => {
      let q = supabase
        .from("invoices")
        .select(
          "id,client_id,company_id,invoice_number,invoice_date,due_date,total,amount_paid,status",
        )
        .neq("status", "cancelled")
        .order("invoice_date", { ascending: false });
      if (!isAll) q = q.eq("company_id", selected);
      const { data, error } = await q;
      if (error) throw error;
      return data as (InvoiceLite & { company_id: string })[];
    },
  });

  const { data: todayPayments = 0 } = useQuery({
    queryKey: ["cc-today-pay", selected],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      let q = supabase
        .from("payments")
        .select("amount, invoices!inner(company_id)")
        .eq("payment_date", today);
      if (!isAll) q = q.eq("invoices.company_id", selected);
      const { data, error } = await q;
      if (error) throw error;
      return (data as { amount: number }[]).reduce((s, p) => s + Number(p.amount || 0), 0);
    },
  });

  // Auto-geocode missing
  useEffect(() => {
    if (geocodeStarted.current) return;
    const pending = clients.filter(
      (c) => c.address && c.address.trim() && (c.latitude == null || c.longitude == null),
    );
    if (!pending.length) return;
    geocodeStarted.current = true;
    setGeocoding(true);
    (async () => {
      for (const c of pending) {
        const res = await geocodeAddr(c.address!);
        if (res) {
          await supabase
            .from("clients")
            .update({
              latitude: res.lat,
              longitude: res.lng,
              geocoded_at: new Date().toISOString(),
            })
            .eq("id", c.id);
        }
        await new Promise((r) => setTimeout(r, 150));
      }
      setGeocoding(false);
      refetchClients();
    })();
  }, [clients, refetchClients]);

  const byClient = useMemo(() => aggregateInvoices(invoices), [invoices]);

  const enriched: EnrichedClient[] = useMemo(() => {
    return clients.map((client) => {
      const agg = byClient.get(client.id) ?? {
        total: 0,
        paid: 0,
        pending: 0,
        overdue: 0,
        count: 0,
        invoices: [],
        daysOverdue: 0,
      };
      const distanceKm =
        client.latitude != null && client.longitude != null
          ? haversineKm(SURAT_HQ, [Number(client.latitude), Number(client.longitude)])
          : null;
      const status = deriveStatus(client, agg, scheduled.has(client.id));
      return { client, agg, status, distanceKm, city: extractCity(client.address), scheduled: scheduled.has(client.id) };
    });
  }, [clients, byClient, scheduled]);

  const filtered = useMemo(() => {
    const s = filters.search.trim().toLowerCase();
    const dueFrom = filters.dueFrom ? new Date(filters.dueFrom) : null;
    const dueTo = filters.dueTo ? new Date(filters.dueTo) : null;
    return enriched.filter((e) => {
      // Only show clients relevant to collections: keep pending + scheduled + unknown.
      // Paid can be shown only when explicitly filtered.
      if (filters.status === "all") {
        if (e.status === "paid") return false;
      } else if (filters.status !== e.status) return false;

      if (s) {
        const hay = `${e.client.client_name} ${e.client.business_name ?? ""} ${e.client.mobile ?? ""} ${e.client.whatsapp ?? ""} ${e.client.address ?? ""} ${e.agg.latest?.invoice_number ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (filters.city && !(e.client.address ?? "").toLowerCase().includes(filters.city.toLowerCase())) return false;
      if (filters.minAmount != null && e.agg.pending < filters.minAmount) return false;
      if (filters.maxAmount != null && e.agg.pending > filters.maxAmount) return false;
      if ((dueFrom || dueTo) && e.agg.soonestDue) {
        const d = new Date(e.agg.soonestDue);
        if (dueFrom && d < dueFrom) return false;
        if (dueTo && d > dueTo) return false;
      } else if (dueFrom || dueTo) {
        // no due date → drop when a date filter is active
        return false;
      }
      return true;
    });
  }, [enriched, filters]);

  const mapPoints = useMemo(
    () => filtered.filter((e) => e.client.latitude != null && e.client.longitude != null),
    [filtered],
  );
  const missingLocation = useMemo(
    () => filtered.filter((e) => e.client.latitude == null || e.client.longitude == null),
    [filtered],
  );

  const summary = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let pending = 0;
    let overdue = 0;
    let overdueClients = 0;
    let dueTodayAmount = 0;
    for (const e of enriched) {
      pending += e.agg.pending;
      overdue += e.agg.overdue;
      if (e.agg.overdue > 0) overdueClients++;
      if (e.agg.soonestDue) {
        const d = new Date(e.agg.soonestDue);
        d.setHours(0, 0, 0, 0);
        if (d.getTime() === today.getTime()) dueTodayAmount += e.agg.pending;
      }
    }
    return {
      pending,
      overdue,
      overdueClients,
      dueTodayAmount,
      scheduledCount: scheduled.size,
      collectedToday: Number(todayPayments) || 0,
    };
  }, [enriched, scheduled, todayPayments]);

  // Realtime: invalidate on payment insert (simple refetch)
  useEffect(() => {
    const channel = supabase
      .channel("cc-payments")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
        refetchClients();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchClients]);

  const cities = useMemo(() => {
    const s = new Set<string>();
    for (const e of enriched) if (e.city) s.add(e.city);
    return Array.from(s).sort();
  }, [enriched]);

  return {
    clients,
    invoices,
    enriched,
    filtered,
    mapPoints,
    missingLocation,
    summary,
    geocoding,
    scheduled,
    toggleScheduled,
    cities,
  };
}

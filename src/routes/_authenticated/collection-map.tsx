import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Circle, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

import { inr, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Phone, MessageCircle, Navigation, FileText, User, Route as RouteIcon, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/collection-map")({
  component: CollectionMapPage,
});

type ClientRow = {
  id: string; client_name: string; business_name: string | null;
  contact_person: string | null; mobile: string | null; whatsapp: string | null;
  address: string | null; company_id: string;
  latitude: number | null; longitude: number | null; geocoded_at: string | null;
};
type InvoiceRow = {
  id: string; client_id: string | null; company_id: string;
  invoice_number: string; invoice_date: string; due_date: string | null;
  total: number; amount_paid: number; status: string;
};

type Status = "paid" | "partial" | "pending" | "overdue" | "none";

const STATUS_COLORS: Record<Status, string> = {
  paid: "#16a34a", partial: "#eab308", pending: "#ef4444",
  overdue: "#7f1d1d", none: "#9ca3af",
};
const STATUS_LABEL: Record<Status, string> = {
  paid: "Fully Paid", partial: "Partial", pending: "Pending", overdue: "Overdue", none: "No Invoice",
};

function pinIcon(color: string, selected = false) {
  const size = selected ? 38 : 30;
  const html = `<div style="transform:translate(-50%,-100%);"><svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5"><path d="M12 2C7.6 2 4 5.6 4 10c0 5.5 7 11.5 7.3 11.7.4.4 1 .4 1.4 0C13 21.5 20 15.5 20 10c0-4.4-3.6-8-8-8z"/><circle cx="12" cy="10" r="3" fill="white"/></svg></div>`;
  return L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size/2, size] });
}

function computeStatus(agg: { pending: number; overdue: number; paid: number; total: number; count: number } | undefined): Status {
  if (!agg || agg.count === 0) return "none";
  if (agg.pending <= 0) return "paid";
  if (agg.overdue > 0) return "overdue";
  if (agg.paid > 0) return "partial";
  return "pending";
}

// Make Me Brand HQ (Pal, Surat) — map center
const SURAT: [number, number] = [21.1959, 72.7933];
const RADIUS_KM = 100;
// Nominatim viewbox ~1.2deg around center (~130km) to bias geocoding
const SURAT_VIEWBOX = `${SURAT[1] - 1.2},${SURAT[0] + 1.2},${SURAT[1] + 1.2},${SURAT[0] - 1.2}`;

function haversineKm(a: [number, number], b: [number, number]) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    // Fix Leaflet showing blank tiles when container size changes after init
    const t = setTimeout(() => map.invalidateSize(), 100);
    if (!points.length) {
      map.setView(SURAT, 11);
    } else {
      const b = L.latLngBounds([...points, SURAT]);
      map.fitBounds(b, { padding: [40, 40], maxZoom: 13 });
    }
    return () => clearTimeout(t);
  }, [points, map]);
  return null;
}


// Nominatim throttled geocoder (1 req/sec). Updates DB cache. Biased to Surat region.
async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const q = /surat|gujarat|india/i.test(address) ? address : `${address}, Surat, Gujarat, India`;
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&viewbox=${SURAT_VIEWBOX}&bounded=1&q=${encodeURIComponent(q)}`,
      { headers: { "Accept-Language": "en" } },
    );
    const j = await r.json();
    if (Array.isArray(j) && j[0]) {
      const lat = parseFloat(j[0].lat);
      const lng = parseFloat(j[0].lon);
      if (haversineKm([lat, lng], SURAT) <= RADIUS_KM + 30) return { lat, lng };
    }
  } catch {/* ignore */}
  return null;
}

function CollectionMapPage() {
  const { selected, isAll } = useCompany();
  const [filter, setFilter] = useState<"all" | "pending" | "overdue" | "partial" | "high" | "month">("all");
  const [search, setSearch] = useState("");
  
  const [routeMode, setRouteMode] = useState(false);
  const [routeSel, setRouteSel] = useState<string[]>([]);
  const [geocoding, setGeocoding] = useState(false);
  const geocodeStarted = useRef(false);

  const { data: clients = [], refetch: refetchClients } = useQuery({
    queryKey: ["cmap-clients", selected],
    queryFn: async () => {
      let q = supabase.from("clients").select("id,client_name,business_name,contact_person,mobile,whatsapp,address,company_id,latitude,longitude,geocoded_at");
      if (!isAll) q = q.eq("company_id", selected);
      const { data, error } = await q;
      if (error) throw error;
      return data as ClientRow[];
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["cmap-invoices", selected],
    queryFn: async () => {
      let q = supabase.from("invoices").select("id,client_id,company_id,invoice_number,invoice_date,due_date,total,amount_paid,status").neq("status","cancelled").order("invoice_date",{ascending:false});
      if (!isAll) q = q.eq("company_id", selected);
      const { data, error } = await q;
      if (error) throw error;
      return data as InvoiceRow[];
    },
  });

  // Latest open invoice per client + aggregates
  const byClient = useMemo(() => {
    const map = new Map<string, { latest?: InvoiceRow; total: number; paid: number; pending: number; overdue: number; count: number; invoices: InvoiceRow[] }>();
    for (const inv of invoices) {
      if (!inv.client_id) continue;
      const e = map.get(inv.client_id) ?? { total: 0, paid: 0, pending: 0, overdue: 0, count: 0, invoices: [] };
      e.invoices.push(inv);
      e.total += Number(inv.total) || 0;
      e.paid += Number(inv.amount_paid) || 0;
      const pendAmt = Math.max(0, Number(inv.total) - Number(inv.amount_paid));
      e.pending += pendAmt;
      const due = inv.due_date ? new Date(inv.due_date) : null;
      const today = new Date(); today.setHours(0,0,0,0);
      if (due && due < today && pendAmt > 0) e.overdue += pendAmt;
      e.count += 1;
      // Latest unpaid invoice preferred; fallback to most recent
      const isUnpaid = pendAmt > 0;
      const isNewer = !e.latest || new Date(inv.invoice_date) > new Date(e.latest.invoice_date);
      if (!e.latest || (isUnpaid && isNewer)) e.latest = inv;
      map.set(inv.client_id, e);
    }
    return map;
  }, [invoices]);

  // Auto-geocode missing clients (sequential, throttled)
  useEffect(() => {
    if (geocodeStarted.current) return;
    const pending = clients.filter(c => c.address && c.address.trim() && (c.latitude == null || c.longitude == null));
    if (!pending.length) return;
    geocodeStarted.current = true;
    setGeocoding(true);
    (async () => {
      for (const c of pending) {
        const res = await geocode(c.address!);
        if (res) {
          await supabase.from("clients").update({ latitude: res.lat, longitude: res.lng, geocoded_at: new Date().toISOString() }).eq("id", c.id);
        }
        await new Promise(r => setTimeout(r, 1100));
      }
      setGeocoding(false);
      refetchClients();
    })();
  }, [clients, refetchClients]);

  const enriched = useMemo(() => clients.map(c => {
    const agg = byClient.get(c.id);
    const status = computeStatus(agg);
    return { client: c, agg, status, latest: agg?.latest };
  }), [clients, byClient]);

  const pendingOnly = useMemo(
    () => enriched.filter(e => e.status === "pending" || e.status === "partial" || e.status === "overdue"),
    [enriched],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const monthEnd = new Date(monthStart); monthEnd.setMonth(monthEnd.getMonth()+1);
    return pendingOnly.filter(({ client, agg, status, latest }) => {
      if (s) {
        const hay = `${client.client_name} ${client.business_name ?? ""} ${client.mobile ?? ""} ${latest?.invoice_number ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (filter === "overdue") return status === "overdue";
      if (filter === "partial") return status === "partial";
      if (filter === "pending") return status === "pending";
      if (filter === "high") return (agg?.pending ?? 0) > 50000;
      if (filter === "month") {
        if (!latest?.due_date) return false;
        const d = new Date(latest.due_date);
        return d >= monthStart && d < monthEnd;
      }
      return true;
    });
  }, [pendingOnly, search, filter]);


  const mapPoints = useMemo(
    () => filtered.filter(e =>
      e.client.latitude != null && e.client.longitude != null &&
      haversineKm([Number(e.client.latitude), Number(e.client.longitude)], SURAT) <= RADIUS_KM
    ),
    [filtered],
  );
  const points: [number, number][] = mapPoints.map(e => [Number(e.client.latitude), Number(e.client.longitude)]);

  // Summary
  const summary = useMemo(() => {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    let pending = 0, overdue = 0, collectedMonth = 0, clientsPending = 0, clientsOverdue = 0;
    for (const e of enriched) {
      const a = e.agg; if (!a) continue;
      pending += a.pending; overdue += a.overdue;
      if (a.pending > 0) clientsPending++;
      if (a.overdue > 0) clientsOverdue++;
    }
    // Collected this month requires payments table
    return { pending, overdue, collectedMonth, clientsPending, clientsOverdue };
  }, [enriched]);

  const { data: monthPayments = 0 } = useQuery({
    queryKey: ["cmap-month-pay", selected],
    queryFn: async () => {
      const start = new Date(); start.setDate(1); start.setHours(0,0,0,0);
      let q = supabase.from("payments").select("amount, invoices!inner(company_id)").gte("payment_date", start.toISOString().slice(0,10));
      if (!isAll) q = q.eq("invoices.company_id", selected);
      const { data, error } = await q;
      if (error) throw error;
      return (data as { amount: number }[]).reduce((s, p) => s + Number(p.amount || 0), 0);
    },
  });


  const toggleRoute = (id: string) => {
    setRouteSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  const launchRoute = () => {
    const pts = enriched.filter(e => routeSel.includes(e.client.id) && e.client.latitude != null && e.client.longitude != null);
    if (!pts.length) { toast.error("Select clients with locations"); return; }
    const origin = "My+Location";
    const dest = `${pts[pts.length-1].client.latitude},${pts[pts.length-1].client.longitude}`;
    const waypoints = pts.slice(0, -1).map(p => `${p.client.latitude},${p.client.longitude}`).join("|");
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}&travelmode=driving`;
    window.open(url, "_blank");
  };

  const navTo = (lat: number, lng: number) => window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, "_blank");
  const callClient = (m?: string | null) => m && (window.location.href = `tel:${m}`);
  const waClient = (m?: string | null) => m && window.open(`https://wa.me/${m.replace(/\D/g,"")}`, "_blank");

  return (
    <div className="space-y-4">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold">Collection Map</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Pending collections only. {geocoding && <span className="text-amber-600">Geocoding…</span>}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant={routeMode ? "default" : "outline"} size="sm" onClick={() => { setRouteMode(v => !v); setRouteSel([]); }}>
            <RouteIcon className="w-4 h-4" /> {routeMode ? `Route (${routeSel.length})` : "Collection Route"}
          </Button>
          {routeMode && <Button size="sm" onClick={launchRoute}>Open in Maps</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        <SummaryCard label="Pending" value={inr(summary.pending)} color="text-red-600" />
        <SummaryCard label="Overdue" value={inr(summary.overdue)} color="text-red-900" />
        <SummaryCard label="Collected this month" value={inr(monthPayments)} color="text-green-600" />
        <SummaryCard label="Clients pending" value={String(summary.clientsPending)} />
        <SummaryCard label="Clients overdue" value={String(summary.clientsOverdue)} />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {([
            ["all","All"],["pending","Pending"],["overdue","Overdue"],
            ["partial","Partial"],["high","> ₹50k"],["month","Due This Month"],
          ] as const).map(([k,l]) => (
            <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>{l}</Button>
          ))}
        </div>
        <div className="relative sm:ml-auto w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search site, client, phone, invoice…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs flex-wrap">
        {(["pending","partial","overdue"] as Status[]).map(s => (
          <span key={s} className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full" style={{ background: STATUS_COLORS[s] }} />{STATUS_LABEL[s]}</span>
        ))}
      </div>


      <Card className="overflow-hidden">
        <div className="h-[60vh] sm:h-[600px] w-full">
          <MapContainer
            center={SURAT}
            zoom={11}
            minZoom={7}
            maxZoom={18}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom
          >

            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
            />
            <Circle center={SURAT} radius={RADIUS_KM * 1000} pathOptions={{ color: "#3b82f6", weight: 2, fillColor: "#3b82f6", fillOpacity: 0.05, dashArray: "6 6" }} />
            <Marker position={SURAT} icon={pinIcon("#1d4ed8", true)} />
            <FitBounds points={points} />
            {mapPoints.map(e => {
              const selected = routeMode && routeSel.includes(e.client.id);
              const pendingAmt = e.agg?.pending ?? 0;
              const daysOverdue = e.latest?.due_date ? Math.max(0, Math.floor((Date.now() - new Date(e.latest.due_date).getTime())/86400000)) : 0;
              return (
                <Marker
                  key={e.client.id}
                  position={[Number(e.client.latitude), Number(e.client.longitude)]}
                  icon={pinIcon(STATUS_COLORS[e.status], selected)}
                  eventHandlers={{
                    click: () => {
                      if (routeMode) toggleRoute(e.client.id);
                    },
                  }}
                >
                  {!routeMode && (
                    <Popup minWidth={260} maxWidth={300}>
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-semibold text-sm leading-tight">{e.client.business_name || e.client.client_name}</div>
                          <Badge style={{ background: STATUS_COLORS[e.status], color: "white" }}>{STATUS_LABEL[e.status]}</Badge>
                        </div>
                        {e.client.business_name && <div className="text-xs text-muted-foreground">{e.client.client_name}</div>}
                        {e.client.contact_person && <div className="text-xs">{e.client.contact_person}</div>}
                        {e.client.mobile && <div className="text-xs">{e.client.mobile}</div>}
                        {e.client.address && <div className="text-xs text-muted-foreground">{e.client.address}</div>}
                        <div className="grid grid-cols-3 gap-1 pt-1">
                          <Stat label="Total" value={inr(e.agg?.total ?? 0)} />
                          <Stat label="Paid" value={inr(e.agg?.paid ?? 0)} color="text-green-600" />
                          <Stat label="Pending" value={inr(pendingAmt)} color="text-red-600" />
                        </div>
                        {e.latest && (
                          <div className="text-xs flex justify-between border-t pt-1">
                            <span>{e.latest.invoice_number}</span>
                            <span className="text-muted-foreground">Due {formatDate(e.latest.due_date)} {daysOverdue > 0 && `· ${daysOverdue}d`}</span>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-1 pt-1">
                          <Button variant="outline" size="sm" onClick={() => callClient(e.client.mobile)}><Phone className="w-3 h-3" /> Call</Button>
                          <Button variant="outline" size="sm" onClick={() => waClient(e.client.whatsapp || e.client.mobile)}><MessageCircle className="w-3 h-3" /> WhatsApp</Button>
                          <Button variant="outline" size="sm" asChild><Link to="/clients/$id" params={{ id: e.client.id }}><User className="w-3 h-3" /> Profile</Link></Button>
                          {e.latest && <Button variant="outline" size="sm" asChild><Link to="/invoices/$id" params={{ id: e.latest.id }}><FileText className="w-3 h-3" /> Invoice</Link></Button>}
                          <Button variant="outline" size="sm" className="col-span-2" onClick={() => navTo(Number(e.client.latitude), Number(e.client.longitude))}>
                            <Navigation className="w-3 h-3" /> Navigate
                          </Button>
                        </div>
                      </div>
                    </Popup>
                  )}
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      </Card>

      {mapPoints.length === 0 && (
        <p className="text-sm text-muted-foreground text-center">No mapped clients yet. Add addresses on client profiles — the map will geocode them automatically.</p>
      )}

    </div>
  );
}

function SummaryCard({ label, value, color = "" }: { label: string; value: string; color?: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${color}`}>{value}</div>
    </CardContent></Card>
  );
}
function Stat({ label, value, color = "" }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border p-2">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-semibold ${color}`}>{value}</div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { inr, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Phone, MessageCircle, Navigation, FileText, User, MapPin, Route as RouteIcon, Search } from "lucide-react";

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

function computeStatus(inv: InvoiceRow | undefined): Status {
  if (!inv) return "none";
  const due = inv.due_date ? new Date(inv.due_date) : null;
  const today = new Date(); today.setHours(0,0,0,0);
  if (inv.amount_paid >= inv.total && inv.total > 0) return "paid";
  if (due && due < today && inv.amount_paid < inv.total) return "overdue";
  if (inv.amount_paid > 0 && inv.amount_paid < inv.total) return "partial";
  return "pending";
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const b = L.latLngBounds(points);
    map.fitBounds(b, { padding: [40, 40], maxZoom: 13 });
  }, [points, map]);
  return null;
}

// Nominatim throttled geocoder (1 req/sec). Updates DB cache.
async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`, {
      headers: { "Accept-Language": "en" },
    });
    const j = await r.json();
    if (Array.isArray(j) && j[0]) return { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) };
  } catch {/* ignore */}
  return null;
}

function CollectionMapPage() {
  const { selected, isAll } = useCompany();
  const [filter, setFilter] = useState<"all" | "pending" | "overdue" | "partial" | "paid" | "high" | "month">("all");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
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
      // Latest "open" invoice = most recent unpaid; fallback most recent
      const openUnpaid = !e.latest || (pendAmt > 0 && (!e.latest || new Date(inv.invoice_date) > new Date(e.latest.invoice_date)));
      if (!e.latest || openUnpaid) e.latest = inv;
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
    const status = computeStatus(agg?.latest);
    return { client: c, agg, status, latest: agg?.latest };
  }), [clients, byClient]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const monthEnd = new Date(monthStart); monthEnd.setMonth(monthEnd.getMonth()+1);
    return enriched.filter(({ client, agg, status, latest }) => {
      if (s) {
        const hay = `${client.client_name} ${client.business_name ?? ""} ${client.mobile ?? ""} ${latest?.invoice_number ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (filter === "pending") return status === "pending" || status === "partial" || status === "overdue";
      if (filter === "overdue") return status === "overdue";
      if (filter === "partial") return status === "partial";
      if (filter === "paid") return status === "paid";
      if (filter === "high") return (agg?.pending ?? 0) > 50000;
      if (filter === "month") {
        if (!latest?.due_date) return false;
        const d = new Date(latest.due_date);
        return d >= monthStart && d < monthEnd;
      }
      return true;
    });
  }, [enriched, search, filter]);

  const mapPoints = useMemo(() => filtered.filter(e => e.client.latitude != null && e.client.longitude != null), [filtered]);
  const points: [number, number][] = mapPoints.map(e => [Number(e.client.latitude), Number(e.client.longitude)]);
  const fallback: [number, number] = [22.3511, 78.6677]; // India

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

  const active = enriched.find(e => e.client.id === activeId) ?? null;

  // Payment history for active
  const { data: activePayments = [] } = useQuery({
    queryKey: ["cmap-active-pay", activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const invIds = active?.agg?.invoices.map(i => i.id) ?? [];
      if (!invIds.length) return [];
      const { data, error } = await supabase.from("payments").select("id,invoice_id,amount,payment_date,method").in("invoice_id", invIds).order("payment_date",{ascending:false});
      if (error) throw error;
      return data;
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Collection Map</h1>
          <p className="text-sm text-muted-foreground">Track pending collections on the map. {geocoding && <span className="text-amber-600">Geocoding addresses…</span>}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={routeMode ? "default" : "outline"} size="sm" onClick={() => { setRouteMode(v => !v); setRouteSel([]); }}>
            <RouteIcon className="w-4 h-4" /> {routeMode ? `Route (${routeSel.length})` : "Collection Route"}
          </Button>
          {routeMode && <Button size="sm" onClick={launchRoute}>Open in Maps</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard label="Pending" value={inr(summary.pending)} color="text-red-600" />
        <SummaryCard label="Overdue" value={inr(summary.overdue)} color="text-red-900" />
        <SummaryCard label="Collected this month" value={inr(monthPayments)} color="text-green-600" />
        <SummaryCard label="Clients pending" value={String(summary.clientsPending)} />
        <SummaryCard label="Clients overdue" value={String(summary.clientsOverdue)} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {([
          ["all","All"],["pending","Pending"],["overdue","Overdue"],
          ["partial","Partial"],["paid","Paid"],["high","High Value > ₹50k"],["month","Due This Month"],
        ] as const).map(([k,l]) => (
          <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>{l}</Button>
        ))}
        <div className="relative ml-auto w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search site, client, phone, invoice…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs flex-wrap">
        {(Object.keys(STATUS_COLORS) as Status[]).map(s => (
          <span key={s} className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full" style={{ background: STATUS_COLORS[s] }} />{STATUS_LABEL[s]}</span>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="h-[600px] w-full">
          <MapContainer center={points[0] ?? fallback} zoom={5} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
            <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <FitBounds points={points} />
            {mapPoints.map(e => {
              const selected = routeMode && routeSel.includes(e.client.id);
              return (
                <Marker
                  key={e.client.id}
                  position={[Number(e.client.latitude), Number(e.client.longitude)]}
                  icon={pinIcon(STATUS_COLORS[e.status], selected || activeId === e.client.id)}
                  eventHandlers={{
                    click: () => {
                      if (routeMode) toggleRoute(e.client.id);
                      else setActiveId(e.client.id);
                    },
                  }}
                />
              );
            })}
          </MapContainer>
        </div>
      </Card>

      {mapPoints.length === 0 && (
        <p className="text-sm text-muted-foreground text-center">No mapped clients yet. Add addresses on client profiles — the map will geocode them automatically.</p>
      )}

      <Sheet open={!!activeId} onOpenChange={(o) => !o && setActiveId(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {active && (
            <>
              <SheetHeader>
                <SheetTitle>{active.client.business_name || active.client.client_name}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Badge style={{ background: STATUS_COLORS[active.status], color: "white" }}>{STATUS_LABEL[active.status]}</Badge>
                  {active.latest && <span className="text-sm text-muted-foreground">{active.latest.invoice_number}</span>}
                </div>

                <div className="space-y-1 text-sm">
                  <Row icon={<User className="w-4 h-4" />} label="Client" value={active.client.client_name} />
                  <Row icon={<User className="w-4 h-4" />} label="Contact" value={active.client.contact_person ?? "—"} />
                  <Row icon={<Phone className="w-4 h-4" />} label="Mobile" value={active.client.mobile ?? "—"} />
                  <Row icon={<MapPin className="w-4 h-4" />} label="Address" value={active.client.address ?? "—"} />
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="Total" value={inr(active.agg?.total ?? 0)} />
                  <Stat label="Collected" value={inr(active.agg?.paid ?? 0)} color="text-green-600" />
                  <Stat label="Pending" value={inr(active.agg?.pending ?? 0)} color="text-red-600" />
                </div>

                {active.latest && (
                  <div className="text-sm space-y-1 rounded-lg border p-3">
                    <div className="flex justify-between"><span className="text-muted-foreground">Due</span><span>{formatDate(active.latest.due_date)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Days overdue</span><span>{active.latest.due_date ? Math.max(0, Math.floor((Date.now() - new Date(active.latest.due_date).getTime())/86400000)) : 0}</span></div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={() => callClient(active.client.mobile)}><Phone className="w-4 h-4" /> Call</Button>
                  <Button variant="outline" size="sm" onClick={() => waClient(active.client.whatsapp || active.client.mobile)}><MessageCircle className="w-4 h-4" /> WhatsApp</Button>
                  <Button variant="outline" size="sm" asChild><Link to="/clients/$id" params={{ id: active.client.id }}><User className="w-4 h-4" /> Profile</Link></Button>
                  {active.latest && <Button variant="outline" size="sm" asChild><Link to="/invoices/$id" params={{ id: active.latest.id }}><FileText className="w-4 h-4" /> Invoice</Link></Button>}
                  {active.client.latitude != null && active.client.longitude != null && (
                    <Button variant="outline" size="sm" className="col-span-2" onClick={() => navTo(Number(active.client.latitude), Number(active.client.longitude))}>
                      <Navigation className="w-4 h-4" /> Navigate (Google Maps)
                    </Button>
                  )}
                </div>

                <div>
                  <div className="text-sm font-medium mb-2">Invoice History</div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {active.agg?.invoices.map(i => (
                      <Link key={i.id} to="/invoices/$id" params={{ id: i.id }} className="flex justify-between text-sm p-2 rounded hover:bg-muted">
                        <span>{i.invoice_number}</span>
                        <span className="text-muted-foreground">{inr(i.total)}</span>
                      </Link>
                    )) ?? <div className="text-sm text-muted-foreground">No invoices</div>}
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium mb-2">Payment History</div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {activePayments.length ? activePayments.map(p => (
                      <div key={p.id} className="flex justify-between text-sm p-2 rounded bg-muted/40">
                        <span>{formatDate(p.payment_date)} · {p.method}</span>
                        <span className="text-green-600">{inr(p.amount)}</span>
                      </div>
                    )) : <div className="text-sm text-muted-foreground">No payments</div>}
                  </div>
                </div>

                {routeMode && (
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Checkbox checked={routeSel.includes(active.client.id)} onCheckedChange={() => toggleRoute(active.client.id)} />
                    <span className="text-sm">Include in collection route</span>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
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
function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div className="flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div>{value}</div>
      </div>
    </div>
  );
}

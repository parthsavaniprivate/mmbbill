import { useEffect, useRef } from "react";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import { STATUS_COLOR, SURAT_HQ, type CollectionStatus } from "@/lib/collection/status";
import type { EnrichedClient } from "@/hooks/use-collection-data";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Props {
  points: EnrichedClient[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function pinSvg(color: string, selected: boolean) {
  const size = selected ? 44 : 32;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"><path fill="${color}" stroke="white" stroke-width="1.5" d="M12 2C7.6 2 4 5.6 4 10c0 5.5 7 11.5 7.3 11.7.4.4 1 .4 1.4 0C13 21.5 20 15.5 20 10c0-4.4-3.6-8-8-8z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new window.google.maps.Size(size, size),
    anchor: new window.google.maps.Point(size / 2, size),
  };
}

export function CollectionMap({ points, selectedId, onSelect }: Props) {
  const { ready, error } = useGoogleMaps();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const infoRef = useRef<any>(null);

  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;
    const g = window.google.maps;
    mapRef.current = new g.Map(containerRef.current, {
      center: { lat: SURAT_HQ[0], lng: SURAT_HQ[1] },
      zoom: 11,
      minZoom: 6,
      maxZoom: 18,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: "greedy",
    });
    infoRef.current = new g.InfoWindow();
    // HQ marker
    new g.Marker({
      map: mapRef.current,
      position: { lat: SURAT_HQ[0], lng: SURAT_HQ[1] },
      icon: pinSvg("#1d4ed8", true),
      title: "Make Me Brand HQ",
      zIndex: 999,
    });
    new g.Circle({
      map: mapRef.current,
      center: { lat: SURAT_HQ[0], lng: SURAT_HQ[1] },
      radius: 100 * 1000,
      strokeColor: "#3b82f6",
      strokeOpacity: 0.35,
      strokeWeight: 1,
      fillColor: "#3b82f6",
      fillOpacity: 0.04,
    });
  }, [ready]);

  // Sync markers
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = window.google.maps;
    const existing = markersRef.current;
    const seen = new Set<string>();
    const bounds = new g.LatLngBounds();
    bounds.extend({ lat: SURAT_HQ[0], lng: SURAT_HQ[1] });

    for (const e of points) {
      if (e.client.latitude == null || e.client.longitude == null) continue;
      seen.add(e.client.id);
      const pos = { lat: Number(e.client.latitude), lng: Number(e.client.longitude) };
      bounds.extend(pos);
      const isSelected = selectedId === e.client.id;
      let m = existing.get(e.client.id);
      if (!m) {
        m = new g.Marker({ map: mapRef.current, position: pos });
        m.addListener("click", () => onSelect(e.client.id));
        existing.set(e.client.id, m);
      } else {
        m.setPosition(pos);
      }
      m.setIcon(pinSvg(STATUS_COLOR[e.status as CollectionStatus] ?? STATUS_COLOR.unknown, isSelected));
      m.setZIndex(isSelected ? 500 : 1);
      m.setTitle(e.client.business_name || e.client.client_name);
    }
    // Remove stale
    for (const [id, m] of existing) {
      if (!seen.has(id)) {
        m.setMap(null);
        existing.delete(id);
      }
    }
    if (points.length > 0 && !selectedId) {
      mapRef.current.fitBounds(bounds, 60);
    }
  }, [points, selectedId, onSelect, ready]);

  // Focus selected
  useEffect(() => {
    if (!ready || !mapRef.current || !selectedId) return;
    const m = markersRef.current.get(selectedId);
    if (m) {
      mapRef.current.panTo(m.getPosition());
      if (mapRef.current.getZoom() < 13) mapRef.current.setZoom(14);
    }
  }, [selectedId, ready]);

  return (
    <Card className="overflow-hidden relative h-full">
      <div ref={containerRef} className="w-full h-full" />
      {!ready && !error && (
        <div className="absolute inset-0 grid place-items-center bg-background/60">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center p-4">
          <div className="text-sm text-destructive text-center">
            Failed to load Google Maps. Check that the Google Maps connector is linked.
          </div>
        </div>
      )}
      <Legend />
    </Card>
  );
}

function Legend() {
  return (
    <div className="absolute bottom-3 left-3 bg-background/95 backdrop-blur border rounded-lg px-3 py-2 shadow-sm text-[11px] flex flex-wrap items-center gap-x-3 gap-y-1 max-w-[calc(100%-24px)]">
      {(
        [
          ["overdue", "Overdue"],
          ["dueToday", "Due today"],
          ["dueSoon", "Due soon"],
          ["scheduled", "Scheduled"],
          ["paid", "Paid"],
          ["unknown", "Unknown"],
        ] as [CollectionStatus, string][]
      ).map(([k, l]) => (
        <span key={k} className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLOR[k] }} />
          {l}
        </span>
      ))}
    </div>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/collection/status";
import type { EnrichedClient } from "@/hooks/use-collection-data";
import { inr, formatDate } from "@/lib/format";
import { Phone, MessageCircle, Navigation, MapPinOff } from "lucide-react";
import { useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  items: EnrichedClient[];
  missing: EnrichedClient[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

type Sort = "distance" | "pending" | "due" | "overdue";

export function CollectionList({ items, missing, selectedId, onSelect }: Props) {
  const [sort, setSort] = useState<Sort>("pending");
  const sorted = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      switch (sort) {
        case "distance":
          return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
        case "pending":
          return b.agg.pending - a.agg.pending;
        case "due":
          return (
            (a.agg.soonestDue ? new Date(a.agg.soonestDue).getTime() : Infinity) -
            (b.agg.soonestDue ? new Date(b.agg.soonestDue).getTime() : Infinity)
          );
        case "overdue":
          return b.agg.daysOverdue - a.agg.daysOverdue;
      }
    });
    return arr;
  }, [items, sort]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="text-sm font-semibold">{items.length} clients</div>
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending amount</SelectItem>
            <SelectItem value="due">Soonest due</SelectItem>
            <SelectItem value="overdue">Overdue days</SelectItem>
            <SelectItem value="distance">Distance</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1 min-h-0 overflow-auto divide-y">
        {sorted.map((e) => (
          <Row key={e.client.id} e={e} selected={selectedId === e.client.id} onSelect={onSelect} />
        ))}
        {sorted.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">No clients match your filters.</div>
        )}
        {missing.length > 0 && (
          <details className="p-3">
            <summary className="cursor-pointer text-xs text-muted-foreground flex items-center gap-1">
              <MapPinOff className="w-3 h-3" /> {missing.length} clients missing location
            </summary>
            <div className="mt-2 space-y-1">
              {missing.map((e) => (
                <div key={e.client.id} className="text-xs px-2 py-1 rounded hover:bg-muted cursor-pointer" onClick={() => onSelect(e.client.id)}>
                  {e.client.business_name || e.client.client_name} · <span className="text-red-600">{inr(e.agg.pending)}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function Row({ e, selected, onSelect }: { e: EnrichedClient; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <div
      className={`px-3 py-2.5 cursor-pointer transition-colors ${selected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/50 border-l-2 border-l-transparent"}`}
      onClick={() => onSelect(e.client.id)}
    >
      <div className="flex items-start gap-2">
        <span
          className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
          style={{ background: STATUS_COLOR[e.status] }}
          aria-label={STATUS_LABEL[e.status]}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="font-medium text-sm truncate">
              {e.client.business_name || e.client.client_name}
            </div>
            <div className="text-sm font-semibold text-red-600 shrink-0">{inr(e.agg.pending)}</div>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <div className="text-[11px] text-muted-foreground truncate">
              {e.agg.latest?.invoice_number ?? "—"}
              {e.agg.soonestDue && <> · Due {formatDate(e.agg.soonestDue)}</>}
              {e.agg.daysOverdue > 0 && <span className="text-red-600"> · {e.agg.daysOverdue}d late</span>}
            </div>
            {e.distanceKm != null && (
              <div className="text-[11px] text-muted-foreground shrink-0">{e.distanceKm.toFixed(1)} km</div>
            )}
          </div>
          <div className="flex items-center gap-1 mt-1.5">
            {e.client.mobile && (
              <IconLink href={`tel:${e.client.mobile}`} label="Call"><Phone className="w-3 h-3" /></IconLink>
            )}
            {(e.client.whatsapp || e.client.mobile) && (
              <IconLink href={`https://wa.me/${(e.client.whatsapp || e.client.mobile!).replace(/\D/g, "")}`} label="WhatsApp" target="_blank">
                <MessageCircle className="w-3 h-3" />
              </IconLink>
            )}
            {e.client.latitude != null && e.client.longitude != null && (
              <IconLink
                href={`https://www.google.com/maps/dir/?api=1&destination=${e.client.latitude},${e.client.longitude}&travelmode=driving`}
                label="Navigate"
                target="_blank"
              >
                <Navigation className="w-3 h-3" />
              </IconLink>
            )}
            {e.scheduled && <Badge className="ml-auto text-[10px]" variant="secondary">Scheduled</Badge>}
          </div>
        </div>
      </div>
    </div>
  );
}

function IconLink({ href, label, target, children }: { href: string; label: string; target?: string; children: React.ReactNode }) {
  return (
    <Button asChild size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => e.stopPropagation()} aria-label={label}>
      <a href={href} target={target} rel={target ? "noopener noreferrer" : undefined}>
        {children}
      </a>
    </Button>
  );
}

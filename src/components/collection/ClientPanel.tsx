import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Link } from "@tanstack/react-router";
import { inr, formatDate } from "@/lib/format";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/collection/status";
import type { EnrichedClient } from "@/hooks/use-collection-data";
import { Phone, MessageCircle, Navigation, FileText, User, MapPin } from "lucide-react";
import { MarkCollectedButton } from "./MarkCollectedDialog";

interface Props {
  item: EnrichedClient | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scheduled: boolean;
  onToggleScheduled: (id: string) => void;
}

export function ClientPanel({ item, open, onOpenChange, scheduled, onToggleScheduled }: Props) {
  if (!item) return null;
  const { client, agg, status, distanceKm } = item;
  const phone = client.mobile;
  const wa = client.whatsapp || client.mobile;
  const nav =
    client.latitude != null && client.longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${client.latitude},${client.longitude}&travelmode=driving`
      : null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-4 border-b space-y-2">
          <div className="flex items-start justify-between gap-2">
            <SheetTitle className="text-lg leading-tight text-left">
              {client.business_name || client.client_name}
            </SheetTitle>
            <Badge style={{ background: STATUS_COLOR[status], color: "white" }}>{STATUS_LABEL[status]}</Badge>
          </div>
          {client.business_name && (
            <div className="text-xs text-muted-foreground text-left">{client.client_name}</div>
          )}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Switch checked={scheduled} onCheckedChange={() => onToggleScheduled(client.id)} />
              Mark for today's route
            </label>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Site / address */}
          <section>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Site</div>
            {client.address ? (
              <div className="text-sm flex gap-2">
                <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
                <div className="min-w-0">
                  <div>{client.address}</div>
                  {distanceKm != null && (
                    <div className="text-xs text-muted-foreground mt-0.5">{distanceKm.toFixed(1)} km from HQ</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-xs text-amber-600">No address on file. Add one on the client profile to map it.</div>
            )}
          </section>

          {/* Pending summary */}
          <section className="grid grid-cols-3 gap-2">
            <Stat label="Total" value={inr(agg.total)} />
            <Stat label="Paid" value={inr(agg.paid)} color="text-emerald-600" />
            <Stat label="Pending" value={inr(agg.pending)} color="text-red-600" />
          </section>
          {agg.overdue > 0 && (
            <div className="text-xs rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">
              Overdue: <b>{inr(agg.overdue)}</b> · {agg.daysOverdue}d late
            </div>
          )}

          {/* Latest invoice */}
          {agg.latest && (
            <section className="rounded-lg border p-3 space-y-1">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Latest open invoice</div>
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm">{agg.latest.invoice_number}</div>
                <div className="text-sm font-semibold text-red-600">
                  {inr(Math.max(0, agg.latest.total - agg.latest.amount_paid))}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Invoice {formatDate(agg.latest.invoice_date)}
                {agg.latest.due_date && <> · Due {formatDate(agg.latest.due_date)}</>}
              </div>
            </section>
          )}

          {/* Contact */}
          {(client.contact_person || phone) && (
            <section>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Contact</div>
              {client.contact_person && <div className="text-sm">{client.contact_person}</div>}
              {phone && <div className="text-sm text-muted-foreground">{phone}</div>}
            </section>
          )}
        </div>

        {/* Sticky actions */}
        <div className="border-t p-3 grid grid-cols-2 gap-2 bg-background">
          {nav && (
            <Button variant="outline" size="sm" asChild>
              <a href={nav} target="_blank" rel="noopener noreferrer"><Navigation className="w-4 h-4" /> Navigate</a>
            </Button>
          )}
          {phone && (
            <Button variant="outline" size="sm" asChild>
              <a href={`tel:${phone}`}><Phone className="w-4 h-4" /> Call</a>
            </Button>
          )}
          {wa && (
            <Button variant="outline" size="sm" asChild>
              <a href={`https://wa.me/${wa.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link to="/clients/$id" params={{ id: client.id }}><User className="w-4 h-4" /> Profile</Link>
          </Button>
          {agg.latest && (
            <Button variant="outline" size="sm" asChild className="col-span-2">
              <Link to="/invoices/$id" params={{ id: agg.latest.id }}><FileText className="w-4 h-4" /> Open Invoice</Link>
            </Button>
          )}
          {agg.latest && agg.pending > 0 && (
            <div className="col-span-2">
              <MarkCollectedButton
                invoiceId={agg.latest.id}
                invoiceNumber={agg.latest.invoice_number}
                pending={Math.max(0, agg.latest.total - agg.latest.amount_paid)}
              />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
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

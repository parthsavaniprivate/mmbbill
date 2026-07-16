import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { STATUS_LABEL, type CollectionStatus } from "@/lib/collection/status";
import type { CollectionFilters } from "@/hooks/use-collection-data";

interface Props {
  filters: CollectionFilters;
  onChange: (patch: Partial<CollectionFilters>) => void;
  onReset: () => void;
  cities: string[];
}

const STATUS_TABS: Array<{ key: CollectionFilters["status"]; label: string }> = [
  { key: "all", label: "All" },
  { key: "overdue", label: STATUS_LABEL.overdue },
  { key: "dueToday", label: STATUS_LABEL.dueToday },
  { key: "dueSoon", label: STATUS_LABEL.dueSoon },
  { key: "scheduled", label: STATUS_LABEL.scheduled },
  { key: "paid", label: STATUS_LABEL.paid },
];

type Preset = "today" | "tomorrow" | "week" | "pending" | null;

function isoDay(offset: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function activePreset(f: CollectionFilters): Preset {
  const t = isoDay(0);
  const tmr = isoDay(1);
  const w = isoDay(7);
  if (f.status === "all" && f.dueFrom === t && f.dueTo === t) return "today";
  if (f.status === "all" && f.dueFrom === tmr && f.dueTo === tmr) return "tomorrow";
  if (f.status === "all" && f.dueFrom === t && f.dueTo === w) return "week";
  if (f.status === "all" && !f.dueFrom && !f.dueTo && f.minAmount == null && f.maxAmount == null && !f.city && !f.search) return "pending";
  return null;
}


export function FilterBar({ filters, onChange, onReset, cities }: Props) {
  const activeCount =
    (filters.city ? 1 : 0) +
    (filters.minAmount != null ? 1 : 0) +
    (filters.maxAmount != null ? 1 : 0) +
    (filters.dueFrom ? 1 : 0) +
    (filters.dueTo ? 1 : 0);
  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="global-search"
            placeholder="Search client, invoice, phone, city…"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            className="pl-9"
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="relative shrink-0" aria-label="More filters">
              <SlidersHorizontal className="w-4 h-4" />
              {activeCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold grid place-items-center">
                  {activeCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm">Advanced filters</div>
              <Button size="sm" variant="ghost" onClick={onReset}>
                <X className="w-3 h-3" /> Reset
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Area / City</Label>
              <Input
                list="cc-cities"
                value={filters.city}
                onChange={(e) => onChange({ city: e.target.value })}
                placeholder="Any city"
              />
              <datalist id="cc-cities">
                {cities.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Min pending</Label>
                <Input
                  inputMode="numeric"
                  value={filters.minAmount ?? ""}
                  onChange={(e) => onChange({ minAmount: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Max pending</Label>
                <Input
                  inputMode="numeric"
                  value={filters.maxAmount ?? ""}
                  onChange={(e) => onChange({ maxAmount: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Due from</Label>
                <Input type="date" value={filters.dueFrom ?? ""} onChange={(e) => onChange({ dueFrom: e.target.value || null })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Due to</Label>
                <Input type="date" value={filters.dueTo ?? ""} onChange={(e) => onChange({ dueTo: e.target.value || null })} />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Employee filter coming soon — requires an assigned employee per client.
            </p>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 no-scrollbar">
        {(() => {
          const preset = activePreset(filters);
          const setPreset = (p: Preset) => {
            if (p === "today") onChange({ status: "all", dueFrom: isoDay(0), dueTo: isoDay(0) });
            else if (p === "tomorrow") onChange({ status: "all", dueFrom: isoDay(1), dueTo: isoDay(1) });
            else if (p === "week") onChange({ status: "all", dueFrom: isoDay(0), dueTo: isoDay(7) });
            else onChange({ status: "all", dueFrom: null, dueTo: null, minAmount: null, maxAmount: null, city: "" });
          };
          const chip = (key: Preset, label: string) => (
            <Button
              key={label}
              size="sm"
              variant={preset === key ? "default" : "outline"}
              onClick={() => setPreset(key)}
              className="shrink-0"
            >
              {label}
            </Button>
          );
          return (
            <>
              {chip("pending", "Pending")}
              {chip("today", "Today")}
              {chip("tomorrow", "Tomorrow")}
              {chip("week", "This Week")}
              <span className="w-px bg-border mx-1 shrink-0" />
              {STATUS_TABS.map((t) => (
                <Button
                  key={t.key}
                  size="sm"
                  variant={filters.status === t.key && !preset ? "default" : "outline"}
                  onClick={() => onChange({ status: t.key, dueFrom: null, dueTo: null })}
                  className="shrink-0"
                >
                  {t.label}
                </Button>
              ))}
            </>
          );
        })()}
      </div>

    </div>
  );
}

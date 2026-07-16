import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { useCompany } from "@/lib/company";
import { useCollectionData, DEFAULT_FILTERS, type CollectionFilters } from "@/hooks/use-collection-data";
import { KpiStrip } from "@/components/collection/KpiStrip";
import { FilterBar } from "@/components/collection/FilterBar";
import { CollectionMap } from "@/components/collection/CollectionMap";
import { CollectionList } from "@/components/collection/CollectionList";
import { ClientPanel } from "@/components/collection/ClientPanel";
import { loadTarget, saveTarget } from "@/lib/collection/status";

export const Route = createFileRoute("/_authenticated/collection-map")({
  component: CollectionCommandCenter,
});

function CollectionCommandCenter() {
  const { selected, companies, isAll } = useCompany();
  const [filters, setFilters] = useState<CollectionFilters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"map" | "list">("map");

  const {
    filtered, mapPoints, missingLocation, summary, geocoding,
    scheduled, toggleScheduled, cities,
  } = useCollectionData(filters);

  // Target: default = pending due today + overdue, override in localStorage
  const targetKey = isAll ? "all" : selected;
  const defaultTarget = Math.round(summary.dueTodayAmount + summary.overdue);
  const [targetOverride, setTargetOverride] = useState<number | null>(null);
  useEffect(() => { setTargetOverride(loadTarget(targetKey)); }, [targetKey]);
  const target = targetOverride ?? defaultTarget;
  const setTarget = (v: number) => {
    setTargetOverride(v);
    saveTarget(targetKey, v);
  };

  const selectedItem = useMemo(
    () => filtered.find((e) => e.client.id === selectedId) ?? null,
    [filtered, selectedId],
  );

  const onSelect = (id: string) => {
    setSelectedId(id);
    setPanelOpen(true);
  };

  const patchFilters = (patch: Partial<CollectionFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  const companyName = isAll ? "All companies" : companies.find((c) => c.id === selected)?.name ?? "";

  return (
    <div className="space-y-3 sm:space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold">Collection Command Center</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {companyName} · {mapPoints.length} on map · {filtered.length} in list
            {geocoding && <span className="text-amber-600"> · Geocoding…</span>}
          </p>
        </div>
      </header>

      <KpiStrip
        pending={summary.pending}
        target={target}
        scheduledCount={summary.scheduledCount}
        overdueClients={summary.overdueClients}
        collectedToday={summary.collectedToday}
        onTargetChange={setTarget}
      />

      <FilterBar filters={filters} onChange={patchFilters} onReset={resetFilters} cities={cities} />

      {/* Desktop split */}
      <div className="hidden lg:grid grid-cols-5 gap-3" style={{ height: "calc(100vh - 340px)", minHeight: 500 }}>
        <div className="col-span-3 min-h-0">
          <CollectionMap points={mapPoints} selectedId={selectedId} onSelect={onSelect} />
        </div>
        <Card className="col-span-2 min-h-0 overflow-hidden">
          <CollectionList items={filtered} missing={missingLocation} selectedId={selectedId} onSelect={onSelect} />
        </Card>
      </div>

      {/* Mobile / tablet tabs */}
      <div className="lg:hidden">
        <Tabs value={mobileTab} onValueChange={(v) => setMobileTab(v as "map" | "list")}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="map">Map ({mapPoints.length})</TabsTrigger>
            <TabsTrigger value="list">List ({filtered.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="map">
            <div className="h-[60vh] min-h-[380px]">
              <CollectionMap points={mapPoints} selectedId={selectedId} onSelect={onSelect} />
            </div>
          </TabsContent>
          <TabsContent value="list">
            <Card className="h-[60vh] min-h-[380px] overflow-hidden">
              <CollectionList items={filtered} missing={missingLocation} selectedId={selectedId} onSelect={onSelect} />
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <ClientPanel
        item={selectedItem}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        scheduled={selectedItem ? scheduled.has(selectedItem.client.id) : false}
        onToggleScheduled={toggleScheduled}
      />
    </div>
  );
}

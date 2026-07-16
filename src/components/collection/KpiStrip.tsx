import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/format";
import { useEffect, useState } from "react";
import { Pencil, Check, X } from "lucide-react";

interface Props {
  pending: number;
  target: number;
  scheduledCount: number;
  overdueClients: number;
  collectedToday: number;
  onTargetChange: (v: number) => void;
}

export function KpiStrip({
  pending,
  target,
  scheduledCount,
  overdueClients,
  collectedToday,
  onTargetChange,
}: Props) {
  const remaining = Math.max(0, target - collectedToday);
  const progress = target > 0 ? Math.min(100, (collectedToday / target) * 100) : 0;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
      <Kpi label="Total Pending" value={inr(pending)} tone="danger" />
      <TargetKpi target={target} onChange={onTargetChange} />
      <Kpi label="Clients to Visit" value={String(scheduledCount)} tone="info" />
      <Kpi label="Overdue Clients" value={String(overdueClients)} tone="danger" />
      <Kpi label="Collected Today" value={inr(collectedToday)} tone="success" />
      <Card className="relative overflow-hidden">
        <CardContent className="p-3 sm:p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Remaining Target</div>
          <div className="text-base sm:text-lg font-bold mt-1 break-words">{inr(remaining)}</div>
          <Progress value={progress} className="h-1.5 mt-2" />
          <div className="text-[10px] text-muted-foreground mt-1">{progress.toFixed(0)}% collected</div>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "danger" | "success" | "info" }) {
  const bar =
    tone === "danger"
      ? "from-red-500/10 to-transparent"
      : tone === "success"
        ? "from-emerald-500/10 to-transparent"
        : tone === "info"
          ? "from-blue-500/10 to-transparent"
          : "from-muted to-transparent";
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute inset-0 bg-gradient-to-br ${bar} pointer-events-none`} />
      <CardContent className="p-3 sm:p-4 relative">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-base sm:text-lg font-bold mt-1 break-words">{value}</div>
      </CardContent>
    </Card>
  );
}

function TargetKpi({ target, onChange }: { target: number; onChange: (v: number) => void }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(String(target));
  useEffect(() => setDraft(String(target)), [target]);
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none" />
      <CardContent className="p-3 sm:p-4 relative">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Today's Target</div>
          {!edit && (
            <button className="text-muted-foreground hover:text-foreground" onClick={() => setEdit(true)} aria-label="Edit target">
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
        {edit ? (
          <div className="flex items-center gap-1 mt-1">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
              className="h-8 text-sm"
              autoFocus
            />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { onChange(Number(draft) || 0); setEdit(false); }}>
              <Check className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEdit(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="text-base sm:text-lg font-bold mt-1 break-words">{inr(target)}</div>
        )}
      </CardContent>
    </Card>
  );
}

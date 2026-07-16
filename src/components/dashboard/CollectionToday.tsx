import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { inr } from "@/lib/format";
import { loadTarget } from "@/lib/collection/status";
import { cn } from "@/lib/utils";
import { Target } from "lucide-react";


export function CollectionToday({ companyId, collectedToday, pendingToday, paidCountToday = 0 }: {
  companyId: string; collectedToday: number; pendingToday: number; paidCountToday?: number;
}) {
  const [target, setTarget] = useState<number>(0);

  useEffect(() => {
    const t = loadTarget(companyId) ?? Math.max(pendingToday, 50000);
    setTarget(t);
  }, [companyId, pendingToday]);

  const pct = target > 0 ? Math.min(100, (collectedToday / target) * 100) : 0;
  const remaining = Math.max(0, target - collectedToday);
  const now = new Date();
  const hoursDone = now.getHours() + now.getMinutes() / 60;
  const rate = hoursDone > 0 ? collectedToday / hoursDone : 0;
  const hoursNeeded = rate > 0 ? remaining / rate : Infinity;
  const eta = remaining === 0 ? "Target achieved" :
    !isFinite(hoursNeeded) ? "Start collecting" :
    hoursNeeded > 12 ? "Beyond today" : `~${hoursNeeded.toFixed(1)}h to goal`;

  return (
    <Card className="shadow-card border-border/60 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-emerald-500/10 pointer-events-none" />
      <CardHeader className="relative">
        <CardTitle className="flex items-center gap-2"><Target className="w-4 h-4 text-blue-500" /> Today's Collection</CardTitle>
        <CardDescription>{eta}</CardDescription>
      </CardHeader>
      <CardContent className="relative space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border bg-card/60 backdrop-blur p-3">
            <p className="text-[10px] uppercase text-muted-foreground font-semibold">Bills Paid</p>
            <p className="text-lg font-bold text-blue-500">{paidCountToday}</p>
          </div>
          <div className="rounded-lg border bg-card/60 backdrop-blur p-3">
            <p className="text-[10px] uppercase text-muted-foreground font-semibold">Collected</p>
            <p className="text-lg font-bold text-emerald-500">{inr(collectedToday)}</p>
          </div>
          <div className="rounded-lg border bg-card/60 backdrop-blur p-3">
            <p className="text-[10px] uppercase text-muted-foreground font-semibold">Remaining</p>
            <p className="text-lg font-bold text-amber-500">{inr(remaining)}</p>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-semibold">{pct.toFixed(0)}%</span>
          </div>
          <div className="h-3 rounded-full bg-muted/40 overflow-hidden">
            <div className={cn("h-full transition-all duration-700 rounded-full",
              pct >= 100 ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : "bg-gradient-to-r from-blue-500 to-emerald-500")}
              style={{ width: `${pct}%` }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


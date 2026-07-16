import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface HealthInputs {
  pending: number;
  billed: number;
  collected: number;
  overdue: number;
  balance: number;
  momGrowthPct: number; // -100..+inf
}

function clamp(n: number, min = 0, max = 100) { return Math.max(min, Math.min(max, n)); }

export function computeHealth(i: HealthInputs) {
  const collectionSuccess = i.billed > 0 ? clamp((i.collected / i.billed) * 100) : 100;
  const pendingScore = i.billed > 0 ? clamp(100 - (i.pending / i.billed) * 100) : 100;
  const overdueScore = i.pending > 0 ? clamp(100 - (i.overdue / i.pending) * 100) : 100;
  const cashflowScore = i.balance >= 0 ? 100 : clamp(50 + (i.balance / Math.max(1, Math.abs(i.balance) * 2)) * 50);
  const growthScore = clamp(50 + i.momGrowthPct); // 0% growth = 50, +50% = 100
  const overall = Math.round((collectionSuccess * 0.25 + pendingScore * 0.2 + overdueScore * 0.2 + cashflowScore * 0.2 + growthScore * 0.15));
  return { overall, collectionSuccess, pendingScore, overdueScore, cashflowScore, growthScore };
}

export function HealthScore({ inputs }: { inputs: HealthInputs }) {
  const h = computeHealth(inputs);
  const size = 140, stroke = 12, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const offset = c - (h.overall / 100) * c;
  const tone = h.overall >= 80 ? "text-emerald-500" : h.overall >= 60 ? "text-amber-500" : "text-red-500";
  const rows: [string, number][] = [
    ["Collection Success", h.collectionSuccess],
    ["Pending Ratio", h.pendingScore],
    ["Overdue Control", h.overdueScore],
    ["Cash Flow", h.cashflowScore],
    ["Monthly Growth", h.growthScore],
  ];
  return (
    <Card className="shadow-card border-border/60">
      <CardHeader>
        <CardTitle>Business Health</CardTitle>
        <CardDescription>Composite score from 5 signals</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
              <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="stroke-muted/40" fill="none" />
              <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} strokeLinecap="round"
                className={cn("transition-all duration-700", tone)}
                stroke="currentColor" fill="none" strokeDasharray={c} strokeDashoffset={offset} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className={cn("text-4xl font-extrabold tracking-tight", tone)}>{h.overall}</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Score</p>
            </div>
          </div>
          <div className="flex-1 w-full space-y-2">
            {rows.map(([label, v]) => (
              <div key={label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-semibold">{Math.round(v)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                  <div className={cn("h-full transition-all duration-500", v >= 80 ? "bg-emerald-500" : v >= 60 ? "bg-amber-500" : "bg-red-500")}
                    style={{ width: `${v}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

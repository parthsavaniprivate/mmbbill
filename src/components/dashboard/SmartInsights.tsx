import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Lightbulb, TrendingUp, TrendingDown, AlertTriangle, Award } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Insight {
  tone: "positive" | "negative" | "warning" | "info";
  icon?: "up" | "down" | "warn" | "award" | "info";
  text: string;
}

const TONE = {
  positive: "bg-emerald-500/10 border-emerald-500/30 text-emerald-500",
  negative: "bg-red-500/10 border-red-500/30 text-red-500",
  warning: "bg-amber-500/10 border-amber-500/30 text-amber-500",
  info: "bg-blue-500/10 border-blue-500/30 text-blue-500",
} as const;

const ICONS = { up: TrendingUp, down: TrendingDown, warn: AlertTriangle, award: Award, info: Lightbulb };

export function SmartInsights({ insights }: { insights: Insight[] }) {
  return (
    <Card className="shadow-card border-border/60 h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-500" /> Smart Insights</CardTitle>
        <CardDescription>Automatic observations from your data</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {insights.length === 0 && <p className="text-sm text-muted-foreground">Not enough data for insights yet.</p>}
        {insights.map((i, idx) => {
          const Icon = ICONS[i.icon ?? "info"];
          return (
            <div key={idx} className={cn("flex items-start gap-3 rounded-lg border p-3 text-sm", TONE[i.tone])}>
              <Icon className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-foreground/90">{i.text}</p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

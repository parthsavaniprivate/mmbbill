import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Map as MapIcon, ArrowRight } from "lucide-react";
import { inr } from "@/lib/format";

export function MapPreview({ overdueCount, dueTodayCount, pendingAmount }: {
  overdueCount: number; dueTodayCount: number; pendingAmount: number;
}) {
  return (
    <Card className="shadow-card border-border/60 h-full relative overflow-hidden">
      <div className="absolute inset-0 opacity-20 pointer-events-none"
        style={{ backgroundImage: "radial-gradient(circle at 20% 30%, #ef4444 0 6px, transparent 7px), radial-gradient(circle at 65% 55%, #f97316 0 6px, transparent 7px), radial-gradient(circle at 40% 75%, #eab308 0 5px, transparent 6px), radial-gradient(circle at 80% 25%, #3b82f6 0 5px, transparent 6px)" }} />
      <CardHeader className="relative">
        <CardTitle className="flex items-center gap-2"><MapIcon className="w-4 h-4 text-blue-500" /> Collection Map</CardTitle>
        <CardDescription>Today's field route summary</CardDescription>
      </CardHeader>
      <CardContent className="relative space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border bg-card/70 backdrop-blur p-3">
            <p className="text-[10px] uppercase text-muted-foreground font-semibold">Overdue</p>
            <p className="text-xl font-bold text-red-500">{overdueCount}</p>
          </div>
          <div className="rounded-lg border bg-card/70 backdrop-blur p-3">
            <p className="text-[10px] uppercase text-muted-foreground font-semibold">Due Today</p>
            <p className="text-xl font-bold text-orange-500">{dueTodayCount}</p>
          </div>
        </div>
        <div className="rounded-lg border bg-card/70 backdrop-blur p-3">
          <p className="text-[10px] uppercase text-muted-foreground font-semibold">Pending Amount</p>
          <p className="text-lg font-bold text-amber-500">{inr(pendingAmount)}</p>
        </div>
        <Button asChild className="w-full gap-2">
          <Link to="/collection-map">Open Collection Map <ArrowRight className="w-4 h-4" /></Link>
        </Button>
      </CardContent>
    </Card>
  );
}

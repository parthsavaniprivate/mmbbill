import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

export interface CompanyRow {
  id: string;
  name: string;
  invoices: number;
  collected: number;
  expenses: number;
  profit: number;
  growthPct: number;
}

export function CompanyPerformance({ rows }: { rows: CompanyRow[] }) {
  return (
    <Card className="shadow-card border-border/60">
      <CardHeader>
        <CardTitle>Company Performance</CardTitle>
        <CardDescription>Side-by-side comparison across companies</CardDescription>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2">Company</th>
              <th className="text-right px-4 py-2">Invoices</th>
              <th className="text-right px-4 py-2">Collected</th>
              <th className="text-right px-4 py-2">Expenses</th>
              <th className="text-right px-4 py-2">Profit</th>
              <th className="text-right px-4 py-2">Growth</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/60 hover:bg-muted/20">
                <td className="px-4 py-2 font-medium truncate max-w-[200px]">{r.name}</td>
                <td className="px-4 py-2 text-right">{r.invoices}</td>
                <td className="px-4 py-2 text-right text-emerald-500 font-semibold">{inr(r.collected)}</td>
                <td className="px-4 py-2 text-right text-orange-500 font-semibold">{inr(r.expenses)}</td>
                <td className={cn("px-4 py-2 text-right font-bold", r.profit >= 0 ? "text-emerald-500" : "text-red-500")}>{inr(r.profit)}</td>
                <td className="px-4 py-2 text-right">
                  <span className={cn("inline-flex items-center gap-1 font-semibold", r.growthPct >= 0 ? "text-emerald-500" : "text-red-500")}>
                    {r.growthPct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {r.growthPct.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

export interface CompanyRow {
  id: string;
  name: string;
  invoices: number;
  total: number;
  collected: number;
  expenses: number;
  profit: number;
  growthPct: number;
}

function collectedPct(total: number, collected: number) {
  if (total <= 0) return 0;
  return (collected / total) * 100;
}

export function CompanyPerformance({ rows }: { rows: CompanyRow[] }) {
  return (
    <Card className="shadow-card border-border/60">
      <CardHeader>
        <CardTitle>Company Performance</CardTitle>
        <CardDescription>Side-by-side comparison across companies</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {/* Mobile card list */}
        <ul className="sm:hidden divide-y divide-border/60">
          {rows.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">No data.</li>}
          {rows.map((r) => {
            const pct = collectedPct(r.total, r.collected);
            return (
              <li key={r.id} className="p-3 space-y-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.invoices} invoices</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="text-muted-foreground">Total</p>
                    <p className="font-semibold text-blue-500 truncate">{inr(r.total)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-muted-foreground">Collected</p>
                    <p className="font-semibold text-emerald-500 truncate">{inr(r.collected)}</p>
                    <p className={cn("text-[10px] font-medium inline-flex items-center gap-0.5", pct >= 50 ? "text-emerald-500" : "text-red-500")}>
                      {pct >= 50 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                      {pct.toFixed(1)}%
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-muted-foreground">Expenses</p>
                    <p className="font-semibold text-orange-500 truncate">{inr(r.expenses)}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2">Company</th>
                <th className="text-right px-4 py-2">Invoices</th>
                <th className="text-right px-4 py-2">Total</th>
                <th className="text-right px-4 py-2">Collected</th>
                <th className="text-right px-4 py-2">Expenses</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = collectedPct(r.total, r.collected);
                return (
                  <tr key={r.id} className="border-t border-border/60 hover:bg-muted/20">
                    <td className="px-4 py-2 font-medium truncate max-w-[200px]">{r.name}</td>
                    <td className="px-4 py-2 text-right">{r.invoices}</td>
                    <td className="px-4 py-2 text-right text-blue-500 font-semibold">{inr(r.total)}</td>
                    <td className="px-4 py-2 text-right font-semibold">
                      <span className="text-emerald-500">{inr(r.collected)}</span>
                      <span className={cn("ml-2 text-xs font-medium inline-flex items-center gap-0.5", pct >= 50 ? "text-emerald-500" : "text-red-500")}>
                        {pct >= 50 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {pct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-orange-500 font-semibold">{inr(r.expenses)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

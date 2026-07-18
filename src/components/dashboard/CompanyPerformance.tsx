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
          {rows.map((r) => (
            <li key={r.id} className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.invoices} invoices</p>
                </div>
                <span className={cn("inline-flex items-center gap-1 text-xs font-semibold shrink-0", r.growthPct >= 0 ? "text-emerald-500" : "text-red-500")}>
                  {r.growthPct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {r.growthPct.toFixed(1)}%
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="min-w-0">
                  <p className="text-muted-foreground">Total</p>
                  <p className="font-semibold text-blue-500 truncate">{inr(r.total)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-muted-foreground">Collected</p>
                  <p className="font-semibold text-emerald-500 truncate">{inr(r.collected)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-muted-foreground">Expenses</p>
                  <p className="font-semibold text-orange-500 truncate">{inr(r.expenses)}</p>
                </div>
              </div>
            </li>
          ))}
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
                <th className="text-right px-4 py-2">Growth</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border/60 hover:bg-muted/20">
                  <td className="px-4 py-2 font-medium truncate max-w-[200px]">{r.name}</td>
                  <td className="px-4 py-2 text-right">{r.invoices}</td>
                  <td className="px-4 py-2 text-right text-blue-500 font-semibold">{inr(r.total)}</td>
                  <td className="px-4 py-2 text-right text-emerald-500 font-semibold">{inr(r.collected)}</td>
                  <td className="px-4 py-2 text-right text-orange-500 font-semibold">{inr(r.expenses)}</td>
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
        </div>
      </CardContent>
    </Card>
  );
}

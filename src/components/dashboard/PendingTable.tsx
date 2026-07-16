import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import { inr, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface PendingRow {
  id: string;
  invoice_number: string;
  client_name: string;
  amount: number;
  due_date: string | null;
  days_overdue: number;
}

function priority(days: number): { label: string; cls: string } {
  if (days > 30) return { label: "Critical", cls: "bg-red-500/15 text-red-500 border-red-500/40" };
  if (days > 7) return { label: "High", cls: "bg-orange-500/15 text-orange-500 border-orange-500/40" };
  if (days > 0) return { label: "Medium", cls: "bg-amber-500/15 text-amber-500 border-amber-500/40" };
  return { label: "Low", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40" };
}

export function PendingTable({ rows }: { rows: PendingRow[] }) {
  return (
    <Card className="shadow-card border-border/60">
      <CardHeader>
        <CardTitle>Pending Collection</CardTitle>
        <CardDescription>Top {rows.length} unpaid invoices, sorted by days overdue</CardDescription>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2">Client</th>
              <th className="text-left px-4 py-2">Invoice</th>
              <th className="text-right px-4 py-2">Amount</th>
              <th className="text-left px-4 py-2">Due</th>
              <th className="text-left px-4 py-2">Overdue</th>
              <th className="text-left px-4 py-2">Priority</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted-foreground py-6">No pending invoices.</td></tr>
            )}
            {rows.map((r) => {
              const p = priority(r.days_overdue);
              return (
                <tr key={r.id} className={cn("border-t border-border/60 hover:bg-muted/20", r.days_overdue > 0 && "bg-red-500/[0.03]")}>
                  <td className="px-4 py-2 font-medium truncate max-w-[200px]">{r.client_name}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.invoice_number}</td>
                  <td className="px-4 py-2 text-right font-semibold">{inr(r.amount)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{formatDate(r.due_date)}</td>
                  <td className="px-4 py-2">
                    {r.days_overdue > 0
                      ? <span className="text-red-500 font-semibold">{r.days_overdue}d</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2"><Badge variant="outline" className={p.cls}>{p.label}</Badge></td>
                  <td className="px-4 py-2 text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/invoices/$id" params={{ id: r.id }}>View</Link>
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

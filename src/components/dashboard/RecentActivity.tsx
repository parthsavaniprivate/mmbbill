import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Receipt, Wallet, TrendingDown, UserPlus, FileText } from "lucide-react";
import { inr, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ActivityItem {
  id: string;
  type: "invoice" | "payment" | "expense" | "client" | "quotation";
  title: string;
  subtitle?: string;
  amount?: number;
  at: string;
}

const ICONS = {
  invoice: Receipt,
  payment: Wallet,
  expense: TrendingDown,
  client: UserPlus,
  quotation: FileText,
} as const;

const TONE = {
  invoice: "bg-blue-500/15 text-blue-500",
  payment: "bg-emerald-500/15 text-emerald-500",
  expense: "bg-orange-500/15 text-orange-500",
  client: "bg-purple-500/15 text-purple-500",
  quotation: "bg-cyan-500/15 text-cyan-500",
} as const;

export function RecentActivity({ items }: { items: ActivityItem[] }) {
  return (
    <Card className="shadow-card border-border/60 h-full">
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Latest events across the business</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ol className="relative divide-y divide-border/60 max-h-96 overflow-y-auto">
          {items.length === 0 && <li className="p-6 text-sm text-muted-foreground text-center">No activity yet.</li>}
          {items.map((it) => {
            const Icon = ICONS[it.type];
            return (
              <li key={it.id} className="flex items-start gap-3 p-4 hover:bg-muted/30 transition-colors">
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", TONE[it.type])}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{it.title}</p>
                  {it.subtitle && <p className="text-xs text-muted-foreground truncate">{it.subtitle}</p>}
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{formatDate(it.at)}</p>
                </div>
                {it.amount != null && <p className="text-sm font-semibold shrink-0">{inr(it.amount)}</p>}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

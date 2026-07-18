import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Eye } from "lucide-react";
import {
  BEHAVIOUR_BADGE,
  BEHAVIOUR_DOT,
  BEHAVIOUR_LABEL,
  BEHAVIOUR_SHORT,
  BEHAVIOUR_ORDER,
  behaviourDescription,
  type BehaviourStats,
  type PaymentBehaviour,
} from "@/lib/payment-behaviour";
import { cn } from "@/lib/utils";

export function BehaviourDot({ behaviour, className }: { behaviour: PaymentBehaviour; className?: string }) {
  return (
    <span
      aria-label={BEHAVIOUR_LABEL[behaviour]}
      title={BEHAVIOUR_LABEL[behaviour]}
      className={cn("inline-block w-2.5 h-2.5 rounded-full shrink-0", className)}
      style={{ backgroundColor: BEHAVIOUR_DOT[behaviour] }}
    />
  );
}

export function BehaviourPill({
  behaviour,
  short = false,
  className,
}: {
  behaviour: PaymentBehaviour;
  short?: boolean;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", BEHAVIOUR_BADGE[behaviour], className)}>
      <span
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: BEHAVIOUR_DOT[behaviour] }}
      />
      {short ? BEHAVIOUR_SHORT[behaviour] : BEHAVIOUR_LABEL[behaviour]}
    </Badge>
  );
}

/**
 * Rich informational card shown below the client selector on the Invoice page.
 * Does not block invoice creation.
 */
export function BehaviourInfoCard({ stats }: { stats: BehaviourStats }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 text-sm",
        BEHAVIOUR_BADGE[stats.behaviour],
      )}
    >
      <span
        className="mt-1 w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: BEHAVIOUR_DOT[stats.behaviour] }}
      />
      <div className="min-w-0">
        <div className="font-semibold">{BEHAVIOUR_LABEL[stats.behaviour]}</div>
        <div className="text-xs opacity-90">{behaviourDescription(stats)}</div>
      </div>
    </div>
  );
}

/**
 * Eye-icon dropdown that filters by behaviour. Multi-coloured background.
 */
export function BehaviourFilter({
  value,
  onChange,
}: {
  value: PaymentBehaviour | "all";
  onChange: (v: PaymentBehaviour | "all") => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="outline"
          aria-label="Filter by payment behaviour"
          className="relative overflow-hidden shrink-0"
        >
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "conic-gradient(from 0deg, #22c55e 0 25%, #eab308 25% 50%, #f97316 50% 75%, #ef4444 75% 100%)",
              opacity: 0.28,
            }}
          />
          <Eye className="w-4 h-4 relative" />
          {value !== "all" && (
            <span
              className="absolute -top-1 -right-1 w-3 h-3 rounded-full ring-2 ring-background"
              style={{ backgroundColor: BEHAVIOUR_DOT[value] }}
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Payment behaviour</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onChange("all")} className={value === "all" ? "font-semibold" : ""}>
          All Clients
        </DropdownMenuItem>
        {BEHAVIOUR_ORDER.map((b) => (
          <DropdownMenuItem
            key={b}
            onSelect={() => onChange(b)}
            className={value === b ? "font-semibold" : ""}
          >
            <span
              className="w-2.5 h-2.5 rounded-full mr-2"
              style={{ backgroundColor: BEHAVIOUR_DOT[b] }}
            />
            {BEHAVIOUR_LABEL[b]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

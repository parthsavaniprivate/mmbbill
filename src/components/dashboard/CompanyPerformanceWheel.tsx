import { useMemo, useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCompany } from "@/lib/company";
import { Building2 } from "lucide-react";
import type { CompanyRow } from "./CompanyPerformance";

// Premium palette — stable across the app (index-based per company id sort order)
const PALETTE = [
  { base: "#3b82f6", glow: "rgba(59,130,246,0.55)" },   // blue
  { base: "#a855f7", glow: "rgba(168,85,247,0.55)" },   // purple
  { base: "#f97316", glow: "rgba(249,115,22,0.55)" },   // orange
  { base: "#10b981", glow: "rgba(16,185,129,0.55)" },   // emerald
  { base: "#ec4899", glow: "rgba(236,72,153,0.55)" },   // pink
  { base: "#14b8a6", glow: "rgba(20,184,166,0.55)" },   // teal
  { base: "#eab308", glow: "rgba(234,179,8,0.55)" },    // yellow
  { base: "#6366f1", glow: "rgba(99,102,241,0.55)" },   // indigo
  { base: "#ef4444", glow: "rgba(239,68,68,0.55)" },    // red
  { base: "#06b6d4", glow: "rgba(6,182,212,0.55)" },    // cyan
];

const colorFor = (idx: number) => PALETTE[idx % PALETTE.length];

// Simple animated count-up (integer INR)
function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  const start = useRef<number | null>(null);
  const from = useRef(0);
  useEffect(() => {
    from.current = val;
    start.current = null;
    let raf = 0;
    const step = (t: number) => {
      if (start.current === null) start.current = t;
      const p = Math.min(1, (t - start.current) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from.current + (target - from.current) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return val;
}

// Polar helpers
const polar = (cx: number, cy: number, r: number, angleDeg: number) => {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
};
const arcPath = (cx: number, cy: number, rInner: number, rOuter: number, startAngle: number, endAngle: number) => {
  const large = endAngle - startAngle > 180 ? 1 : 0;
  const p1 = polar(cx, cy, rOuter, startAngle);
  const p2 = polar(cx, cy, rOuter, endAngle);
  const p3 = polar(cx, cy, rInner, endAngle);
  const p4 = polar(cx, cy, rInner, startAngle);
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${p4.x} ${p4.y}`,
    "Z",
  ].join(" ");
};

interface Segment extends CompanyRow {
  pending: number;
  pct: number;             // slice size (share of revenue)
  collectionPct: number;   // collected / total
  startAngle: number;
  endAngle: number;
  color: { base: string; glow: string };
  idx: number;
}

export function CompanyPerformanceWheel({ rows }: { rows: CompanyRow[] }) {
  const { setSelected } = useCompany();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 30); return () => clearTimeout(t); }, []);

  const totalRevenue = rows.reduce((s, r) => s + r.total, 0);
  const totalCollected = rows.reduce((s, r) => s + r.collected, 0);
  const totalPending = Math.max(0, totalRevenue - totalCollected);
  const displayedRevenue = useCountUp(totalRevenue);

  const segments: Segment[] = useMemo(() => {
    // Stable color per company id — sort ids alphabetically for consistency
    const idOrder = [...rows].map((r) => r.id).sort();
    const colorIndex = new Map(idOrder.map((id, i) => [id, i]));
    let angle = 0;
    // Ensure at least a minimum visible slice even for tiny values
    const safeTotal = totalRevenue > 0 ? totalRevenue : rows.length || 1;
    return rows.map((r) => {
      const share = totalRevenue > 0 ? r.total / safeTotal : 1 / (rows.length || 1);
      const sweep = share * 360;
      const seg: Segment = {
        ...r,
        pending: Math.max(0, r.total - r.collected),
        pct: share * 100,
        collectionPct: r.total > 0 ? (r.collected / r.total) * 100 : 0,
        startAngle: angle,
        endAngle: angle + sweep,
        color: colorFor(colorIndex.get(r.id) ?? 0),
        idx: colorIndex.get(r.id) ?? 0,
      };
      angle += sweep;
      return seg;
    });
  }, [rows, totalRevenue]);

  const singleCompany = segments.length === 1;

  const SIZE = 560;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R_OUTER = 250;
  const R_INNER = 150;
  const R_HOVER_OUT = 262;

  const hoverSeg = segments.find((s) => s.id === hoverId) ?? null;

  return (
    <Card className="shadow-card border-border/60 overflow-hidden">
      <CardHeader>
        <CardTitle>Company Performance</CardTitle>
        <CardDescription>Radial share of revenue across companies — hover for details, click to drill in</CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-6 items-center">
          {/* Wheel */}
          <div className="relative w-full flex items-center justify-center">
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className={cn("w-full max-w-[560px] h-auto transition-opacity duration-700", drawn ? "opacity-100" : "opacity-0")}
              role="img"
              aria-label="Company revenue distribution"
            >
              <defs>
                {segments.map((s) => (
                  <radialGradient key={`g-${s.id}`} id={`grad-${s.id}`} cx="50%" cy="50%" r="65%">
                    <stop offset="0%" stopColor={s.color.base} stopOpacity="0.55" />
                    <stop offset="100%" stopColor={s.color.base} stopOpacity="1" />
                  </radialGradient>
                ))}
                <filter id="wheel-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="6" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Backdrop ring */}
              <circle cx={CX} cy={CY} r={R_OUTER + 6} fill="none" stroke="hsl(var(--border))" strokeOpacity="0.35" strokeWidth="1" />
              <circle cx={CX} cy={CY} r={R_INNER - 6} fill="none" stroke="hsl(var(--border))" strokeOpacity="0.35" strokeWidth="1" />

              {segments.map((s) => {
                const isHover = hoverSeg?.id === s.id;
                const outer = isHover ? R_HOVER_OUT : R_OUTER;
                // Slight gap between segments unless single company
                const gap = singleCompany ? 0 : 0.6;
                const path = arcPath(
                  CX, CY, R_INNER, outer,
                  s.startAngle + gap,
                  Math.max(s.startAngle + gap, s.endAngle - gap),
                );
                // Label position (mid-angle, at mid-radius)
                const mid = (s.startAngle + s.endAngle) / 2;
                const labelR = (R_INNER + outer) / 2;
                const lp = polar(CX, CY, labelR, mid);
                const showLabel = s.pct >= 6 || singleCompany;
                return (
                  <g
                    key={s.id}
                    onMouseEnter={() => setHoverId(s.id)}
                    onMouseLeave={() => setHoverId(null)}
                    onClick={() => setSelected(s.id)}
                    style={{ cursor: "pointer", transformOrigin: `${CX}px ${CY}px` }}
                    className="transition-transform duration-300"
                  >
                    <path
                      d={path}
                      fill={`url(#grad-${s.id})`}
                      stroke={s.color.base}
                      strokeOpacity={isHover ? 0.9 : 0.4}
                      strokeWidth={isHover ? 2 : 1}
                      filter={isHover ? "url(#wheel-glow)" : undefined}
                      style={{
                        transition: "d 300ms ease, filter 300ms ease, stroke-opacity 300ms ease",
                        opacity: hoverSeg && !isHover ? 0.55 : 1,
                      }}
                    />
                    {showLabel && (
                      <g pointerEvents="none" style={{ opacity: drawn ? 1 : 0, transition: "opacity 500ms ease 400ms" }}>
                        <text
                          x={lp.x}
                          y={lp.y - 8}
                          textAnchor="middle"
                          className="fill-white font-semibold"
                          style={{ fontSize: 12, textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}
                        >
                          {truncate(s.name, 14)}
                        </text>
                        <text
                          x={lp.x}
                          y={lp.y + 8}
                          textAnchor="middle"
                          className="fill-white/90"
                          style={{ fontSize: 11, textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}
                        >
                          {Math.round(s.collectionPct)}%
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Center hub */}
              <circle cx={CX} cy={CY} r={R_INNER - 10} fill="hsl(var(--card))" stroke="hsl(var(--border))" />
              <text x={CX} y={CY - 40} textAnchor="middle" className="fill-muted-foreground uppercase" style={{ fontSize: 11, letterSpacing: 2 }}>
                Company Performance
              </text>
              <text x={CX} y={CY - 8} textAnchor="middle" className="fill-foreground font-extrabold" style={{ fontSize: 34 }}>
                {inr(displayedRevenue)}
              </text>
              <text x={CX} y={CY + 14} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 12 }}>
                Total Revenue
              </text>
              <text x={CX} y={CY + 42} textAnchor="middle" className="fill-foreground font-semibold" style={{ fontSize: 14 }}>
                {rows.length} {rows.length === 1 ? "Company" : "Companies"}
              </text>
              <text x={CX} y={CY + 62} textAnchor="middle" className="fill-emerald-500" style={{ fontSize: 12 }}>
                {inr(totalCollected)} collected
              </text>
              <text x={CX} y={CY + 80} textAnchor="middle" className="fill-orange-500" style={{ fontSize: 12 }}>
                {inr(totalPending)} pending
              </text>
            </svg>

            {/* Hover tooltip (positioned over the wheel) */}
            {hoverSeg && (
              <div className="pointer-events-none absolute top-3 right-3 z-10 min-w-[220px] rounded-xl border border-border/70 bg-popover/95 backdrop-blur px-4 py-3 shadow-xl animate-fade-in">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: hoverSeg.color.base, boxShadow: `0 0 10px ${hoverSeg.color.glow}` }} />
                  <p className="font-semibold text-sm truncate">{hoverSeg.name}</p>
                </div>
                <TooltipRow label="Revenue" value={inr(hoverSeg.total)} color="text-blue-500" />
                <TooltipRow label="Collected" value={inr(hoverSeg.collected)} color="text-emerald-500" />
                <TooltipRow label="Pending" value={inr(hoverSeg.pending)} color="text-orange-500" />
                <TooltipRow label="Expenses" value={inr(hoverSeg.expenses)} color="text-red-500" />
                <TooltipRow label="Profit" value={inr(hoverSeg.profit)} color={hoverSeg.profit >= 0 ? "text-emerald-500" : "text-red-500"} />
                <TooltipRow label="Invoices" value={String(hoverSeg.invoices)} />
                <TooltipRow label="Collection" value={`${Math.round(hoverSeg.collectionPct)}%`} />
              </div>
            )}
          </div>

          {/* Side legend / selected card */}
          <div className="space-y-3">
            {(hoverSeg ? [hoverSeg] : segments.slice(0, 1)).map((s) => (
              <button
                key={`hero-${s.id}`}
                onClick={() => setSelected(s.id)}
                className="w-full text-left rounded-xl border border-border/60 p-4 bg-gradient-to-br from-muted/40 to-transparent hover:shadow-lg transition-all"
                style={{ borderColor: `${s.color.base}55` }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-9 h-9 rounded-lg grid place-items-center" style={{ background: `${s.color.base}22`, color: s.color.base }}>
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{s.name}</p>
                    <p className="text-[11px] text-muted-foreground">{s.invoices} invoices</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Stat label="Revenue" value={inr(s.total)} tone="text-blue-500" />
                  <Stat label="Collected" value={inr(s.collected)} tone="text-emerald-500" />
                  <Stat label="Pending" value={inr(s.pending)} tone="text-orange-500" />
                  <Stat label="Collection" value={`${Math.round(s.collectionPct)}%`} tone="text-foreground" />
                </div>
              </button>
            ))}
            <p className="text-[11px] text-muted-foreground px-1">
              Hover a segment to preview. Click to filter the dashboard by that company.
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-6 pt-4 border-t border-border/60">
          <div className="flex flex-wrap gap-2">
            {segments.map((s) => (
              <button
                key={`lg-${s.id}`}
                onMouseEnter={() => setHoverId(s.id)}
                onMouseLeave={() => setHoverId(null)}
                onClick={() => setSelected(s.id)}
                className={cn(
                  "group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                  "border-border/60 hover:border-border hover:shadow-sm bg-card/60",
                  hoverSeg?.id === s.id && "shadow-md -translate-y-0.5",
                )}
                style={hoverSeg?.id === s.id ? { borderColor: `${s.color.base}88` } : undefined}
              >
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: s.color.base, boxShadow: `0 0 8px ${s.color.glow}` }} />
                <span className="truncate max-w-[160px]">{s.name}</span>
                <span className="text-muted-foreground">{Math.round(s.collectionPct)}%</span>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TooltipRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums", color)}>{value}</span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("font-semibold truncate", tone)}>{value}</p>
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

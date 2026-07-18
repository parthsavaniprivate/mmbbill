import { useMemo, useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCompany } from "@/lib/company";
import { Building2 } from "lucide-react";
import type { CompanyRow } from "./CompanyPerformance";

// Premium palette — stable across the app (index-based per company id sort order)
const PALETTE = [
  { base: "#3b82f6", glow: "rgba(59,130,246,0.55)" },
  { base: "#a855f7", glow: "rgba(168,85,247,0.55)" },
  { base: "#f97316", glow: "rgba(249,115,22,0.55)" },
  { base: "#10b981", glow: "rgba(16,185,129,0.55)" },
  { base: "#ec4899", glow: "rgba(236,72,153,0.55)" },
  { base: "#14b8a6", glow: "rgba(20,184,166,0.55)" },
  { base: "#eab308", glow: "rgba(234,179,8,0.55)" },
  { base: "#6366f1", glow: "rgba(99,102,241,0.55)" },
  { base: "#ef4444", glow: "rgba(239,68,68,0.55)" },
  { base: "#06b6d4", glow: "rgba(6,182,212,0.55)" },
];

const colorFor = (idx: number) => PALETTE[idx % PALETTE.length];

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

// Elliptical polar point (tilted top-down view). angleDeg: 0 = top of ellipse.
const ePolar = (cx: number, cy: number, rx: number, ry: number, angleDeg: number) => {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
};

// Elliptical annulus arc (donut slice) with independent inner/outer rx,ry.
const eArcPath = (
  cx: number, cy: number,
  rxIn: number, ryIn: number, rxOut: number, ryOut: number,
  startAngle: number, endAngle: number,
) => {
  const large = endAngle - startAngle > 180 ? 1 : 0;
  const p1 = ePolar(cx, cy, rxOut, ryOut, startAngle);
  const p2 = ePolar(cx, cy, rxOut, ryOut, endAngle);
  const p3 = ePolar(cx, cy, rxIn, ryIn, endAngle);
  const p4 = ePolar(cx, cy, rxIn, ryIn, startAngle);
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rxOut} ${ryOut} 0 ${large} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rxIn} ${ryIn} 0 ${large} 0 ${p4.x} ${p4.y}`,
    "Z",
  ].join(" ");
};

// Darken a hex color by mixing toward black.
const darken = (hex: string, amt: number) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amt))));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
};

interface Segment extends CompanyRow {
  pending: number;
  pct: number;
  collectionPct: number;
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
    const idOrder = [...rows].map((r) => r.id).sort();
    const colorIndex = new Map(idOrder.map((id, i) => [id, i]));
    let angle = 0;
    return rows.map((r) => {
      const share = totalRevenue > 0 ? r.total / totalRevenue : 1 / (rows.length || 1);
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

  // 3D geometry
  const SIZE_W = 620;
  const SIZE_H = 460;
  const CX = SIZE_W / 2;
  const CY = SIZE_H / 2 - 20;      // shift up to leave room for depth
  const RX_OUT = 260;
  const TILT = 0.5;                 // ellipse squish (ry/rx)
  const RY_OUT = RX_OUT * TILT;
  const RX_IN = 150;
  const RY_IN = RX_IN * TILT;
  const DEPTH = 42;                 // total 3D height
  const HOVER_LIFT = 10;            // lift on hover
  const HOVER_GROW = 12;            // extra radius on hover

  // Draw order: back-to-front. In tilted view (viewer looks slightly down from
  // the front), segments whose mid-angle is near 0/360 (top of ellipse) are
  // FARTHEST; near 180 (bottom) are CLOSEST. Sort ascending by "closeness".
  const closeness = (mid: number) => {
    // 0 (top/back) -> 0 ; 180 (front) -> 1
    const m = ((mid % 360) + 360) % 360;
    return 1 - Math.cos((m * Math.PI) / 180) / 2 - 0.5; // = (1 - cos)/2
  };
  const drawOrder = [...segments].sort((a, b) => {
    const ma = (a.startAngle + a.endAngle) / 2;
    const mb = (b.startAngle + b.endAngle) / 2;
    // hovered always last (on top)
    if (hoverId && a.id === hoverId) return 1;
    if (hoverId && b.id === hoverId) return -1;
    return closeness(ma) - closeness(mb);
  });

  const hoverSeg = segments.find((s) => s.id === hoverId) ?? null;

  return (
    <Card className="shadow-card border-border/60 overflow-hidden">
      <CardHeader>
        <CardTitle>Company Performance</CardTitle>
        <CardDescription>3D radial share of revenue — hover for details, click to drill in</CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-6 items-center">
          <div className="relative w-full flex items-center justify-center">
            <svg
              viewBox={`0 0 ${SIZE_W} ${SIZE_H}`}
              className={cn("w-full max-w-[620px] h-auto transition-opacity duration-700", drawn ? "opacity-100" : "opacity-0")}
              role="img"
              aria-label="3D company revenue distribution"
            >
              <defs>
                {segments.map((s) => (
                  <linearGradient key={`g-${s.id}`} id={`grad-${s.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={s.color.base} stopOpacity="1" />
                    <stop offset="60%" stopColor={s.color.base} stopOpacity="0.92" />
                    <stop offset="100%" stopColor={darken(s.color.base, 0.35)} stopOpacity="1" />
                  </linearGradient>
                ))}
                {segments.map((s) => (
                  <linearGradient key={`s-${s.id}`} id={`side-${s.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={darken(s.color.base, 0.25)} />
                    <stop offset="100%" stopColor={darken(s.color.base, 0.65)} />
                  </linearGradient>
                ))}
                <radialGradient id="hub-grad" cx="50%" cy="35%" r="80%">
                  <stop offset="0%" stopColor="hsl(var(--card))" stopOpacity="1" />
                  <stop offset="100%" stopColor="hsl(var(--muted))" stopOpacity="1" />
                </radialGradient>
                <filter id="wheel-shadow" x="-20%" y="-20%" width="140%" height="160%">
                  <feGaussianBlur in="SourceAlpha" stdDeviation="8" />
                  <feOffset dy="10" result="off" />
                  <feComponentTransfer><feFuncA type="linear" slope="0.35" /></feComponentTransfer>
                  <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <filter id="hover-glow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="6" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* Ground shadow */}
              <ellipse
                cx={CX}
                cy={CY + DEPTH + 14}
                rx={RX_OUT * 0.95}
                ry={RY_OUT * 0.55}
                fill="#000"
                opacity={0.22}
                style={{ filter: "blur(14px)" }}
              />

              {/* Segments — extruded 3D */}
              {drawOrder.map((s) => {
                const isHover = hoverSeg?.id === s.id;
                const lift = isHover ? HOVER_LIFT : 0;
                const grow = isHover ? HOVER_GROW : 0;
                const rxOut = RX_OUT + grow;
                const ryOut = RY_OUT + grow * TILT;
                const gap = singleCompany ? 0 : 0.6;
                const a1 = s.startAngle + gap;
                const a2 = Math.max(a1, s.endAngle - gap);

                // ---- Side wall (extrusion) ----
                // Build wall polygon: outer arc top -> outer arc bottom, only visible
                // where segment crosses the "front" (angles 90..270 in top-based coords).
                const wallSteps = 28;
                const wallPts: string[] = [];
                for (let i = 0; i <= wallSteps; i++) {
                  const ang = a1 + (a2 - a1) * (i / wallSteps);
                  const p = ePolar(CX, CY - lift, rxOut, ryOut, ang);
                  wallPts.push(`${p.x},${p.y}`);
                }
                for (let i = wallSteps; i >= 0; i--) {
                  const ang = a1 + (a2 - a1) * (i / wallSteps);
                  const p = ePolar(CX, CY - lift + DEPTH, rxOut, ryOut, ang);
                  wallPts.push(`${p.x},${p.y}`);
                }

                // Determine if a wall is visible at all: any angle in [a1,a2] with
                // sin(angle-90) > 0 → y goes down (front). We approximate: render
                // wall only when part of the arc is on the front half. If entirely
                // back (a2 < 180 or a1 > 360 etc.), skip wall to reduce clutter.
                const frontVisible = (() => {
                  // The front half is angles where ePolar's y is greater than cy.
                  // ePolar uses angle-90 rotation: y = cy + ry*sin(angle-90).
                  // sin(angle-90) > 0 when angle in (90, 270).
                  const norm = (x: number) => ((x % 360) + 360) % 360;
                  const A = norm(a1), B = norm(a2);
                  if (A <= B) return B > 90 && A < 270;
                  return true; // wraps
                })();

                // ---- Inner wall (donut hole) ----
                const rxIn = RX_IN;
                const ryIn = RY_IN;
                const innerWallPts: string[] = [];
                for (let i = 0; i <= wallSteps; i++) {
                  const ang = a1 + (a2 - a1) * (i / wallSteps);
                  const p = ePolar(CX, CY - lift, rxIn, ryIn, ang);
                  innerWallPts.push(`${p.x},${p.y}`);
                }
                for (let i = wallSteps; i >= 0; i--) {
                  const ang = a1 + (a2 - a1) * (i / wallSteps);
                  const p = ePolar(CX, CY - lift + DEPTH, rxIn, ryIn, ang);
                  innerWallPts.push(`${p.x},${p.y}`);
                }

                // ---- Top face ----
                const topPath = eArcPath(CX, CY - lift, rxIn, ryIn, rxOut, ryOut, a1, a2);

                // Label at mid-angle
                const mid = (a1 + a2) / 2;
                const labelR = (rxOut + rxIn) / 2;
                const labelRy = (ryOut + ryIn) / 2;
                const lp = ePolar(CX, CY - lift, labelR, labelRy, mid);
                const showLabel = s.pct >= 7 || singleCompany;

                const dim = hoverSeg && !isHover ? 0.55 : 1;

                return (
                  <g
                    key={s.id}
                    onMouseEnter={() => setHoverId(s.id)}
                    onMouseLeave={() => setHoverId(null)}
                    onClick={() => setSelected(s.id)}
                    style={{ cursor: "pointer", opacity: dim, transition: "opacity 250ms ease" }}
                  >
                    {/* Outer wall */}
                    {frontVisible && (
                      <polygon
                        points={wallPts.join(" ")}
                        fill={`url(#side-${s.id})`}
                        stroke={darken(s.color.base, 0.5)}
                        strokeOpacity="0.4"
                        strokeWidth="0.5"
                      />
                    )}
                    {/* Inner wall (visible on back side of donut hole) */}
                    <polygon
                      points={innerWallPts.join(" ")}
                      fill={darken(s.color.base, 0.55)}
                      opacity="0.85"
                    />
                    {/* Radial cut walls at slice edges */}
                    {!singleCompany && (() => {
                      const outerTop = ePolar(CX, CY - lift, rxOut, ryOut, a1);
                      const innerTop = ePolar(CX, CY - lift, rxIn, ryIn, a1);
                      const outerBot = ePolar(CX, CY - lift + DEPTH, rxOut, ryOut, a1);
                      const innerBot = ePolar(CX, CY - lift + DEPTH, rxIn, ryIn, a1);
                      const outerTop2 = ePolar(CX, CY - lift, rxOut, ryOut, a2);
                      const innerTop2 = ePolar(CX, CY - lift, rxIn, ryIn, a2);
                      const outerBot2 = ePolar(CX, CY - lift + DEPTH, rxOut, ryOut, a2);
                      const innerBot2 = ePolar(CX, CY - lift + DEPTH, rxIn, ryIn, a2);
                      return (
                        <>
                          <polygon
                            points={`${outerTop.x},${outerTop.y} ${innerTop.x},${innerTop.y} ${innerBot.x},${innerBot.y} ${outerBot.x},${outerBot.y}`}
                            fill={darken(s.color.base, 0.5)}
                            opacity="0.75"
                          />
                          <polygon
                            points={`${outerTop2.x},${outerTop2.y} ${innerTop2.x},${innerTop2.y} ${innerBot2.x},${innerBot2.y} ${outerBot2.x},${outerBot2.y}`}
                            fill={darken(s.color.base, 0.5)}
                            opacity="0.75"
                          />
                        </>
                      );
                    })()}
                    {/* Top face */}
                    <path
                      d={topPath}
                      fill={`url(#grad-${s.id})`}
                      stroke={darken(s.color.base, 0.25)}
                      strokeOpacity={isHover ? 0.9 : 0.5}
                      strokeWidth={isHover ? 1.5 : 0.75}
                      filter={isHover ? "url(#hover-glow)" : undefined}
                      style={{ transition: "filter 250ms ease" }}
                    />
                    {/* Specular highlight on top */}
                    <path
                      d={topPath}
                      fill="white"
                      opacity="0.08"
                      pointerEvents="none"
                    />
                    {showLabel && (
                      <g pointerEvents="none" style={{ opacity: drawn ? 1 : 0, transition: "opacity 500ms ease 400ms" }}>
                        <text
                          x={lp.x}
                          y={lp.y - 6}
                          textAnchor="middle"
                          className="fill-white font-semibold"
                          style={{ fontSize: 12, textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
                        >
                          {truncate(s.name, 14)}
                        </text>
                        <text
                          x={lp.x}
                          y={lp.y + 9}
                          textAnchor="middle"
                          className="fill-white/95"
                          style={{ fontSize: 11, textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
                        >
                          {Math.round(s.collectionPct)}%
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Center hub (elliptical, sits on top) */}
              <ellipse cx={CX} cy={CY + DEPTH} rx={RX_IN - 2} ry={RY_IN - 2} fill={darken("#000000", 0)} opacity="0.15" />
              <ellipse cx={CX} cy={CY} rx={RX_IN - 4} ry={RY_IN - 4} fill="url(#hub-grad)" stroke="hsl(var(--border))" />

              {/* Center text */}
              <g pointerEvents="none">
                <text x={CX} y={CY - 34} textAnchor="middle" className="fill-muted-foreground uppercase" style={{ fontSize: 10, letterSpacing: 2 }}>
                  Company Performance
                </text>
                <text x={CX} y={CY - 8} textAnchor="middle" className="fill-foreground font-extrabold" style={{ fontSize: 26 }}>
                  {inr(displayedRevenue)}
                </text>
                <text x={CX} y={CY + 10} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 11 }}>
                  Total Revenue · {rows.length} {rows.length === 1 ? "Co." : "Cos."}
                </text>
                <text x={CX} y={CY + 28} textAnchor="middle" className="fill-emerald-500" style={{ fontSize: 11 }}>
                  {inr(totalCollected)} collected
                </text>
                <text x={CX} y={CY + 44} textAnchor="middle" className="fill-orange-500" style={{ fontSize: 11 }}>
                  {inr(totalPending)} pending
                </text>
              </g>
            </svg>

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

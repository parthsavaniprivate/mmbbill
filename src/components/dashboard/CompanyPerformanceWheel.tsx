import { useMemo, useState, useEffect, useRef, useLayoutEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCompany } from "@/lib/company";
import { Building2, TrendingUp, TrendingDown, Trophy, Activity } from "lucide-react";
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

const darken = (hex: string, amt: number) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amt))));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
};

function sparkPoints(seed: string, len = 12) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  let v = 0.5;
  for (let i = 0; i < len; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    const r = ((h >>> 16) & 0xffff) / 0xffff;
    v = Math.max(0.08, Math.min(0.95, v + (r - 0.5) * 0.35));
    out.push(v);
  }
  return out;
}

interface Segment extends CompanyRow {
  pending: number;
  pct: number;
  collectionPct: number;
  startAngle: number;
  endAngle: number;
  color: { base: string; glow: string };
  idx: number;
}

// Rectangle boundary intersection from center toward a target point.
function rectEdgePoint(cx: number, cy: number, w: number, h: number, tx: number, ty: number) {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hx = w / 2;
  const hy = h / 2;
  const sx = dx === 0 ? Infinity : hx / Math.abs(dx);
  const sy = dy === 0 ? Infinity : hy / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

// ==================================================================
// Wheel geometry (stage-local coordinates — svg fills the whole stage)
// ==================================================================
const STAGE_W = 1200;
const STAGE_H = 780;
const WHEEL_CX = STAGE_W / 2;
const WHEEL_CY = STAGE_H / 2 - 10;
// bumped ~11% and thicker donut
const RX_OUT = 250;
const TILT = 0.5;
const RY_OUT = RX_OUT * TILT;
const RX_IN = 128;
const RY_IN = RX_IN * TILT;
const DEPTH = 40;
const HOVER_LIFT = 12;
const HOVER_GROW = 10;

// Card size
const CARD_W = 288;
const CARD_H = 232;

export function CompanyPerformanceWheel({ rows }: { rows: CompanyRow[] }) {
  const { setSelected } = useCompany();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 30); return () => clearTimeout(t); }, []);

  const totalRevenue = rows.reduce((s, r) => s + r.total, 0);
  const totalCollected = rows.reduce((s, r) => s + r.collected, 0);
  const totalExpenses = rows.reduce((s, r) => s + r.expenses, 0);
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
  const totalInvoices = rows.reduce((s, r) => s + r.invoices, 0);
  const totalPending = Math.max(0, totalRevenue - totalCollected);
  const overallPct = totalRevenue > 0 ? (totalCollected / totalRevenue) * 100 : 0;
  const avgCollectionRate = rows.length
    ? rows.reduce((s, r) => s + (r.total > 0 ? (r.collected / r.total) * 100 : 0), 0) / rows.length
    : 0;
  const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const health = Math.max(0, Math.min(100, Math.round(overallPct * 0.65 + Math.max(0, margin) * 0.35)));
  const displayedRevenue = useCountUp(totalRevenue);
  const displayedCollected = useCountUp(totalCollected);
  const displayedPending = useCountUp(totalPending);

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
  const bestId = useMemo(() => {
    if (!segments.length) return null;
    return [...segments].sort((a, b) => b.collected - a.collected)[0].id;
  }, [segments]);

  // ---------------------- Card layout: directional to segment centroids ----------------------
  // Anchor cards on an ellipse sized so each card stays fully inside the stage.
  const CARD_RX = STAGE_W / 2 - CARD_W / 2 - 24; // ~284
  const CARD_RY = STAGE_H / 2 - CARD_H / 2 - 24; // ~254

  const cardLayout = useMemo(() => {
    if (!segments.length) return [] as Array<{
      seg: Segment;
      angle: number;      // 0 = top, clockwise, degrees
      cardX: number; cardY: number;   // stage coords, card center
      anchorX: number; anchorY: number; // stage coords, segment centroid on wheel
    }>;

    // Start with each card at its segment's mid-angle for perfect directional match.
    const raw = segments.map((seg) => {
      const mid = (seg.startAngle + seg.endAngle) / 2;
      return { seg, angle: ((mid % 360) + 360) % 360 };
    });

    // Space them apart to prevent overlap. Minimum angular gap depends on count.
    // With 8 cards evenly spaced that's 45° apart. Use that as the floor.
    const n = raw.length;
    const minGap = Math.max(38, Math.min(90, 360 / Math.max(4, n)));
    // Sort by desired angle, then apply an iterative constraint relaxation.
    const items = [...raw].sort((a, b) => a.angle - b.angle);
    for (let iter = 0; iter < 60; iter++) {
      let moved = false;
      for (let i = 0; i < items.length; i++) {
        const cur = items[i];
        const next = items[(i + 1) % items.length];
        let gap = next.angle - cur.angle;
        if (i === items.length - 1) gap += 360;
        if (gap < minGap) {
          const push = (minGap - gap) / 2;
          cur.angle -= push;
          next.angle += push;
          moved = true;
        }
      }
      if (!moved) break;
    }

    return items.map(({ seg, angle }) => {
      const rad = ((angle - 90) * Math.PI) / 180;
      const cardX = WHEEL_CX + CARD_RX * Math.cos(rad);
      const cardY = WHEEL_CY + CARD_RY * Math.sin(rad);
      // Anchor = centroid of the segment (mid-radius, mid-arc) on the top face of the wheel.
      const midR = (RX_OUT + RX_IN) / 2;
      const midRy = (RY_OUT + RY_IN) / 2;
      const segMid = (seg.startAngle + seg.endAngle) / 2;
      const anchor = ePolar(WHEEL_CX, WHEEL_CY, midR, midRy, segMid);
      return { seg, angle, cardX, cardY, anchorX: anchor.x, anchorY: anchor.y };
    });
  }, [segments, CARD_RX, CARD_RY]);

  return (
    <Card className="shadow-card border-border/60 overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          Company Performance
        </CardTitle>
        <CardDescription>Enterprise radial control center — hover a segment or card to explore</CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        {/* ================= DESKTOP / TABLET stage ================= */}
        <div className="hidden md:block relative w-full" style={{ aspectRatio: `${STAGE_W} / ${STAGE_H}` }}>
          {/* Single SVG for wheel + connectors — same coord system so anchors always line up */}
          <svg
            viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
            className="absolute inset-0 w-full h-full"
            role="img"
            aria-label="Company revenue distribution"
          >
            <WheelDefs segments={segments} />
            <WheelShapes
              segments={segments}
              hoverId={hoverId}
              setHoverId={setHoverId}
              onPick={setSelected}
              singleCompany={singleCompany}
            />
            <CenterHub
              totalCompanies={rows.length}
              totalInvoices={totalInvoices}
              totalRevenue={displayedRevenue}
              totalCollected={displayedCollected}
              totalPending={displayedPending}
              totalExpenses={totalExpenses}
              totalProfit={totalProfit}
              overallPct={overallPct}
              avgRate={avgCollectionRate}
              health={health}
            />

            {/* Segment labels — name + % inside the segment, wrapped, auto-sized */}
            <SegmentLabels segments={segments} hoverId={hoverId} />

            {/* Connectors from segment centroid to card edge */}
            <g>
              {cardLayout.map(({ seg, cardX, cardY, anchorX, anchorY }) => {
                const isHover = hoverId === seg.id;
                const edge = rectEdgePoint(cardX, cardY, CARD_W, CARD_H, anchorX, anchorY);
                // Curved path: control point midway pushed toward the wheel-normal direction.
                const midX = (anchorX + edge.x) / 2;
                const midY = (anchorY + edge.y) / 2;
                // Push perpendicular so curves don't cross the wheel
                const dx = edge.x - anchorX;
                const dy = edge.y - anchorY;
                const len = Math.hypot(dx, dy) || 1;
                const nx = -dy / len;
                const ny = dx / len;
                const bow = Math.min(40, len * 0.15);
                const cx1 = midX + nx * bow;
                const cy1 = midY + ny * bow;
                const d = `M ${anchorX} ${anchorY} Q ${cx1} ${cy1} ${edge.x} ${edge.y}`;
                return (
                  <g
                    key={`ln-${seg.id}`}
                    style={{
                      opacity: hoverId && !isHover ? 0.18 : 1,
                      transition: "opacity 250ms",
                      pointerEvents: "none",
                    }}
                  >
                    <path
                      d={d}
                      fill="none"
                      stroke={seg.color.base}
                      strokeOpacity={isHover ? 1 : 0.7}
                      strokeWidth={isHover ? 3 : 1.75}
                      strokeLinecap="round"
                      strokeDasharray="900"
                      strokeDashoffset={drawn ? 0 : 900}
                      filter="url(#line-glow)"
                      style={{
                        transition:
                          "stroke-dashoffset 1.2s ease-out, stroke-width 250ms, stroke-opacity 250ms",
                      }}
                    />
                    {/* Anchor dot on segment */}
                    <circle cx={anchorX} cy={anchorY} r={isHover ? 6 : 4.5} fill={seg.color.base}>
                      <animate attributeName="r" values={`${isHover ? 6 : 4.5};${isHover ? 9 : 6.5};${isHover ? 6 : 4.5}`} dur="2s" repeatCount="indefinite" />
                    </circle>
                    <circle cx={anchorX} cy={anchorY} r={isHover ? 10 : 7} fill={seg.color.base} opacity="0.25" />
                    {/* Endpoint dot on card edge */}
                    <circle cx={edge.x} cy={edge.y} r={isHover ? 5 : 3.5} fill={seg.color.base}
                      style={{ filter: `drop-shadow(0 0 6px ${seg.color.glow})` }} />
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Radial cards — absolutely positioned in the same stage coord system as SVG */}
          {cardLayout.map(({ seg, cardX, cardY }, i) => (
            <div
              key={`card-${seg.id}`}
              className="absolute animate-fade-in"
              style={{
                left: `${(cardX / STAGE_W) * 100}%`,
                top: `${(cardY / STAGE_H) * 100}%`,
                width: `${(CARD_W / STAGE_W) * 100}%`,
                transform: "translate(-50%, -50%)",
                animationDelay: `${150 + i * 80}ms`,
                animationFillMode: "backwards",
              }}
              onMouseEnter={() => setHoverId(seg.id)}
              onMouseLeave={() => setHoverId(null)}
            >
              <CompanyCard
                seg={seg}
                isHover={hoverId === seg.id}
                dim={!!hoverId && hoverId !== seg.id}
                isBest={seg.id === bestId}
                onClick={() => setSelected(seg.id)}
              />
            </div>
          ))}
        </div>

        {/* ================= MOBILE stage ================= */}
        <div className="md:hidden">
          <div className="grid grid-cols-3 gap-2 mb-4">
            <MobileKpi label="Revenue" value={inr(displayedRevenue)} tone="text-blue-500" />
            <MobileKpi label="Collected" value={inr(displayedCollected)} tone="text-emerald-500" />
            <MobileKpi label="Pending" value={inr(displayedPending)} tone="text-orange-500" />
            <MobileKpi label="Expenses" value={inr(totalExpenses)} tone="text-red-500" />
            <MobileKpi label="Profit" value={inr(totalProfit)} tone={totalProfit >= 0 ? "text-emerald-500" : "text-red-500"} />
            <MobileKpi label="Health" value={`${health}`} tone={health >= 70 ? "text-emerald-500" : health >= 40 ? "text-amber-500" : "text-red-500"} />
          </div>

          <div className="relative w-full mx-auto" style={{ maxWidth: 360 }}>
            <svg
              viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
              className="w-full h-auto"
              style={{ aspectRatio: `${STAGE_W} / ${STAGE_H}` }}
            >
              <WheelDefs segments={segments} />
              <WheelShapes
                segments={segments}
                hoverId={hoverId}
                setHoverId={setHoverId}
                onPick={setSelected}
                singleCompany={singleCompany}
              />
              <foreignObject x={WHEEL_CX - 140} y={WHEEL_CY - 55} width={280} height={110} style={{ pointerEvents: "none" }}>
                <div className="w-full h-full flex flex-col items-center justify-center text-center">
                  <p className="text-[16px] uppercase tracking-[0.2em] text-muted-foreground">Total Revenue</p>
                  <p className="font-extrabold text-foreground leading-none mt-1" style={{ fontSize: 34 }}>{inr(displayedRevenue)}</p>
                  <p className="text-[16px] text-primary font-semibold mt-2">{Math.round(overallPct)}% collected · {rows.length} {rows.length === 1 ? "co." : "cos."}</p>
                </div>
              </foreignObject>
            </svg>
          </div>

          <div className="mt-4 -mx-4 sm:-mx-6 px-4 sm:px-6 overflow-x-auto snap-x snap-mandatory flex gap-3 pb-2 scrollbar-none">
            {segments.map((seg, i) => (
              <div
                key={`m-card-${seg.id}`}
                className="snap-center shrink-0 animate-fade-in"
                style={{ width: 280, animationDelay: `${100 + i * 60}ms`, animationFillMode: "backwards" }}
                onClick={() => setHoverId(seg.id)}
              >
                <CompanyCard
                  seg={seg}
                  isHover={hoverId === seg.id}
                  dim={false}
                  isBest={seg.id === bestId}
                  onClick={() => setSelected(seg.id)}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground text-center">Swipe to browse companies →</p>
        </div>

        {/* ================= PREMIUM SUMMARY BAR ================= */}
        <div className="mt-6 pt-4 border-t border-border/60">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {segments.map((s) => {
              const isBest = s.id === bestId;
              const status = s.collectionPct >= 80 ? { label: "Excellent", tone: "text-emerald-500 bg-emerald-500/10" }
                : s.collectionPct >= 50 ? { label: "On track", tone: "text-blue-500 bg-blue-500/10" }
                : s.collectionPct >= 25 ? { label: "At risk", tone: "text-amber-500 bg-amber-500/10" }
                : { label: "Critical", tone: "text-red-500 bg-red-500/10" };
              return (
                <button
                  key={`sum-${s.id}`}
                  onMouseEnter={() => setHoverId(s.id)}
                  onMouseLeave={() => setHoverId(null)}
                  onClick={() => setSelected(s.id)}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all",
                    "border-border/60 hover:border-border hover:shadow-md bg-card/60",
                    hoverId === s.id && "shadow-lg -translate-y-0.5",
                  )}
                  style={hoverId === s.id ? { borderColor: `${s.color.base}88`, boxShadow: `0 8px 24px -12px ${s.color.glow}` } : undefined}
                >
                  <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ background: s.color.base, boxShadow: `0 0 10px ${s.color.glow}` }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-sm truncate">{s.name}</p>
                      {isBest && <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                      <span className="font-medium tabular-nums" style={{ color: s.color.base }}>{inr(s.total)}</span>
                      <span>·</span>
                      <span>{s.invoices} inv</span>
                      <span>·</span>
                      <span className={cn("tabular-nums", s.profit >= 0 ? "text-emerald-500" : "text-red-500")}>{inr(s.profit)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", status.tone)}>{status.label}</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: s.color.base }}>{Math.round(s.collectionPct)}%</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared SVG defs
// ---------------------------------------------------------------------------
function WheelDefs({ segments }: { segments: Segment[] }) {
  return (
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
      <filter id="hover-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="7" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <filter id="line-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
  );
}

// ---------------------------------------------------------------------------
// Wheel shapes (3D radial slices)
// ---------------------------------------------------------------------------
function WheelShapes({
  segments, hoverId, setHoverId, onPick, singleCompany,
}: {
  segments: Segment[];
  hoverId: string | null;
  setHoverId: (id: string | null) => void;
  onPick: (id: string) => void;
  singleCompany: boolean;
}) {
  const hoverSeg = segments.find((s) => s.id === hoverId) ?? null;

  const closeness = (mid: number) => {
    const m = ((mid % 360) + 360) % 360;
    return 1 - Math.cos((m * Math.PI) / 180) / 2 - 0.5;
  };
  const drawOrder = [...segments].sort((a, b) => {
    const ma = (a.startAngle + a.endAngle) / 2;
    const mb = (b.startAngle + b.endAngle) / 2;
    if (hoverId && a.id === hoverId) return 1;
    if (hoverId && b.id === hoverId) return -1;
    return closeness(ma) - closeness(mb);
  });

  return (
    <>
      {/* Ground shadow */}
      <ellipse
        cx={WHEEL_CX}
        cy={WHEEL_CY + DEPTH + 18}
        rx={RX_OUT * 0.95}
        ry={RY_OUT * 0.55}
        fill="#000"
        opacity={0.22}
        style={{ filter: "blur(16px)" }}
      />
      {drawOrder.map((s) => {
        const isHover = hoverSeg?.id === s.id;
        const lift = isHover ? HOVER_LIFT : 0;
        const grow = isHover ? HOVER_GROW : 0;
        const rxOut = RX_OUT + grow;
        const ryOut = RY_OUT + grow * TILT;
        const gap = singleCompany ? 0 : 0.6;
        const a1 = s.startAngle + gap;
        const a2 = Math.max(a1, s.endAngle - gap);

        const wallSteps = 24;
        const wallPts: string[] = [];
        for (let i = 0; i <= wallSteps; i++) {
          const ang = a1 + (a2 - a1) * (i / wallSteps);
          const p = ePolar(WHEEL_CX, WHEEL_CY - lift, rxOut, ryOut, ang);
          wallPts.push(`${p.x},${p.y}`);
        }
        for (let i = wallSteps; i >= 0; i--) {
          const ang = a1 + (a2 - a1) * (i / wallSteps);
          const p = ePolar(WHEEL_CX, WHEEL_CY - lift + DEPTH, rxOut, ryOut, ang);
          wallPts.push(`${p.x},${p.y}`);
        }

        const frontVisible = (() => {
          const norm = (x: number) => ((x % 360) + 360) % 360;
          const A = norm(a1), B = norm(a2);
          if (A <= B) return B > 90 && A < 270;
          return true;
        })();

        const topPath = eArcPath(WHEEL_CX, WHEEL_CY - lift, RX_IN, RY_IN, rxOut, ryOut, a1, a2);
        const dim = hoverSeg && !isHover ? 0.5 : 1;

        return (
          <g
            key={s.id}
            onMouseEnter={() => setHoverId(s.id)}
            onMouseLeave={() => setHoverId(null)}
            onClick={() => onPick(s.id)}
            style={{ cursor: "pointer", opacity: dim, transition: "opacity 250ms ease" }}
          >
            {frontVisible && (
              <polygon
                points={wallPts.join(" ")}
                fill={`url(#side-${s.id})`}
                stroke={darken(s.color.base, 0.5)}
                strokeOpacity="0.4"
                strokeWidth="0.5"
              />
            )}
            <path
              d={topPath}
              fill={`url(#grad-${s.id})`}
              stroke={darken(s.color.base, 0.25)}
              strokeOpacity={isHover ? 0.95 : 0.55}
              strokeWidth={isHover ? 2 : 0.9}
              filter={isHover ? "url(#hover-glow)" : undefined}
              style={{ transition: "filter 250ms ease" }}
            />
            <path d={topPath} fill="white" opacity="0.08" pointerEvents="none" />
          </g>
        );
      })}

      {/* Center hub */}
      <ellipse cx={WHEEL_CX} cy={WHEEL_CY + DEPTH} rx={RX_IN - 2} ry={RY_IN - 2} fill="#000" opacity="0.18" />
      <ellipse cx={WHEEL_CX} cy={WHEEL_CY} rx={RX_IN - 4} ry={RY_IN - 4} fill="url(#hub-grad)" stroke="hsl(var(--border))" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Segment labels: company short name + % inside each visible slice
// ---------------------------------------------------------------------------
function SegmentLabels({ segments, hoverId }: { segments: Segment[]; hoverId: string | null }) {
  return (
    <g style={{ pointerEvents: "none" }}>
      {segments.map((s) => {
        const sweep = s.endAngle - s.startAngle;
        if (sweep < 6) return null; // too thin, connector handles identity
        const mid = (s.startAngle + s.endAngle) / 2;
        const midR = (RX_OUT + RX_IN) / 2;
        const midRy = (RY_OUT + RY_IN) / 2;
        const p = ePolar(WHEEL_CX, WHEEL_CY, midR, midRy, mid);
        // Auto font size by sweep width
        const fontSize = Math.max(10, Math.min(14, 8 + sweep * 0.12));
        const boxW = Math.max(70, Math.min(120, 40 + sweep * 1.8));
        const boxH = 44;
        const dim = hoverId && hoverId !== s.id ? 0.5 : 1;
        return (
          <foreignObject
            key={`lbl-${s.id}`}
            x={p.x - boxW / 2}
            y={p.y - boxH / 2}
            width={boxW}
            height={boxH}
            style={{ opacity: dim, transition: "opacity 250ms" }}
          >
            <div className="w-full h-full flex flex-col items-center justify-center text-center leading-tight px-1">
              <p
                className="font-bold text-white overflow-hidden"
                style={{
                  fontSize,
                  textShadow: "0 1px 2px rgba(0,0,0,0.55)",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  wordBreak: "break-word",
                }}
              >
                {s.name}
              </p>
              <p className="font-extrabold text-white tabular-nums" style={{ fontSize: fontSize + 1, textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>
                {Math.round(s.pct)}%
              </p>
            </div>
          </foreignObject>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Center analytics hub
// ---------------------------------------------------------------------------
function CenterHub(props: {
  totalCompanies: number;
  totalInvoices: number;
  totalRevenue: number;
  totalCollected: number;
  totalPending: number;
  totalExpenses: number;
  totalProfit: number;
  overallPct: number;
  avgRate: number;
  health: number;
}) {
  const { totalCompanies, totalInvoices, totalRevenue, totalCollected, totalPending, totalExpenses, totalProfit, overallPct, avgRate, health } = props;
  const W = 230;
  const H = 214;
  return (
    <foreignObject x={WHEEL_CX - W / 2} y={WHEEL_CY - H / 2} width={W} height={H} style={{ pointerEvents: "none" }}>
      <div className="w-full h-full flex flex-col items-center justify-center text-center px-3 py-2">
        <p className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Company Overview</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {totalCompanies} {totalCompanies === 1 ? "company" : "companies"} · {totalInvoices} invoices
        </p>
        <p className="mt-1.5 font-extrabold text-foreground leading-none tabular-nums" style={{ fontSize: 20 }}>
          {inr(totalRevenue)}
        </p>
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Total Revenue</p>

        <div className="mt-2 w-full space-y-1 text-[10.5px]">
          <HubRow label="Collected" value={inr(totalCollected)} valueClass="text-emerald-500" />
          <HubRow label="Pending" value={inr(totalPending)} valueClass="text-orange-500" />
          <HubRow label="Expenses" value={inr(totalExpenses)} valueClass="text-red-500" />
          <HubRow label="Profit" value={inr(totalProfit)} valueClass={totalProfit >= 0 ? "text-emerald-500" : "text-red-500"} />
        </div>

        <div className="mt-2 w-full pt-1.5 border-t border-border/50 grid grid-cols-3 gap-1 text-[9.5px]">
          <div>
            <p className="text-muted-foreground uppercase tracking-wider text-[8px]">Collection</p>
            <p className="font-bold text-primary text-[11px]">{Math.round(overallPct)}%</p>
          </div>
          <div>
            <p className="text-muted-foreground uppercase tracking-wider text-[8px]">Avg</p>
            <p className="font-bold text-foreground text-[11px]">{Math.round(avgRate)}%</p>
          </div>
          <div>
            <p className="text-muted-foreground uppercase tracking-wider text-[8px]">Health</p>
            <p className={cn("font-bold text-[11px]", health >= 70 ? "text-emerald-500" : health >= 40 ? "text-amber-500" : "text-red-500")}>{health}</p>
          </div>
        </div>
      </div>
    </foreignObject>
  );
}

function HubRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums whitespace-nowrap", valueClass)}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Company card — bigger, better spacing, no truncation on currency
// ---------------------------------------------------------------------------
function CompanyCard({
  seg,
  isHover,
  dim,
  isBest,
  onClick,
}: {
  seg: Segment;
  isHover: boolean;
  dim: boolean;
  isBest: boolean;
  onClick: () => void;
}) {
  const spark = useMemo(() => sparkPoints(seg.id, 14), [seg.id]);
  const pct = Math.round(seg.collectionPct);
  const growthUp = seg.growthPct >= 0;
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-2xl border p-3.5 backdrop-blur-md transition-all duration-300",
        "bg-card/80 hover:bg-card/95",
        isHover ? "scale-[1.03] shadow-2xl" : "shadow-md",
        dim ? "opacity-40" : "opacity-100",
      )}
      style={{
        borderColor: isHover ? seg.color.base : `${seg.color.base}66`,
        boxShadow: isHover
          ? `0 12px 44px -8px ${seg.color.glow}, 0 0 0 1px ${seg.color.base}`
          : `0 4px 22px -8px ${seg.color.glow}`,
      }}
    >
      {/* header */}
      <div className="flex items-start gap-2.5 mb-2.5">
        <div
          className="w-10 h-10 rounded-xl grid place-items-center shrink-0"
          style={{ background: `${seg.color.base}22`, color: seg.color.base, boxShadow: `inset 0 0 0 1px ${seg.color.base}55` }}
        >
          <Building2 className="w-4 h-4" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="font-semibold text-sm leading-tight line-clamp-2">{seg.name}</p>
            {isBest && <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">{seg.invoices} invoices · updated just now</p>
        </div>
        <span
          className="text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0 tabular-nums"
          style={{ background: `${seg.color.base}22`, color: seg.color.base }}
        >
          {pct}%
        </span>
      </div>

      {/* metrics grid — one row per metric with breathing room, no truncation */}
      <div className="space-y-1 text-[11.5px] mb-2.5">
        <CardRow label="Revenue" value={inr(seg.total)} tone="text-blue-500" />
        <CardRow label="Collected" value={inr(seg.collected)} tone="text-emerald-500" />
        <CardRow label="Pending" value={inr(seg.pending)} tone="text-orange-500" />
        <CardRow label="Expenses" value={inr(seg.expenses)} tone="text-red-500" />
        <CardRow label="Profit" value={inr(seg.profit)} tone={seg.profit >= 0 ? "text-emerald-500" : "text-red-500"} />
      </div>

      {/* progress + sparkline + growth */}
      <div className="space-y-1.5">
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${seg.color.base}, ${seg.color.base}bb)` }}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <svg viewBox="0 0 100 24" className="h-6 flex-1" preserveAspectRatio="none">
            <polyline
              fill="none"
              stroke={seg.color.base}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={spark.map((v, i) => `${(i / (spark.length - 1)) * 100},${24 - v * 22}`).join(" ")}
            />
            <polyline
              fill={`${seg.color.base}22`}
              stroke="none"
              points={`0,24 ${spark.map((v, i) => `${(i / (spark.length - 1)) * 100},${24 - v * 22}`).join(" ")} 100,24`}
            />
          </svg>
          <span className={cn(
            "inline-flex items-center gap-0.5 text-[10.5px] font-semibold px-2 py-0.5 rounded-full shrink-0 tabular-nums",
            growthUp ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500",
          )}>
            {growthUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {growthUp ? "+" : ""}{Math.round(seg.growthPct)}%
          </span>
        </div>
      </div>
    </button>
  );
}

function CardRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground text-[10.5px] uppercase tracking-wider">{label}</span>
      <span className={cn("font-semibold tabular-nums whitespace-nowrap", tone)}>{value}</span>
    </div>
  );
}

function MobileKpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 backdrop-blur px-2 py-1.5 min-w-0">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground truncate">{label}</p>
      <p className={cn("text-xs font-bold tabular-nums truncate", tone)}>{value}</p>
    </div>
  );
}

// Silence unused-import lint in case tree-shaking flags them
void useLayoutEffect;

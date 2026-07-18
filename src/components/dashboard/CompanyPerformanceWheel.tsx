import { useMemo, useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCompany } from "@/lib/company";
import { Building2, TrendingUp, TrendingDown, Trophy, Activity, Clock } from "lucide-react";
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

// Deterministic small sparkline from a string seed (visual flourish only,
// derived from existing data — no extra queries).
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

// Ensure card angles have a minimum angular gap while staying close to segment midpoints.
function distributeAngles(rawAngles: number[], minGapDeg = 34): number[] {
  const n = rawAngles.length;
  if (n <= 1) return rawAngles.slice();
  const norm = (x: number) => ((x % 360) + 360) % 360;
  const items = rawAngles.map((a, i) => ({ a: norm(a), i }));
  items.sort((x, y) => x.a - y.a);
  const gap = Math.min(minGapDeg, 360 / n);
  // Forward pass
  for (let k = 1; k < n; k++) {
    if (items[k].a - items[k - 1].a < gap) items[k].a = items[k - 1].a + gap;
  }
  // Wrap fix
  const wrap = items[0].a + 360 - items[n - 1].a;
  if (wrap < gap) {
    const shift = (gap - wrap) / 2;
    for (let k = 0; k < n; k++) items[k].a -= shift;
  }
  const out = new Array<number>(n);
  for (const { a, i } of items) out[i] = norm(a);
  return out;
}

// Intersect a ray from card center outward with the card's rectangle.
// Returns the edge point (in stage coords) closest to the anchor.
function rectEdgePoint(cx: number, cy: number, w: number, h: number, tx: number, ty: number) {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hw = w / 2;
  const hh = h / 2;
  const sx = dx === 0 ? Infinity : hw / Math.abs(dx);
  const sy = dy === 0 ? Infinity : hh / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
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

export function CompanyPerformanceWheel({ rows }: { rows: CompanyRow[] }) {
  const { setSelected } = useCompany();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 30); return () => clearTimeout(t); }, []);

  const totalRevenue = rows.reduce((s, r) => s + r.total, 0);
  const totalCollected = rows.reduce((s, r) => s + r.collected, 0);
  const totalExpenses = rows.reduce((s, r) => s + r.expenses, 0);
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
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

  // ---------------------- 3D wheel geometry (SVG-local coords) ----------------------
  // ~10% larger diameter, thicker ring, deeper 3D.
  const SIZE_W = 680;
  const SIZE_H = 500;
  const CX = SIZE_W / 2;
  const CY = SIZE_H / 2 - 22;
  const RX_OUT = 244;
  const TILT = 0.5;
  const RY_OUT = RX_OUT * TILT;
  const RX_IN = 108;
  const RY_IN = RX_IN * TILT;
  const DEPTH = 44;
  const HOVER_LIFT = 12;
  const HOVER_GROW = 12;

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

  // ---------------------- Radial card layout (stage coords) ----------------------
  const STAGE_W = 1240;
  const STAGE_H = 820;
  const STAGE_CX = STAGE_W / 2;
  const STAGE_CY = STAGE_H / 2;
  // Wheel is drawn 1:1 into stage (its SVG is 680×500 stage px, centered).
  const CARD_W = 290;
  const CARD_H = 250;
  const CARD_RX = 480;
  const CARD_RY = 335;

  const cardLayout = useMemo(() => {
    if (segments.length === 0) return [] as Array<{
      seg: Segment; angle: number; x: number; y: number; anchor: { x: number; y: number };
    }>;
    // Card angle = segment midpoint (0° = top, clockwise).
    const rawMids = segments.map((s) => (s.startAngle + s.endAngle) / 2);
    const spread = distributeAngles(rawMids, Math.min(52, 360 / segments.length));
    return segments.map((seg, i) => {
      const angle = spread[i]; // 0 = top, clockwise
      const rad = ((angle - 90) * Math.PI) / 180; // convert to standard math (0 = right)
      const x = STAGE_CX + CARD_RX * Math.cos(rad);
      const y = STAGE_CY + CARD_RY * Math.sin(rad);
      // anchor = MIDDLE of the segment's radial band (in stage coords)
      const midR_x = (RX_IN + RX_OUT) / 2;
      const midR_y = (RY_IN + RY_OUT) / 2;
      const svgMid = ePolar(CX, CY, midR_x, midR_y, rawMids[i]);
      const ax = STAGE_CX + (svgMid.x - CX);
      const ay = STAGE_CY + (svgMid.y - CY);
      return { seg, angle, x, y, anchor: { x: ax, y: ay } };
    });
  }, [segments, CX, CY, RX_IN, RX_OUT, RY_IN, RY_OUT]);

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
          {/* Connector SVG overlay */}
          <svg
            viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
            className="absolute inset-0 w-full h-full pointer-events-none"
            aria-hidden
          >
            <defs>
              <filter id="line-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {cardLayout.map(({ seg, x, y, anchor }) => {
              const isHover = hoverId === seg.id;
              // End point = card edge closest to the segment anchor
              const edge = rectEdgePoint(x, y, CARD_W, CARD_H, anchor.x, anchor.y);
              // Curved path: control point pulled outward from wheel toward card
              const dx = edge.x - anchor.x;
              const dy = edge.y - anchor.y;
              const midX = (anchor.x + edge.x) / 2;
              const midY = (anchor.y + edge.y) / 2;
              const len = Math.hypot(dx, dy) || 1;
              // perpendicular offset scaled by distance for a graceful curve
              const nx = -dy / len;
              const ny = dx / len;
              // outward push: away from center
              const away_x = midX - STAGE_CX;
              const away_y = midY - STAGE_CY;
              const awayLen = Math.hypot(away_x, away_y) || 1;
              const cx1 = midX + (away_x / awayLen) * 32 + nx * 6;
              const cy1 = midY + (away_y / awayLen) * 32 + ny * 6;
              const d = `M ${anchor.x} ${anchor.y} Q ${cx1} ${cy1} ${edge.x} ${edge.y}`;
              return (
                <g key={`ln-${seg.id}`} style={{ opacity: hoverId && !isHover ? 0.18 : 1, transition: "opacity 250ms" }}>
                  <path
                    d={d}
                    fill="none"
                    stroke={seg.color.base}
                    strokeOpacity={isHover ? 0.95 : 0.6}
                    strokeWidth={isHover ? 3 : 1.75}
                    strokeLinecap="round"
                    strokeDasharray="800"
                    strokeDashoffset={drawn ? 0 : 800}
                    filter="url(#line-glow)"
                    style={{
                      transition: "stroke-dashoffset 1.2s ease-out, stroke-width 250ms, stroke-opacity 250ms",
                    }}
                  />
                  {/* pulsing dot at segment anchor */}
                  <circle cx={anchor.x} cy={anchor.y} r={isHover ? 7 : 5} fill={seg.color.base} filter="url(#line-glow)">
                    <animate attributeName="r" values={`${isHover ? 7 : 5};${isHover ? 10 : 7};${isHover ? 7 : 5}`} dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="1;0.55;1" dur="2s" repeatCount="indefinite" />
                  </circle>
                  {/* solid dot at card edge */}
                  <circle cx={edge.x} cy={edge.y} r={isHover ? 5 : 3.5} fill={seg.color.base} stroke="hsl(var(--card))" strokeWidth="1.5" />
                </g>
              );
            })}
          </svg>

          {/* Center wheel */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ width: `${(SIZE_W / STAGE_W) * 100}%` }}
          >
            <Wheel
              segments={segments}
              drawOrder={drawOrder}
              hoverId={hoverId}
              setHoverId={setHoverId}
              onPick={setSelected}
              SIZE_W={SIZE_W} SIZE_H={SIZE_H}
              CX={CX} CY={CY}
              RX_OUT={RX_OUT} RY_OUT={RY_OUT} RX_IN={RX_IN} RY_IN={RY_IN}
              TILT={TILT} DEPTH={DEPTH} HOVER_LIFT={HOVER_LIFT} HOVER_GROW={HOVER_GROW}
              singleCompany={singleCompany} drawn={drawn}
              showLabels
              centerContent={
                <CenterHub
                  totalCompanies={rows.length}
                  totalRevenue={displayedRevenue}
                  totalCollected={displayedCollected}
                  totalPending={displayedPending}
                  totalExpenses={totalExpenses}
                  totalProfit={totalProfit}
                  overallPct={overallPct}
                  avgRate={avgCollectionRate}
                  health={health}
                  CX={CX} CY={CY}
                />
              }
            />
          </div>

          {/* Radial cards */}
          {cardLayout.map(({ seg, x, y }, i) => (
            <div
              key={`card-${seg.id}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 animate-fade-in"
              style={{
                left: `${(x / STAGE_W) * 100}%`,
                top: `${(y / STAGE_H) * 100}%`,
                width: `${(CARD_W / STAGE_W) * 100}%`,
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
            <Wheel
              segments={segments}
              drawOrder={drawOrder}
              hoverId={hoverId}
              setHoverId={setHoverId}
              onPick={setSelected}
              SIZE_W={SIZE_W} SIZE_H={SIZE_H}
              CX={CX} CY={CY}
              RX_OUT={RX_OUT} RY_OUT={RY_OUT} RX_IN={RX_IN} RY_IN={RY_IN}
              TILT={TILT} DEPTH={DEPTH} HOVER_LIFT={HOVER_LIFT} HOVER_GROW={HOVER_GROW}
              singleCompany={singleCompany} drawn={drawn}
              showLabels={false}
              centerContent={
                <foreignObject x={CX - 110} y={CY - 46} width={220} height={92} style={{ pointerEvents: "none" }}>
                  <div className="w-full h-full flex flex-col items-center justify-center text-center">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Total Revenue</p>
                    <p className="font-extrabold text-foreground leading-none mt-1" style={{ fontSize: 22 }}>{inr(displayedRevenue)}</p>
                    <p className="text-[10px] text-primary font-semibold mt-1.5">{Math.round(overallPct)}% collected · {rows.length} {rows.length === 1 ? "co." : "cos."}</p>
                  </div>
                </foreignObject>
              }
            />
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
        <div className="mt-8 pt-5 border-t border-border/60">
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
                    "group flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-all",
                    "border-border/60 hover:border-border hover:shadow-md bg-card/60",
                    hoverId === s.id && "shadow-lg -translate-y-0.5",
                  )}
                  style={hoverId === s.id ? { borderColor: `${s.color.base}88` } : undefined}
                >
                  <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ background: s.color.base, boxShadow: `0 0 10px ${s.color.glow}` }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-sm truncate">{s.name}</p>
                      {isBest && <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground whitespace-nowrap">
                      <span className="font-medium text-blue-500 tabular-nums">{inr(s.total)}</span>
                      <span>·</span>
                      <span>{s.invoices} inv</span>
                      <span>·</span>
                      <span className={cn("tabular-nums", s.profit >= 0 ? "text-emerald-500" : "text-red-500")}>{inr(s.profit)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", status.tone)}>{status.label}</span>
                    <span className="text-xs font-bold tabular-nums" style={{ color: s.color.base }}>{Math.round(s.collectionPct)}%</span>
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
// Center analytics hub
// ---------------------------------------------------------------------------
function CenterHub(props: {
  totalCompanies: number;
  totalRevenue: number;
  totalCollected: number;
  totalPending: number;
  totalExpenses: number;
  totalProfit: number;
  overallPct: number;
  avgRate: number;
  health: number;
  CX: number; CY: number;
}) {
  const { totalCompanies, totalRevenue, totalCollected, totalPending, totalExpenses, totalProfit, overallPct, avgRate, health, CX, CY } = props;
  const W = 210;
  const H = 210;
  return (
    <foreignObject x={CX - W / 2} y={CY - H / 2} width={W} height={H} style={{ pointerEvents: "none" }}>
      <div className="w-full h-full flex flex-col items-center justify-center text-center px-3 py-2">
        <p className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Company Overview</p>
        <p className="mt-1 text-[10px] text-muted-foreground">{totalCompanies} {totalCompanies === 1 ? "company" : "companies"}</p>
        <p className="mt-2 font-extrabold text-foreground leading-none tabular-nums" style={{ fontSize: 20 }}>
          {inr(totalRevenue)}
        </p>
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-1">Total Revenue</p>

        <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] w-full">
          <HubRow label="Collected" value={inr(totalCollected)} tone="text-emerald-500" align="left" />
          <HubRow label="Pending" value={inr(totalPending)} tone="text-orange-500" align="right" />
          <HubRow label="Expenses" value={inr(totalExpenses)} tone="text-red-500" align="left" />
          <HubRow label="Profit" value={inr(totalProfit)} tone={totalProfit >= 0 ? "text-emerald-500" : "text-red-500"} align="right" />
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-2 text-[10px] w-full pt-2 border-t border-border/50">
          <div className="text-center">
            <p className="text-muted-foreground text-[8px] uppercase tracking-wider">Coll.</p>
            <p className="font-bold text-primary tabular-nums">{Math.round(overallPct)}%</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground text-[8px] uppercase tracking-wider">Avg</p>
            <p className="font-bold text-foreground tabular-nums">{Math.round(avgRate)}%</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground text-[8px] uppercase tracking-wider">Health</p>
            <p className={cn("font-bold tabular-nums", health >= 70 ? "text-emerald-500" : health >= 40 ? "text-amber-500" : "text-red-500")}>{health}</p>
          </div>
        </div>
      </div>
    </foreignObject>
  );
}

function HubRow({ label, value, tone, align }: { label: string; value: string; tone?: string; align: "left" | "right" }) {
  return (
    <div className={cn(align === "left" ? "text-left" : "text-right")}>
      <p className="text-muted-foreground text-[8.5px] uppercase tracking-wider">{label}</p>
      <p className={cn("font-semibold tabular-nums whitespace-nowrap", tone)} style={{ fontSize: 10.5 }}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Company card
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
        "w-full text-left rounded-2xl border p-4 backdrop-blur-md transition-all duration-300",
        "bg-card/75 hover:bg-card/95",
        isHover ? "scale-[1.03] shadow-2xl" : "shadow-md",
        dim ? "opacity-40" : "opacity-100",
      )}
      style={{
        borderColor: isHover ? seg.color.base : `${seg.color.base}55`,
        boxShadow: isHover
          ? `0 12px 40px -8px ${seg.color.glow}, 0 0 0 1px ${seg.color.base}`
          : `0 4px 22px -10px ${seg.color.glow}`,
      }}
    >
      {/* header */}
      <div className="flex items-start gap-2.5 mb-3">
        <div
          className="w-10 h-10 rounded-xl grid place-items-center shrink-0"
          style={{ background: `${seg.color.base}22`, color: seg.color.base, boxShadow: `inset 0 0 0 1px ${seg.color.base}44` }}
        >
          <Building2 className="w-5 h-5" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-sm leading-tight line-clamp-2 break-words">{seg.name}</p>
            {isBest && <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" /> updated just now
          </p>
        </div>
        <span
          className="text-[11px] font-bold px-1.5 py-0.5 rounded-md shrink-0 tabular-nums"
          style={{ background: `${seg.color.base}22`, color: seg.color.base }}
        >
          {pct}%
        </span>
      </div>

      {/* metrics grid — evenly spaced rows */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] mb-3">
        <Row label="Invoices" value={String(seg.invoices)} />
        <Row label="Revenue" value={inr(seg.total)} tone="text-blue-500" />
        <Row label="Collected" value={inr(seg.collected)} tone="text-emerald-500" />
        <Row label="Pending" value={inr(seg.pending)} tone="text-orange-500" />
        <Row label="Expenses" value={inr(seg.expenses)} tone="text-red-500" />
        <Row label="Profit" value={inr(seg.profit)} tone={seg.profit >= 0 ? "text-emerald-500" : "text-red-500"} />
      </div>

      {/* collection % bar */}
      <div className="mb-2">
        <div className="flex items-center justify-between text-[9.5px] text-muted-foreground uppercase tracking-wider mb-1">
          <span>Collection</span>
          <span className="tabular-nums font-semibold" style={{ color: seg.color.base }}>{pct}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, pct)}%`, background: `linear-gradient(90deg, ${seg.color.base}, ${seg.color.base}bb)` }}
          />
        </div>
      </div>

      {/* sparkline + monthly growth */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">Trend</p>
          <svg viewBox="0 0 100 26" className="h-6 w-full" preserveAspectRatio="none">
            <polyline
              fill="none"
              stroke={seg.color.base}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={spark.map((v, i) => `${(i / (spark.length - 1)) * 100},${26 - v * 24}`).join(" ")}
            />
            <polyline
              fill={`${seg.color.base}22`}
              stroke="none"
              points={`0,26 ${spark.map((v, i) => `${(i / (spark.length - 1)) * 100},${26 - v * 24}`).join(" ")} 100,26`}
            />
          </svg>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">MoM</p>
          <span className={cn(
            "inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full tabular-nums",
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

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-1.5 min-w-0">
      <span className="text-muted-foreground text-[9.5px] uppercase tracking-wider shrink-0">{label}</span>
      <span className={cn("font-semibold tabular-nums whitespace-nowrap text-[11px]", tone)}>{value}</span>
    </div>
  );
}

function MobileKpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 backdrop-blur px-2 py-1.5 min-w-0">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground truncate">{label}</p>
      <p className={cn("text-xs font-bold tabular-nums whitespace-nowrap overflow-hidden text-ellipsis", tone)}>{value}</p>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Wheel (3D radial chart)
// ---------------------------------------------------------------------------
function Wheel(props: {
  segments: Segment[];
  drawOrder: Segment[];
  hoverId: string | null;
  setHoverId: (id: string | null) => void;
  onPick: (id: string) => void;
  SIZE_W: number; SIZE_H: number;
  CX: number; CY: number;
  RX_OUT: number; RY_OUT: number; RX_IN: number; RY_IN: number;
  TILT: number; DEPTH: number; HOVER_LIFT: number; HOVER_GROW: number;
  singleCompany: boolean; drawn: boolean;
  centerContent: React.ReactNode;
  showLabels?: boolean;
}) {
  const {
    segments, drawOrder, hoverId, setHoverId, onPick,
    SIZE_W, SIZE_H, CX, CY, RX_OUT, RY_OUT, RX_IN, RY_IN,
    TILT, DEPTH, HOVER_LIFT, HOVER_GROW, singleCompany, drawn, centerContent, showLabels,
  } = props;
  const hoverSeg = segments.find((s) => s.id === hoverId) ?? null;

  return (
    <svg
      viewBox={`0 0 ${SIZE_W} ${SIZE_H}`}
      className={cn("w-full h-auto transition-opacity duration-700", drawn ? "opacity-100" : "opacity-0")}
      role="img"
      aria-label="Company revenue distribution"
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
        <filter id="hover-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <ellipse
        cx={CX}
        cy={CY + DEPTH + 16}
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
          const p = ePolar(CX, CY - lift, rxOut, ryOut, ang);
          wallPts.push(`${p.x},${p.y}`);
        }
        for (let i = wallSteps; i >= 0; i--) {
          const ang = a1 + (a2 - a1) * (i / wallSteps);
          const p = ePolar(CX, CY - lift + DEPTH, rxOut, ryOut, ang);
          wallPts.push(`${p.x},${p.y}`);
        }

        const frontVisible = (() => {
          const norm = (x: number) => ((x % 360) + 360) % 360;
          const A = norm(a1), B = norm(a2);
          if (A <= B) return B > 90 && A < 270;
          return true;
        })();

        const innerWallPts: string[] = [];
        for (let i = 0; i <= wallSteps; i++) {
          const ang = a1 + (a2 - a1) * (i / wallSteps);
          const p = ePolar(CX, CY - lift, RX_IN, RY_IN, ang);
          innerWallPts.push(`${p.x},${p.y}`);
        }
        for (let i = wallSteps; i >= 0; i--) {
          const ang = a1 + (a2 - a1) * (i / wallSteps);
          const p = ePolar(CX, CY - lift + DEPTH, RX_IN, RY_IN, ang);
          innerWallPts.push(`${p.x},${p.y}`);
        }

        const topPath = eArcPath(CX, CY - lift, RX_IN, RY_IN, rxOut, ryOut, a1, a2);
        const dim = hoverSeg && !isHover ? 0.5 : 1;

        // ---- In-segment label (name + percentage) ----
        const midAngle = (a1 + a2) / 2;
        const midR_x = (RX_IN + rxOut) / 2;
        const midR_y = (RY_IN + ryOut) / 2;
        const lbl = ePolar(CX, CY - lift, midR_x, midR_y, midAngle);
        // available arc length at mid radius (approx)
        const sweep = Math.abs(a2 - a1);
        const arcLen = (sweep * Math.PI / 180) * midR_x;
        const ringThick = rxOut - RX_IN;
        // pick font size that fits both dimensions
        const nameFont = Math.max(8.5, Math.min(13, Math.min(arcLen / Math.max(6, s.name.length * 0.55), ringThick * 0.36)));
        const pctFont = Math.max(8, Math.min(11, nameFont * 0.85));
        const showLabel = showLabels && arcLen > 32 && ringThick > 22;
        // wrap name into two lines if long and narrow
        let line1 = s.name;
        let line2 = "";
        const approxCharW = nameFont * 0.55;
        const maxChars = Math.max(4, Math.floor(arcLen / approxCharW) - 1);
        if (s.name.length > maxChars) {
          const parts = s.name.split(" ");
          if (parts.length > 1) {
            let acc = "";
            let i = 0;
            while (i < parts.length && (acc + " " + parts[i]).trim().length <= maxChars) {
              acc = (acc + " " + parts[i]).trim();
              i++;
            }
            line1 = acc || parts[0];
            line2 = parts.slice(i).join(" ");
            if (line2.length > maxChars) line2 = line2.slice(0, maxChars - 1) + "…";
          } else {
            line1 = s.name.slice(0, maxChars - 1) + "…";
          }
        }

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
            <polygon points={innerWallPts.join(" ")} fill={darken(s.color.base, 0.55)} opacity="0.85" />
            {!singleCompany && (() => {
              const oT = ePolar(CX, CY - lift, rxOut, ryOut, a1);
              const iT = ePolar(CX, CY - lift, RX_IN, RY_IN, a1);
              const oB = ePolar(CX, CY - lift + DEPTH, rxOut, ryOut, a1);
              const iB = ePolar(CX, CY - lift + DEPTH, RX_IN, RY_IN, a1);
              const oT2 = ePolar(CX, CY - lift, rxOut, ryOut, a2);
              const iT2 = ePolar(CX, CY - lift, RX_IN, RY_IN, a2);
              const oB2 = ePolar(CX, CY - lift + DEPTH, rxOut, ryOut, a2);
              const iB2 = ePolar(CX, CY - lift + DEPTH, RX_IN, RY_IN, a2);
              return (
                <>
                  <polygon points={`${oT.x},${oT.y} ${iT.x},${iT.y} ${iB.x},${iB.y} ${oB.x},${oB.y}`} fill={darken(s.color.base, 0.5)} opacity="0.75" />
                  <polygon points={`${oT2.x},${oT2.y} ${iT2.x},${iT2.y} ${iB2.x},${iB2.y} ${oB2.x},${oB2.y}`} fill={darken(s.color.base, 0.5)} opacity="0.75" />
                </>
              );
            })()}
            <path
              d={topPath}
              fill={`url(#grad-${s.id})`}
              stroke={darken(s.color.base, 0.25)}
              strokeOpacity={isHover ? 0.95 : 0.55}
              strokeWidth={isHover ? 1.8 : 0.85}
              filter={isHover ? "url(#hover-glow)" : undefined}
              style={{ transition: "filter 250ms ease" }}
            />
            <path d={topPath} fill="white" opacity="0.08" pointerEvents="none" />

            {showLabel && (
              <g pointerEvents="none" style={{ mixBlendMode: "normal" }}>
                {line2 ? (
                  <>
                    <text
                      x={lbl.x} y={lbl.y - nameFont * 0.55}
                      textAnchor="middle" fontSize={nameFont}
                      fontWeight={700}
                      fill="#fff"
                      style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.55)", strokeWidth: 2.5, strokeLinejoin: "round" }}
                    >{line1}</text>
                    <text
                      x={lbl.x} y={lbl.y + nameFont * 0.45}
                      textAnchor="middle" fontSize={nameFont}
                      fontWeight={700}
                      fill="#fff"
                      style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.55)", strokeWidth: 2.5, strokeLinejoin: "round" }}
                    >{line2}</text>
                    <text
                      x={lbl.x} y={lbl.y + nameFont * 0.45 + pctFont + 2}
                      textAnchor="middle" fontSize={pctFont}
                      fontWeight={800}
                      fill="#fff" opacity={0.95}
                      style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.55)", strokeWidth: 2, strokeLinejoin: "round" }}
                    >{Math.round(s.collectionPct)}%</text>
                  </>
                ) : (
                  <>
                    <text
                      x={lbl.x} y={lbl.y - 2}
                      textAnchor="middle" fontSize={nameFont}
                      fontWeight={700}
                      fill="#fff"
                      style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.55)", strokeWidth: 2.5, strokeLinejoin: "round" }}
                    >{line1}</text>
                    <text
                      x={lbl.x} y={lbl.y + pctFont + 2}
                      textAnchor="middle" fontSize={pctFont}
                      fontWeight={800}
                      fill="#fff" opacity={0.95}
                      style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.55)", strokeWidth: 2, strokeLinejoin: "round" }}
                    >{Math.round(s.collectionPct)}%</text>
                  </>
                )}
              </g>
            )}
          </g>
        );
      })}

      {/* Center hub */}
      <ellipse cx={CX} cy={CY + DEPTH} rx={RX_IN - 2} ry={RY_IN - 2} fill="#000" opacity="0.15" />
      <ellipse cx={CX} cy={CY} rx={RX_IN - 4} ry={RY_IN - 4} fill="url(#hub-grad)" stroke="hsl(var(--border))" />

      {centerContent}
    </svg>
  );
}

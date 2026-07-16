## Goal

Upgrade `src/routes/_authenticated/dashboard.tsx` into a premium SaaS "Business Control Center". Keep every existing calculation, query (`useAll`), and dependency (InvoiceTimeline, company filter, date range). This is pure UI + light data derivations from data already fetched.

## Scope guardrails

- No DB schema changes, no new tables, no new server functions.
- Reuse `useAll()` — do NOT add new network calls. All new widgets derive from `invoices/payments/expenses/clients/packages/companies/recurring/quotations/salarySlips` already in memory.
- Header, company selector, date range presets, `InvoiceTimeline`, existing chart — all preserved.
- Other modules (Collection Map, Invoices, etc.) untouched.

## New dashboard structure (top → bottom)

1. **Header row** (existing) — title, company selector, date presets, custom range.
2. **KPI grid (6 cards)** — replace current 3 hero cards:
   - Total Revenue (billed in range) · Pending Collection (all-time overdue+due) · Collected This Month · Total Expenses · Company Balance · Active Clients.
   - Each card: value, MoM delta % + trend arrow, small icon, `Link` to related module (`/invoices`, `/payments`, `/expenses`, `/clients`, `/billing`).
   - MoM delta computed from previous equivalent range using existing arrays.
3. **Business Health + Collection Performance** (2-col):
   - **Health Score card**: circular SVG progress (0–100), computed from 5 sub-scores (pending %, collection success %, cash flow sign, overdue %, MoM growth). Show sub-score bars below.
   - **Today's Collection card**: target (from `loadTarget` in `lib/collection/status.ts` reusing existing localStorage), collected today, remaining, % progress bar, ETA (linear extrapolation).
4. **Monthly Analytics chart** (existing recharts) — keep, add a granularity switch (Weekly/Monthly/Quarterly/Yearly) that regroups `chartData` client-side.
5. **Invoice Timeline** (existing component) — kept as-is.
6. **3-column row**:
   - **Recent Activity timeline** — merged feed from invoices/payments/expenses/clients sorted by created_at/date, last 15 items with icon+timestamp.
   - **Smart Insights panel** — rule-based bullets (pending MoM delta, N invoices going overdue in 7d, top paying client, highest pending client, profit trend).
   - **Collection Map preview** — static card (no map render): counts of overdue/dueToday markers, total pending, "Open Collection Map" button linking to `/collection-map`. Avoids Google Maps re-init cost.
7. **Pending Collection table** — top 10 unpaid invoices sorted by days overdue: Client · Invoice # · Amount · Due · Days Overdue (red pill if >0) · Priority (High/Med/Low from overdue days) · Actions (View / Remind). Reuses invoice+client data already loaded.
8. **Company Performance** (only when `isAll`) — one row per company: invoices count, collected, expenses, profit, MoM growth %.
9. **Bottom widgets** (4-col grid): Recent Clients · Upcoming Due (next 7d) · Recent Expenses · Recent Payments — each a compact list of 5.
10. **Quick Actions FAB** — bottom-right floating group: New Invoice, New Client, Add Expense, Record Payment, Generate Report. Uses existing routes.

## Visual system

- Reuse existing tokens in `src/styles.css` (OKLCH). No new colors.
- Cards: `bg-card/60 backdrop-blur border-border/60 shadow-card` with subtle gradient rings per accent — extend the existing `HeroKpi` styling pattern.
- Animations: `animate-fade-in` on mount, `hover-scale` on KPI cards, CSS transitions on progress bars. No new animation libraries.
- Fully responsive: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6` for KPIs; sections stack on mobile with `<details>` collapsibles where noted.

## File plan

- `src/routes/_authenticated/dashboard.tsx` — restructure JSX, add derivations. Keep `useAll`, range logic, existing math untouched.
- `src/components/dashboard/HealthScore.tsx` — new, pure component (props in).
- `src/components/dashboard/CollectionToday.tsx` — new.
- `src/components/dashboard/RecentActivity.tsx` — new.
- `src/components/dashboard/SmartInsights.tsx` — new.
- `src/components/dashboard/PendingTable.tsx` — new.
- `src/components/dashboard/CompanyPerformance.tsx` — new.
- `src/components/dashboard/QuickActionsFab.tsx` — new.
- `src/components/dashboard/MapPreview.tsx` — new (static, no maps SDK).

Existing `HeroKpi`/`MiniKpi` helpers reused for consistency; a new `KpiCard` variant added inline for the 6-card grid with delta indicators.

## Out of scope (per your instructions)

- No AI insights (rule-based only).
- No changes to Collection Map, Invoices, Payments, Expenses modules.
- No new backend / RPC / migrations.

## Estimated size

~8 new small components (~80–150 LOC each) + dashboard route rewrite. Single-turn implementable, no dependency installs.

---

Approve and I'll implement in one pass. If you want a lighter first cut (e.g. skip Company Performance or Map Preview), tell me which sections to drop.
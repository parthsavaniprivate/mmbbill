# Collection Command Center — Redesign Plan

Transform `/collection-map` from a single map view into a full command center: KPI strip on top, filter/search bar, split view of Map + synchronized Collection List, and a rich side panel for each client. All existing data (clients, invoices, payments, geocoding, company scoping) is reused — this is a UX/structure redesign, not a data-model change.

## 1. Page Layout (mobile-first)

```text
┌───────────────────────────────────────────────────────────┐
│ Header: Title + date + "Today's Target" progress ring     │
├───────────────────────────────────────────────────────────┤
│ KPI Strip (horizontal scroll on mobile, grid on desktop)  │
├───────────────────────────────────────────────────────────┤
│ Filter + Search Bar (collapsible on mobile)               │
├───────────────────────────────────┬───────────────────────┤
│                                   │                       │
│   MAP (Google Maps)               │  Collection List      │
│   markers color-coded             │  (synced w/ map)      │
│                                   │                       │
│                                   │  click row → focus    │
│                                   │  marker + open panel  │
└───────────────────────────────────┴───────────────────────┘
   Slide-in Side Panel (right, over list on <lg screens)
```

- Desktop (≥lg): 2-col split, map 60% / list 40%.
- Tablet (md): map full width, list becomes a bottom drawer toggle.
- Mobile (<md): tabs — [Map] [List], side panel becomes a full bottom sheet.
- Reuse `Card`, `Sheet`, `Tabs`, `Badge`, `Button` from shadcn.

## 2. KPI Cards

Six cards on a horizontally scrollable strip on mobile, 3×2 or 6×1 grid on desktop.

| Card | Source |
|---|---|
| Total Pending Amount | sum of `invoices.total - amount_paid` where status ≠ paid/cancelled |
| Today's Collection Target | user-settable (localStorage per user+company) with default = sum of overdue + due-today pending |
| Clients to Visit | count of clients marked "Scheduled Visit" today (new lightweight local flag, see §7) |
| Overdue Clients | distinct clients with any overdue pending |
| Amount Collected Today | sum of `payments.amount` where `payment_date = today` (scoped by company) |
| Remaining Target | Today's Target − Collected Today (with % progress bar) |

Each card: label, big value, small delta/subtext, subtle gradient tied to status color.

## 3. Map Migration: Leaflet → Google Maps

- Switch from `react-leaflet` to Google Maps JS API using the browser key already available (`VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`) via connector.
- Load async with `callback=initMap&loading=async&channel=...`.
- Use `google.maps.Marker` (NOT AdvancedMarkerElement — needs mapId).
- No `mapId` on the Map constructor.
- Marker clustering via `@googlemaps/markerclusterer` for dense areas.
- Reuse existing `SURAT` center + 100 km radius circle (drawn via `google.maps.Circle`).

### Marker Color Rules
| Color | Condition |
|---|---|
| Red `#ef4444` | Overdue (any invoice past due, unpaid) |
| Orange `#f97316` | Due today |
| Yellow `#eab308` | Due within next 7 days |
| Blue `#3b82f6` | Scheduled Visit (today) |
| Green `#16a34a` | Fully paid (last invoice) |
| Gray `#9ca3af` | Unknown / no geocode |

Gray markers listed in the "Missing Location" section of the list only (not plotted).

## 4. Filters & Search

Filter bar (collapsible `Popover` on mobile):
- **Status**: All / Overdue / Due Today / Due Soon / Scheduled / Paid
- **Company**: reuses `useCompany()` (already global — synced to top switcher)
- **Employee**: dropdown from `employees` (new — client optionally has `assigned_employee_id`; if column absent, show as "Coming soon" and disable). Ask user before adding column.
- **Date range**: due-date range picker (defaults: today → +30d)
- **Area / City**: derived from `clients.address` (split by comma, deduped) — free-text with datalist
- **Amount**: min/max pending amount slider

Search bar (top-right of filter row):
- Single input matching against: client name, business name, invoice number, phone, address, city.
- Debounced 200ms, keyboard-focus via existing `/` shortcut.

All filters + search reflected in URL search params (`validateSearch` with zod + `fallback()`) so state is shareable and back-button friendly.

## 5. Collection List (right column)

- Virtualized list of the filtered clients (use simple map + windowing if <500; otherwise `react-window`).
- Row content: color dot • client/site name • pending amount • due date • distance from HQ (existing `haversineKm`).
- Row actions inline: Call, WhatsApp, Navigate (icons only on mobile).
- Selecting a row: pan+zoom map to marker, open side panel.
- Sort dropdown: Distance | Pending amount | Due date | Overdue days.
- "Missing Location" collapsible group at bottom for gray clients.

Map ↔ List are always in sync (both driven by same filtered array).

## 6. Side Panel (Client Detail)

Slide-in right sheet on desktop, bottom sheet on mobile. Sections:

1. **Header**: business name, client name, status badge, avatar/initials.
2. **Site / Address block**: address, city, distance from HQ, "Missing address" warning if none.
3. **Pending summary**: Total, Paid, Pending, Overdue, invoice count. Reuses existing `Stat`.
4. **Latest invoice card**: invoice number, date, due date, days overdue, pending amount.
5. **Contact**: contact person, phone, WhatsApp.
6. **Actions row** (sticky bottom): Navigate • Call • WhatsApp • Open Invoice • **Mark as Collected**.
   - Mark as Collected: opens confirm dialog, records payment = current pending amount against latest open invoice via existing `payments` insert path (reuses logic from `SendReminderDialog`).
7. **Recent activity** (last 5 payments + last 3 invoices) — optional, reads from existing tables.

Panel state also encoded in URL search param `clientId` for deep-linking.

## 7. Scheduled Visit (lightweight, no migration in v1)

To avoid a schema change in v1:
- Store scheduled-today client IDs in `localStorage` keyed by user+date.
- "Mark for Today" toggle inside the side panel adds/removes.
- KPI "Clients to Visit" reads from this list.
- Note in plan: v2 will move this to a `client_visits` table (see §11).

## 8. Data Layer

Reuse existing queries; consolidate into a single `useCollectionData(filters)` hook returning:
- `clients`, `invoices`, `payments (today)`, `byClient` aggregates, `enriched`, `filtered`, `mapPoints`, `summary`.
- All server calls go through existing `supabase` client with company scoping.
- Geocoding continues via existing `geocode.functions.ts` (server function) — no changes.
- Realtime subscription (new): `payments` inserts invalidate the query so "Collected Today" and marker colors update live. Follows the `useEffect + removeChannel` rule.

## 9. New / Changed Files

- `src/routes/_authenticated/collection-map.tsx` — rewritten as thin route: search params, layout composition.
- `src/components/collection/KpiStrip.tsx`
- `src/components/collection/FilterBar.tsx`
- `src/components/collection/CollectionMap.tsx` (Google Maps wrapper)
- `src/components/collection/CollectionList.tsx`
- `src/components/collection/ClientPanel.tsx`
- `src/components/collection/MarkCollectedDialog.tsx`
- `src/hooks/use-collection-data.ts`
- `src/lib/collection/status.ts` (status derivation + color tokens)
- Add Google Maps color tokens to `src/styles.css` under existing token system (no hardcoded hex in components).

Removed: `react-leaflet` / `leaflet` dependency once migration complete.

## 10. Preserved Functionality

- Company scoping via `useCompany()`
- Auto-geocode of missing clients on mount
- 100 km radius circle around Surat HQ
- Existing pending/overdue calculation
- Call / WhatsApp / Navigate deep links
- Invoice deep links via `Link to="/invoices/$id"`

## 11. Explicitly Out of Scope (v2 recommendations)

- **Route Optimization**: TSP-based multi-stop route via Google Routes API (`routes:computeRoutes` with `optimizeWaypointOrder`). UI: "Plan My Day" button that returns ordered visit list + total drive time.
- **AI Planning**: use Lovable AI Gateway to suggest which clients to visit today based on pending amount × overdue days × distance × last-contact recency; produce a ranked list + suggested script per client.
- **Scheduled visits table** (`client_visits`) with employee assignment, status (planned/visited/skipped), outcome notes.
- **Employee assignment** column on `clients` (`assigned_employee_id`) + per-employee KPIs.
- **Heatmap layer** for overdue density.

## 12. Open Questions

1. Confirm switch from Leaflet → Google Maps (uses managed connector, browser key already set). If you prefer to stay on Leaflet, I'll keep it and just restyle.
2. OK to store "Scheduled Visits" in localStorage for v1, or should we add the `client_visits` table now?
3. Add `assigned_employee_id` column to `clients` now to enable the Employee filter, or defer to v2?
4. Today's Collection Target: user-settable per day, or auto = sum(overdue + due-today)?

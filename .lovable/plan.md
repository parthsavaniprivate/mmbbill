## Auto Billing Scheduler

A Tally-style recurring billing layer on top of the existing invoice module. **Suggests** invoices — never auto-creates them. Existing invoice flow stays untouched.

### 1. Data (minimal schema additions)

New table `billing_schedules`:
- `id`, `company_id`, `client_id`
- `billing_type` enum: `monthly | bi_monthly | quarterly | half_yearly | yearly | custom`
- `custom_interval_months` (int, nullable)
- `start_date`, `next_billing_date`, `last_generated_date`
- `auto_reminder` bool, `auto_suggest` bool
- `invoice_prefix` text nullable
- `default_gst_rate` numeric nullable
- `is_active` bool
- Standard RLS: company members can read/write.

New table `billing_schedule_services` (service plan per client):
- `id`, `schedule_id`, `service_name`, `price`, `gst_rate`, `unit` (month/year), `position`

New table `service_catalog` (global suggestions, per company):
- `id`, `company_id`, `name`, `default_price`, `default_gst_rate`, `usage_count`, `last_used_at`
- Powers Tally-style typeahead + "recently used".

No changes to `invoices`/`invoice_items`. New invoices generated from a schedule optionally record `source_schedule_id` (add nullable column) so we can mark schedules as fulfilled without touching invoice logic.

### 2. Client Profile — "Billing Configuration" section

On `clients.$id.tsx`, add a collapsible card:
- Billing Type radio (6 options + custom months)
- Billing Start Date, Next Billing Date (auto-computed, editable)
- Service Plan list (add/remove rows with name + price + GST + unit); typeahead sourced from `service_catalog`
- Invoice Prefix (optional)
- Toggles: Auto Reminder, Auto Invoice Suggestion
- Save → upserts `billing_schedules` + `billing_schedule_services`

Helper `computeNextBillingDate(startDate, type, lastGenerated?)` in `src/lib/billing/cycle.ts`.

### 3. Dashboard widget — "Invoices To Generate"

New component `src/components/dashboard/BillingReminder.tsx` shown at top of dashboard when there are due/overdue schedules:
- Groups: **Due Today**, **Overdue** (with days overdue + priority badge), **This Week**
- Row: client · service summary · amount · [Generate Invoice] button
- "Generate Now" batch button opens a review dialog before creation.
- Hidden when list is empty.

Only appears if `auto_suggest = true` and `next_billing_date <= today+7`.

### 4. Generate Invoice from schedule

Clicking **Generate Invoice** navigates to `/invoices/new?schedule=<id>`:
- `invoices.new.tsx` reads the search param (additive, keeps existing `client` param behaviour)
- Prefills: company, client, GST, invoice prefix, line items from `billing_schedule_services`, notes
- User can edit anything before saving (existing flow unchanged)
- On save, if `source_schedule_id` set → update `billing_schedules.last_generated_date = today` and `next_billing_date = computeNext(...)`, removing it from the widget automatically.

### 5. Tally-style service typeahead

New `src/components/billing/ServiceCombobox.tsx`:
- Command palette style dropdown (uses existing shadcn `Command`)
- Suggests from `service_catalog` sorted by `last_used_at`, then fuzzy match on typed text
- Also seeded with defaults (SEO Monthly, Facebook Ads, Website Maintenance, Hosting, AMC, Domain Renewal, etc.)
- Selecting a suggestion fills price + GST
- Used in Billing Configuration and (optionally) in `invoices.new.tsx` line description field — additive, doesn't remove existing input.

On save of any invoice generated from a schedule, upsert each service name into `service_catalog` (increment usage). Standalone invoices unaffected.

### 6. New route `/billing-scheduler`

Tabs:
- **Upcoming** — schedules by next date grouped Today/Tomorrow/This Week/This Month
- **Overdue** — sorted by days overdue with priority (High >14d, Med 4-14d, Low ≤3d)
- **Calendar** — month/week/agenda views using `react-day-picker` + custom agenda list; each due date shows dot with client(s); click a day → side panel of that day's schedules
- **Analytics** — cards for Invoices Generated (this month), Pending, Overdue, Upcoming (30d), Expected Revenue (sum of upcoming 30d), **MRR** (monthly-normalised sum of active schedules), **ARR** (MRR × 12)

Home screen tile added → "Billing Scheduler".

### 7. Notifications

Small bell badge in header (reuse existing header) counts Today + Overdue schedules; dropdown lists Today / Tomorrow / Overdue / This Week / This Month. Client-side derived from `billing_schedules` query — no push infra.

### 8. Files

New:
- `src/lib/billing/cycle.ts`
- `src/lib/billing/queries.ts` (react-query hooks)
- `src/components/billing/BillingConfigCard.tsx`
- `src/components/billing/ServiceCombobox.tsx`
- `src/components/billing/ScheduleRow.tsx`
- `src/components/dashboard/BillingReminder.tsx`
- `src/components/header/BillingBell.tsx`
- `src/routes/_authenticated/billing-scheduler.tsx`
- Migration for the 3 tables + `invoices.source_schedule_id` column + RLS + grants

Edited (small additive changes only):
- `src/routes/_authenticated/clients.$id.tsx` — mount `BillingConfigCard`
- `src/routes/_authenticated/dashboard.tsx` — mount `BillingReminder` at top
- `src/routes/_authenticated/invoices.new.tsx` — read `?schedule=` search param, prefill, and on-save schedule advancement (guarded so nothing changes when param absent)
- `src/routes/_authenticated/home.tsx` — add tile
- Header — add bell

### Guardrails (matches your DO NOT list)

- No auto-creation of invoices anywhere — only prefill + reminder.
- No edits to `recalc_invoice_totals`, invoice numbering, or existing invoice CRUD paths.
- Duplicate prevention: schedule row disappears from widget the moment an invoice with matching `source_schedule_id` and today's date exists.
- All new tables have RLS + grants per project rules.

Approve and I'll ship it in one pass. If you want a lighter first cut, tell me which sections to drop (e.g. skip Calendar view or Notifications bell for v1).
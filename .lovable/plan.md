
## Goal
Build a complete **Expense Management** module for the agency app and wire it into the existing Dashboard so Total Expenses / Company Balance / charts update in real time.

The current `expenses` table + `/expenses` page already supports basic Add/Delete/Filter/Export-CSV. We will extend it to cover everything in the brief.

---

## 1. Database (migration)

**Extend `expenses` table:**
- `title TEXT` (Expense Title)
- `payment_method` enum: `cash | upi | bank_transfer | credit_card`
- `notes TEXT` (rename/alias of existing `description`)
- `expense_kind` enum: `fixed | variable`
- `recurring_id UUID NULL` → link to parent recurring rule (for auto-generated rows)

**Add new expense categories** to the existing `expense_category` enum:
- `office_rent`, `electricity`, `travel`, `miscellaneous` (keep existing ones)

**New table `recurring_expenses`** (fixed-expense rules that auto-generate monthly rows):
- `company_id`, `category`, `title`, `amount`, `payment_method`, `notes`
- `day_of_month INT` (1–28)
- `start_date`, `end_date NULL`
- `is_active BOOLEAN DEFAULT true`
- `last_generated_on DATE NULL`
- standard `created_at` / `updated_at` + trigger

**RLS + GRANTs:** authenticated full access, service_role all (matches existing pattern).

**Auto-generate function** `public.generate_recurring_expenses()` (SECURITY DEFINER):
- For each active rule where `last_generated_on < current month start`, insert one row into `expenses` for the current month using the rule, then update `last_generated_on`.
- Called client-side from the Expenses page on load (cheap idempotent UPSERT-style check), and exposed via RPC.

## 2. Frontend — Expense pages

**`/expenses` (rewrite of existing page)** with tabs:
1. **All Expenses** — unified table (Date, Company, Category, Title, Amount, Payment, Notes, Actions: View / Edit / Delete)
2. **Fixed Expenses** — rows where `expense_kind = 'fixed'`
3. **Variable Expenses** — rows where `expense_kind = 'variable'`
4. **Recurring Rules** — manage `recurring_expenses` (Add / Edit / Delete / toggle Active)
5. **Analytics** — charts (recharts):
   - Monthly trend (line, last 12 months)
   - Company-wise comparison (bar)
   - Category-wise breakdown (pie)
   - Fixed vs Variable (donut)

**Search & filters bar** (applies to tables): text search (title/category/company name), company select, date range, category, payment method.

**Add/Edit dialog** — single `ExpenseForm` with all fields (Company, Kind, Category, Title, Amount, Date, Payment Method, Notes). Used for both create and edit.

**Recurring form** — same fields + Day of Month + Active toggle + Start/End date.

**Export**: keep existing CSV; add **Excel** (`xlsx` via `bun add xlsx`) and **Print** (window.print on a print-friendly view). PDF export = "Print → Save as PDF" (no extra dep).

## 3. Dashboard wiring

The dashboard already reads from `expenses` for totals and the Expense-by-Category chart. After the schema change we just:
- Invalidate `["expenses"]` and `["recurring_expenses"]` queries on every mutation (already done for expenses).
- Trigger `generate_recurring_expenses()` RPC once on dashboard load so the month's fixed rows exist before totals compute.

No formula changes needed — `Total Expenses` and `Company Balance` already use the `expenses` sum.

## 4. Files touched

```
supabase/migrations/<new>.sql                (migration tool)
src/routes/_authenticated/expenses.tsx       (rewrite)
src/components/expenses/ExpenseForm.tsx      (new)
src/components/expenses/RecurringForm.tsx    (new)
src/components/expenses/ExpenseAnalytics.tsx (new)
src/lib/expense-constants.ts                 (categories, payment methods)
src/routes/_authenticated/dashboard.tsx      (call RPC on mount)
package.json                                 (+ xlsx)
```

## 5. Out of scope (call out)
- Server-side cron for recurring generation — using client-triggered RPC on page load (sufficient for single-tenant agency tool, no extra infra). Can be moved to `pg_cron` later if needed.
- True PDF generator — using browser Print → Save as PDF.

---

**Step 1 = create the migration** (tool call needs approval). Once approved I'll implement the UI in one batch.

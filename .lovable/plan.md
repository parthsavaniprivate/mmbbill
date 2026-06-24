## Two New Modules: Quotations + Salary Slips

Both will mirror the existing Invoices module's look, theme, and patterns (same Card/Table/Dialog primitives, sidebar entry, company filter, premium gradients, dark mode, mobile responsive).

---

### 1. Database (one migration)

**`quotations`**
- quotation_number (auto via `next_quotation_number` fn, per-company)
- quotation_date, valid_until
- client_id (FK clients), company_id (FK companies)
- subtotal, discount, gst_rate, gst_amount, total
- status: `draft | sent | accepted | rejected` (enum `quotation_status`)
- terms, notes
- converted_invoice_id (FK invoices, nullable)

**`quotation_items`**
- quotation_id, item_name, description, quantity, unit_price, gst_rate, amount
- Trigger recalcs quotation totals on item change.

**`employees`**
- company_id, employee_code, name, designation, department, mobile, email
- joining_date, pan, bank_account, uan
- default salary components (basic, hra, conveyance, medical) for quick prefill

**`salary_slips`**
- employee_id, company_id, month (1–12), year
- basic, hra, conveyance, medical, bonus, incentives, overtime
- pf, esi, prof_tax, tds, other_deductions
- gross, total_deductions, net (computed via trigger)
- status: `draft | paid`
- unique (employee_id, month, year)

**Grants + RLS**: `SELECT/INSERT/UPDATE/DELETE` to `authenticated`; ALL to `service_role`. Policies follow existing pattern (company-scoped via existing companies RLS). `updated_at` triggers.

**Signature/logo**: reuse existing `companies.logo_url` + add `companies.signature_url` if missing (check current schema first).

---

### 2. Routes / Pages

```
src/routes/_authenticated/
  quotations.index.tsx        # list + dashboard cards + filters/search/sort
  quotations.new.tsx          # create form (mirrors invoices.new)
  quotations.$id.tsx          # detail view + PDF/print/WA/email/convert
  salary.index.tsx            # list + dashboard cards
  salary.new.tsx              # generate salary slip
  salary.$id.tsx              # slip preview + PDF/print/WA/email
  employees.tsx               # employee CRUD (lightweight)
```

Sidebar in `_authenticated/route.tsx` gets three new entries: **Quotations**, **Employees**, **Salary**.

---

### 3. Features per module

Quotations:
- Auto number (DB fn `next_quotation_number`)
- Line items grid (same UX as invoices)
- Auto subtotal/GST/discount/grand total
- Terms & Notes textareas
- Logo + signature pulled from selected company
- Buttons: **Download PDF** (reuse `InvoiceTemplates` adapted → `QuotationTemplate`), **Print**, **WhatsApp** (prefilled msg + public link), **Email** (mailto), **Convert to Invoice** (creates invoice + items, links back)
- Status badges + dropdown to change status
- Dashboard cards: Total, Accepted, Pending (draft+sent), Rejected, Total Value

Salary Slips:
- Employees CRUD page
- New Slip: pick employee → prefill defaults → edit components → auto Gross/Deductions/Net → save
- Slip detail = printable A4 template (company logo, signature, employee details, earnings table, deductions table, net in words via existing `amountInWords`)
- Buttons: Download PDF, Print, WhatsApp, Email
- Dashboard cards: Total Employees, Total Salary Paid (all time), Current Month Payroll, Pending (draft)

Shared:
- Search (debounced), status filter, month/date range, sort by date/amount
- CSV export via existing `downloadCSV`
- PDF via `window.print()` with print stylesheet (same approach as current invoice templates) — keeps bundle small
- Role-based permissions: use existing `has_role` (admin/manager/staff). Staff = read-only; Manager = CRUD; Admin = + delete. Enforced in UI (hide buttons) and via RLS predicate.

---

### 4. Technical notes

- Same `useCompany` filter, same `inr` / `formatDate` helpers
- New `src/lib/quotation-pdf.tsx` + `src/lib/salary-pdf.tsx` (print-friendly components)
- Types regenerate after migration; new pages written after migration approval
- All UI uses semantic tokens (no hardcoded colors), matches existing premium gradient/card style
- Mobile: same responsive grid pattern used in dashboard mini-cards

---

### Build order

1. Migration (tables + enums + grants + RLS + triggers + numbering fn) — **needs your approval first**
2. Sidebar nav + route files (list/new/detail) for Quotations
3. Quotation PDF template + actions (PDF/print/WA/email/convert)
4. Employees CRUD page
5. Salary slip routes + PDF template + actions
6. Dashboard cards + filters + CSV export on both modules
7. Permission gating via `has_role`

Shall I proceed with the migration?

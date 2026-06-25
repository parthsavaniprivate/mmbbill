# Phase 1 Business Upgrade — Implementation Plan

This is a large, multi-week scope. I'll break it into 5 shippable milestones so each one can be verified before moving on. Approve the plan and I'll start with Milestone 1.

---

## Milestone 1 — Database Foundation (1 migration)

New columns / tables (reusing existing schema where possible):

- `clients`: add `last_billed_spend numeric default 0`, `last_invoice_date date`, `last_billed_at timestamptz`
- `client_meta_accounts` (new): `client_id`, `meta_account_id`, `meta_ad_account_id`, `is_primary`, timestamps — many-to-many link
- `client_activity` (new): `client_id`, `actor_id`, `kind` (invoice_created/payment_received/quotation_created/meta_linked/meta_synced), `ref_id`, `summary jsonb`, `created_at`
- `invoices`: add `billed_spend_from numeric`, `billed_spend_to numeric`, `meta_account_id uuid` (for spend-billing audit trail)
- Encrypted token storage: enable `pgsodium`, add `meta_accounts.access_token_encrypted bytea`, migrate values, drop plaintext column in follow-up after verification
- DB functions: `client_pending_amount(client_id)`, `client_ledger(client_id)` returning ledger rows, `record_client_activity(...)` helper
- GRANTs + RLS on every new table (company-scoped via existing `has_role`/company pattern)

## Milestone 2 — Client Profile Dashboard

Route: `/_authenticated/clients/$clientId` (tabbed)

Tabs: Overview · Invoices · Payments · Quotations · Meta Ads · Files · Settings · Ledger · Activity

- Overview cards: Total Invoices, Paid, Pending, Outstanding, Total Revenue, Last Invoice, Active Campaigns, Total Ad Spend
- Each tab is a lazy child component reading from existing tables via server fns
- Activity Timeline tab reads `client_activity`
- Ledger tab with PDF + Excel export (reuse existing PDF print pattern; xlsx via `xlsx` package)

## Milestone 3 — Meta Linking + Spend Billing Engine

- Settings tab: link/change/disconnect Meta ad accounts (UI over `client_meta_accounts`)
- New server fn `computeBillableMetaSpend(clientId, metaAccountId)`:
  - reads `meta_ad_spend_history` cumulative spend
  - subtracts `clients.last_billed_spend` for that link
  - returns delta
- Invoice creation wizard: Client → detect linked Meta account → fetch billable spend → prefill line item
- On invoice save: update `last_billed_spend`, `last_invoice_date`, `last_billed_at`, write `client_activity`
- Idempotent — re-saving same invoice never double-bills

## Milestone 4 — Pending Amount, Dashboard, Quote→Invoice, Files

- Global financial cards (Total Revenue / Collected / Pending / Overdue) on Dashboard + per-client
- Dashboard widgets: Top Clients by Revenue, Top Clients by Spend, Pending Collections, Recent Payments, Recent Invoices
- `Convert to Invoice` button on quotation detail — copies client, items, gst, discount; creates invoice in draft
- Files tab: upload to existing `client-files` bucket with category enum (gst/pan/agreement/invoice/other); list/download/delete

## Milestone 5 — Security + Validation Report

- Migrate `meta_accounts.access_token` → `access_token_encrypted` using pgsodium; update server-side decrypt helper; remove plaintext column
- Final report listing: Completed / Modified / DB changes / Routes / Tables / Functions / Remaining

---

## Technical notes

- All server logic via `createServerFn` + `requireSupabaseAuth` (no edge functions)
- New tables follow CREATE → GRANT → ENABLE RLS → POLICY pattern
- Reuse `meta_ad_spend_history`, `meta_campaign_insights`, `invoices`, `payments`, `client-files` bucket
- No duplicate tables: ledger is a VIEW/function over invoices+payments, not a new table
- Activity log written by triggers on invoices/payments/quotations + explicit calls from Meta sync

---

## Estimated scope

~15-20 new/modified files per milestone, 1 migration per milestone (5 total). Each milestone is independently testable.

**Reply "go" to start Milestone 1**, or tell me which milestones to reorder/drop.

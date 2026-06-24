# Meta Marketing API Integration

Add a Meta (Facebook) Ads integration to InvoiceMMB so each client can connect their own Ad Account and your team can see spend, performance, leads and billing inside the CRM.

> **Required from you before I can build this end-to-end:**
> 1. A Meta App in https://developers.facebook.com with **Marketing API** + **Facebook Login** products enabled.
> 2. `META_APP_ID` and `META_APP_SECRET` (I'll request via the secret tool).
> 3. OAuth redirect URI whitelisted in the Meta app:
>    `https://invoicemmb.lovable.app/api/public/meta/oauth/callback`
> 4. App in **Live** mode + business verification if you want to connect real client accounts (Meta requires `ads_read`, `ads_management`, `business_management` advanced access).
>
> Without these the "Connect Meta Account" button will only work for you (the dev) and accounts added as testers.

---

## 1. Database (one migration)

New tables (all company-scoped + RLS via existing `has_role` / company membership pattern):

- **meta_accounts** — `id, company_id, client_id (nullable), meta_user_id, business_id, business_name, ad_account_id, ad_account_name, currency, timezone, access_token (encrypted), token_expires_at, status, connected_by, last_synced_at`
- **meta_campaigns** — `id, meta_account_id, campaign_id, name, objective, status, daily_budget, lifetime_budget, start_time, stop_time`
- **meta_campaign_insights** — `id, campaign_id, date, spend, reach, impressions, clicks, ctr, cpc, cpm, leads, cost_per_lead, actions jsonb` (unique on `campaign_id+date`)
- **meta_ad_spend_history** — `id, meta_account_id, date, spend, currency` (unique on `account+date`) — powers daily/monthly trend
- **meta_billing_reports** — `id, meta_account_id, period_start, period_end, total_spend, currency, generated_at, file_url`
- **meta_sync_log** — `id, meta_account_id, started_at, finished_at, status, error, rows_synced`

Tokens stored encrypted via `pgsodium` or a `vault`-style helper; never returned to the browser.

## 2. Server logic (TanStack server functions + public routes)

OAuth (server routes, public prefix because Meta posts to them):

- `GET /api/public/meta/oauth/start` → builds Facebook login URL with state, redirects
- `GET /api/public/meta/oauth/callback` → exchanges code → long-lived token → stores in `meta_accounts` (status: `pending_account_select`)

Server functions (auth-gated, called from UI):

- `listMetaBusinesses(accountRowId)` / `listMetaAdAccounts(businessId)`
- `selectMetaAdAccount({ rowId, businessId, adAccountId })`
- `disconnectMetaAccount(rowId)`
- `syncMetaAccount(rowId)` — pulls campaigns + last-N-days insights, upserts
- `getMetaDashboard({ accountId, range })` — aggregates KPIs for cards/charts
- `generateMetaReport({ accountId, period })` — builds PDF/Excel, stores in Supabase Storage `meta-reports/`

Cron: `pg_cron` daily job hitting `/api/public/meta/cron/sync` (apikey header) → refresh tokens + sync all active accounts.

## 3. UI

New sidebar group **Meta Ads** with:

- `meta.index.tsx` — Accounts list, "Connect Meta Account" button, last synced, Sync Now, Disconnect
- `meta.$accountId.tsx` — Tabs: **Overview**, **Campaigns**, **Billing**, **Reports**
  - Overview cards: Total Spend, Active Campaigns, Reach, Impressions, Clicks, CTR, CPC, CPM, Leads, CPL, ROAS
  - Charts (recharts): Daily Spend, Monthly Spend, Campaign Performance, Lead Generation
  - Billing: current month / last month / lifetime, daily + monthly trend, campaign-wise spend, currency
  - Reports: Daily/Weekly/Monthly generate → PDF + Excel download
- Client portal: existing client login sees only their own `meta_accounts` (RLS scoped via `clients.user_id` link)

All in the existing premium dark theme + semantic tokens, mobile responsive, "Last synced" timestamp + manual Sync button on every page.

## 4. Security

- OAuth only — no manual token paste
- `access_token` encrypted at rest, only readable by `service_role` / server functions
- Token refresh handled server-side before each sync (long-lived FB token = 60 days; auto-extend)
- RLS: client sees only their accounts; staff scoped to company; admin sees all
- All Meta API calls go through server fns — frontend only ever sees aggregated KPIs

## 5. Build order

1. Migration (tables + RLS + grants + encryption helpers + cron job)
2. Secrets: `META_APP_ID`, `META_APP_SECRET`
3. OAuth routes + Connect flow + account/business picker
4. Sync server fn + manual Sync Now button
5. Dashboard (cards + charts) + Campaigns table
6. Billing tab
7. Reports (PDF/Excel) + Storage bucket `meta-reports`
8. Cron daily sync
9. Client-portal scoping + permission gating

---

### Technical notes (for reference)

- Meta Graph API base: `https://graph.facebook.com/v21.0`
- Endpoints used: `/me/businesses`, `/{business}/owned_ad_accounts`, `/act_{id}/campaigns`, `/act_{id}/insights?level=campaign&fields=spend,reach,impressions,clicks,ctr,cpc,cpm,actions&time_increment=1`
- Lead count derived from `actions` where `action_type='lead'`; ROAS from `purchase_roas`
- PDF reuses the existing print-stylesheet pattern; Excel via `xlsx` (already viable in Worker runtime)

---

This is a big build (~10–15 files + 1 migration + 1 secret request). Confirm and I'll start with the migration and secret request in the next step.
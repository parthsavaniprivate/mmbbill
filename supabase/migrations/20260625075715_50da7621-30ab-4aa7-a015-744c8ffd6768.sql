
-- Phase 1: Client billing settings + cumulative Meta-spend invoice tracking

-- Billing settings on clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS service_charge_type text NOT NULL DEFAULT 'fixed_monthly'
    CHECK (service_charge_type IN ('fixed_monthly','percent_of_spend','custom')),
  ADD COLUMN IF NOT EXISTS service_charge_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_limit numeric(12,2),
  ADD COLUMN IF NOT EXISTS billing_cycle text NOT NULL DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly','weekly','custom')),
  ADD COLUMN IF NOT EXISTS auto_sync_meta boolean NOT NULL DEFAULT true,
  -- cumulative lifetime Meta spend already billed to this client (across all invoices)
  ADD COLUMN IF NOT EXISTS last_billed_spend numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_invoice_date date,
  ADD COLUMN IF NOT EXISTS last_meta_sync timestamptz;

-- Per-invoice snapshot of the Meta spend window it billed for
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS meta_spend_billed numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_spend_cumulative_at_invoice numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS management_fee numeric(12,2) NOT NULL DEFAULT 0;

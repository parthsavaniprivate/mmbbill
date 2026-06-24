
DO $$ BEGIN
  CREATE TYPE public.meta_account_status AS ENUM ('pending_account_select','active','disconnected','error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.meta_sync_status AS ENUM ('running','success','error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.meta_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  meta_user_id text, meta_user_name text,
  business_id text, business_name text,
  ad_account_id text, ad_account_name text,
  currency text, timezone text,
  access_token text, token_expires_at timestamptz,
  status public.meta_account_status NOT NULL DEFAULT 'pending_account_select',
  last_synced_at timestamptz, last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, ad_account_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_accounts TO authenticated;
GRANT ALL ON public.meta_accounts TO service_role;
ALTER TABLE public.meta_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manages meta_accounts" ON public.meta_accounts FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER trg_meta_accounts_updated_at BEFORE UPDATE ON public.meta_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.meta_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_account_id uuid NOT NULL REFERENCES public.meta_accounts(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  name text, objective text, status text,
  daily_budget numeric(14,2), lifetime_budget numeric(14,2),
  start_time timestamptz, stop_time timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meta_account_id, campaign_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_campaigns TO authenticated;
GRANT ALL ON public.meta_campaigns TO service_role;
ALTER TABLE public.meta_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manages meta_campaigns" ON public.meta_campaigns FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER trg_meta_campaigns_updated_at BEFORE UPDATE ON public.meta_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.meta_campaign_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_account_id uuid NOT NULL REFERENCES public.meta_accounts(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.meta_campaigns(id) ON DELETE CASCADE,
  date date NOT NULL,
  spend numeric(14,2) DEFAULT 0, reach bigint DEFAULT 0,
  impressions bigint DEFAULT 0, clicks bigint DEFAULT 0,
  ctr numeric(10,4) DEFAULT 0, cpc numeric(14,4) DEFAULT 0, cpm numeric(14,4) DEFAULT 0,
  leads bigint DEFAULT 0, cost_per_lead numeric(14,4) DEFAULT 0,
  purchase_value numeric(14,2) DEFAULT 0, actions jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, date)
);
CREATE INDEX idx_mci_account_date ON public.meta_campaign_insights(meta_account_id, date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_campaign_insights TO authenticated;
GRANT ALL ON public.meta_campaign_insights TO service_role;
ALTER TABLE public.meta_campaign_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manages meta_insights" ON public.meta_campaign_insights FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.meta_ad_spend_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_account_id uuid NOT NULL REFERENCES public.meta_accounts(id) ON DELETE CASCADE,
  date date NOT NULL,
  spend numeric(14,2) DEFAULT 0, impressions bigint DEFAULT 0,
  clicks bigint DEFAULT 0, reach bigint DEFAULT 0, leads bigint DEFAULT 0,
  currency text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meta_account_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_ad_spend_history TO authenticated;
GRANT ALL ON public.meta_ad_spend_history TO service_role;
ALTER TABLE public.meta_ad_spend_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manages meta_spend" ON public.meta_ad_spend_history FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.meta_billing_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_account_id uuid NOT NULL REFERENCES public.meta_accounts(id) ON DELETE CASCADE,
  period_start date NOT NULL, period_end date NOT NULL,
  total_spend numeric(14,2) DEFAULT 0, currency text, file_url text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_billing_reports TO authenticated;
GRANT ALL ON public.meta_billing_reports TO service_role;
ALTER TABLE public.meta_billing_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manages meta_reports" ON public.meta_billing_reports FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.meta_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_account_id uuid NOT NULL REFERENCES public.meta_accounts(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status public.meta_sync_status NOT NULL DEFAULT 'running',
  error text, rows_synced int DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_sync_log TO authenticated;
GRANT ALL ON public.meta_sync_log TO service_role;
ALTER TABLE public.meta_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manages meta_sync_log" ON public.meta_sync_log FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

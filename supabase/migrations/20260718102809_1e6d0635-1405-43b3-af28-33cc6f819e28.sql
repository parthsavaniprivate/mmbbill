
-- Billing schedules
CREATE TABLE public.billing_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  billing_type TEXT NOT NULL CHECK (billing_type IN ('monthly','bi_monthly','quarterly','half_yearly','yearly','custom')),
  custom_interval_months INT,
  start_date DATE NOT NULL,
  next_billing_date DATE NOT NULL,
  last_generated_date DATE,
  auto_reminder BOOLEAN NOT NULL DEFAULT true,
  auto_suggest BOOLEAN NOT NULL DEFAULT true,
  invoice_prefix TEXT,
  default_gst_rate NUMERIC(5,2),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_schedules TO authenticated;
GRANT ALL ON public.billing_schedules TO service_role;
ALTER TABLE public.billing_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage billing schedules"
ON public.billing_schedules FOR ALL TO authenticated
USING (true) WITH CHECK (true);
CREATE TRIGGER update_billing_schedules_updated_at
BEFORE UPDATE ON public.billing_schedules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX billing_schedules_next_date_idx ON public.billing_schedules(next_billing_date) WHERE is_active;

-- Billing schedule services (plan lines)
CREATE TABLE public.billing_schedule_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES public.billing_schedules(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_rate NUMERIC(5,2),
  unit TEXT NOT NULL DEFAULT 'month',
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_schedule_services TO authenticated;
GRANT ALL ON public.billing_schedule_services TO service_role;
ALTER TABLE public.billing_schedule_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage schedule services"
ON public.billing_schedule_services FOR ALL TO authenticated
USING (true) WITH CHECK (true);
CREATE INDEX billing_schedule_services_schedule_idx ON public.billing_schedule_services(schedule_id);

-- Service catalog for tally-style typeahead
CREATE TABLE public.service_catalog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  default_price NUMERIC(12,2),
  default_gst_rate NUMERIC(5,2),
  usage_count INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_catalog TO authenticated;
GRANT ALL ON public.service_catalog TO service_role;
ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage service catalog"
ON public.service_catalog FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- Link invoices back to originating schedule (nullable, additive)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS source_schedule_id UUID REFERENCES public.billing_schedules(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS invoices_source_schedule_idx ON public.invoices(source_schedule_id);

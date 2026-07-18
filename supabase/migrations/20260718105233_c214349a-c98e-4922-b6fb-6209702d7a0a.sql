
ALTER TABLE public.service_catalog
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS billing_type text,
  ADD COLUMN IF NOT EXISTS hsn_sac text,
  ADD COLUMN IF NOT EXISTS service_code text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS default_quantity numeric(12,2) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS default_unit text DEFAULT 'nos',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS service_catalog_company_code_uidx
  ON public.service_catalog (company_id, lower(service_code))
  WHERE service_code IS NOT NULL AND service_code <> '';

DROP TRIGGER IF EXISTS trg_service_catalog_updated_at ON public.service_catalog;
CREATE TRIGGER trg_service_catalog_updated_at
  BEFORE UPDATE ON public.service_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

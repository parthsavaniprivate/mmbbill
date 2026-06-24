
-- Add signature_url to companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS signature_url text;

-- ============ QUOTATIONS ============
CREATE TYPE public.quotation_status AS ENUM ('draft','sent','accepted','rejected');

CREATE TABLE public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  quotation_number text NOT NULL,
  quotation_date date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  gst_rate numeric(5,2) NOT NULL DEFAULT 18,
  gst_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  status public.quotation_status NOT NULL DEFAULT 'draft',
  terms text,
  notes text,
  converted_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, quotation_number)
);

CREATE TABLE public.quotation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  description text,
  quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  gst_rate numeric(5,2) NOT NULL DEFAULT 0,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_items TO authenticated;
GRANT ALL ON public.quotations TO service_role;
GRANT ALL ON public.quotation_items TO service_role;

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth manage quotations" ON public.quotations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth manage quotation_items" ON public.quotation_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_quotations_updated_at BEFORE UPDATE ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Quotation number generator
CREATE OR REPLACE FUNCTION public.next_quotation_number(_company_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  yr text := to_char(now(),'YY');
  prefix text := 'QT';
  next_num int;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(quotation_number,'^.*-(\d+)$','\1'),'')::int),0)+1
    INTO next_num FROM public.quotations
    WHERE company_id=_company_id AND quotation_number LIKE prefix||'-'||yr||'-%';
  RETURN prefix||'-'||yr||'-'||lpad(next_num::text,4,'0');
END $$;

-- Recalc quotation totals
CREATE OR REPLACE FUNCTION public.recalc_quotation_totals(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sub numeric(12,2); q RECORD; gst numeric(12,2); ttl numeric(12,2);
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO sub FROM public.quotation_items WHERE quotation_id=_id;
  SELECT * INTO q FROM public.quotations WHERE id=_id;
  gst := ROUND((sub-COALESCE(q.discount,0))*COALESCE(q.gst_rate,0)/100.0,2);
  ttl := (sub-COALESCE(q.discount,0))+gst;
  UPDATE public.quotations SET subtotal=sub, gst_amount=gst, total=ttl WHERE id=_id;
END $$;

CREATE OR REPLACE FUNCTION public.quotation_items_after_change()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN PERFORM public.recalc_quotation_totals(COALESCE(NEW.quotation_id, OLD.quotation_id)); RETURN COALESCE(NEW,OLD); END $$;

CREATE TRIGGER quotation_items_change AFTER INSERT OR UPDATE OR DELETE ON public.quotation_items
  FOR EACH ROW EXECUTE FUNCTION public.quotation_items_after_change();

-- ============ EMPLOYEES ============
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_code text,
  name text NOT NULL,
  designation text,
  department text,
  mobile text,
  email text,
  joining_date date,
  pan text,
  bank_account text,
  uan text,
  basic numeric(12,2) NOT NULL DEFAULT 0,
  hra numeric(12,2) NOT NULL DEFAULT 0,
  conveyance numeric(12,2) NOT NULL DEFAULT 0,
  medical numeric(12,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage employees" ON public.employees FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SALARY SLIPS ============
CREATE TYPE public.salary_status AS ENUM ('draft','paid');

CREATE TABLE public.salary_slips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  year int NOT NULL,
  basic numeric(12,2) NOT NULL DEFAULT 0,
  hra numeric(12,2) NOT NULL DEFAULT 0,
  conveyance numeric(12,2) NOT NULL DEFAULT 0,
  medical numeric(12,2) NOT NULL DEFAULT 0,
  bonus numeric(12,2) NOT NULL DEFAULT 0,
  incentives numeric(12,2) NOT NULL DEFAULT 0,
  overtime numeric(12,2) NOT NULL DEFAULT 0,
  pf numeric(12,2) NOT NULL DEFAULT 0,
  esi numeric(12,2) NOT NULL DEFAULT 0,
  prof_tax numeric(12,2) NOT NULL DEFAULT 0,
  tds numeric(12,2) NOT NULL DEFAULT 0,
  other_deductions numeric(12,2) NOT NULL DEFAULT 0,
  gross numeric(12,2) NOT NULL DEFAULT 0,
  total_deductions numeric(12,2) NOT NULL DEFAULT 0,
  net numeric(12,2) NOT NULL DEFAULT 0,
  status public.salary_status NOT NULL DEFAULT 'draft',
  notes text,
  paid_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, month, year)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_slips TO authenticated;
GRANT ALL ON public.salary_slips TO service_role;
ALTER TABLE public.salary_slips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage salary_slips" ON public.salary_slips FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_salary_slips_updated_at BEFORE UPDATE ON public.salary_slips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto compute totals
CREATE OR REPLACE FUNCTION public.salary_slip_compute()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  NEW.gross := COALESCE(NEW.basic,0)+COALESCE(NEW.hra,0)+COALESCE(NEW.conveyance,0)+COALESCE(NEW.medical,0)+COALESCE(NEW.bonus,0)+COALESCE(NEW.incentives,0)+COALESCE(NEW.overtime,0);
  NEW.total_deductions := COALESCE(NEW.pf,0)+COALESCE(NEW.esi,0)+COALESCE(NEW.prof_tax,0)+COALESCE(NEW.tds,0)+COALESCE(NEW.other_deductions,0);
  NEW.net := NEW.gross - NEW.total_deductions;
  RETURN NEW;
END $$;

CREATE TRIGGER salary_slip_compute_trg BEFORE INSERT OR UPDATE ON public.salary_slips
  FOR EACH ROW EXECUTE FUNCTION public.salary_slip_compute();

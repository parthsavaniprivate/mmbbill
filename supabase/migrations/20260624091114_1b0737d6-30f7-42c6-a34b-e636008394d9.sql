
ALTER TABLE public.salary_slips ALTER COLUMN employee_id DROP NOT NULL;
ALTER TABLE public.salary_slips
  ADD COLUMN IF NOT EXISTS employee_name TEXT,
  ADD COLUMN IF NOT EXISTS designation TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS worked_days NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS pay_date DATE,
  ADD COLUMN IF NOT EXISTS loan NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.salary_slip_compute()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.gross := COALESCE(NEW.basic,0)+COALESCE(NEW.hra,0)+COALESCE(NEW.conveyance,0)+COALESCE(NEW.medical,0)+COALESCE(NEW.bonus,0)+COALESCE(NEW.incentives,0)+COALESCE(NEW.overtime,0);
  NEW.total_deductions := COALESCE(NEW.pf,0)+COALESCE(NEW.esi,0)+COALESCE(NEW.prof_tax,0)+COALESCE(NEW.tds,0)+COALESCE(NEW.other_deductions,0)+COALESCE(NEW.loan,0);
  NEW.net := NEW.gross - NEW.total_deductions;
  RETURN NEW;
END $function$;

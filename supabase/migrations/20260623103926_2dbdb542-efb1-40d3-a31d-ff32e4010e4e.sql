
DO $$ BEGIN
  CREATE TYPE public.recurring_cycle AS ENUM ('monthly','quarterly','half_yearly','yearly');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.recurring_expenses
  ADD COLUMN IF NOT EXISTS cycle public.recurring_cycle NOT NULL DEFAULT 'monthly';

ALTER TABLE public.recurring_expenses
  ADD COLUMN IF NOT EXISTS next_due_date date;

UPDATE public.recurring_expenses
SET next_due_date = (date_trunc('month', CURRENT_DATE) + (LEAST(day_of_month,28)-1) * INTERVAL '1 day')::date
WHERE next_due_date IS NULL;

CREATE OR REPLACE FUNCTION public.generate_recurring_expenses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  inserted_count INT := 0;
  next_date DATE;
BEGIN
  FOR r IN
    SELECT * FROM public.recurring_expenses
    WHERE is_active = true
      AND start_date <= CURRENT_DATE
      AND (end_date IS NULL OR end_date >= CURRENT_DATE)
      AND (next_due_date IS NULL OR next_due_date <= CURRENT_DATE)
  LOOP
    INSERT INTO public.expenses (
      company_id, category, amount, expense_date, description, method, title, expense_kind, recurring_id
    ) VALUES (
      r.company_id, r.category, r.amount, COALESCE(r.next_due_date, CURRENT_DATE),
      r.notes, r.method, r.title, 'fixed', r.id
    );
    next_date := CASE r.cycle
      WHEN 'monthly' THEN (COALESCE(r.next_due_date, CURRENT_DATE) + INTERVAL '1 month')::date
      WHEN 'quarterly' THEN (COALESCE(r.next_due_date, CURRENT_DATE) + INTERVAL '3 months')::date
      WHEN 'half_yearly' THEN (COALESCE(r.next_due_date, CURRENT_DATE) + INTERVAL '6 months')::date
      WHEN 'yearly' THEN (COALESCE(r.next_due_date, CURRENT_DATE) + INTERVAL '1 year')::date
    END;
    UPDATE public.recurring_expenses
      SET last_generated_on = CURRENT_DATE, next_due_date = next_date
      WHERE id = r.id;
    inserted_count := inserted_count + 1;
  END LOOP;
  RETURN inserted_count;
END;
$function$;

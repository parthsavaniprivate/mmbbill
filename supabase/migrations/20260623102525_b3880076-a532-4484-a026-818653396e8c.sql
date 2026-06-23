
-- Add new categories
ALTER TYPE public.expense_category ADD VALUE IF NOT EXISTS 'office_rent';
ALTER TYPE public.expense_category ADD VALUE IF NOT EXISTS 'electricity';
ALTER TYPE public.expense_category ADD VALUE IF NOT EXISTS 'miscellaneous';

-- Expense kind enum
DO $$ BEGIN
  CREATE TYPE public.expense_kind AS ENUM ('fixed', 'variable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend expenses
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS expense_kind public.expense_kind NOT NULL DEFAULT 'variable',
  ADD COLUMN IF NOT EXISTS recurring_id UUID;

-- Recurring expense rules
CREATE TABLE IF NOT EXISTS public.recurring_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category public.expense_category NOT NULL DEFAULT 'other',
  title TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  method public.payment_method,
  notes TEXT,
  day_of_month INT NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 28),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_generated_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_expenses TO authenticated;
GRANT ALL ON public.recurring_expenses TO service_role;

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manages recurring_expenses" ON public.recurring_expenses
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TRIGGER update_recurring_expenses_updated_at
  BEFORE UPDATE ON public.recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add FK from expenses.recurring_id (added in earlier ALTER) to recurring_expenses
DO $$ BEGIN
  ALTER TABLE public.expenses
    ADD CONSTRAINT expenses_recurring_id_fkey
    FOREIGN KEY (recurring_id) REFERENCES public.recurring_expenses(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Auto-generate current-month expense rows for active recurring rules
CREATE OR REPLACE FUNCTION public.generate_recurring_expenses()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  target_date DATE;
  month_start DATE := date_trunc('month', CURRENT_DATE)::date;
  inserted_count INT := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.recurring_expenses
    WHERE is_active = true
      AND start_date <= CURRENT_DATE
      AND (end_date IS NULL OR end_date >= CURRENT_DATE)
      AND (last_generated_on IS NULL OR last_generated_on < month_start)
  LOOP
    target_date := (month_start + (LEAST(r.day_of_month, 28) - 1) * INTERVAL '1 day')::date;
    INSERT INTO public.expenses (
      company_id, category, amount, expense_date, description, method, title, expense_kind, recurring_id
    ) VALUES (
      r.company_id, r.category, r.amount, target_date, r.notes, r.method, r.title, 'fixed', r.id
    );
    UPDATE public.recurring_expenses SET last_generated_on = month_start WHERE id = r.id;
    inserted_count := inserted_count + 1;
  END LOOP;
  RETURN inserted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_recurring_expenses() TO authenticated;

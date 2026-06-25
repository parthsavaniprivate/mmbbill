
-- 1) Lock down generate_recurring_expenses: require admin inside the function
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
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

-- 2) Revoke EXECUTE from anon/authenticated on SECURITY DEFINER functions that
--    should not be callable from the API. Trigger functions and internal
--    recalc helpers don't need direct API access.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_invoice_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_invoice_totals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_quotation_totals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_invoice_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_payment_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_quotation_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.payments_after_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.invoice_items_after_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.quotation_items_after_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.salary_slip_compute() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- Revoke anon access on functions only authenticated users need
REVOKE EXECUTE ON FUNCTION public.generate_recurring_expenses() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number(uuid, public.invoice_type) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_quotation_number(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_client_activity(uuid, text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.client_ledger(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.client_financial_summary(uuid) FROM PUBLIC, anon;

-- complete_meta_oauth is intentionally callable by anon (used from OAuth callback
-- via the publishable client). Leave EXECUTE in place for anon and authenticated.

-- 3) Tighten invoice_reminders RLS: admin-only access instead of true.
DROP POLICY IF EXISTS "auth manage invoice_reminders" ON public.invoice_reminders;
CREATE POLICY "Admins manage invoice_reminders"
  ON public.invoice_reminders
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

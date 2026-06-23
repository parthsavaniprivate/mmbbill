
CREATE OR REPLACE FUNCTION public.recalc_invoice_status(_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  paid NUMERIC(12,2);
  inv RECORD;
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO paid FROM public.payments WHERE invoice_id = _invoice_id;
  SELECT * INTO inv FROM public.invoices WHERE id = _invoice_id;
  UPDATE public.invoices SET
    amount_paid = paid,
    status = (CASE
      WHEN inv.status = 'cancelled' THEN 'cancelled'
      WHEN paid >= inv.total AND inv.total > 0 THEN 'paid'
      WHEN paid > 0 AND paid < inv.total THEN 'partially_paid'
      WHEN inv.due_date IS NOT NULL AND inv.due_date < CURRENT_DATE AND paid < inv.total THEN 'overdue'
      ELSE 'pending'
    END)::invoice_status
  WHERE id = _invoice_id;
END; $function$;

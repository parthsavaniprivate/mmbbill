
-- 1. Drop leftover storage policy that allowed any authenticated user to upload to company-assets
DROP POLICY IF EXISTS "Auth upload company-assets" ON storage.objects;

-- 2. Revoke EXECUTE on trigger + internal SECURITY DEFINER functions from authenticated/anon.
-- These are invoked by triggers or admin-only server code and should not be callable via the API.
REVOKE EXECUTE ON FUNCTION public.recalc_invoice_totals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_invoice_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_quotation_totals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_invoice_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_payment_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_quotation_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_audit_log() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.payments_after_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.invoice_items_after_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_meta_oauth(uuid, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_recurring_expenses() FROM PUBLIC, anon, authenticated;

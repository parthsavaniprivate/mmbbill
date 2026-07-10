
-- 1) Tighten company-assets storage policies to admins only
DROP POLICY IF EXISTS "Auth read company-assets" ON storage.objects;
DROP POLICY IF EXISTS "Auth insert company-assets" ON storage.objects;
DROP POLICY IF EXISTS "Auth update company-assets" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete company-assets" ON storage.objects;

CREATE POLICY "Admin read company-assets" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'company-assets' AND public.is_admin());
CREATE POLICY "Admin insert company-assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-assets' AND public.is_admin());
CREATE POLICY "Admin update company-assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'company-assets' AND public.is_admin())
  WITH CHECK (bucket_id = 'company-assets' AND public.is_admin());
CREATE POLICY "Admin delete company-assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'company-assets' AND public.is_admin());

-- 2) Revoke EXECUTE on internal SECURITY DEFINER helpers (triggers + recalc)
-- These are invoked by triggers or SECURITY DEFINER callers, never directly by clients.
REVOKE EXECUTE ON FUNCTION public.tg_audit_log() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_invoice_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_payment_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_quotation_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_invoice_totals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_invoice_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_quotation_totals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_meta_oauth(uuid, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_recurring_expenses() FROM PUBLIC, anon;
-- keep generate_recurring_expenses executable by authenticated admins (function itself checks is_admin)
GRANT EXECUTE ON FUNCTION public.generate_recurring_expenses() TO authenticated;

-- Number generators are called only from admin server flows; restrict to authenticated.
REVOKE EXECUTE ON FUNCTION public.next_invoice_number(uuid, invoice_type) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_quotation_number(uuid) FROM PUBLIC, anon;

-- record_client_activity / ledger / summary: used by app UI; keep authenticated only.
REVOKE EXECUTE ON FUNCTION public.record_client_activity(uuid, text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.client_ledger(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.client_financial_summary(uuid) FROM PUBLIC, anon;

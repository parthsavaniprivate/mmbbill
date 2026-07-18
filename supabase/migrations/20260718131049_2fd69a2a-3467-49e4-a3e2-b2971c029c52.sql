DROP POLICY IF EXISTS "Authenticated can manage billing schedules" ON public.billing_schedules;
CREATE POLICY "Admins manage billing schedules" ON public.billing_schedules
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Authenticated can manage schedule services" ON public.billing_schedule_services;
CREATE POLICY "Admins manage schedule services" ON public.billing_schedule_services
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Authenticated can manage service catalog" ON public.service_catalog;
CREATE POLICY "Admins manage service catalog" ON public.service_catalog
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Auth upload company-assets" ON storage.objects;
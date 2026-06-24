
DROP POLICY IF EXISTS "auth manage quotations" ON public.quotations;
DROP POLICY IF EXISTS "auth manage quotation_items" ON public.quotation_items;
DROP POLICY IF EXISTS "auth manage employees" ON public.employees;
DROP POLICY IF EXISTS "auth manage salary_slips" ON public.salary_slips;

CREATE POLICY "Admin manages quotations" ON public.quotations FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admin manages quotation_items" ON public.quotation_items FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admin manages employees" ON public.employees FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admin manages salary_slips" ON public.salary_slips FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

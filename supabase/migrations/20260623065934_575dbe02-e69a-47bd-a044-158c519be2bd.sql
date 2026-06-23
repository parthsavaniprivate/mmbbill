
CREATE POLICY "Admin reads client files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'client-files' AND public.is_admin());
CREATE POLICY "Admin uploads client files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'client-files' AND public.is_admin());
CREATE POLICY "Admin updates client files" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'client-files' AND public.is_admin());
CREATE POLICY "Admin deletes client files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'client-files' AND public.is_admin());

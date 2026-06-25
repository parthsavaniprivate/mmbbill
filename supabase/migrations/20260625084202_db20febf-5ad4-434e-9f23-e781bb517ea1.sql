ALTER TABLE public.meta_campaigns
  ADD COLUMN IF NOT EXISTS effective_status text,
  ADD COLUMN IF NOT EXISTS configured_status text;
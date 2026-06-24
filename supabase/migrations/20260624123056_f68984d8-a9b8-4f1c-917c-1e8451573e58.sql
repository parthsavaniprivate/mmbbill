CREATE TABLE public.meta_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  return_to text NOT NULL DEFAULT '/meta',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_oauth_states TO authenticated;
GRANT ALL ON public.meta_oauth_states TO service_role;
ALTER TABLE public.meta_oauth_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage meta oauth states" ON public.meta_oauth_states
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.complete_meta_oauth(
  _state_id uuid,
  _meta_user_id text,
  _meta_user_name text,
  _access_token text,
  _token_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st public.meta_oauth_states%ROWTYPE;
  account_id uuid;
BEGIN
  SELECT * INTO st
  FROM public.meta_oauth_states
  WHERE id = _state_id
    AND used_at IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired Meta connection state';
  END IF;

  IF NOT public.has_role(st.created_by, 'admin') THEN
    RAISE EXCEPTION 'Meta connection is no longer authorized';
  END IF;

  SELECT id INTO account_id
  FROM public.meta_accounts
  WHERE company_id = st.company_id
    AND meta_user_id = _meta_user_id
    AND status = 'pending_account_select'
  ORDER BY created_at DESC
  LIMIT 1;

  IF account_id IS NULL THEN
    INSERT INTO public.meta_accounts (
      company_id,
      connected_by,
      meta_user_id,
      meta_user_name,
      access_token,
      token_expires_at,
      status
    ) VALUES (
      st.company_id,
      st.created_by,
      _meta_user_id,
      _meta_user_name,
      _access_token,
      _token_expires_at,
      'pending_account_select'
    )
    RETURNING id INTO account_id;
  ELSE
    UPDATE public.meta_accounts
    SET connected_by = st.created_by,
        meta_user_name = _meta_user_name,
        access_token = _access_token,
        token_expires_at = _token_expires_at,
        status = 'pending_account_select',
        last_sync_error = NULL,
        updated_at = now()
    WHERE id = account_id;
  END IF;

  UPDATE public.meta_oauth_states
  SET used_at = now()
  WHERE id = st.id;

  RETURN account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_meta_oauth(uuid, text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_meta_oauth(uuid, text, text, text, timestamptz) TO anon;
GRANT EXECUTE ON FUNCTION public.complete_meta_oauth(uuid, text, text, text, timestamptz) TO authenticated;
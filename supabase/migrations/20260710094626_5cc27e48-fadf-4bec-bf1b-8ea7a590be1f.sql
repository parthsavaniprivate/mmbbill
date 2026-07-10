
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  changed_fields text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit log" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_table_idx ON public.audit_log (table_name, created_at DESC);

CREATE OR REPLACE FUNCTION public.tg_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  uemail text;
  rec_id uuid;
  old_j jsonb;
  new_j jsonb;
  changed text[];
BEGIN
  BEGIN
    SELECT email INTO uemail FROM auth.users WHERE id = uid;
  EXCEPTION WHEN OTHERS THEN uemail := NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    old_j := to_jsonb(OLD);
    rec_id := (old_j->>'id')::uuid;
    INSERT INTO public.audit_log(user_id, user_email, table_name, record_id, action, old_data)
    VALUES (uid, uemail, TG_TABLE_NAME, rec_id, 'DELETE', old_j);
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    new_j := to_jsonb(NEW);
    rec_id := (new_j->>'id')::uuid;
    INSERT INTO public.audit_log(user_id, user_email, table_name, record_id, action, new_data)
    VALUES (uid, uemail, TG_TABLE_NAME, rec_id, 'INSERT', new_j);
    RETURN NEW;
  ELSE
    old_j := to_jsonb(OLD);
    new_j := to_jsonb(NEW);
    rec_id := (new_j->>'id')::uuid;
    SELECT COALESCE(array_agg(key), '{}') INTO changed
    FROM jsonb_each(new_j) n
    WHERE n.key NOT IN ('updated_at')
      AND (old_j->n.key) IS DISTINCT FROM n.value;
    IF array_length(changed, 1) IS NULL THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.audit_log(user_id, user_email, table_name, record_id, action, old_data, new_data, changed_fields)
    VALUES (uid, uemail, TG_TABLE_NAME, rec_id, 'UPDATE', old_j, new_j, changed);
    RETURN NEW;
  END IF;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoices','clients','payments','expenses','quotations','companies','employees','invoice_items','salary_slips','recurring_expenses','packages']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON public.%I;', t, t);
    EXECUTE format('CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_audit_log();', t, t);
  END LOOP;
END $$;

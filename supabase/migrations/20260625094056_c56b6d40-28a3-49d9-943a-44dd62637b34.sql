
-- 1. Invoice → Meta account audit link
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS meta_account_id uuid REFERENCES public.meta_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_billed_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_invoices_meta_account ON public.invoices(meta_account_id);

-- 2. Client activity timeline
CREATE TABLE IF NOT EXISTS public.client_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('invoice_created','invoice_paid','payment_received','quotation_created','quotation_converted','meta_linked','meta_unlinked','meta_synced','client_created','client_updated','note')),
  ref_id uuid,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_activity TO authenticated;
GRANT ALL ON public.client_activity TO service_role;
ALTER TABLE public.client_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manages client_activity" ON public.client_activity FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE INDEX IF NOT EXISTS idx_client_activity_client ON public.client_activity(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_activity_company ON public.client_activity(company_id, created_at DESC);

-- 3. Helper to record activity
CREATE OR REPLACE FUNCTION public.record_client_activity(_client_id uuid, _kind text, _ref_id uuid, _summary jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _company_id uuid; _id uuid;
BEGIN
  SELECT company_id INTO _company_id FROM public.clients WHERE id = _client_id;
  IF _company_id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.client_activity (company_id, client_id, actor_id, kind, ref_id, summary)
  VALUES (_company_id, _client_id, auth.uid(), _kind, _ref_id, COALESCE(_summary,'{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- 4. Auto-log triggers
CREATE OR REPLACE FUNCTION public.tg_invoice_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO public.client_activity(company_id, client_id, kind, ref_id, summary)
    VALUES (NEW.company_id, NEW.client_id, 'invoice_created', NEW.id,
      jsonb_build_object('invoice_number', NEW.invoice_number, 'total', NEW.total));
  ELSIF TG_OP='UPDATE' AND NEW.status='paid' AND OLD.status<>'paid' THEN
    INSERT INTO public.client_activity(company_id, client_id, kind, ref_id, summary)
    VALUES (NEW.company_id, NEW.client_id, 'invoice_paid', NEW.id,
      jsonb_build_object('invoice_number', NEW.invoice_number, 'total', NEW.total));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_invoice_activity ON public.invoices;
CREATE TRIGGER trg_invoice_activity AFTER INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.tg_invoice_activity();

CREATE OR REPLACE FUNCTION public.tg_payment_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inv RECORD;
BEGIN
  SELECT company_id, client_id, invoice_number INTO inv FROM public.invoices WHERE id = NEW.invoice_id;
  IF inv.client_id IS NOT NULL THEN
    INSERT INTO public.client_activity(company_id, client_id, kind, ref_id, summary)
    VALUES (inv.company_id, inv.client_id, 'payment_received', NEW.id,
      jsonb_build_object('invoice_number', inv.invoice_number, 'amount', NEW.amount, 'method', NEW.method));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_payment_activity ON public.payments;
CREATE TRIGGER trg_payment_activity AFTER INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.tg_payment_activity();

CREATE OR REPLACE FUNCTION public.tg_quotation_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.client_id IS NOT NULL THEN
    INSERT INTO public.client_activity(company_id, client_id, kind, ref_id, summary)
    VALUES (NEW.company_id, NEW.client_id, 'quotation_created', NEW.id,
      jsonb_build_object('quotation_number', NEW.quotation_number, 'total', NEW.total));
  ELSIF TG_OP='UPDATE' AND NEW.converted_invoice_id IS NOT NULL AND OLD.converted_invoice_id IS NULL AND NEW.client_id IS NOT NULL THEN
    INSERT INTO public.client_activity(company_id, client_id, kind, ref_id, summary)
    VALUES (NEW.company_id, NEW.client_id, 'quotation_converted', NEW.converted_invoice_id,
      jsonb_build_object('quotation_number', NEW.quotation_number));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_quotation_activity ON public.quotations;
CREATE TRIGGER trg_quotation_activity AFTER INSERT OR UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.tg_quotation_activity();

-- 5. Client ledger
CREATE OR REPLACE FUNCTION public.client_ledger(_client_id uuid)
RETURNS TABLE(entry_date date, kind text, ref text, description text, debit numeric, credit numeric, balance numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE bal numeric := 0; r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (
      SELECT i.invoice_date AS d, 'invoice'::text AS k, i.invoice_number AS rref,
             'Invoice '||i.invoice_number AS descr, i.total AS dr, 0::numeric AS cr, i.created_at AS ts
      FROM public.invoices i WHERE i.client_id = _client_id AND i.status::text <> 'cancelled'
      UNION ALL
      SELECT p.payment_date, 'payment'::text, i.invoice_number,
             'Payment for '||i.invoice_number||' ('||p.method::text||')', 0::numeric, p.amount, p.created_at
      FROM public.payments p JOIN public.invoices i ON i.id=p.invoice_id
      WHERE i.client_id = _client_id
    ) t ORDER BY t.d ASC, t.ts ASC
  LOOP
    bal := bal + r.dr - r.cr;
    entry_date := r.d; kind := r.k; ref := r.rref; description := r.descr;
    debit := r.dr; credit := r.cr; balance := bal;
    RETURN NEXT;
  END LOOP;
END $$;

-- 6. Client financial summary
CREATE OR REPLACE FUNCTION public.client_financial_summary(_client_id uuid)
RETURNS TABLE(total_invoices int, total_revenue numeric, total_collected numeric, pending_amount numeric, overdue_amount numeric, last_invoice_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COUNT(*)::int, COALESCE(SUM(total),0), COALESCE(SUM(amount_paid),0),
    COALESCE(SUM(total - amount_paid),0),
    COALESCE(SUM(CASE WHEN status::text='overdue' THEN (total - amount_paid) ELSE 0 END),0),
    MAX(invoice_date)
  FROM public.invoices WHERE client_id = _client_id AND status::text <> 'cancelled';
$$;

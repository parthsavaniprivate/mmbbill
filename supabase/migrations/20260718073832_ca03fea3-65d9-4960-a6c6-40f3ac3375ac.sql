
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS gst_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS gst_rate numeric(5,2);

CREATE OR REPLACE FUNCTION public.recalc_invoice_totals(_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sub NUMERIC(12,2);
  inv RECORD;
  gst NUMERIC(12,2);
  ttl NUMERIC(12,2);
  per_item_count INT;
  disc_factor NUMERIC(20,10);
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO sub FROM public.invoice_items WHERE invoice_id = _invoice_id;
  SELECT * INTO inv FROM public.invoices WHERE id = _invoice_id;

  SELECT COUNT(*) INTO per_item_count FROM public.invoice_items
    WHERE invoice_id = _invoice_id AND gst_rate IS NOT NULL;

  IF per_item_count > 0 AND sub > 0 THEN
    disc_factor := GREATEST(0, (sub - COALESCE(inv.discount,0))) / sub;
    SELECT COALESCE(ROUND(SUM(amount * disc_factor * COALESCE(gst_rate,0) / 100.0), 2), 0)
      INTO gst FROM public.invoice_items WHERE invoice_id = _invoice_id;
  ELSE
    gst := ROUND((sub - COALESCE(inv.discount,0)) * COALESCE(inv.gst_rate,0) / 100.0, 2);
  END IF;

  ttl := (sub - COALESCE(inv.discount,0)) + gst;
  UPDATE public.invoices SET subtotal = sub, gst_amount = gst, total = ttl WHERE id = _invoice_id;
  PERFORM public.recalc_invoice_status(_invoice_id);
END; $function$;

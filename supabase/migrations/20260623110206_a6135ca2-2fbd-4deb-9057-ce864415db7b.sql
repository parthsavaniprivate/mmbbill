CREATE OR REPLACE FUNCTION public.next_invoice_number(_company_id uuid, _type invoice_type)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  prefix TEXT;
  yr TEXT := to_char(now(), 'YY');
  next_num INTEGER;
BEGIN
  SELECT CASE WHEN _type = 'proforma' THEN COALESCE(invoice_prefix, 'INV') || '-PF' ELSE COALESCE(invoice_prefix, 'INV') END
    INTO prefix FROM public.companies WHERE id = _company_id;

  -- Scan ALL invoices in the company matching this prefix+year, regardless of invoice_type,
  -- because the unique constraint is (company_id, invoice_number) — collisions across types
  -- would otherwise cause duplicate key errors.
  SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '^.*-(\d+)$', '\1'), '')::int), 0) + 1
    INTO next_num FROM public.invoices
    WHERE company_id = _company_id
      AND invoice_number LIKE prefix || '-' || yr || '-%';

  RETURN prefix || '-' || yr || '-' || lpad(next_num::text, 4, '0');
END; $function$;
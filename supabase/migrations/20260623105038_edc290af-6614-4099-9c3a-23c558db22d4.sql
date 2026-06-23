
-- Reminder tracking
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS reminder_days integer,
  ADD COLUMN IF NOT EXISTS invoice_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminders_sent integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.invoice_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  reminder_no integer NOT NULL,
  template text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  message text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_reminders TO authenticated;
GRANT ALL ON public.invoice_reminders TO service_role;

ALTER TABLE public.invoice_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth manage invoice_reminders"
  ON public.invoice_reminders FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_invoice_reminders_invoice ON public.invoice_reminders(invoice_id);

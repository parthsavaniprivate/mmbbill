ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS payment_behaviour_override text
CHECK (payment_behaviour_override IN ('excellent','average','late','high_risk','defaulter'));
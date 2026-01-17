ALTER TABLE public.profiles
  ADD COLUMN stripe_customer_id TEXT,
  ADD COLUMN stripe_subscription_id TEXT,
  ADD COLUMN stripe_subscription_status TEXT,
  ADD COLUMN stripe_current_period_end TIMESTAMPTZ,
  ADD COLUMN feature_flags JSONB DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_stripe_customer_id_key
  ON public.profiles (stripe_customer_id);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_stripe_subscription_id_key
  ON public.profiles (stripe_subscription_id);

ALTER TABLE public.manus_keys
  ADD COLUMN IF NOT EXISTS cooldown_until timestamptz,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS success_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS manus_keys_pool_idx ON public.manus_keys (status, priority DESC, last_used_at NULLS FIRST);

GRANT ALL ON public.manus_keys TO service_role;
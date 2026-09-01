CREATE TABLE IF NOT EXISTS public.agent_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  site text NOT NULL,
  site_url text,
  login_email text NOT NULL,
  username text,
  password text NOT NULL,
  notes text,
  created_by text NOT NULL DEFAULT 'agent',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, site)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_credentials TO authenticated;
GRANT ALL ON public.agent_credentials TO service_role;

ALTER TABLE public.agent_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own credentials"
  ON public.agent_credentials FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS agent_credentials_user_idx ON public.agent_credentials (user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.touch_agent_credentials() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS agent_credentials_touch ON public.agent_credentials;
CREATE TRIGGER agent_credentials_touch BEFORE UPDATE ON public.agent_credentials
FOR EACH ROW EXECUTE FUNCTION public.touch_agent_credentials();
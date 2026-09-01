CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.agent_tick_config (
  id boolean PRIMARY KEY DEFAULT true,
  functions_url text NOT NULL,
  secret text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_tick_config_singleton CHECK (id)
);

GRANT ALL ON public.agent_tick_config TO service_role;

ALTER TABLE public.agent_tick_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No client access to agent tick config"
  ON public.agent_tick_config
  FOR SELECT
  TO authenticated
  USING (false);

INSERT INTO public.agent_tick_config (id, functions_url)
VALUES (true, 'https://ltgampdtawuefwwayncx.supabase.co/functions/v1/agent-tick')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.run_agent_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.agent_tick_config;
BEGIN
  SELECT * INTO cfg FROM public.agent_tick_config WHERE id LIMIT 1;
  IF cfg IS NULL THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := cfg.functions_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-agent-tick-secret', cfg.secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_agent_tick() FROM public, anon, authenticated;

SELECT cron.unschedule('agent-kernel-tick')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agent-kernel-tick');

SELECT cron.schedule('agent-kernel-tick', '* * * * *', $$SELECT public.run_agent_tick();$$);

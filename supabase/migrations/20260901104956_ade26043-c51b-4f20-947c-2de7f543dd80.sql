CREATE OR REPLACE FUNCTION public.run_agent_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.agent_tick_config;
  base text;
BEGIN
  SELECT * INTO cfg FROM public.agent_tick_config WHERE id LIMIT 1;
  IF cfg IS NULL THEN
    RETURN;
  END IF;

  base := regexp_replace(cfg.functions_url, '/[^/]*$', '');

  -- Primary: the long-run function validates the same secret against
  -- agent_tick_config and advances every live run.
  PERFORM net.http_post(
    url := base || '/long-run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-agent-tick-secret', cfg.secret
    ),
    body := jsonb_build_object('action', 'cron_tick'),
    timeout_milliseconds := 60000
  );

  -- Secondary (harmless if it is not configured): the dedicated tick endpoint.
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
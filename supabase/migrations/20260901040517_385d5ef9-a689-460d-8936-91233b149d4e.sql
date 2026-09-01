CREATE TABLE public.api_rate_limits (
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, endpoint)
);
GRANT ALL ON public.api_rate_limits TO service_role;
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_api_rate_limit(
  _endpoint text,
  _request_limit integer,
  _window_seconds integer
)
RETURNS TABLE(allowed boolean, retry_after integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _now timestamptz := clock_timestamp();
  _row public.api_rate_limits%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;
  IF _endpoint IS NULL OR length(_endpoint) < 1 OR length(_endpoint) > 80
     OR _request_limit < 1 OR _request_limit > 10000
     OR _window_seconds < 1 OR _window_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid rate limit parameters' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.api_rate_limits AS limits (user_id, endpoint, window_started_at, request_count)
  VALUES (_uid, _endpoint, _now, 1)
  ON CONFLICT (user_id, endpoint) DO UPDATE
  SET window_started_at = CASE
        WHEN limits.window_started_at + make_interval(secs => _window_seconds) <= _now THEN _now
        ELSE limits.window_started_at
      END,
      request_count = CASE
        WHEN limits.window_started_at + make_interval(secs => _window_seconds) <= _now THEN 1
        ELSE limits.request_count + 1
      END
  RETURNING * INTO _row;

  allowed := _row.request_count <= _request_limit;
  retry_after := CASE WHEN allowed THEN 0 ELSE GREATEST(
    1,
    CEIL(EXTRACT(EPOCH FROM (_row.window_started_at + make_interval(secs => _window_seconds) - _now)))::integer
  ) END;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.check_api_rate_limit(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_api_rate_limit(text, integer, integer) TO authenticated, service_role;
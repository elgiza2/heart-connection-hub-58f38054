CREATE TABLE IF NOT EXISTS public.video_quota_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  period text NOT NULL,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.video_quota_usage TO authenticated;
GRANT ALL ON public.video_quota_usage TO service_role;

ALTER TABLE public.video_quota_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own video usage" ON public.video_quota_usage;
CREATE POLICY "Users read own video usage"
ON public.video_quota_usage FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS video_quota_usage_user_period_idx
  ON public.video_quota_usage (user_id, period);

CREATE OR REPLACE FUNCTION public.video_quota_tier(_uid uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN lower(coalesce(p.plan,'free')) IN ('elite','max','business','team','enterprise','ultimate') THEN 'elite'
    WHEN lower(coalesce(p.plan,'free')) IN ('pro','plus','pro_plus','premium','starter') THEN 'pro'
    ELSE 'free'
  END
  FROM public.profiles p WHERE p.id = _uid
$$;

CREATE OR REPLACE FUNCTION public.get_video_quota()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tier text;
  v_limit int;
  v_used int;
  v_period text := to_char(now() at time zone 'utc', 'YYYY-MM');
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'unauthenticated');
  END IF;
  v_tier := coalesce(public.video_quota_tier(v_uid), 'free');
  v_limit := CASE v_tier WHEN 'elite' THEN 120 WHEN 'pro' THEN 40 ELSE 0 END;
  SELECT count(*) INTO v_used FROM public.video_quota_usage
    WHERE user_id = v_uid AND period = v_period;
  RETURN jsonb_build_object(
    'tier', v_tier,
    'limit', v_limit,
    'used', v_used,
    'remaining', greatest(v_limit - v_used, 0),
    'period', v_period
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_video_quota(_model text DEFAULT NULL, _unlimited boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tier text;
  v_limit int;
  v_used int;
  v_period text := to_char(now() at time zone 'utc', 'YYYY-MM');
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'unauthenticated');
  END IF;

  IF _unlimited OR coalesce(_model,'') ~* 'deapi' THEN
    RETURN jsonb_build_object('allowed', true, 'unlimited', true);
  END IF;

  v_tier := coalesce(public.video_quota_tier(v_uid), 'free');
  v_limit := CASE v_tier WHEN 'elite' THEN 120 WHEN 'pro' THEN 40 ELSE 0 END;

  SELECT count(*) INTO v_used FROM public.video_quota_usage
    WHERE user_id = v_uid AND period = v_period FOR UPDATE;

  IF v_used >= v_limit THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'video_quota_exceeded',
      'tier', v_tier, 'limit', v_limit, 'used', v_used, 'remaining', 0);
  END IF;

  INSERT INTO public.video_quota_usage (user_id, period, model)
  VALUES (v_uid, v_period, _model);

  RETURN jsonb_build_object('allowed', true, 'tier', v_tier, 'limit', v_limit,
    'used', v_used + 1, 'remaining', greatest(v_limit - v_used - 1, 0));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.video_quota_tier(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_video_quota() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.consume_video_quota(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_video_quota() TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_video_quota(text, boolean) TO authenticated;
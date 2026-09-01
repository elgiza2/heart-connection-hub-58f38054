-- 1) Lock down daily_free_usage: read-only for clients (was fully writable → free-quota bypass)
DROP POLICY IF EXISTS "Users can manage own daily usage" ON public.daily_free_usage;

CREATE POLICY "Users read own daily usage"
ON public.daily_free_usage
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.daily_free_usage FROM authenticated;
GRANT SELECT ON public.daily_free_usage TO authenticated;
GRANT ALL ON public.daily_free_usage TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS daily_free_usage_user_date_feature_key
  ON public.daily_free_usage (user_id, usage_date, feature);

-- 2) Atomic, server-authoritative consumption of a daily free slot (falls back to credits)
CREATE OR REPLACE FUNCTION public.consume_daily_free_or_credits(
  p_feature text,
  p_free_per_day integer,
  p_cost integer DEFAULT 1,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_used integer;
  v_deduct jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF p_feature IS NULL OR length(p_feature) = 0 OR length(p_feature) > 64 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid feature');
  END IF;

  p_free_per_day := greatest(0, least(coalesce(p_free_per_day, 0), 1000));
  p_cost := greatest(0, least(coalesce(p_cost, 1), 1000));

  INSERT INTO public.daily_free_usage (user_id, usage_date, feature, usage_count)
  VALUES (v_user, CURRENT_DATE, p_feature, 0)
  ON CONFLICT (user_id, usage_date, feature) DO NOTHING;

  SELECT usage_count INTO v_used
  FROM public.daily_free_usage
  WHERE user_id = v_user AND usage_date = CURRENT_DATE AND feature = p_feature
  FOR UPDATE;

  IF v_used < p_free_per_day THEN
    UPDATE public.daily_free_usage
       SET usage_count = usage_count + 1
     WHERE user_id = v_user AND usage_date = CURRENT_DATE AND feature = p_feature;

    RETURN jsonb_build_object(
      'success', true,
      'charged', false,
      'remaining_free', p_free_per_day - v_used - 1
    );
  END IF;

  IF p_cost = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Daily free limit reached');
  END IF;

  SELECT public.deduct_credits(
    v_user,
    p_cost,
    p_feature,
    coalesce(p_description, p_feature)
  ) INTO v_deduct;

  IF coalesce((v_deduct->>'success')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', coalesce(v_deduct->>'error', 'Insufficient credits')
    );
  END IF;

  UPDATE public.daily_free_usage
     SET usage_count = usage_count + 1
   WHERE user_id = v_user AND usage_date = CURRENT_DATE AND feature = p_feature;

  RETURN jsonb_build_object('success', true, 'charged', true, 'remaining_free', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_daily_free_or_credits(text, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_daily_free_or_credits(text, integer, integer, text) TO authenticated, service_role;
-- Snapshot of Supabase public schema (02_functions.sql). Generated for auditability. Do not run directly.

CREATE OR REPLACE FUNCTION public.accept_conversation_invite(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invite record;
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  SELECT id, conversation_id, status, expires_at INTO v_invite
    FROM public.conversation_invites WHERE invite_token = p_token;

  IF v_invite.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;
  IF v_invite.status <> 'pending' THEN RETURN jsonb_build_object('success', false, 'error', 'already_used'); END IF;
  IF v_invite.expires_at < now() THEN RETURN jsonb_build_object('success', false, 'error', 'expired'); END IF;

  INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES (v_invite.conversation_id, v_user, 'member')
    ON CONFLICT DO NOTHING;

  UPDATE public.conversation_invites
    SET status = 'accepted', accepted_by = v_user
    WHERE id = v_invite.id;

  -- Bump conversation so it appears at the top of the joiner's recent list
  UPDATE public.conversations
    SET updated_at = now()
    WHERE id = v_invite.conversation_id;

  RETURN jsonb_build_object('success', true, 'conversation_id', v_invite.conversation_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.acquire_media_key(p_provider text, p_model_id text)
 RETURNS TABLE(o_key_id uuid, o_api_key text, o_workspace_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key RECORD;
BEGIN
  UPDATE public.media_key_usage u
  SET used_count = 0, period_start = now()
  FROM public.media_key_limits l
  WHERE u.key_id = l.key_id AND u.model_id = l.model_id
    AND ((l.reset_period = 'daily' AND u.period_start < now() - INTERVAL '1 day')
      OR (l.reset_period = 'monthly' AND u.period_start < now() - INTERVAL '30 days'));

  FOR v_key IN
    SELECT k.id, k.api_key, k.workspace_id
    FROM public.media_provider_keys k
    LEFT JOIN public.media_key_limits l ON l.key_id = k.id AND l.model_id = p_model_id
    LEFT JOIN public.media_key_usage u ON u.key_id = k.id AND u.model_id = p_model_id
    WHERE k.provider = p_provider AND k.status = 'active'
      AND (l.max_uses IS NULL OR COALESCE(u.used_count, 0) < l.max_uses)
    ORDER BY k.priority ASC, k.created_at ASC
    LIMIT 1
  LOOP
    INSERT INTO public.media_key_usage AS mku (key_id, model_id, used_count, last_used_at)
    VALUES (v_key.id, p_model_id, 1, now())
    ON CONFLICT (key_id, model_id) DO UPDATE
      SET used_count = mku.used_count + 1, last_used_at = now();

    o_key_id := v_key.id;
    o_api_key := v_key.api_key;
    o_workspace_id := v_key.workspace_id;
    RETURN NEXT;
    RETURN;
  END LOOP;
  RETURN;
END; $function$
;

CREATE OR REPLACE FUNCTION public.add_credits(p_user_id uuid, p_amount numeric, p_description text DEFAULT 'Manual credit addition'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_credits numeric;
BEGIN
  UPDATE public.profiles SET credits = credits + p_amount, updated_at = now() WHERE id = p_user_id
  RETURNING credits INTO new_credits;

  IF new_credits IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, action_type, description)
  VALUES (p_user_id, p_amount, 'credit_addition', p_description);

  RETURN jsonb_build_object('success', true, 'credits', new_credits);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_add_api_key(p_service text, p_key text, p_label text DEFAULT NULL::text, p_credit_limit numeric DEFAULT 5)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_id uuid;
BEGIN
  IF p_service NOT IN ('serper','firecrawl','leonardo','manus','media') THEN
    RAISE EXCEPTION 'unsupported service: %', p_service;
  END IF;
  IF p_key IS NULL OR length(trim(p_key)) < 8 THEN
    RAISE EXCEPTION 'invalid key';
  END IF;

  INSERT INTO public.api_keys (service, api_key, label, is_active, is_blocked, credit_limit_usd)
  VALUES (p_service, trim(p_key), COALESCE(p_label, p_service || ' key'), true, false, COALESCE(p_credit_limit, 5))
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_grant_pro_monthly(target_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := lower(trim(coalesce(target_email, '')));
  v_user_id uuid;
  v_existing_id uuid;
  v_existing_end timestamptz;
  v_period_end timestamptz := now() + interval '30 days';
  v_sub_id text := 'comp:influencer:' || extract(epoch from now())::bigint::text;
BEGIN
  IF v_email = '' OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email', 'email', v_email);
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found', 'email', v_email);
  END IF;

  -- Extend any currently active Pro sub instead of creating a duplicate.
  SELECT id, current_period_end
    INTO v_existing_id, v_existing_end
  FROM public.subscriptions
  WHERE user_id = v_user_id
    AND plan = 'pro'
    AND status = 'active'
    AND (current_period_end IS NULL OR current_period_end > now())
  ORDER BY current_period_end DESC NULLS LAST
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    v_period_end := greatest(coalesce(v_existing_end, now()), now()) + interval '30 days';
    UPDATE public.subscriptions
       SET current_period_end = v_period_end,
           status = 'active',
           updated_at = now()
     WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.subscriptions
      (user_id, plan, status, current_period_end, polar_subscription_id, amount_cents, currency)
    VALUES
      (v_user_id, 'pro', 'active', v_period_end, v_sub_id, 0, 'USD');
  END IF;

  -- Ensure a profile row exists and is set to pro.
  INSERT INTO public.profiles (id, plan, updated_at)
  VALUES (v_user_id, 'pro', now())
  ON CONFLICT (id) DO UPDATE
    SET plan = 'pro', updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', v_user_id,
    'email', v_email,
    'period_end', v_period_end,
    'plan', 'pro',
    'extended', v_existing_id IS NOT NULL
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', 'exception', 'detail', SQLERRM);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.alibaba_keys_extract_workspace_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- For sk-ws-* keys, the workspace id is the segment after "sk-ws-" up to the first dot.
  IF NEW.api_key IS NOT NULL AND NEW.api_key LIKE 'sk-ws-%' THEN
    NEW.workspace_id := split_part(substring(NEW.api_key from 7), '.', 1);
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.assert_model_access(_model_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_authenticated');
  END IF;

  IF public.model_requires_paid_plan(_model_id) AND NOT public.has_paid_plan(v_user) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'plan_required', 'model', _model_id);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'model', _model_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.block_v0_key(p_id uuid, p_reason text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.v0_api_keys
    SET is_blocked = true, last_error = p_reason
    WHERE id = p_id;
$function$
;

CREATE OR REPLACE FUNCTION public.bump_conversation(p_conversation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF NOT public.is_conversation_member(p_conversation_id, auth.uid()) THEN RETURN; END IF;
  UPDATE public.conversations SET updated_at = now() WHERE id = p_conversation_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calc_referral_stats(_referrer uuid)
 RETURNS TABLE(active_refs integer, net_mrr_cents integer, tier_id text, tier_name text, rate_pct numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _active integer := 0;
  _mrr    integer := 0;
BEGIN
  SELECT COUNT(DISTINCT r.referred_id)::int,
         COALESCE(SUM(s.amount_cents), 0)::int
    INTO _active, _mrr
  FROM public.referrals r
  JOIN public.subscriptions s ON s.user_id = r.referred_id
  WHERE r.referrer_id = _referrer
    AND s.status IN ('active', 'trialing', 'past_due')
    AND s.updated_at >= now() - interval '90 days';

  RETURN QUERY
  SELECT _active, _mrr, t.id, t.name, t.rate_pct
    FROM public.referral_tiers t
   WHERE _active >= t.min_active_refs
      OR _mrr    >= t.min_net_mrr_cents
   ORDER BY t.sort_order DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT _active, _mrr, t.id, t.name, t.rate_pct
      FROM public.referral_tiers t
     ORDER BY t.sort_order ASC
     LIMIT 1;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_edge_rate_limit(_identifier text, _endpoint text, _limit integer, _window_seconds integer)
 RETURNS TABLE(allowed boolean, remaining integer, reset_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _bucket TIMESTAMPTZ;
  _current INTEGER;
BEGIN
  _bucket := date_trunc('second', now())
    - make_interval(secs => (EXTRACT(EPOCH FROM now())::INTEGER % _window_seconds));

  INSERT INTO public.edge_rate_limits(identifier, endpoint, window_start, count)
    VALUES (_identifier, _endpoint, _bucket, 1)
  ON CONFLICT (identifier, endpoint, window_start)
    DO UPDATE SET count = public.edge_rate_limits.count + 1,
                  updated_at = now()
  RETURNING count INTO _current;

  RETURN QUERY SELECT
    _current <= _limit,
    GREATEST(0, _limit - _current),
    _bucket + make_interval(secs => _window_seconds);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_profile_update_safe_policy(profile_row profiles)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- This function is used in RLS WITH CHECK to ensure only safe fields change
  -- The actual column blocking is done by the trigger, but this tightens the policy layer too
  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_rate_limit(p_user_id uuid, p_ip_hash text, p_bucket text, p_per_minute integer DEFAULT 30, p_per_hour integer DEFAULT 500, p_block_seconds integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.rate_limit_buckets;
  v_now TIMESTAMPTZ := now();
  v_min TIMESTAMPTZ := date_trunc('minute', v_now);
  v_hour TIMESTAMPTZ := date_trunc('hour', v_now);
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.rate_limit_buckets
      WHERE user_id = p_user_id AND bucket = p_bucket FOR UPDATE;
  ELSIF p_ip_hash IS NOT NULL THEN
    SELECT * INTO v_row FROM public.rate_limit_buckets
      WHERE ip_hash = p_ip_hash AND user_id IS NULL AND bucket = p_bucket FOR UPDATE;
  ELSE
    RETURN jsonb_build_object('allowed', true);
  END IF;

  IF v_row.id IS NULL THEN
    INSERT INTO public.rate_limit_buckets(user_id, ip_hash, bucket, window_start, count, hour_start, hour_count)
    VALUES (p_user_id, p_ip_hash, p_bucket, v_min, 1, v_hour, 1);
    RETURN jsonb_build_object('allowed', true, 'remaining_minute', p_per_minute - 1);
  END IF;

  -- Currently blocked?
  IF v_row.blocked_until IS NOT NULL AND v_row.blocked_until > v_now THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'blocked',
      'retry_after', EXTRACT(EPOCH FROM (v_row.blocked_until - v_now))::int
    );
  END IF;

  -- Reset minute window
  IF v_row.window_start < v_min THEN
    v_row.window_start := v_min;
    v_row.count := 0;
  END IF;
  IF v_row.hour_start < v_hour THEN
    v_row.hour_start := v_hour;
    v_row.hour_count := 0;
  END IF;

  v_row.count := v_row.count + 1;
  v_row.hour_count := v_row.hour_count + 1;

  IF v_row.count > p_per_minute OR v_row.hour_count > p_per_hour THEN
    v_row.blocked_until := v_now + make_interval(secs => p_block_seconds);
    UPDATE public.rate_limit_buckets
      SET window_start = v_row.window_start, count = v_row.count,
          hour_start = v_row.hour_start, hour_count = v_row.hour_count,
          blocked_until = v_row.blocked_until, updated_at = v_now
      WHERE id = v_row.id;
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', CASE WHEN v_row.count > p_per_minute THEN 'minute_exceeded' ELSE 'hour_exceeded' END,
      'retry_after', p_block_seconds
    );
  END IF;

  UPDATE public.rate_limit_buckets
    SET window_start = v_row.window_start, count = v_row.count,
        hour_start = v_row.hour_start, hour_count = v_row.hour_count,
        blocked_until = NULL, updated_at = v_now
    WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'allowed', true,
    'remaining_minute', p_per_minute - v_row.count,
    'remaining_hour', p_per_hour - v_row.hour_count
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_promo_slot()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining INTEGER;
BEGIN
  INSERT INTO public.daily_promo_slots (date)
  VALUES (CURRENT_DATE)
  ON CONFLICT (date) DO NOTHING;

  UPDATE public.daily_promo_slots
  SET claimed_count = claimed_count + 1,
      updated_at = now()
  WHERE date = CURRENT_DATE
    AND claimed_count < total_slots
  RETURNING (total_slots - claimed_count) INTO v_remaining;

  IF v_remaining IS NULL THEN
    RETURN -1;
  END IF;

  RETURN v_remaining;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_referral_signup(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_email_confirmed timestamptz;
  v_clean_code text;
  v_referrer_id uuid;
  v_existing uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT email_confirmed_at INTO v_email_confirmed
    FROM auth.users WHERE id = v_user_id;
  IF v_email_confirmed IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_not_confirmed');
  END IF;

  SELECT id INTO v_existing FROM public.referrals
    WHERE referred_id = v_user_id LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  v_clean_code := upper(trim(coalesce(p_code, '')));
  IF v_clean_code = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_code');
  END IF;

  SELECT user_id INTO v_referrer_id
    FROM public.referral_codes
    WHERE upper(code) = v_clean_code
    LIMIT 1;
  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;
  IF v_referrer_id = v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_referral');
  END IF;

  INSERT INTO public.referrals (referrer_id, referred_id, referral_code, status)
  VALUES (v_referrer_id, v_user_id, v_clean_code, 'pending');

  PERFORM public.add_credits(v_user_id, 15::numeric, 'Referral signup bonus (invited by friend)');

  RETURN jsonb_build_object(
    'ok', true,
    'referrer_id', v_referrer_id,
    'credits_granted', 15
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_stale_background_jobs(stale_seconds integer DEFAULT 90)
 RETURNS SETOF background_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.background_jobs;
begin
  for r in
    update public.background_jobs j
       set status = case
                      when j.attempt + 1 >= j.max_attempts then 'error'
                      else 'queued'
                    end,
           attempt = j.attempt + 1,
           next_run_at = now(),
           last_heartbeat_at = now(),
           error = case
                     when j.attempt + 1 >= j.max_attempts
                       then coalesce(j.error, 'Job exceeded max attempts after timeout')
                     else j.error
                   end,
           finished_at = case
                           when j.attempt + 1 >= j.max_attempts then now()
                           else j.finished_at
                         end,
           updated_at = now()
     where j.resumable = true
       and j.status in ('running','queued')
       and (j.last_heartbeat_at is null
            or j.last_heartbeat_at < now() - make_interval(secs => stale_seconds))
    returning j.*
  loop
    if r.status = 'error' then
      begin
        perform public.move_to_dead_letter(r.id, 'background_jobs', r.error);
      exception when others then
        null; -- never let DLQ failure block the watchdog
      end;
    end if;
    return next r;
  end loop;
  return;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_high_volume_tables()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted jsonb := '{}'::jsonb;
  v_count bigint;
BEGIN
  DELETE FROM public.service_status WHERE checked_at < now() - interval '7 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('service_status', v_count);

  DELETE FROM public.admin_error_log WHERE created_at < now() - interval '14 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('admin_error_log', v_count);

  DELETE FROM public.key_usage_log WHERE created_at < now() - interval '14 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('key_usage_log', v_count);

  DELETE FROM public.chat_router_logs WHERE created_at < now() - interval '14 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('chat_router_logs', v_count);

  DELETE FROM public.agent_runs
    WHERE status IN ('success','failed','error','completed','cancelled')
      AND COALESCE(ended_at, started_at) < now() - interval '30 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('agent_runs', v_count);

  DELETE FROM public.background_jobs
    WHERE status IN ('completed','failed','cancelled')
      AND created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('background_jobs', v_count);

  DELETE FROM public.rate_limit_buckets WHERE updated_at < now() - interval '2 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('rate_limit_buckets', v_count);

  DELETE FROM public.otp_codes WHERE created_at < now() - interval '1 day';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('otp_codes', v_count);

  DELETE FROM public.oauth_codes WHERE expires_at < now() - interval '1 day';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('oauth_codes', v_count);

  RETURN v_deleted;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_research_reports()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.research_reports
  SET images = '[]'::jsonb,
      updated_at = now()
  WHERE created_at < (now() - interval '10 days')
    AND jsonb_array_length(images) > 0;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DELETE FROM public.rate_limit_buckets
    WHERE updated_at < now() - interval '24 hours'
      AND (blocked_until IS NULL OR blocked_until < now());
$function$
;

CREATE OR REPLACE FUNCTION public.code_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.consume_daily_free_or_credits(p_feature text, p_free_per_day integer, p_cost integer DEFAULT 1, p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.consume_free_image_use(p_user_id uuid, p_limit integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_used integer;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR auth.uid() <> p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;
  SELECT image_free_uses INTO v_used FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_used IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'user_not_found'); END IF;
  IF v_used >= p_limit THEN
    RETURN jsonb_build_object('success', false, 'error', 'free_trial_exhausted', 'used', v_used, 'limit', p_limit);
  END IF;
  UPDATE public.profiles SET image_free_uses = image_free_uses + 1, updated_at = now() WHERE id = p_user_id;
  RETURN jsonb_build_object('success', true, 'used', v_used + 1, 'remaining', p_limit - v_used - 1);
END $function$
;

CREATE OR REPLACE FUNCTION public.consume_model_use(_model_id text, _feature text, _free_per_day integer DEFAULT 0, _cost integer DEFAULT 1, _description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_access jsonb;
BEGIN
  v_access := public.assert_model_access(_model_id);
  IF coalesce((v_access->>'allowed')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', v_access->>'reason');
  END IF;

  RETURN public.consume_daily_free_or_credits(
    _feature,
    _free_per_day,
    _cost,
    coalesce(_description, _feature || ' • ' || coalesce(_model_id,'unknown'))
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.corn_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_notification(p_user_id uuid, p_type text, p_title text, p_message text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  notification_id uuid;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, metadata)
  VALUES (p_user_id, p_type, p_title, p_message, p_metadata)
  RETURNING id INTO notification_id;
  RETURN notification_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_workspace(p_name text, p_plan text DEFAULT NULL::text)
 RETURNS workspaces
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ws public.workspaces;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  INSERT INTO public.workspaces (name, owner_id, plan)
  VALUES (trim(p_name), v_uid, p_plan)
  RETURNING * INTO v_ws;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_ws.id, v_uid, 'owner')
  ON CONFLICT DO NOTHING;

  RETURN v_ws;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.deduct_credits(p_user_id uuid, p_amount numeric, p_action_type text, p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_credits NUMERIC;
  new_credits NUMERIC;
BEGIN
  SELECT credits INTO current_credits FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  
  IF current_credits IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;
  
  IF current_credits < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient credits', 'credits', current_credits);
  END IF;
  
  new_credits := current_credits - p_amount;
  
  UPDATE public.profiles SET credits = new_credits, updated_at = now() WHERE id = p_user_id;
  
  INSERT INTO public.credit_transactions (user_id, amount, action_type, description)
  VALUES (p_user_id, p_amount, p_action_type, p_description);
  
  -- Create notification when balance drops below 5
  IF new_credits < 5 AND current_credits >= 5 THEN
    PERFORM public.create_notification(
      p_user_id, 'credits',
      'رصيدك منخفض',
      'رصيدك الحالي ' || new_credits::text || ' MC. قم بشحن رصيدك للاستمرار.',
      jsonb_build_object('credits', new_credits)
    );
  END IF;
  
  RETURN jsonb_build_object('success', true, 'credits', new_credits);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_integration_secret(_names text[] DEFAULT ARRAY[]::text[], _all_tokens text[] DEFAULT ARRAY[]::text[], _prefer_tokens text[] DEFAULT ARRAY[]::text[], _forbidden_tokens text[] DEFAULT ARRAY[]::text[])
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
declare
  exact_value text;
  token_value text;
begin
  if coalesce(array_length(_names, 1), 0) > 0 then
    select nullif(trim(ds.decrypted_secret), '') into exact_value
    from vault.decrypted_secrets ds
    where ds.name = any(_names)
      and nullif(trim(ds.decrypted_secret), '') is not null
    order by array_position(_names, ds.name)
    limit 1;

    if exact_value is not null then
      return exact_value;
    end if;
  end if;

  if coalesce(array_length(_all_tokens, 1), 0) > 0 then
    with candidates as (
      select
        ds.name,
        nullif(trim(ds.decrypted_secret), '') as secret_value,
        upper(regexp_replace(ds.name, '[^A-Za-z0-9]+', '_', 'g')) as normalized_name
      from vault.decrypted_secrets ds
      where nullif(trim(ds.decrypted_secret), '') is not null
    ), scored as (
      select
        c.secret_value,
        (
          select count(*)
          from unnest(_prefer_tokens) p
          where c.normalized_name like '%' || upper(p) || '%'
        ) as preference_score,
        c.normalized_name
      from candidates c
      where not exists (
        select 1
        from unnest(_all_tokens) t
        where c.normalized_name not like '%' || upper(t) || '%'
      )
      and not exists (
        select 1
        from unnest(_forbidden_tokens) f
        where c.normalized_name like '%' || upper(f) || '%'
      )
    )
    select secret_value into token_value
    from scored
    order by preference_score desc, normalized_name asc
    limit 1;

    if token_value is not null then
      return token_value;
    end if;
  end if;

  return '';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_invite_details(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invite record;
  v_conv record;
  v_prof record;
  v_count integer;
BEGIN
  SELECT id, conversation_id, invited_by, invite_email, status, expires_at
    INTO v_invite
    FROM public.conversation_invites
    WHERE invite_token = p_token;

  IF v_invite.id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;
  IF v_invite.status <> 'pending' THEN
    RETURN jsonb_build_object('error', 'already_used');
  END IF;
  IF v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  SELECT title, mode INTO v_conv FROM public.conversations WHERE id = v_invite.conversation_id;
  SELECT display_name, avatar_url INTO v_prof FROM public.profiles WHERE id = v_invite.invited_by;
  SELECT count(*) INTO v_count FROM public.conversation_members WHERE conversation_id = v_invite.conversation_id;

  RETURN jsonb_build_object(
    'invite_id', v_invite.id,
    'conversation_id', v_invite.conversation_id,
    'invite_email', v_invite.invite_email,
    'conversation_title', COALESCE(v_conv.title, 'Conversation'),
    'conversation_mode', COALESCE(v_conv.mode, 'chat'),
    'inviter_name', v_prof.display_name,
    'inviter_avatar', v_prof.avatar_url,
    'member_count', COALESCE(v_count, 0) + 1
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_landing_page_prompt(item_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prompt text;
  v_is_pro boolean;
  v_has_sub boolean := false;
BEGIN
  SELECT prompt, is_pro INTO v_prompt, v_is_pro
  FROM public.landing_page_prompts
  WHERE id = item_id AND is_published = true;

  IF v_prompt IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_is_pro = false THEN
    RETURN v_prompt;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  -- Admins always get access
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN v_prompt;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = auth.uid()
      AND status = 'active'
      AND (current_period_end IS NULL OR current_period_end > now())
  ) INTO v_has_sub;

  IF v_has_sub THEN
    RETURN v_prompt;
  END IF;

  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_referrer_commission_rate(_user_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.commission_rate
  FROM public.referral_tiers t
  WHERE t.min_conversions <= (
    SELECT COUNT(*) FROM public.referrals
    WHERE referrer_id = _user_id AND status = 'active'
  )
  ORDER BY t.min_conversions DESC
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_today_promo_slots()
 RETURNS TABLE(date date, total_slots integer, claimed_count integer, remaining integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.daily_promo_slots (date)
  VALUES (CURRENT_DATE)
  ON CONFLICT (date) DO NOTHING;

  RETURN QUERY
  SELECT s.date, s.total_slots, s.claimed_count, GREATEST(s.total_slots - s.claimed_count, 0)
  FROM public.daily_promo_slots s
  WHERE s.date = CURRENT_DATE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_referral_tier(_user_id uuid)
 RETURNS TABLE(tier_name text, commission_rate numeric, conversions bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH stats AS (
    SELECT COUNT(*)::bigint AS c
    FROM public.referrals
    WHERE referrer_id = _user_id AND status = 'active'
  )
  SELECT t.tier_name, t.commission_rate, s.c
  FROM public.referral_tiers t, stats s
  WHERE t.min_conversions <= s.c
  ORDER BY t.min_conversions DESC
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_subscription_status(p_email text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_email text;
  v_plan text;
  v_sub record;
  v_status text;
  v_renews_at timestamptz;
BEGIN
  IF p_user_id IS NOT NULL THEN
    v_uid := p_user_id;
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  ELSIF p_email IS NOT NULL THEN
    SELECT id, email INTO v_uid, v_email FROM auth.users WHERE lower(email) = lower(trim(p_email)) LIMIT 1;
  ELSE
    RETURN jsonb_build_object('found', false, 'error', 'email_or_user_id_required');
  END IF;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('found', false, 'error', 'user_not_found');
  END IF;

  SELECT plan INTO v_plan FROM public.profiles WHERE id = v_uid;
  v_plan := COALESCE(v_plan, 'free');

  -- Most recent subscription record
  SELECT * INTO v_sub
    FROM public.subscriptions
    WHERE user_id = v_uid
    ORDER BY created_at DESC
    LIMIT 1;

  IF v_sub.id IS NOT NULL THEN
    v_renews_at := COALESCE(v_sub.current_period_end, v_sub.next_billing_date);
    IF v_sub.status IN ('active','trialing') AND (v_renews_at IS NULL OR v_renews_at > now()) THEN
      v_status := 'active';
    ELSE
      v_status := 'expired';
    END IF;
  ELSE
    v_status := CASE WHEN v_plan = 'free' THEN 'active' ELSE 'expired' END;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'user_id', v_uid,
    'email', v_email,
    'plan', v_plan,
    'status', v_status,
    'renews_at', v_renews_at
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_workspace_invite_details(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invite record;
  v_ws record;
  v_inviter record;
BEGIN
  SELECT id, workspace_id, invited_by, invite_email, role, status, expires_at, created_at
    INTO v_invite
    FROM public.workspace_invites
    WHERE invite_token = p_token;

  IF v_invite.id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;
  IF v_invite.status <> 'pending' THEN
    RETURN jsonb_build_object('error', 'already_used');
  END IF;
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  SELECT id, name, avatar_url INTO v_ws FROM public.workspaces WHERE id = v_invite.workspace_id;
  SELECT display_name, avatar_url INTO v_inviter FROM public.profiles WHERE id = v_invite.invited_by;

  RETURN jsonb_build_object(
    'workspace_id', v_invite.workspace_id,
    'workspace_name', COALESCE(v_ws.name, 'Workspace'),
    'workspace_avatar', v_ws.avatar_url,
    'role', v_invite.role,
    'invite_email', v_invite.invite_email,
    'inviter_name', v_inviter.display_name,
    'inviter_avatar', v_inviter.avatar_url,
    'is_link_invite', (v_invite.invite_email IS NULL OR length(trim(v_invite.invite_email)) = 0)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.grant_user_credits(p_user_id uuid, p_amount numeric, p_action_type text, p_description text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_balance numeric;
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  UPDATE public.profiles
    SET credits = COALESCE(credits, 0) + p_amount
    WHERE id = p_user_id
    RETURNING credits INTO new_balance;

  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  INSERT INTO public.credit_transactions(user_id, amount, action_type, description)
  VALUES (p_user_id, p_amount, p_action_type, p_description);

  RETURN new_balance;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_referral_conversion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.converted_user_id IS NOT NULL
     AND NEW.referrer_user_id IS NOT NULL
     AND NEW.referrer_user_id <> NEW.converted_user_id
     AND (TG_OP = 'INSERT' OR OLD.converted_user_id IS DISTINCT FROM NEW.converted_user_id)
  THEN
    INSERT INTO public.referrals (referrer_id, referred_id, referral_code, status)
    VALUES (NEW.referrer_user_id, NEW.converted_user_id, NEW.code, 'active')
    ON CONFLICT (referred_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_elite_plan(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR auth.uid() <> p_user_id) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = p_user_id AND s.status = 'active'
      AND COALESCE(s.amount_cents, 0) >= 4900
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
  ) OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id
      AND lower(COALESCE(p.plan, 'free')) IN ('elite','business','enterprise','ultimate')
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.has_paid_plan(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  v_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );
  IF v_role IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR auth.uid() <> p_user_id) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = p_user_id AND s.status = 'active'
      AND COALESCE(s.amount_cents, 0) >= 2400
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
  ) OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id
      AND lower(COALESCE(p.plan, 'free')) IN
        ('starter','pro','pro_plus','business','team','elite','enterprise','ultimate','premium')
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$function$
;

CREATE OR REPLACE FUNCTION public.has_unlimited_plan(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = p_user_id
      AND s.status = 'active'
      AND COALESCE(s.amount_cents, 0) >= 2900
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_conversation_member(p_conversation_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations WHERE id = p_conversation_id AND user_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.conversation_members WHERE conversation_id = p_conversation_id AND user_id = p_user_id
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_invite_for_current_user(p_invite_email text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_invite_email = (SELECT email FROM auth.users WHERE id = auth.uid())
$function$
;

CREATE OR REPLACE FUNCTION public.is_service_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role',
    false
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_workspace_admin(_ws uuid, _user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = _ws AND user_id = _user AND role IN ('owner','admin'))
$function$
;

CREATE OR REPLACE FUNCTION public.is_workspace_member(_ws uuid, _user uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR auth.uid() <> _user) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = _ws AND user_id = _user);
END $function$
;

CREATE OR REPLACE FUNCTION public.log_billing_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  role_txt text := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', 'unknown');
  uid uuid := auth.uid();
BEGIN
  IF TG_TABLE_NAME = 'profiles' THEN
    IF NEW.credits IS DISTINCT FROM OLD.credits THEN
      INSERT INTO public.billing_audit_log(actor_role, actor_user_id, table_name, entity_id, column_name, old_value, new_value)
      VALUES (role_txt, uid, 'profiles', NEW.id, 'credits', OLD.credits::text, NEW.credits::text);
    END IF;
    IF NEW.plan IS DISTINCT FROM OLD.plan THEN
      INSERT INTO public.billing_audit_log(actor_role, actor_user_id, table_name, entity_id, column_name, old_value, new_value)
      VALUES (role_txt, uid, 'profiles', NEW.id, 'plan', OLD.plan, NEW.plan);
    END IF;
  ELSIF TG_TABLE_NAME = 'workspaces' THEN
    IF NEW.credits IS DISTINCT FROM OLD.credits THEN
      INSERT INTO public.billing_audit_log(actor_role, actor_user_id, table_name, entity_id, column_name, old_value, new_value)
      VALUES (role_txt, uid, 'workspaces', NEW.id, 'credits', OLD.credits::text, NEW.credits::text);
    END IF;
    IF NEW.plan IS DISTINCT FROM OLD.plan THEN
      INSERT INTO public.billing_audit_log(actor_role, actor_user_id, table_name, entity_id, column_name, old_value, new_value)
      VALUES (role_txt, uid, 'workspaces', NEW.id, 'plan', OLD.plan, NEW.plan);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_security_event(p_event_type text, p_severity text DEFAULT 'info'::text, p_actor_user_id uuid DEFAULT NULL::uuid, p_target_id text DEFAULT NULL::text, p_function_name text DEFAULT NULL::text, p_provider text DEFAULT NULL::text, p_details jsonb DEFAULT '{}'::jsonb, p_ip_hash text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.security_audit_log (
    event_type, severity, actor_user_id, target_id, function_name, provider, details, ip_hash
  ) VALUES (
    p_event_type, p_severity, p_actor_user_id, p_target_id, p_function_name, p_provider, COALESCE(p_details,'{}'::jsonb), p_ip_hash
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_media_key_exhausted(p_key_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.media_provider_keys SET status = 'exhausted', notes = COALESCE(p_reason, notes) WHERE id = p_key_id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_user_id uuid, p_notification_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_notification_ids IS NULL THEN
    UPDATE public.notifications SET read = true WHERE user_id = p_user_id AND read = false;
  ELSE
    UPDATE public.notifications SET read = true WHERE user_id = p_user_id AND id = ANY(p_notification_ids);
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.marketing_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.match_attachment_chunks(query_embedding vector, p_conversation_id uuid, p_match_count integer DEFAULT 5, p_min_similarity double precision DEFAULT 0.4)
 RETURNS TABLE(id uuid, file_name text, chunk_index integer, content text, similarity double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR NOT public.is_conversation_member(p_conversation_id, auth.uid())) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT a.id, a.file_name, a.chunk_index, a.content,
           1 - (a.embedding <=> query_embedding) AS similarity
    FROM public.attachment_chunks a
    WHERE a.conversation_id = p_conversation_id
      AND a.embedding IS NOT NULL
      AND (1 - (a.embedding <=> query_embedding)) >= p_min_similarity
    ORDER BY a.embedding <=> query_embedding
    LIMIT p_match_count;
END $function$
;

CREATE OR REPLACE FUNCTION public.match_skills(query_embedding vector, p_user_id uuid, p_match_count integer DEFAULT 3, p_min_similarity double precision DEFAULT 0.62)
 RETURNS TABLE(id uuid, source text, name text, description text, instructions text, preferred_model text, enabled_tools text[], similarity double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR auth.uid() <> p_user_id) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT s.id, 'user'::text, s.name, s.description, s.instructions, s.preferred_model, s.enabled_tools,
           1 - (s.embedding <=> query_embedding) AS similarity
    FROM public.skills s
    WHERE s.user_id = p_user_id
      AND s.is_enabled IS NOT FALSE
      AND s.embedding IS NOT NULL
      AND (1 - (s.embedding <=> query_embedding)) >= p_min_similarity
    UNION ALL
    SELECT ss.id, 'system'::text, ss.name, ss.description, ss.instructions, ss.preferred_model, ss.enabled_tools,
           1 - (ss.embedding <=> query_embedding) AS similarity
    FROM public.system_skills ss
    WHERE ss.is_active IS NOT FALSE
      AND ss.embedding IS NOT NULL
      AND (1 - (ss.embedding <=> query_embedding)) >= p_min_similarity
    ORDER BY similarity DESC
    LIMIT p_match_count;
END $function$
;

CREATE OR REPLACE FUNCTION public.match_user_memories(p_user_id uuid, p_query_embedding vector, p_match_count integer DEFAULT 6, p_min_similarity double precision DEFAULT 0.25)
 RETURNS TABLE(id uuid, title text, summary text, scope text, created_at timestamp with time zone, similarity double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR auth.uid() <> p_user_id) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT m.id, m.title, m.summary, m.scope, m.created_at,
           1 - (m.embedding <=> p_query_embedding) AS similarity
    FROM public.user_memory_entries m
    WHERE m.user_id = p_user_id
      AND m.embedding IS NOT NULL
      AND 1 - (m.embedding <=> p_query_embedding) >= p_min_similarity
    ORDER BY m.embedding <=> p_query_embedding
    LIMIT p_match_count;
END $function$
;

CREATE OR REPLACE FUNCTION public.match_user_memories(p_user_id uuid, p_query_embedding vector, p_match_count integer DEFAULT 5)
 RETURNS TABLE(id uuid, title text, summary text, similarity double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    m.id,
    m.title,
    m.summary,
    1 - (m.embedding <=> p_query_embedding) AS similarity
  FROM public.user_memory_entries m
  WHERE m.user_id = p_user_id
    AND m.embedding IS NOT NULL
  ORDER BY m.embedding <=> p_query_embedding
  LIMIT p_match_count;
$function$
;

CREATE OR REPLACE FUNCTION public.match_user_messages(query_embedding vector, p_user_id uuid, p_match_count integer DEFAULT 8, p_exclude_conversation uuid DEFAULT NULL::uuid, p_min_similarity double precision DEFAULT 0.55)
 RETURNS TABLE(id uuid, conversation_id uuid, role text, content text, created_at timestamp with time zone, similarity double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR auth.uid() <> p_user_id) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT m.id, m.conversation_id, m.role, m.content, m.created_at,
           1 - (m.embedding <=> query_embedding) AS similarity
    FROM public.messages m
    WHERE m.user_id = p_user_id
      AND m.embedding IS NOT NULL
      AND (p_exclude_conversation IS NULL OR m.conversation_id <> p_exclude_conversation)
      AND (1 - (m.embedding <=> query_embedding)) >= p_min_similarity
    ORDER BY m.embedding <=> query_embedding
    LIMIT p_match_count;
END $function$
;

CREATE OR REPLACE FUNCTION public.model_requires_paid_plan(_model_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    -- Always-free house models
    WHEN lower(coalesce(_model_id,'')) LIKE 'megsy-lite%' THEN false
    WHEN lower(coalesce(_model_id,'')) IN (
      'megsy-image','nano-banana','wan2.7-image-pro','wan2.7-image',
      'wan2.6-image','wan2.6-t2i','qwen-image','z-image-turbo'
    ) THEN false
    -- Chat catalogue
    WHEN EXISTS (
      SELECT 1 FROM public.chat_models m
      WHERE m.model_id = _model_id AND lower(coalesce(m.tier,'free')) = 'free'
    ) THEN false
    WHEN EXISTS (SELECT 1 FROM public.chat_models m WHERE m.model_id = _model_id) THEN true
    -- Image catalogue
    WHEN EXISTS (
      SELECT 1 FROM public.image_models i
      WHERE i.slug = _model_id AND coalesce(i.is_premium,false) = false
    ) THEN false
    WHEN EXISTS (SELECT 1 FROM public.image_models i WHERE i.slug = _model_id) THEN true
    -- Unknown model: fail closed
    ELSE true
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.move_to_dead_letter(p_original_id uuid, p_source_table text, p_last_error text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row record;
  v_id  uuid;
BEGIN
  IF p_source_table = 'background_jobs' THEN
    SELECT user_id, runner, kind, input, error, attempt, provider_errors
      INTO v_row FROM public.background_jobs WHERE id = p_original_id;
  ELSIF p_source_table = 'research_jobs' THEN
    SELECT user_id, NULL::text AS runner, 'research'::text AS kind,
           jsonb_build_object('query', query) AS input,
           error_message AS error, attempt, provider_errors
      INTO v_row FROM public.research_jobs WHERE id = p_original_id;
  ELSE
    RAISE EXCEPTION 'unknown source_table %', p_source_table;
  END IF;

  INSERT INTO public.dead_letter_jobs (
    original_id, source_table, user_id, runner, kind, input,
    last_error, attempts, provider_errors
  ) VALUES (
    p_original_id, p_source_table, v_row.user_id, v_row.runner, v_row.kind, v_row.input,
    COALESCE(p_last_error, v_row.error), COALESCE(v_row.attempt,0), v_row.provider_errors
  ) RETURNING id INTO v_id;

  PERFORM public.log_security_event(
    'dlq_enqueued','warn', v_row.user_id, p_original_id::text, NULL, NULL,
    jsonb_build_object('source', p_source_table, 'error', p_last_error)
  );

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_admin_new_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_email text;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = NEW.id;

  PERFORM net.http_post(
    url := 'https://ltgampdtawuefwwayncx.supabase.co/functions/v1/telegram-admin-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Secret', 'mgs_notify_7K9pQ2rV4nL8wX3cF6tY1bN5jH0aZ_v1'
    ),
    body := jsonb_build_object(
      'action', 'signup',
      'user_id', NEW.id::text,
      'email', COALESCE(user_email, ''),
      'name', COALESCE(NEW.display_name, split_part(COALESCE(user_email, ''), '@', 1))
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_harmony_on_generation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tg_id BIGINT;
  webhook_secret TEXT;
  msg TEXT;
BEGIN
  IF NEW.status <> 'completed' OR (OLD.status IS NOT DISTINCT FROM NEW.status) THEN
    RETURN NEW;
  END IF;
  SELECT telegram_id INTO tg_id FROM public.telegram_users WHERE user_id = NEW.user_id LIMIT 1;
  IF tg_id IS NULL THEN RETURN NEW; END IF;
  SELECT decrypted_secret INTO webhook_secret FROM vault.decrypted_secrets WHERE name = 'TELEGRAM_HARMONY_WEBHOOK_SECRET' LIMIT 1;
  IF webhook_secret IS NULL THEN RETURN NEW; END IF;
  msg := '<b>Your ' || COALESCE(NEW.job_type,'job') || ' is ready</b>' || E'\nOpen Megsy AI to view the result.';
  PERFORM net.http_post(
    url := 'https://ltgampdtawuefwwayncx.supabase.co/functions/v1/telegram-tasks-bot/harmony/notify',
    headers := jsonb_build_object('Content-Type','application/json','x-harmony-secret',webhook_secret),
    body := jsonb_build_object('telegram_id', tg_id, 'text', msg)
  );
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION public.notify_harmony_on_research()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tg_id BIGINT;
  webhook_secret TEXT;
BEGIN
  IF NEW.status <> 'completed' OR (OLD.status IS NOT DISTINCT FROM NEW.status) THEN
    RETURN NEW;
  END IF;
  SELECT telegram_id INTO tg_id FROM public.telegram_users WHERE user_id = NEW.user_id LIMIT 1;
  IF tg_id IS NULL THEN RETURN NEW; END IF;
  SELECT decrypted_secret INTO webhook_secret FROM vault.decrypted_secrets WHERE name = 'TELEGRAM_HARMONY_WEBHOOK_SECRET' LIMIT 1;
  IF webhook_secret IS NULL THEN RETURN NEW; END IF;
  PERFORM net.http_post(
    url := 'https://ltgampdtawuefwwayncx.supabase.co/functions/v1/telegram-tasks-bot/harmony/notify',
    headers := jsonb_build_object('Content-Type','application/json','x-harmony-secret',webhook_secret),
    body := jsonb_build_object('telegram_id', tg_id, 'text', '<b>Deep Research complete</b>' || E'\nOpen Megsy AI to read the report.')
  );
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION public.notify_user_milestone()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  total bigint;
BEGIN
  SELECT count(*) INTO total FROM auth.users;
  IF total > 0 AND total % 1000 = 0 THEN
    INSERT INTO public.admin_notifications(type, payload)
    VALUES ('user_milestone', jsonb_build_object('total_users', total));
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.on_new_profile_welcome()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_email text;
  user_name text;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = NEW.id;
  user_name := COALESCE(NEW.display_name, split_part(user_email, '@', 1));
  
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.anon_key', true)
    ),
    body := jsonb_build_object(
      'to', user_email,
      'template', 'welcome',
      'user_id', NEW.id::text,
      'type', 'system',
      'variables', jsonb_build_object(
        'name', user_name,
        'app_url', 'https://smart-hub-egy.lovable.app'
      )
    )
  );
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.owns_conversation(p_conversation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conversation_id AND user_id = auth.uid()
  )
$function$
;

CREATE OR REPLACE FUNCTION public.parallel_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.pick_api_key(p_service text)
 RETURNS TABLE(id uuid, api_key text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  (
    SELECT k.id, k.api_key
    FROM public.alibaba_keys k
    WHERE p_service = 'alibaba'
      AND COALESCE(k.status, 'active') = 'active'
      AND COALESCE(k.failure_count, 0) < 5
    ORDER BY k.last_used_at NULLS FIRST, COALESCE(k.failure_count, 0) ASC
    LIMIT 1
  )
  UNION ALL
  (
    SELECT k.id, k.api_key
    FROM public.api_keys k
    WHERE p_service <> 'alibaba'
      AND k.service = p_service
      AND k.is_active = true
      AND k.is_blocked = false
      AND (k.cooldown_until IS NULL OR k.cooldown_until <= now())
      AND k.credit_used_usd < k.credit_limit_usd
    ORDER BY k.last_used_at NULLS FIRST, k.credit_used_usd ASC
    LIMIT 1
  )
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.pick_v0_key()
 RETURNS TABLE(id uuid, api_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_key text;
BEGIN
  UPDATE public.v0_api_keys
    SET messages_used = 0, window_started_at = now()
    WHERE is_active
      AND NOT is_blocked
      AND window_started_at < now() - interval '24 hours';

  SELECT k.id, k.api_key INTO v_id, v_key
  FROM public.v0_api_keys k
  WHERE k.is_active
    AND NOT k.is_blocked
    AND k.messages_used < k.message_limit
  ORDER BY k.messages_used ASC, COALESCE(k.last_used_at, k.created_at) ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.v0_api_keys
    SET messages_used = messages_used + 1,
        last_used_at = now()
    WHERE public.v0_api_keys.id = v_id;

  RETURN QUERY SELECT v_id, v_key;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_self_referral()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.referrer_id = NEW.referred_id THEN
    RAISE EXCEPTION 'self_referral_not_allowed';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_polar_order(p_order_id text, p_user_id uuid, p_product_id text, p_plan text, p_credits numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_credits numeric;
BEGIN
  -- Atomic insert; raises 23505 on duplicate
  INSERT INTO public.processed_orders (polar_order_id, user_id, product_id, plan, credits)
  VALUES (p_order_id, p_user_id, p_product_id, p_plan, p_credits);

  -- Credit user
  UPDATE public.profiles
  SET credits = credits + p_credits, plan = p_plan, updated_at = now()
  WHERE id = p_user_id
  RETURNING credits INTO new_credits;

  IF new_credits IS NULL THEN
    RAISE EXCEPTION 'User profile not found: %', p_user_id;
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, action_type, description)
  VALUES (p_user_id, -p_credits, 'subscription_purchase',
          'Subscription: ' || p_plan || ' (Polar order ' || p_order_id || ')');

  RETURN jsonb_build_object('success', true, 'credits', new_credits, 'duplicate', false);

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_referral_purchase()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prior_count int;
  v_ref_id uuid;
  v_referrer_id uuid;
  v_mode text;
  v_amount_cents bigint;
  v_commission numeric;
BEGIN
  -- Only on the user's FIRST successful order
  SELECT COUNT(*) INTO v_prior_count
    FROM public.processed_orders
    WHERE user_id = NEW.user_id AND id <> NEW.id;
  IF v_prior_count > 0 THEN RETURN NEW; END IF;

  -- Find pending referral for this user
  SELECT id, referrer_id INTO v_ref_id, v_referrer_id
    FROM public.referrals
    WHERE referred_id = NEW.user_id AND status = 'pending'
    LIMIT 1;
  IF v_ref_id IS NULL THEN RETURN NEW; END IF;

  -- Resolve referrer's chosen reward mode
  SELECT COALESCE(referral_mode, 'cash') INTO v_mode
    FROM public.referral_codes
    WHERE user_id = v_referrer_id LIMIT 1;

  IF v_mode = 'credits' THEN
    PERFORM public.add_credits(v_referrer_id, 15::numeric, 'Referral reward: friend subscribed');
    INSERT INTO public.referral_earnings
      (referrer_id, referred_id, amount, source_action, available_at)
    VALUES
      (v_referrer_id, NEW.user_id, 0, 'credits_15', now());
  ELSE
    -- Cash 20% of the first successful payment
    SELECT (payload->'data'->>'total_amount')::bigint INTO v_amount_cents
      FROM public.payment_events
      WHERE payload->'data'->>'id' = NEW.polar_order_id
        AND event_type IN ('order.paid','order.created','order.updated')
        AND (payload->'data'->>'total_amount') IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1;

    IF v_amount_cents IS NULL OR v_amount_cents <= 0 THEN
      RETURN NEW;
    END IF;

    v_commission := round((v_amount_cents::numeric / 100.0) * 0.20, 2);

    INSERT INTO public.referral_earnings
      (referrer_id, referred_id, amount, source_action, available_at)
    VALUES
      (v_referrer_id, NEW.user_id, v_commission, 'cash_20', now() + interval '30 days');
  END IF;

  UPDATE public.referrals SET status = 'converted' WHERE id = v_ref_id;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_credit_transactions_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'credit_transactions is append-only'
    USING ERRCODE = '42501';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_kashier_order_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_service_role() THEN
    RETURN NEW;
  END IF;
  -- Force safe defaults regardless of what the client sent
  NEW.status := 'pending';
  NEW.kashier_ref := NULL;
  NEW.raw := NULL;
  -- Force user_id = auth.uid()
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_kashier_order_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_service_role() THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'permission denied: kashier_orders can only be modified by the payment webhook'
    USING ERRCODE = '42501';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_profile_billing_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_service_role() THEN
    RETURN NEW;
  END IF;

  IF NEW.credits IS DISTINCT FROM OLD.credits THEN
    RAISE EXCEPTION 'permission denied: profiles.credits is server-managed'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    RAISE EXCEPTION 'permission denied: profiles.plan is server-managed'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.image_free_uses IS DISTINCT FROM OLD.image_free_uses THEN
    RAISE EXCEPTION 'permission denied: profiles.image_free_uses is server-managed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_profile_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('role', true) = 'service_role'
     OR current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    RAISE EXCEPTION 'Cannot modify plan column directly';
  END IF;
  IF NEW.credits IS DISTINCT FROM OLD.credits THEN
    RAISE EXCEPTION 'Cannot modify credits column directly';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Cannot modify created_at column directly';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Cannot modify id column directly';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_workspace_billing_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_service_role() THEN
    RETURN NEW;
  END IF;

  IF NEW.credits IS DISTINCT FROM OLD.credits THEN
    RAISE EXCEPTION 'permission denied: workspaces.credits is server-managed'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    RAISE EXCEPTION 'permission denied: workspaces.plan is server-managed'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.default_member_monthly_limit IS DISTINCT FROM OLD.default_member_monthly_limit THEN
    -- Allow admins to change this via a dedicated RPC in the future; block direct writes
    IF NOT public.is_workspace_admin(OLD.id, auth.uid()) THEN
      RAISE EXCEPTION 'permission denied: only workspace admin can change member limit'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_workspace_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- service_role and superuser bypass (edge functions, RPCs)
  IF current_setting('role', true) = 'service_role'
     OR current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_user IN ('postgres','supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Block any non-zero credit grant at creation
    NEW.credits := 0;
    -- Plan must be NULL on create; set via verified topup flow
    NEW.plan := NULL;
    NEW.archived_at := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE: forbid changing critical columns from client
  IF NEW.credits IS DISTINCT FROM OLD.credits THEN
    RAISE EXCEPTION 'workspace.credits is read-only (use topup flow)';
  END IF;
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    RAISE EXCEPTION 'workspace.plan is read-only (use billing flow)';
  END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'workspace.owner_id is read-only (use workspace_transfer_ownership)';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'workspace.id is immutable';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'workspace.created_at is immutable';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_workspace_invite_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('role', true) = 'service_role'
     OR current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.invite_token IS DISTINCT FROM OLD.invite_token THEN
    RAISE EXCEPTION 'Cannot modify invite_token';
  END IF;
  IF NEW.invite_email IS DISTINCT FROM OLD.invite_email THEN
    RAISE EXCEPTION 'Cannot modify invite_email';
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Cannot modify role';
  END IF;
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
    RAISE EXCEPTION 'Cannot modify workspace_id';
  END IF;
  IF NEW.invited_by IS DISTINCT FROM OLD.invited_by THEN
    RAISE EXCEPTION 'Cannot modify invited_by';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_workspace_member_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('role', true) = 'service_role'
     OR current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_user IN ('postgres','supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Never let client insert an 'owner' row directly; owner is set by the
    -- workspace_add_owner_member trigger (SECURITY DEFINER) at workspace creation.
    IF NEW.role = 'owner' THEN
      RAISE EXCEPTION 'cannot assign owner role directly (use workspace_transfer_ownership)';
    END IF;
    -- Force monthly counters to safe defaults on insert
    NEW.monthly_used := 0;
    NEW.monthly_period_start := date_trunc('month', now());
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'workspace_members identity is immutable';
  END IF;
  -- Block direct promotion to owner; must go through workspace_transfer_ownership RPC
  IF NEW.role = 'owner' AND OLD.role <> 'owner' THEN
    RAISE EXCEPTION 'use workspace_transfer_ownership to assign owner role';
  END IF;
  -- Block monthly_used tampering from client (only deduct_credits RPC may change it)
  IF NEW.monthly_used IS DISTINCT FROM OLD.monthly_used THEN
    RAISE EXCEPTION 'workspace_members.monthly_used is read-only (use workspace_deduct_credits)';
  END IF;
  IF NEW.monthly_period_start IS DISTINCT FROM OLD.monthly_period_start THEN
    RAISE EXCEPTION 'workspace_members.monthly_period_start is read-only';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_api_key_usage(p_id uuid, p_cost_usd numeric DEFAULT 0, p_ok boolean DEFAULT true, p_error text DEFAULT NULL::text, p_status_code integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  k record;
  v_next_day timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day';
BEGIN
  SELECT * INTO k FROM public.api_keys WHERE id = p_id FOR UPDATE;
  IF FOUND THEN
    UPDATE public.api_keys
    SET usage_count    = usage_count + 1,
        credit_used_usd = credit_used_usd + COALESCE(p_cost_usd, 0),
        last_used_at   = now(),
        error_count    = error_count + CASE WHEN p_ok THEN 0 ELSE 1 END,
        last_error_at  = CASE WHEN p_ok THEN last_error_at ELSE now() END,
        -- On success, clear any lingering same-day cooldown.
        cooldown_until = CASE
                            WHEN p_ok THEN NULL
                            -- Credit exhausted: hard block, no cooldown escape.
                            WHEN credit_used_usd + COALESCE(p_cost_usd, 0) >= credit_limit_usd THEN cooldown_until
                            -- Auth/quota: put the key on cooldown until next UTC day
                            -- instead of blocking it permanently, so it re-enters
                            -- the rotation tomorrow.
                            WHEN p_status_code IN (401, 402, 403) THEN v_next_day
                            WHEN p_status_code = 429 THEN v_next_day
                            ELSE cooldown_until
                          END,
        is_blocked     = CASE
                            WHEN credit_used_usd + COALESCE(p_cost_usd, 0) >= credit_limit_usd THEN true
                            ELSE is_blocked
                          END,
        block_reason   = CASE
                            WHEN credit_used_usd + COALESCE(p_cost_usd, 0) >= credit_limit_usd THEN 'credit_exhausted'
                            WHEN p_status_code IN (401, 402, 403) THEN 'auth_or_payment_cooldown'
                            WHEN p_status_code = 429 THEN 'rate_limited_cooldown'
                            ELSE block_reason
                          END
    WHERE id = p_id;
    RETURN;
  END IF;

  UPDATE public.alibaba_keys
  SET last_used_at  = now(),
      failure_count = CASE WHEN p_ok THEN 0 ELSE COALESCE(failure_count, 0) + 1 END,
      last_error    = CASE WHEN p_ok THEN last_error ELSE LEFT(COALESCE(p_error, ''), 500) END,
      status        = CASE
                        WHEN NOT p_ok AND p_status_code IN (401, 402, 403) THEN 'blocked'
                        WHEN NOT p_ok AND COALESCE(failure_count, 0) + 1 >= 5 THEN 'blocked'
                        ELSE COALESCE(status, 'active')
                      END,
      updated_at    = now()
  WHERE id = p_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_referral_commission(_referred uuid, _net_cents integer, _subscription uuid, _source text DEFAULT 'subscription'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _referrer uuid;
  _pct numeric;
  _amount numeric;
  _earning_id uuid;
BEGIN
  IF _net_cents IS NULL OR _net_cents <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT referrer_id INTO _referrer
    FROM public.referrals
   WHERE referred_id = _referred
   ORDER BY created_at ASC
   LIMIT 1;

  IF _referrer IS NULL OR _referrer = _referred THEN
    RETURN NULL;
  END IF;

  SELECT rate_pct INTO _pct FROM public.calc_referral_stats(_referrer);
  IF _pct IS NULL THEN _pct := 20; END IF;

  _amount := ROUND((_net_cents::numeric * _pct / 100.0) / 100.0, 2);

  INSERT INTO public.referral_earnings
    (referrer_id, referred_id, amount, source_action, available_at, commission_pct, net_revenue_cents, subscription_id, period_start)
  VALUES
    (_referrer, _referred, _amount, _source, now() + interval '14 days', _pct, _net_cents, _subscription, (now() at time zone 'utc')::date)
  ON CONFLICT (referrer_id, subscription_id, source_action, period_start) DO NOTHING
  RETURNING id INTO _earning_id;

  RETURN _earning_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_attachment_chunks(p_user_id uuid, p_conversation_id uuid, p_query_embedding vector, p_match_count integer DEFAULT 5)
 RETURNS TABLE(id uuid, file_name text, chunk_index integer, content text, similarity double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.id, c.file_name, c.chunk_index, c.content, 1 - (c.embedding <=> p_query_embedding) AS similarity
  FROM public.attachment_chunks c
  WHERE c.user_id = p_user_id
    AND (p_conversation_id IS NULL OR c.conversation_id = p_conversation_id)
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT p_match_count;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at_hitl()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.spend_credits_auto(p_user_id uuid, p_amount numeric, p_action_type text, p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ws uuid; v_member record; v_ws_row record; v_new_credits numeric; v_result jsonb;
  v_role text;
BEGIN
  v_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), ''),
    current_user
  );
  IF v_role IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR auth.uid() <> p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'auth_required'); END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'invalid_amount'); END IF;

  SELECT active_workspace_id INTO v_ws FROM public.profiles WHERE id = p_user_id;
  IF v_ws IS NOT NULL THEN
    SELECT * INTO v_member FROM public.workspace_members
      WHERE workspace_id = v_ws AND user_id = p_user_id FOR UPDATE;
    IF v_member.id IS NOT NULL THEN
      IF date_trunc('month', now()) > date_trunc('month', v_member.monthly_period_start) THEN
        UPDATE public.workspace_members SET monthly_used = 0, monthly_period_start = date_trunc('month', now())
          WHERE id = v_member.id;
        v_member.monthly_used := 0;
      END IF;
      IF v_member.monthly_limit IS NOT NULL AND (v_member.monthly_used + p_amount) > v_member.monthly_limit THEN
        RETURN jsonb_build_object('success', false, 'error', 'monthly_limit_exceeded',
          'source', 'workspace', 'limit', v_member.monthly_limit, 'used', v_member.monthly_used);
      END IF;
      SELECT * INTO v_ws_row FROM public.workspaces WHERE id = v_ws FOR UPDATE;
      IF v_ws_row.credits < p_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'insufficient_workspace_credits',
          'source', 'workspace', 'credits', v_ws_row.credits);
      END IF;
      v_new_credits := v_ws_row.credits - p_amount;
      UPDATE public.workspaces SET credits = v_new_credits, updated_at = now() WHERE id = v_ws;
      UPDATE public.workspace_members SET monthly_used = monthly_used + p_amount WHERE id = v_member.id;
      INSERT INTO public.workspace_usage (workspace_id, user_id, amount, action_type, description)
        VALUES (v_ws, p_user_id, p_amount, p_action_type, p_description);
      RETURN jsonb_build_object('success', true, 'source', 'workspace',
        'credits', v_new_credits, 'monthly_used', v_member.monthly_used + p_amount);
    END IF;
  END IF;
  v_result := public.deduct_credits(p_user_id, p_amount, p_action_type, p_description);
  RETURN COALESCE(v_result, '{}'::jsonb) || jsonb_build_object('source', 'personal');
END $function$
;

CREATE OR REPLACE FUNCTION public.spend_credits_auto(p_user_id uuid, p_workspace_id uuid, p_amount numeric, p_action_type text, p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_member record; v_ws record; v_new_credits numeric; v_personal jsonb;
  v_role text;
BEGIN
  v_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), ''),
    current_user
  );
  IF v_role IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR auth.uid() <> p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'auth_required'); END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'invalid_amount'); END IF;

  IF p_workspace_id IS NOT NULL THEN
    SELECT * INTO v_member FROM public.workspace_members
      WHERE workspace_id = p_workspace_id AND user_id = p_user_id FOR UPDATE;
    IF v_member.id IS NOT NULL THEN
      IF date_trunc('month', now()) > date_trunc('month', v_member.monthly_period_start) THEN
        UPDATE public.workspace_members SET monthly_used = 0, monthly_period_start = date_trunc('month', now())
          WHERE id = v_member.id;
        v_member.monthly_used := 0;
      END IF;
      IF v_member.monthly_limit IS NOT NULL AND (v_member.monthly_used + p_amount) > v_member.monthly_limit THEN
        RETURN jsonb_build_object('success', false, 'error', 'monthly_limit_exceeded',
          'limit', v_member.monthly_limit, 'used', v_member.monthly_used);
      END IF;
      SELECT * INTO v_ws FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;
      IF v_ws.credits < p_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'insufficient_workspace_credits',
          'credits', v_ws.credits);
      END IF;
      v_new_credits := v_ws.credits - p_amount;
      UPDATE public.workspaces SET credits = v_new_credits, updated_at = now() WHERE id = p_workspace_id;
      UPDATE public.workspace_members SET monthly_used = monthly_used + p_amount WHERE id = v_member.id;
      INSERT INTO public.workspace_usage (workspace_id, user_id, amount, action_type, description)
        VALUES (p_workspace_id, p_user_id, p_amount, p_action_type, p_description);
      RETURN jsonb_build_object('success', true, 'source', 'workspace',
        'credits', v_new_credits, 'monthly_used', v_member.monthly_used + p_amount);
    END IF;
  END IF;
  v_personal := public.deduct_credits(p_user_id, p_amount, p_action_type, p_description);
  RETURN COALESCE(v_personal, '{}'::jsonb) || jsonb_build_object('source', 'personal');
END $function$
;

CREATE OR REPLACE FUNCTION public.spend_user_credits(p_user_id uuid, p_amount numeric, p_action_type text, p_description text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_balance numeric;
  new_balance numeric;
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  SELECT credits INTO current_balance FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'profile not found';
  END IF;
  IF current_balance < p_amount THEN
    RAISE EXCEPTION 'insufficient credits' USING ERRCODE = 'P0001';
  END IF;

  new_balance := current_balance - p_amount;
  UPDATE public.profiles SET credits = new_balance WHERE id = p_user_id;

  INSERT INTO public.credit_transactions(user_id, amount, action_type, description)
  VALUES (p_user_id, -p_amount, p_action_type, p_description);

  RETURN new_balance;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_marketing_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END $function$
;

CREATE OR REPLACE FUNCTION public.tg_processed_orders_record_referral()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _amount_usd numeric;
  _net_cents  integer;
  _sub        uuid;
BEGIN
  -- Resolve price:
  --  1) exact plan_key + monthly interval (subscription)
  --  2) any active row for that plan_key
  --  3) topup row with matching credits
  IF NEW.plan IS NOT NULL THEN
    SELECT amount_usd INTO _amount_usd
      FROM public.billing_skus
     WHERE plan_key = NEW.plan
       AND kind = 'subscription'
       AND interval = 'monthly'
       AND active = true
       AND amount_usd IS NOT NULL
     ORDER BY sort_order
     LIMIT 1;

    IF _amount_usd IS NULL THEN
      SELECT amount_usd INTO _amount_usd
        FROM public.billing_skus
       WHERE plan_key = NEW.plan
         AND amount_usd IS NOT NULL
       ORDER BY sort_order
       LIMIT 1;
    END IF;
  END IF;

  IF _amount_usd IS NULL AND NEW.credits IS NOT NULL AND NEW.credits > 0 THEN
    SELECT amount_usd INTO _amount_usd
      FROM public.billing_skus
     WHERE kind = 'topup'
       AND credits = NEW.credits
       AND amount_usd IS NOT NULL
     ORDER BY sort_order
     LIMIT 1;
  END IF;

  IF _amount_usd IS NULL OR _amount_usd <= 0 THEN
    RETURN NEW; -- nothing to record; do not block the order write
  END IF;

  _net_cents := (_amount_usd * 100)::integer;

  -- Deterministic subscription uuid from the Dodo order id so retries stay
  -- idempotent even if the same order fires the trigger twice.
  _sub := md5('dodo:' || COALESCE(NEW.polar_order_id, NEW.id::text))::uuid;

  BEGIN
    PERFORM public.record_referral_commission(
      NEW.user_id,
      _net_cents,
      _sub,
      'dodo_purchase'
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never break the order insert because of referral bookkeeping.
    RAISE WARNING 'record_referral_commission (dodo) failed for order %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_template_images_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.touch_chat_models_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_i18n_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_operator_settings()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END $function$
;

CREATE OR REPLACE FUNCTION public.trigger_referral_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.create_notification(
    NEW.referrer_id, 'referral',
    'New Referral!',
    'Someone signed up using your referral code. You''ll earn 20% commission on their activity!',
    jsonb_build_object('referral_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_welcome_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_email text;
  user_name text;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = NEW.id;
  user_name := COALESCE(NEW.display_name, split_part(COALESCE(user_email, ''), '@', 1));
  
  PERFORM extensions.http_post(
    'https://ltgampdtawuefwwayncx.supabase.co/functions/v1/send-email'::text,
    jsonb_build_object(
      'to', user_email,
      'template', 'welcome',
      'user_id', NEW.id::text,
      'type', 'system',
      'variables', jsonb_build_object(
        'name', user_name,
        'app_url', 'https://smart-hub-egy.lovable.app'
      )
    )::text,
    'application/json'::text
  );
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_withdrawal_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_email text;
  user_name text;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = NEW.user_id;
  SELECT COALESCE(display_name, split_part(COALESCE(user_email, ''), '@', 1)) INTO user_name
    FROM public.profiles WHERE id = NEW.user_id;
  
  PERFORM extensions.http_post(
    'https://ltgampdtawuefwwayncx.supabase.co/functions/v1/send-email'::text,
    jsonb_build_object(
      'to', user_email,
      'template', 'transaction',
      'user_id', NEW.user_id::text,
      'type', 'credits',
      'variables', jsonb_build_object(
        'name', user_name,
        'action', 'Withdrawal Request',
        'amount', NEW.amount::text || ' MC',
        'remaining', '—',
        'app_url', 'https://smart-hub-egy.lovable.app'
      )
    )::text,
    'application/json'::text
  );
  
  -- Also create in-app notification
  PERFORM public.create_notification(
    NEW.user_id, 'credits',
    'Withdrawal Request Submitted',
    'Your withdrawal of ' || NEW.amount::text || ' MC via ' || NEW.method || ' is being processed.',
    jsonb_build_object('amount', NEW.amount)
  );
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_profile_safe(p_user_id uuid, p_display_name text DEFAULT NULL::text, p_avatar_url text DEFAULT NULL::text, p_two_factor_enabled boolean DEFAULT NULL::boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.profiles
  SET
    display_name = COALESCE(p_display_name, display_name),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    two_factor_enabled = COALESCE(p_two_factor_enabled, two_factor_enabled),
    updated_at = now()
  WHERE id = p_user_id AND p_user_id = auth.uid();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_telegram_media_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.verify_external_api_key(p_key_hash text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.external_subscription_api_keys
    SET usage_count = usage_count + 1,
        last_used_at = now()
    WHERE key_hash = p_key_hash AND is_active = true
    RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.watchdog_resume_background()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec record;
  n int := 0;
  base_url text := 'https://ltgampdtawuefwwayncx.supabase.co/functions/v1/';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0Z2FtcGR0YXd1ZWZ3d2F5bmN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3Njk5ODAsImV4cCI6MjA4ODM0NTk4MH0.5ZOzuxCrm-TO4zzRDJ68LrCLH3f0itiznUxhbEupvGg';
  internal_secret text;
  endpoint text;
  effective_runner text;
begin
  select decrypted_secret into internal_secret
    from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_SECRET' limit 1;

  for rec in select * from public.claim_stale_background_jobs(90) loop
    n := n + 1;
    if rec.status <> 'queued' then continue; end if;

    effective_runner := rec.runner;
    if effective_runner is null then
      effective_runner := case rec.kind
        when 'slides' then 'chat-slides-stream'
        when 'docs'   then 'docs-generate'
        when 'video'  then 'media-video'
        else null
      end;
    end if;

    if effective_runner is null then
      update public.background_jobs
         set status = 'error',
             error = coalesce(error, 'No runner registered for this job kind ('||rec.kind||')'),
             finished_at = now(),
             updated_at = now()
       where id = rec.id;
      continue;
    end if;

    endpoint := base_url || effective_runner;
    perform net.http_post(
      url := endpoint,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key,
        'apikey', anon_key,
        'x-internal-secret', coalesce(internal_secret,'')
      ),
      body := jsonb_build_object(
        'action', 'resume',
        'jobId', rec.id,
        'job_id', rec.id,
        'attempt', rec.attempt,
        'user_id', rec.user_id,
        'input', rec.input
      )
    );
  end loop;
  return n;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.watchdog_resume_operator()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  base_url text := 'https://ltgampdtawuefwwayncx.supabase.co/functions/v1';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0Z2FtcGR0YXd1ZWZ3d2F5bmN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3Njk5ODAsImV4cCI6MjA4ODM0NTk4MH0.5ZOzuxCrm-TO4zzRDJ68LrCLH3f0itiznUxhbEupvGg';
begin
  for r in
    select id from public.operator_runs
    where status = 'running'
      and (last_tick_at is null or last_tick_at < now() - interval '120 seconds')
    limit 20
  loop
    perform net.http_post(
      url := base_url || '/operator-orchestrator',
      headers := jsonb_build_object('Content-Type','application/json','apikey',anon_key,'Authorization','Bearer '||anon_key,'x-internal-call','1'),
      body := jsonb_build_object('run_id', r.id)
    );
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.workspace_accept_invite(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invite record;
  v_uid uuid := auth.uid();
  v_email text;
  v_ws_name text;
  v_acceptor_name text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  SELECT id, workspace_id, invite_email, role, status, expires_at, invited_by
    INTO v_invite
    FROM public.workspace_invites
    WHERE invite_token = p_token;

  IF v_invite.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;
  IF v_invite.status <> 'pending' THEN RETURN jsonb_build_object('success', false, 'error', 'already_used'); END IF;
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  END IF;

  IF v_invite.invite_email IS NOT NULL AND length(trim(v_invite.invite_email)) > 0 THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
    IF v_email IS NULL OR lower(v_email) <> lower(v_invite.invite_email) THEN
      RETURN jsonb_build_object('success', false, 'error', 'email_mismatch');
    END IF;
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_invite.workspace_id, v_uid, v_invite.role)
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  UPDATE public.workspace_invites
    SET status = 'accepted', accepted_by = v_uid, accepted_at = now()
    WHERE id = v_invite.id;

  -- Notify the inviter
  SELECT name INTO v_ws_name FROM public.workspaces WHERE id = v_invite.workspace_id;
  SELECT COALESCE(display_name, 'Someone') INTO v_acceptor_name FROM public.profiles WHERE id = v_uid;

  IF v_invite.invited_by IS NOT NULL AND v_invite.invited_by <> v_uid THEN
    INSERT INTO public.notifications (user_id, type, title, message, metadata)
    VALUES (
      v_invite.invited_by,
      'workspace_invite_accepted',
      'Invite accepted',
      v_acceptor_name || ' joined ' || COALESCE(v_ws_name, 'your workspace'),
      jsonb_build_object(
        'workspace_id', v_invite.workspace_id,
        'workspace_name', v_ws_name,
        'invite_id', v_invite.id,
        'accepted_by', v_uid,
        'accepted_by_name', v_acceptor_name
      )
    );
  END IF;

  -- Mark the original invite notification (if any) as read for the acceptor
  UPDATE public.notifications
    SET read = true
    WHERE user_id = v_uid
      AND type = 'workspace_invite'
      AND (metadata->>'invite_id')::uuid = v_invite.id;

  RETURN jsonb_build_object('success', true, 'workspace_id', v_invite.workspace_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.workspace_add_owner_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.workspace_apply_topup(p_workspace_id uuid, p_amount_credits numeric, p_amount_usd numeric, p_polar_order_id text, p_initiated_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_invoice text; v_id uuid;
BEGIN
  v_invoice := 'INV-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,8);
  INSERT INTO public.workspace_credit_topups (workspace_id, initiated_by, amount_credits, amount_usd, status, invoice_number, polar_order_id)
  VALUES (p_workspace_id, p_initiated_by, p_amount_credits, p_amount_usd, 'succeeded', v_invoice, p_polar_order_id)
  RETURNING id INTO v_id;
  UPDATE public.workspaces SET credits = credits + p_amount_credits, updated_at = now() WHERE id = p_workspace_id;
  PERFORM public.workspace_log(p_workspace_id, 'topup_applied', 'topup', v_id::text, jsonb_build_object('credits', p_amount_credits, 'usd', p_amount_usd));
  RETURN jsonb_build_object('success', true, 'invoice', v_invoice);
END $function$
;

CREATE OR REPLACE FUNCTION public.workspace_approve_request(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_req record;
BEGIN
  SELECT * INTO v_req FROM public.workspace_join_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RETURN jsonb_build_object('success',false,'error','not_found'); END IF;
  IF NOT public.is_workspace_admin(v_req.workspace_id, v_uid) THEN
    RETURN jsonb_build_object('success',false,'error','forbidden');
  END IF;
  INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES (v_req.workspace_id, v_req.user_id, 'member')
    ON CONFLICT DO NOTHING;
  UPDATE public.workspace_join_requests SET status='approved', reviewed_by=v_uid, reviewed_at=now() WHERE id=p_request_id;
  PERFORM public.workspace_log(v_req.workspace_id, 'request_approved', 'user', v_req.user_id::text, '{}'::jsonb);
  RETURN jsonb_build_object('success', true);
END $function$
;

CREATE OR REPLACE FUNCTION public.workspace_archive(p_ws uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_workspace_admin(p_ws, v_uid) THEN
    RETURN jsonb_build_object('success',false,'error','forbidden');
  END IF;
  UPDATE public.workspaces SET archived_at = now() WHERE id = p_ws;
  PERFORM public.workspace_log(p_ws, 'workspace_archived', 'workspace', p_ws::text, '{}'::jsonb);
  RETURN jsonb_build_object('success', true);
END $function$
;

CREATE OR REPLACE FUNCTION public.workspace_create_api_key(p_ws uuid, p_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_key text; v_hash text; v_prefix text; v_id uuid;
BEGIN
  IF NOT public.is_workspace_admin(p_ws, v_uid) THEN
    RETURN jsonb_build_object('success',false,'error','forbidden');
  END IF;
  v_key := 'mwsk_' || encode(extensions.gen_random_bytes(24), 'hex');
  v_prefix := substring(v_key, 1, 12);
  v_hash := encode(extensions.digest(v_key, 'sha256'), 'hex');
  INSERT INTO public.workspace_api_keys (workspace_id, name, key_prefix, key_hash, created_by)
  VALUES (p_ws, p_name, v_prefix, v_hash, v_uid) RETURNING id INTO v_id;
  PERFORM public.workspace_log(p_ws, 'api_key_created', 'api_key', v_id::text, jsonb_build_object('name', p_name));
  RETURN jsonb_build_object('success', true, 'key', v_key, 'id', v_id);
END $function$
;

CREATE OR REPLACE FUNCTION public.workspace_create_invite(p_workspace_id uuid, p_email text, p_role workspace_role DEFAULT 'member'::workspace_role)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_token text;
  v_id uuid;
  v_email text := lower(trim(p_email));
  v_target uuid;
  v_ws_name text;
  v_inviter text;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;
  IF NOT public.is_workspace_admin(p_workspace_id, v_user) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;
  IF v_email IS NULL OR v_email = '' OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_email');
  END IF;

  INSERT INTO public.workspace_invites (workspace_id, invited_by, invite_email, role)
  VALUES (p_workspace_id, v_user, v_email, p_role)
  RETURNING id, invite_token INTO v_id, v_token;

  SELECT id INTO v_target FROM auth.users WHERE lower(email) = v_email LIMIT 1;

  IF v_target IS NOT NULL THEN
    SELECT name INTO v_ws_name FROM public.workspaces WHERE id = p_workspace_id;
    SELECT COALESCE(display_name, 'A teammate') INTO v_inviter FROM public.profiles WHERE id = v_user;

    PERFORM public.create_notification(
      v_target,
      'workspace_invite',
      'دعوة لمساحة عمل: ' || COALESCE(v_ws_name, 'Workspace'),
      COALESCE(v_inviter, 'مستخدم') || ' دعاك للانضمام إلى مساحة العمل.',
      jsonb_build_object(
        'workspace_id', p_workspace_id,
        'workspace_name', v_ws_name,
        'invite_id', v_id,
        'invite_token', v_token,
        'role', p_role,
        'link', '/auth/accept-workspace-invite?token=' || v_token
      )
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'invite_id', v_id, 'token', v_token,
    'notified_in_app', v_target IS NOT NULL);
END
$function$
;

CREATE OR REPLACE FUNCTION public.workspace_decline_invite(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invite record;
  v_uid uuid := auth.uid();
  v_email text;
  v_ws_name text;
  v_decliner_name text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  SELECT id, workspace_id, invite_email, status, invited_by
    INTO v_invite
    FROM public.workspace_invites
    WHERE invite_token = p_token;

  IF v_invite.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;
  IF v_invite.status <> 'pending' THEN RETURN jsonb_build_object('success', false, 'error', 'already_used'); END IF;

  -- Only the addressed email can decline
  IF v_invite.invite_email IS NOT NULL AND length(trim(v_invite.invite_email)) > 0 THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
    IF v_email IS NULL OR lower(v_email) <> lower(v_invite.invite_email) THEN
      RETURN jsonb_build_object('success', false, 'error', 'email_mismatch');
    END IF;
  END IF;

  UPDATE public.workspace_invites
    SET status = 'declined'
    WHERE id = v_invite.id;

  SELECT name INTO v_ws_name FROM public.workspaces WHERE id = v_invite.workspace_id;
  SELECT COALESCE(display_name, 'A user') INTO v_decliner_name FROM public.profiles WHERE id = v_uid;

  IF v_invite.invited_by IS NOT NULL AND v_invite.invited_by <> v_uid THEN
    INSERT INTO public.notifications (user_id, type, title, message, metadata)
    VALUES (
      v_invite.invited_by,
      'workspace_invite_declined',
      'Invite declined',
      v_decliner_name || ' declined your invite to ' || COALESCE(v_ws_name, 'the workspace'),
      jsonb_build_object(
        'workspace_id', v_invite.workspace_id,
        'workspace_name', v_ws_name,
        'invite_id', v_invite.id,
        'declined_by', v_uid,
        'declined_by_name', v_decliner_name
      )
    );
  END IF;

  -- Mark the original invite notification as read for the decliner
  UPDATE public.notifications
    SET read = true
    WHERE user_id = v_uid
      AND type = 'workspace_invite'
      AND (metadata->>'invite_id')::uuid = v_invite.id;

  RETURN jsonb_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.workspace_deduct_credits(p_workspace_id uuid, p_amount numeric, p_action_type text, p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_member record;
  v_ws record;
  v_new_credits numeric;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  SELECT * INTO v_member FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = v_user FOR UPDATE;
  IF v_member.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_member');
  END IF;

  -- reset monthly counter if new month
  IF date_trunc('month', now()) > date_trunc('month', v_member.monthly_period_start) THEN
    UPDATE public.workspace_members
      SET monthly_used = 0, monthly_period_start = date_trunc('month', now())
      WHERE id = v_member.id;
    v_member.monthly_used := 0;
  END IF;

  IF v_member.monthly_limit IS NOT NULL AND (v_member.monthly_used + p_amount) > v_member.monthly_limit THEN
    RETURN jsonb_build_object('success', false, 'error', 'monthly_limit_exceeded',
      'limit', v_member.monthly_limit, 'used', v_member.monthly_used);
  END IF;

  SELECT * INTO v_ws FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF v_ws.credits < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_workspace_credits',
      'credits', v_ws.credits);
  END IF;

  v_new_credits := v_ws.credits - p_amount;
  UPDATE public.workspaces SET credits = v_new_credits, updated_at = now() WHERE id = p_workspace_id;
  UPDATE public.workspace_members SET monthly_used = monthly_used + p_amount WHERE id = v_member.id;
  INSERT INTO public.workspace_usage (workspace_id, user_id, amount, action_type, description)
    VALUES (p_workspace_id, v_user, p_amount, p_action_type, p_description);

  RETURN jsonb_build_object('success', true, 'credits', v_new_credits,
    'monthly_used', v_member.monthly_used + p_amount);
END $function$
;

CREATE OR REPLACE FUNCTION public.workspace_export_gdpr(p_ws uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_result jsonb;
BEGIN
  IF NOT public.is_workspace_admin(p_ws, v_uid) THEN
    RETURN jsonb_build_object('success',false,'error','forbidden');
  END IF;
  SELECT jsonb_build_object(
    'workspace', (SELECT row_to_json(w) FROM public.workspaces w WHERE id = p_ws),
    'members', (SELECT jsonb_agg(row_to_json(m)) FROM public.workspace_members m WHERE workspace_id = p_ws),
    'invites', (SELECT jsonb_agg(row_to_json(i)) FROM public.workspace_invites i WHERE workspace_id = p_ws),
    'usage', (SELECT jsonb_agg(row_to_json(u)) FROM public.workspace_usage u WHERE workspace_id = p_ws),
    'topups', (SELECT jsonb_agg(row_to_json(t)) FROM public.workspace_credit_topups t WHERE workspace_id = p_ws),
    'audit', (SELECT jsonb_agg(row_to_json(a)) FROM public.workspace_audit_log a WHERE workspace_id = p_ws),
    'tasks', (SELECT jsonb_agg(row_to_json(t)) FROM public.workspace_tasks t WHERE workspace_id = p_ws),
    'brand_kit', (SELECT row_to_json(b) FROM public.workspace_brand_kit b WHERE workspace_id = p_ws),
    'settings', (SELECT row_to_json(s) FROM public.workspace_settings s WHERE workspace_id = p_ws),
    'exported_at', now()
  ) INTO v_result;
  PERFORM public.workspace_log(p_ws, 'gdpr_exported', 'workspace', p_ws::text, '{}'::jsonb);
  RETURN jsonb_build_object('success', true, 'data', v_result);
END $function$
;

CREATE OR REPLACE FUNCTION public.workspace_log(p_ws uuid, p_action text, p_target_type text DEFAULT NULL::text, p_target_id text DEFAULT NULL::text, p_meta jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  INSERT INTO public.workspace_audit_log (workspace_id, actor_id, action, target_type, target_id, metadata)
  VALUES (p_ws, auth.uid(), p_action, p_target_type, p_target_id, COALESCE(p_meta, '{}'::jsonb));
$function$
;

CREATE OR REPLACE FUNCTION public.workspace_reject_request(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_req record;
BEGIN
  SELECT * INTO v_req FROM public.workspace_join_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RETURN jsonb_build_object('success',false,'error','not_found'); END IF;
  IF NOT public.is_workspace_admin(v_req.workspace_id, v_uid) THEN
    RETURN jsonb_build_object('success',false,'error','forbidden');
  END IF;
  UPDATE public.workspace_join_requests SET status='rejected', reviewed_by=v_uid, reviewed_at=now() WHERE id=p_request_id;
  PERFORM public.workspace_log(v_req.workspace_id, 'request_rejected', 'user', v_req.user_id::text, '{}'::jsonb);
  RETURN jsonb_build_object('success', true);
END $function$
;

CREATE OR REPLACE FUNCTION public.workspace_revoke_api_key(p_key_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_ws uuid;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.workspace_api_keys WHERE id = p_key_id;
  IF v_ws IS NULL THEN RETURN jsonb_build_object('success',false,'error','not_found'); END IF;
  IF NOT public.is_workspace_admin(v_ws, v_uid) THEN
    RETURN jsonb_build_object('success',false,'error','forbidden');
  END IF;
  UPDATE public.workspace_api_keys SET revoked_at = now() WHERE id = p_key_id;
  PERFORM public.workspace_log(v_ws, 'api_key_revoked', 'api_key', p_key_id::text, '{}'::jsonb);
  RETURN jsonb_build_object('success', true);
END $function$
;

CREATE OR REPLACE FUNCTION public.workspace_role_of(_ws uuid, _user uuid)
 RETURNS workspace_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM public.workspace_members WHERE workspace_id = _ws AND user_id = _user
$function$
;

CREATE OR REPLACE FUNCTION public.workspace_set_member_role(p_ws uuid, p_user uuid, p_role workspace_role)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;
  IF NOT public.is_workspace_admin(p_ws, v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;
  IF p_role = 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'use_transfer_ownership');
  END IF;
  -- Can't change an existing owner's role (only transfer_ownership does)
  IF EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_ws AND user_id = p_user AND role = 'owner'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'cannot_demote_owner');
  END IF;
  UPDATE public.workspace_members SET role = p_role
    WHERE workspace_id = p_ws AND user_id = p_user;
  PERFORM public.workspace_log(p_ws, 'role_changed', 'user', p_user::text,
    jsonb_build_object('role', p_role));
  RETURN jsonb_build_object('success', true);
END $function$
;

CREATE OR REPLACE FUNCTION public.workspace_set_member_status(p_ws uuid, p_user uuid, p_suspended boolean, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_workspace_admin(p_ws, v_uid) THEN
    RETURN jsonb_build_object('success',false,'error','forbidden');
  END IF;
  INSERT INTO public.workspace_member_status (workspace_id, user_id, suspended, suspended_reason, suspended_by, suspended_at)
  VALUES (p_ws, p_user, p_suspended, p_reason, v_uid, CASE WHEN p_suspended THEN now() ELSE NULL END)
  ON CONFLICT (workspace_id, user_id) DO UPDATE
    SET suspended = EXCLUDED.suspended, suspended_reason = EXCLUDED.suspended_reason,
        suspended_by = EXCLUDED.suspended_by, suspended_at = EXCLUDED.suspended_at;
  PERFORM public.workspace_log(p_ws, CASE WHEN p_suspended THEN 'member_suspended' ELSE 'member_unsuspended' END, 'user', p_user::text, jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('success', true);
END $function$
;

CREATE OR REPLACE FUNCTION public.workspace_transfer_ownership(p_ws uuid, p_new_owner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_current_owner uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success',false,'error','auth_required'); END IF;
  SELECT owner_id INTO v_current_owner FROM public.workspaces WHERE id = p_ws FOR UPDATE;
  IF v_current_owner IS NULL THEN RETURN jsonb_build_object('success',false,'error','not_found'); END IF;
  IF v_current_owner <> v_uid THEN RETURN jsonb_build_object('success',false,'error','only_owner'); END IF;
  IF NOT public.is_workspace_member(p_ws, p_new_owner) THEN
    RETURN jsonb_build_object('success',false,'error','target_not_member');
  END IF;
  UPDATE public.workspaces SET owner_id = p_new_owner, updated_at = now() WHERE id = p_ws;
  UPDATE public.workspace_members SET role = 'owner' WHERE workspace_id = p_ws AND user_id = p_new_owner;
  UPDATE public.workspace_members SET role = 'admin' WHERE workspace_id = p_ws AND user_id = v_uid;
  PERFORM public.workspace_log(p_ws, 'ownership_transferred', 'user', p_new_owner::text, jsonb_build_object('from', v_uid));
  RETURN jsonb_build_object('success', true);
END $function$
;

CREATE OR REPLACE FUNCTION public.workspace_transfer_project(p_project_id uuid, p_target_ws uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_proj record;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success',false,'error','auth_required'); END IF;
  SELECT * INTO v_proj FROM public.projects WHERE id = p_project_id;
  IF v_proj.id IS NULL THEN RETURN jsonb_build_object('success',false,'error','not_found'); END IF;
  IF v_proj.user_id <> v_uid THEN RETURN jsonb_build_object('success',false,'error','only_owner'); END IF;
  IF p_target_ws IS NOT NULL AND NOT public.is_workspace_admin(p_target_ws, v_uid) THEN
    RETURN jsonb_build_object('success',false,'error','need_admin_in_target');
  END IF;
  UPDATE public.projects SET workspace_id = p_target_ws, updated_at = now() WHERE id = p_project_id;
  IF p_target_ws IS NOT NULL THEN
    PERFORM public.workspace_log(p_target_ws, 'project_transferred_in', 'project', p_project_id::text, '{}'::jsonb);
  END IF;
  IF v_proj.workspace_id IS NOT NULL THEN
    PERFORM public.workspace_log(v_proj.workspace_id, 'project_transferred_out', 'project', p_project_id::text, '{}'::jsonb);
  END IF;
  RETURN jsonb_build_object('success', true);
END $function$
;

CREATE OR REPLACE FUNCTION public.ws_task_completed_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    NEW.completed_at = now();
  ELSIF NEW.status <> 'done' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END $function$
;


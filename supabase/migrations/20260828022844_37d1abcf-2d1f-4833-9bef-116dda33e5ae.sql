DO $$
DECLARE f record;
  keep text[] := ARRAY['add_credits','deduct_credits','redeem_reward','create_notification',
    'claim_referral_signup','consume_daily_free_or_credits','update_profile_safe',
    'has_paid_plan','bump_conversation','create_workspace','accept_conversation_invite',
    'get_invite_details','get_image_provider_key','next_provider_key','provider_key_counts',
    'report_provider_key_failure','report_provider_key_success','store_provider_key',
    'has_role','is_workspace_member','is_workspace_admin','workspace_role_of',
    'is_conversation_member','is_invite_for_current_user','get_workspace_invite_details',
    'get_user_subscription_status','match_user_memories','check_rate_limit',
    'consume_free_image_use','consume_model_use','assert_model_access','model_requires_paid_plan',
    'get_landing_page_prompt','get_today_promo_slots','claim_promo_slot','get_referral_summary',
    'calc_referral_stats','get_user_referral_tier','award_referral_points'];
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prosecdef
      AND NOT (p.proname = ANY(keep))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;

  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prosecdef
      AND p.proname = ANY(keep)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
  END LOOP;
END $$;
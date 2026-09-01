DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prosecdef
      AND (
        p.proname LIKE 'gram\_%' OR p.proname LIKE 'game\_%' OR p.proname LIKE 'pvp\_%'
        OR p.proname LIKE '%\_for\_telegram' OR p.proname LIKE 'ad\_watch\_%'
        OR p.proname LIKE 'staking\_%' OR p.proname LIKE 'admin\_%'
        OR p.proname LIKE 'prevent\_%' OR p.proname LIKE 'protect\_%'
        OR p.proname LIKE 'notify\_%' OR p.proname LIKE 'watchdog\_%'
        OR p.proname IN ('start_mining_for_telegram','sync_mining_for_telegram',
          'nft_mining_power_for_telegram','perform_attack_for_telegram',
          'purchase_battle_item_with_intent','purchase_server_with_intent',
          'request_withdrawal_for_telegram','verify_wallet_with_intent',
          'consume_ton_intent','credit_ton_deposit_with_intent','is_telegram_admin',
          'next_prize_broadcast_targets','all_prize_broadcast_targets','ensure_monthly_prize',
          'expire_prize_rewards','tg_processed_orders_record_referral','tg_fulfill_payment',
          'log_billing_change','is_owner_uid','pvp_add_bots')
      )
      AND p.proname NOT IN ('add_credits','deduct_credits','redeem_reward','create_notification',
        'claim_referral_signup','consume_daily_free_or_credits','update_profile_safe',
        'has_paid_plan','bump_conversation','create_workspace','accept_conversation_invite',
        'get_invite_details','get_image_provider_key','next_provider_key','provider_key_counts',
        'report_provider_key_failure','report_provider_key_success','store_provider_key')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', f.sig);
  END LOOP;
END $$;
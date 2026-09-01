DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind = 'r'
      AND (
        c.relname LIKE 'gram\_%' OR c.relname LIKE 'pvp\_%' OR c.relname LIKE 'game\_%'
        OR c.relname LIKE 'music\_%' OR c.relname LIKE 'mining\_%' OR c.relname LIKE 'telegram\_%'
        OR c.relname LIKE 'ton\_%'
        OR c.relname IN ('stakes','staking_plans','attacks','invest_plans','investments',
          'characters','servers','tasks','battle_inventory','ad_watch_progress',
          'auto_notification_log','star_payments','bot_admins','bot_admin_pending',
          'bot_pending_actions','prize_broadcast_log','user_nfts','user_servers','user_tasks',
          'referral_tiers')
      )
      AND c.relname <> 'telegram_users'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t.relname);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t.relname);
  END LOOP;
END $$;

REVOKE ALL ON public.telegram_users FROM anon;
GRANT SELECT ON public.telegram_users TO authenticated;
GRANT ALL ON public.telegram_users TO service_role;
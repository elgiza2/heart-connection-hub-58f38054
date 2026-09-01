DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('place_order','track_order','orders_by_phone','check_store_price','credit_affiliate_on_ship','grant_crypto_plan')
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

DROP TABLE IF EXISTS public.affiliate_commissions CASCADE;
DROP TABLE IF EXISTS public.affiliate_payouts CASCADE;
DROP TABLE IF EXISTS public.affiliate_store_products CASCADE;
DROP TABLE IF EXISTS public.affiliate_stores CASCADE;
DROP TABLE IF EXISTS public.affiliate_profiles CASCADE;

DROP TABLE IF EXISTS public.shop_order_items CASCADE;
DROP TABLE IF EXISTS public.shop_orders CASCADE;
DROP TABLE IF EXISTS public.shop_products CASCADE;
DROP TABLE IF EXISTS public.customer_addresses CASCADE;
DROP TABLE IF EXISTS public.crypto_payments CASCADE;
DROP TABLE IF EXISTS public.dodo_catalog CASCADE;

DROP TABLE IF EXISTS public.course_orders CASCADE;
DROP TABLE IF EXISTS public.course_students CASCADE;
DROP TABLE IF EXISTS public.bundle_books CASCADE;
DROP TABLE IF EXISTS public.bundle_orders CASCADE;
DROP TABLE IF EXISTS public.library_requests CASCADE;

DROP TABLE IF EXISTS public.bolt_task_completions CASCADE;
DROP TABLE IF EXISTS public.bolt_player_characters CASCADE;
DROP TABLE IF EXISTS public.bolt_battles CASCADE;
DROP TABLE IF EXISTS public.bolt_payments CASCADE;
DROP TABLE IF EXISTS public.bolt_upgrades CASCADE;
DROP TABLE IF EXISTS public.bolt_tasks CASCADE;
DROP TABLE IF EXISTS public.bolt_characters CASCADE;
DROP TABLE IF EXISTS public.bolt_players CASCADE;

DROP TABLE IF EXISTS public.premium_subscriptions CASCADE;
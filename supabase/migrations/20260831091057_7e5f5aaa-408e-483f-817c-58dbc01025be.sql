REVOKE EXECUTE ON FUNCTION public.get_user_subscription_status(text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_prize_rewards() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_promo_slot() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_subscription_status(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_prize_rewards() TO service_role;
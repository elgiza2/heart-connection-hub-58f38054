-- Revoke dangerous EXECUTE from authenticated on privileged credit RPCs.
-- These SECURITY DEFINER functions modify profiles.credits with no caller check,
-- so any signed-in user calling them via RPC could grant themselves credits.
REVOKE EXECUTE ON FUNCTION public.add_credits(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_credits(uuid, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_credits(uuid, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, numeric, text, text) TO service_role;
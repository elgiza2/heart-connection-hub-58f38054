REVOKE EXECUTE ON FUNCTION public.ensure_mailbox(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_mailbox(uuid, text) TO service_role;
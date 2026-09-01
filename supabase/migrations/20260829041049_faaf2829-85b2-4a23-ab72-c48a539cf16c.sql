GRANT EXECUTE ON FUNCTION public.owns_conversation(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_owner_uid(uuid) TO authenticated, anon, service_role;
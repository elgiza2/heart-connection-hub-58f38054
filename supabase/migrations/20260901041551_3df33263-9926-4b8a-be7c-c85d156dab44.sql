REVOKE ALL ON TABLE public.api_rate_limits FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "No direct client access to API rate limits" ON public.api_rate_limits;
CREATE POLICY "No direct client access to API rate limits"
ON public.api_rate_limits
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

REVOKE ALL ON FUNCTION public.next_provider_key(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_provider_key_success(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_provider_key_failure(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_provider_key(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_provider_key_success(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_provider_key_failure(uuid, text) TO service_role;
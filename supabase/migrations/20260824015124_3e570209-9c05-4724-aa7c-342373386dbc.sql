revoke all on function public.next_provider_key(text) from public, anon, authenticated;
revoke all on function public.report_provider_key_failure(uuid, text) from public, anon, authenticated;
revoke all on function public.report_provider_key_success(uuid) from public, anon, authenticated;
grant execute on function public.next_provider_key(text) to service_role;
grant execute on function public.report_provider_key_failure(uuid, text) to service_role;
grant execute on function public.report_provider_key_success(uuid) to service_role;
revoke all on function public.store_provider_key(text, text) from public, anon;
revoke all on function public.provider_key_counts() from public, anon;
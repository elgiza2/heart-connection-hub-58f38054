REVOKE ALL ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_workspace_billing_escalation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_reward_task_self_award() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_workspace_usage_tampering() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() TO service_role;
GRANT EXECUTE ON FUNCTION public.prevent_workspace_billing_escalation() TO service_role;
GRANT EXECUTE ON FUNCTION public.prevent_reward_task_self_award() TO service_role;
GRANT EXECUTE ON FUNCTION public.prevent_workspace_usage_tampering() TO service_role;
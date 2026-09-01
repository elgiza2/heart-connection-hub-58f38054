-- 1) Missing indexes on owner / parent columns
CREATE INDEX IF NOT EXISTS idx_agent_memory_files_conversation ON public.agent_memory_files (conversation_id);
CREATE INDEX IF NOT EXISTS idx_appsumo_oauth_states_user ON public.appsumo_oauth_states (user_id);
CREATE INDEX IF NOT EXISTS idx_attachment_chunks_conversation ON public.attachment_chunks (conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_interaction_events_conversation ON public.chat_interaction_events (conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_stream_buffers_conversation ON public.chat_stream_buffers (conversation_id);
CREATE INDEX IF NOT EXISTS idx_learn_sessions_conversation ON public.learn_sessions (conversation_id);
CREATE INDEX IF NOT EXISTS idx_marketing_accounts_user ON public.marketing_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_marketing_analytics_user ON public.marketing_analytics (user_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_workspace ON public.marketing_campaigns (workspace_id);
CREATE INDEX IF NOT EXISTS idx_marketing_publish_log_user ON public.marketing_publish_log (user_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_workspace ON public.media_assets (workspace_id);
CREATE INDEX IF NOT EXISTS idx_media_provider_keys_workspace ON public.media_provider_keys (workspace_id);
CREATE INDEX IF NOT EXISTS idx_parallel_monitors_conversation ON public.parallel_monitors (conversation_id);
CREATE INDEX IF NOT EXISTS idx_pending_video_jobs_workspace ON public.pending_video_jobs (workspace_id);
CREATE INDEX IF NOT EXISTS idx_projects_workspace ON public.projects (workspace_id);
CREATE INDEX IF NOT EXISTS idx_research_jobs_conversation ON public.research_jobs (conversation_id);
CREATE INDEX IF NOT EXISTS idx_user_memory_entries_workspace ON public.user_memory_entries (workspace_id);

-- 2) Is a model free, or does it require a paid plan? (data driven)
CREATE OR REPLACE FUNCTION public.model_requires_paid_plan(_model_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- Always-free house models
    WHEN lower(coalesce(_model_id,'')) LIKE 'megsy-lite%' THEN false
    WHEN lower(coalesce(_model_id,'')) IN (
      'megsy-image','nano-banana','wan2.7-image-pro','wan2.7-image',
      'wan2.6-image','wan2.6-t2i','qwen-image','z-image-turbo'
    ) THEN false
    -- Chat catalogue
    WHEN EXISTS (
      SELECT 1 FROM public.chat_models m
      WHERE m.model_id = _model_id AND lower(coalesce(m.tier,'free')) = 'free'
    ) THEN false
    WHEN EXISTS (SELECT 1 FROM public.chat_models m WHERE m.model_id = _model_id) THEN true
    -- Image catalogue
    WHEN EXISTS (
      SELECT 1 FROM public.image_models i
      WHERE i.slug = _model_id AND coalesce(i.is_premium,false) = false
    ) THEN false
    WHEN EXISTS (SELECT 1 FROM public.image_models i WHERE i.slug = _model_id) THEN true
    -- Unknown model: fail closed
    ELSE true
  END;
$$;

-- 3) Authoritative access check for the current user
CREATE OR REPLACE FUNCTION public.assert_model_access(_model_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_authenticated');
  END IF;

  IF public.model_requires_paid_plan(_model_id) AND NOT public.has_paid_plan(v_user) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'plan_required', 'model', _model_id);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'model', _model_id);
END;
$$;

-- 4) Single guarded entry point: check plan, then spend free allowance or credits
CREATE OR REPLACE FUNCTION public.consume_model_use(
  _model_id text,
  _feature text,
  _free_per_day integer DEFAULT 0,
  _cost integer DEFAULT 1,
  _description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access jsonb;
BEGIN
  v_access := public.assert_model_access(_model_id);
  IF coalesce((v_access->>'allowed')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', v_access->>'reason');
  END IF;

  RETURN public.consume_daily_free_or_credits(
    _feature,
    _free_per_day,
    _cost,
    coalesce(_description, _feature || ' • ' || coalesce(_model_id,'unknown'))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.model_requires_paid_plan(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_model_access(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_model_use(text, text, integer, integer, text) TO authenticated, service_role;
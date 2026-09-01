-- ============ 1) agent_memory ============
CREATE TABLE public.agent_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  domain TEXT,
  kind TEXT NOT NULL DEFAULT 'site_fact',
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.6,
  hits INTEGER NOT NULL DEFAULT 0,
  source_run_id UUID,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX agent_memory_unique_fact
  ON public.agent_memory (user_id, coalesce(domain, ''), kind, key);
CREATE INDEX agent_memory_user_domain_idx ON public.agent_memory (user_id, domain);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_memory TO authenticated;
GRANT ALL ON public.agent_memory TO service_role;
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_memory owner all" ON public.agent_memory
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ 2) agent_questions ============
CREATE TABLE public.agent_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.long_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  question TEXT NOT NULL,
  reason TEXT,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  sensitive BOOLEAN NOT NULL DEFAULT false,
  answer TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  asked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  answered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX agent_questions_run_idx ON public.agent_questions (run_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_questions TO authenticated;
GRANT ALL ON public.agent_questions TO service_role;
ALTER TABLE public.agent_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_questions owner all" ON public.agent_questions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ 3) agent_plans ============
CREATE TABLE public.agent_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.long_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  goal TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_round INTEGER NOT NULL DEFAULT 0,
  critique TEXT,
  verdict TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX agent_plans_run_idx ON public.agent_plans (run_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_plans TO authenticated;
GRANT ALL ON public.agent_plans TO service_role;
ALTER TABLE public.agent_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_plans owner all" ON public.agent_plans
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ 4) agent_checkpoints ============
CREATE TABLE public.agent_checkpoints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.long_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  step_number INTEGER NOT NULL DEFAULT 0,
  fingerprint TEXT,
  last_action TEXT,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX agent_checkpoints_run_idx ON public.agent_checkpoints (run_id, step_number DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_checkpoints TO authenticated;
GRANT ALL ON public.agent_checkpoints TO service_role;
ALTER TABLE public.agent_checkpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_checkpoints owner all" ON public.agent_checkpoints
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ 5) long_runs extra columns ============
ALTER TABLE public.long_runs
  ADD COLUMN IF NOT EXISTS plan_id UUID,
  ADD COLUMN IF NOT EXISTS review_round INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget_ms BIGINT NOT NULL DEFAULT 21600000,
  ADD COLUMN IF NOT EXISTS needs_input BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS loop_strikes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS step_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sandbox_generation INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS long_runs_active_heartbeat_idx
  ON public.long_runs (last_heartbeat_at)
  WHERE status IN ('queued', 'running', 'paused');

-- ============ 6) updated_at triggers ============
CREATE OR REPLACE FUNCTION public.agentkernel_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER agent_memory_touch BEFORE UPDATE ON public.agent_memory
  FOR EACH ROW EXECUTE FUNCTION public.agentkernel_touch_updated_at();
CREATE TRIGGER agent_questions_touch BEFORE UPDATE ON public.agent_questions
  FOR EACH ROW EXECUTE FUNCTION public.agentkernel_touch_updated_at();
CREATE TRIGGER agent_plans_touch BEFORE UPDATE ON public.agent_plans
  FOR EACH ROW EXECUTE FUNCTION public.agentkernel_touch_updated_at();

-- ============ 7) realtime ============
ALTER TABLE public.agent_questions REPLICA IDENTITY FULL;
ALTER TABLE public.agent_plans REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_questions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_plans;

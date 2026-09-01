-- Freestyle API key pool (server-only)
CREATE TABLE public.freestyle_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key TEXT NOT NULL,
  label TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  priority INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_used_at TIMESTAMPTZ,
  cooldown_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.freestyle_keys TO service_role;
ALTER TABLE public.freestyle_keys ENABLE ROW LEVEL SECURITY;

-- Projects
CREATE TABLE public.dev_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  conversation_id TEXT,
  name TEXT NOT NULL DEFAULT 'project',
  template TEXT NOT NULL DEFAULT 'react-vite',
  repo_id TEXT,
  vm_id TEXT,
  git_url TEXT,
  head_commit TEXT,
  deployed_commit TEXT,
  deploy_url TEXT,
  screenshot_url TEXT,
  github_repo TEXT,
  supabase_project_ref TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX dev_projects_user_idx ON public.dev_projects (user_id, updated_at DESC);
CREATE INDEX dev_projects_conversation_idx ON public.dev_projects (conversation_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_projects TO authenticated;
GRANT ALL ON public.dev_projects TO service_role;
ALTER TABLE public.dev_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev_projects_own" ON public.dev_projects FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Runs
CREATE TABLE public.dev_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID REFERENCES public.dev_projects(id) ON DELETE CASCADE,
  conversation_id TEXT,
  message_id TEXT,
  intent TEXT NOT NULL DEFAULT 'edit',
  prompt TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued',
  step INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  error TEXT,
  vm_id TEXT,
  allow_deploy BOOLEAN NOT NULL DEFAULT false,
  last_heartbeat_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX dev_runs_user_idx ON public.dev_runs (user_id, created_at DESC);
CREATE INDEX dev_runs_project_idx ON public.dev_runs (project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_runs TO authenticated;
GRANT ALL ON public.dev_runs TO service_role;
ALTER TABLE public.dev_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev_runs_own" ON public.dev_runs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Tasks
CREATE TABLE public.dev_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.dev_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX dev_tasks_run_idx ON public.dev_tasks (run_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_tasks TO authenticated;
GRANT ALL ON public.dev_tasks TO service_role;
ALTER TABLE public.dev_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev_tasks_own" ON public.dev_tasks FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Events
CREATE TABLE public.dev_events (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.dev_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX dev_events_run_idx ON public.dev_events (run_id, id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_events TO authenticated;
GRANT ALL ON public.dev_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.dev_events_id_seq TO authenticated, service_role;
ALTER TABLE public.dev_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev_events_own" ON public.dev_events FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Deploys
CREATE TABLE public.dev_deploys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.dev_projects(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.dev_runs(id) ON DELETE SET NULL,
  commit_sha TEXT,
  deployment_id TEXT,
  url TEXT,
  screenshot_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX dev_deploys_project_idx ON public.dev_deploys (project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_deploys TO authenticated;
GRANT ALL ON public.dev_deploys TO service_role;
ALTER TABLE public.dev_deploys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev_deploys_own" ON public.dev_deploys FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
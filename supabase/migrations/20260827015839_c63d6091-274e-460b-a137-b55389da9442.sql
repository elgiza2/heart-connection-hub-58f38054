-- 1) Extend mcp_connections
ALTER TABLE public.mcp_connections
  ADD COLUMN IF NOT EXISTS protocol_version text NOT NULL DEFAULT '2026-07-28',
  ADD COLUMN IF NOT EXISTS tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS auth_mode text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS oauth jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_probed_at timestamptz;

-- 2) Tool approvals
CREATE TABLE IF NOT EXISTS public.mcp_tool_approvals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES public.mcp_connections(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  scope text NOT NULL DEFAULT 'always',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, tool_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_tool_approvals TO authenticated;
GRANT ALL ON public.mcp_tool_approvals TO service_role;
ALTER TABLE public.mcp_tool_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own mcp tool approvals" ON public.mcp_tool_approvals
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3) Call log
CREATE TABLE IF NOT EXISTS public.mcp_call_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  connection_id uuid REFERENCES public.mcp_connections(id) ON DELETE SET NULL,
  server_name text,
  tool_name text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  duration_ms integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_call_log_user_created_idx ON public.mcp_call_log (user_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.mcp_call_log TO authenticated;
GRANT ALL ON public.mcp_call_log TO service_role;
ALTER TABLE public.mcp_call_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own mcp call log" ON public.mcp_call_log
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4) OAuth states (PKCE) for MCP authorization flows
CREATE TABLE IF NOT EXISTS public.mcp_oauth_states (
  state text NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES public.mcp_connections(id) ON DELETE CASCADE,
  code_verifier text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.mcp_oauth_states TO authenticated;
GRANT ALL ON public.mcp_oauth_states TO service_role;
ALTER TABLE public.mcp_oauth_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own mcp oauth states" ON public.mcp_oauth_states
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5) Clerk account links
CREATE TABLE IF NOT EXISTS public.clerk_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  clerk_user_id text NOT NULL UNIQUE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clerk_links TO authenticated;
GRANT ALL ON public.clerk_links TO service_role;
ALTER TABLE public.clerk_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own clerk link" ON public.clerk_links
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6) updated_at triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_mcp_tool_approvals_updated_at ON public.mcp_tool_approvals;
CREATE TRIGGER update_mcp_tool_approvals_updated_at BEFORE UPDATE ON public.mcp_tool_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_clerk_links_updated_at ON public.clerk_links;
CREATE TRIGGER update_clerk_links_updated_at BEFORE UPDATE ON public.clerk_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
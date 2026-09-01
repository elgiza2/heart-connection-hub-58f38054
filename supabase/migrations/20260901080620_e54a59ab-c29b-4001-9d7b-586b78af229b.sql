-- Local desktop bridge: user-installed Windows agent paired to a Megsy account.
CREATE TABLE public.local_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'My PC',
  os text NOT NULL DEFAULT 'windows',
  hostname text,
  agent_version text,
  status text NOT NULL DEFAULT 'unpaired',
  pair_code text UNIQUE,
  pair_expires_at timestamptz,
  token_hash text,
  capabilities jsonb NOT NULL DEFAULT '{"shell":false,"files":false,"screen":false,"input":false,"browser":false}'::jsonb,
  permission_mode text NOT NULL DEFAULT 'ask',
  allowlist jsonb NOT NULL DEFAULT '[]'::jsonb,
  work_dir text,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.local_devices TO authenticated;
GRANT ALL ON public.local_devices TO service_role;
ALTER TABLE public.local_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own devices select" ON public.local_devices
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own devices insert" ON public.local_devices
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own devices update" ON public.local_devices
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own devices delete" ON public.local_devices
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.local_device_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.local_devices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text,
  status text NOT NULL DEFAULT 'pending',
  result jsonb,
  error text,
  origin text NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX local_device_commands_device_idx
  ON public.local_device_commands (device_id, status, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.local_device_commands TO authenticated;
GRANT ALL ON public.local_device_commands TO service_role;
ALTER TABLE public.local_device_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own commands select" ON public.local_device_commands
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own commands insert" ON public.local_device_commands
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own commands update" ON public.local_device_commands
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own commands delete" ON public.local_device_commands
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_local_device_command()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER local_device_commands_touch
  BEFORE UPDATE ON public.local_device_commands
  FOR EACH ROW EXECUTE FUNCTION public.touch_local_device_command();

ALTER PUBLICATION supabase_realtime ADD TABLE public.local_device_commands;
ALTER PUBLICATION supabase_realtime ADD TABLE public.local_devices;
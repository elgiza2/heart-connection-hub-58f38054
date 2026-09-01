CREATE TABLE public.computer_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conversation_id uuid,
  message_id uuid,
  provider_task_id text,
  key_id uuid,
  prompt text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  progress text,
  result_text text,
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.computer_tasks TO authenticated;
GRANT ALL ON public.computer_tasks TO service_role;
ALTER TABLE public.computer_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own computer tasks" ON public.computer_tasks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX computer_tasks_conv_idx ON public.computer_tasks (conversation_id, created_at DESC);

CREATE TABLE public.computer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.computer_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'step',
  title text,
  detail text,
  url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.computer_events TO authenticated;
GRANT ALL ON public.computer_events TO service_role;
ALTER TABLE public.computer_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own computer events" ON public.computer_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX computer_events_task_idx ON public.computer_events (task_id, created_at);

CREATE TABLE public.computer_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conversation_id uuid,
  summary text NOT NULL DEFAULT '',
  facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, conversation_id)
);
GRANT SELECT ON public.computer_memory TO authenticated;
GRANT ALL ON public.computer_memory TO service_role;
ALTER TABLE public.computer_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own computer memory" ON public.computer_memory FOR SELECT TO authenticated USING (auth.uid() = user_id);
ALTER TABLE public.long_run_events
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS step_id text,
  ADD COLUMN IF NOT EXISTS tool text,
  ADD COLUMN IF NOT EXISTS action text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS progress numeric,
  ADD COLUMN IF NOT EXISTS metadata jsonb;

CREATE INDEX IF NOT EXISTS long_run_events_run_created_idx
  ON public.long_run_events (run_id, created_at DESC);

ALTER TABLE public.long_runs
  ADD COLUMN IF NOT EXISTS last_tool_at timestamptz,
  ADD COLUMN IF NOT EXISTS stall_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_class text;
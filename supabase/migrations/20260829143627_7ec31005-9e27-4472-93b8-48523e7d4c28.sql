ALTER TABLE public.long_runs
  ADD COLUMN IF NOT EXISTS risk_level text NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low', 'medium', 'high')),
  ADD COLUMN IF NOT EXISTS auto_continue_allowed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pending_steering text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS stop_requested boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS long_runs_soft_stop_idx
  ON public.long_runs (updated_at)
  WHERE stop_requested;
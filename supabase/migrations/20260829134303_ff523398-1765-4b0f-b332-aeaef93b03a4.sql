ALTER TABLE public.long_runs
  ADD COLUMN IF NOT EXISTS awaiting_plan_ack boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_continue_at timestamptz;

CREATE INDEX IF NOT EXISTS long_runs_awaiting_plan_ack_idx
  ON public.long_runs (auto_continue_at)
  WHERE awaiting_plan_ack;
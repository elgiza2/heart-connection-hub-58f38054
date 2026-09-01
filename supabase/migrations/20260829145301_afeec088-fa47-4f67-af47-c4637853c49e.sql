GRANT SELECT, INSERT ON public.long_run_events TO authenticated;
GRANT ALL ON public.long_run_events TO service_role;

DROP POLICY IF EXISTS "own long run events insert" ON public.long_run_events;
CREATE POLICY "own long run events insert"
ON public.long_run_events
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.long_runs r
    WHERE r.id = long_run_events.run_id
      AND r.user_id = auth.uid()
  )
);
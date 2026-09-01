SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'jobs-watchdog-research';
DROP FUNCTION IF EXISTS public.claim_stale_research_jobs(integer);
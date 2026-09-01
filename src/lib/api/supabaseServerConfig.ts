/** @doc Public Supabase config for the serverless API routes.
 *
 *  The project URL and the publishable (anon) key are public values that already
 *  ship inside the browser bundle, so hardcoding them here is safe and removes
 *  the need to configure any environment variable on the hosting platform.
 *  Env vars still win when they are present (e.g. a staging project).
 *
 *  The service-role key is NEVER hardcoded — routes fall back to the caller's
 *  JWT plus RLS instead.
 */
const FALLBACK_URL = "https://ltgampdtawuefwwayncx.supabase.co";
const FALLBACK_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0Z2FtcGR0YXd1ZWZ3d2F5bmN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3Njk5ODAsImV4cCI6MjA4ODM0NTk4MH0.5ZOzuxCrm-TO4zzRDJ68LrCLH3f0itiznUxhbEupvGg";

export const SUPABASE_URL: string =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || FALLBACK_URL;

export const SUPABASE_PUBLISHABLE_KEY: string =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  FALLBACK_PUBLISHABLE_KEY;

/** Optional — present only when the deployment configured it. */
export const SUPABASE_SERVICE_ROLE_KEY: string | undefined =
  process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;

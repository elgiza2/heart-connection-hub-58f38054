ALTER TABLE public.user_api_apps
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS spec jsonb,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
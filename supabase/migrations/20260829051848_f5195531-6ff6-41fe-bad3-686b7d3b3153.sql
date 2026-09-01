ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS email_enabled boolean NOT NULL DEFAULT true;
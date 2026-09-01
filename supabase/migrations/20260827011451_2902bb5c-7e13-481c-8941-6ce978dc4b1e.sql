CREATE TABLE IF NOT EXISTS public.cloud_browser_settings (
  user_id UUID NOT NULL PRIMARY KEY,
  keep_signed_in BOOLEAN NOT NULL DEFAULT false,
  allow_downloads BOOLEAN NOT NULL DEFAULT true,
  last_session_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cloud_browser_settings TO authenticated;
GRANT ALL ON public.cloud_browser_settings TO service_role;
ALTER TABLE public.cloud_browser_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own browser settings" ON public.cloud_browser_settings;
CREATE POLICY "Users manage their own browser settings"
  ON public.cloud_browser_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.user_provider_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL,
  label TEXT,
  key_value TEXT NOT NULL,
  key_hint TEXT NOT NULL DEFAULT '',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  last_verified_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, label)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_provider_keys TO authenticated;
GRANT ALL ON public.user_provider_keys TO service_role;
ALTER TABLE public.user_provider_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own provider keys" ON public.user_provider_keys;
CREATE POLICY "Users manage their own provider keys"
  ON public.user_provider_keys FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_cloud_browser_settings_updated_at ON public.cloud_browser_settings;
CREATE TRIGGER update_cloud_browser_settings_updated_at
  BEFORE UPDATE ON public.cloud_browser_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_provider_keys_updated_at ON public.user_provider_keys;
CREATE TRIGGER update_user_provider_keys_updated_at
  BEFORE UPDATE ON public.user_provider_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS user_provider_keys_user_idx ON public.user_provider_keys (user_id);
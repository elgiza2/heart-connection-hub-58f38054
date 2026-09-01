CREATE TABLE IF NOT EXISTS public.user_api_apps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  app_id TEXT NOT NULL,
  key_value TEXT NOT NULL,
  key_hint TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, app_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_api_apps TO authenticated;
GRANT ALL ON public.user_api_apps TO service_role;

ALTER TABLE public.user_api_apps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own API apps"
  ON public.user_api_apps FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_user_api_apps_updated_at ON public.user_api_apps;
CREATE TRIGGER update_user_api_apps_updated_at BEFORE UPDATE ON public.user_api_apps
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
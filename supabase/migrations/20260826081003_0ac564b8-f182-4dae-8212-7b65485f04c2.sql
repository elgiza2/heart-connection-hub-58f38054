-- 1) Alibaba video models catalogue
CREATE TABLE IF NOT EXISTS public.alibaba_video_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  model_id_api text NOT NULL,
  mode text NOT NULL DEFAULT 't2v',
  description text,
  supported_resolutions jsonb NOT NULL DEFAULT '["480P","720P"]'::jsonb,
  supported_durations jsonb NOT NULL DEFAULT '[5]'::jsonb,
  default_resolution text NOT NULL DEFAULT '720P',
  default_duration integer NOT NULL DEFAULT 5,
  avg_seconds integer NOT NULL DEFAULT 120,
  prompt_extend boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.alibaba_video_models TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.alibaba_video_models TO authenticated;
GRANT ALL ON public.alibaba_video_models TO service_role;

ALTER TABLE public.alibaba_video_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active alibaba video models" ON public.alibaba_video_models;
CREATE POLICY "Anyone can view active alibaba video models"
  ON public.alibaba_video_models FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage alibaba video models" ON public.alibaba_video_models;
CREATE POLICY "Admins manage alibaba video models"
  ON public.alibaba_video_models FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_alibaba_video_models_updated_at ON public.alibaba_video_models;
CREATE TRIGGER trg_alibaba_video_models_updated_at
  BEFORE UPDATE ON public.alibaba_video_models
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.alibaba_video_models
  (slug, display_name, model_id_api, mode, description, supported_resolutions, supported_durations, default_resolution, default_duration, avg_seconds, prompt_extend, is_featured, sort_order)
VALUES
  ('wan-t2v-turbo', 'Wan 2.2 Turbo (Fast)', 'wan2.2-t2v-turbo', 't2v',
   'Fastest Wan text-to-video, best for quick 480P/720P clips.',
   '["480P","720P"]'::jsonb, '[5]'::jsonb, '480P', 5, 70, false, true, 1),
  ('wan-t2v-plus', 'Wan 2.2 Plus (Quality)', 'wan2.2-t2v-plus', 't2v',
   'Highest quality Wan text-to-video at 1080P.',
   '["480P","720P","1080P"]'::jsonb, '[5]'::jsonb, '720P', 5, 210, true, true, 2),
  ('wan-i2v-flash', 'Wan 2.2 Image→Video Flash', 'wan2.2-i2v-flash', 'i2v',
   'Animates a still image quickly.',
   '["480P","720P"]'::jsonb, '[5]'::jsonb, '480P', 5, 90, false, true, 3)
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  model_id_api = EXCLUDED.model_id_api,
  mode = EXCLUDED.mode,
  description = EXCLUDED.description,
  supported_resolutions = EXCLUDED.supported_resolutions,
  default_resolution = EXCLUDED.default_resolution,
  avg_seconds = EXCLUDED.avg_seconds,
  prompt_extend = EXCLUDED.prompt_extend,
  is_active = true,
  updated_at = now();

-- 2) allow storing Alibaba keys ('a') from the key page
ALTER TABLE public.provider_api_keys DROP CONSTRAINT IF EXISTS provider_api_keys_provider_check;
ALTER TABLE public.provider_api_keys
  ADD CONSTRAINT provider_api_keys_provider_check CHECK (provider IN ('d','r','y','a'));

CREATE OR REPLACE FUNCTION public.store_provider_key(p_provider text, p_value text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not public.has_role(v_user, 'admin') then
    return jsonb_build_object('ok', false);
  end if;
  if p_provider not in ('d','r','y','a') or coalesce(trim(p_value), '') = '' then
    return jsonb_build_object('ok', false);
  end if;
  insert into public.provider_api_keys (provider, api_key) values (p_provider, trim(p_value));
  return jsonb_build_object('ok', true);
end;
$$;

GRANT EXECUTE ON FUNCTION public.store_provider_key(text, text) TO authenticated;

-- 3) best 3 DeAPI video models in the main catalogue
INSERT INTO public.video_models
  (slug, display_name, provider, model_id_api, description, supported_resolutions, supported_durations, default_resolution, default_duration, is_featured, is_active, sort_order)
VALUES
  ('deapi-ltx-video', 'LTX Video 13B (Free)', 'deapi', 'Ltxv_13B_0_9_8_Distilled_FP8',
   'Fast free text-to-video.', '["480p","720p"]'::jsonb, '[5]'::jsonb, '720p', 5, true, true, 1),
  ('deapi-ltx-2-3', 'LTX 2.3 22B (Free)', 'deapi', 'Ltx2_3_22B_Dist_INT8',
   'Higher quality free LTX model.', '["480p","720p"]'::jsonb, '[5]'::jsonb, '720p', 5, true, true, 2),
  ('deapi-minimax-h3', 'MiniMax H3 Turbo (Free)', 'deapi', 'MiniMaxH3_33B_Turbo_INT8',
   'MiniMax H3 turbo video model.', '["480p","720p"]'::jsonb, '[5]'::jsonb, '720p', 5, true, true, 3)
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  provider = EXCLUDED.provider,
  model_id_api = EXCLUDED.model_id_api,
  description = EXCLUDED.description,
  is_featured = true,
  is_active = true,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

UPDATE public.video_models SET is_active = false WHERE slug = 'deapi-ltx-2';
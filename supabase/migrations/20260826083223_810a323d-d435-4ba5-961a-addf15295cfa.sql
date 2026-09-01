DROP POLICY IF EXISTS "Anyone can view active alibaba video models" ON public.alibaba_video_models;

CREATE POLICY "Anyone can view active alibaba video models"
ON public.alibaba_video_models
FOR SELECT
TO anon, authenticated
USING (is_active = true);
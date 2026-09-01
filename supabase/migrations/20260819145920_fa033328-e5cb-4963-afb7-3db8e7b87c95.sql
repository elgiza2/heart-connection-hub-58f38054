CREATE TABLE public.app_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  media_url TEXT,
  media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image','video')),
  published BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_updates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_updates TO authenticated;
GRANT ALL ON public.app_updates TO service_role;

ALTER TABLE public.app_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read published updates"
ON public.app_updates FOR SELECT
USING (published = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage updates"
ON public.app_updates FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_app_updates_updated_at
BEFORE UPDATE ON public.app_updates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_app_updates_published_at ON public.app_updates (published_at DESC);
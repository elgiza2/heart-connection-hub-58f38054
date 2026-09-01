CREATE TABLE public.user_knowledge (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  use_when TEXT NOT NULL,
  content TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_knowledge TO authenticated;
GRANT ALL ON public.user_knowledge TO service_role;

ALTER TABLE public.user_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own knowledge"
ON public.user_knowledge FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_user_knowledge_updated_at
BEFORE UPDATE ON public.user_knowledge
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_user_knowledge_user ON public.user_knowledge (user_id, created_at DESC);
-- ============ Megsy internal mail ============
CREATE TABLE IF NOT EXISTS public.mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  username text NOT NULL UNIQUE,
  address text NOT NULL UNIQUE,
  display_name text,
  external_enabled boolean NOT NULL DEFAULT true,
  ai_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.mailboxes TO authenticated;
GRANT ALL ON public.mailboxes TO service_role;
ALTER TABLE public.mailboxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own mailbox read" ON public.mailboxes;
CREATE POLICY "own mailbox read" ON public.mailboxes
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "own mailbox update" ON public.mailboxes;
CREATE POLICY "own mailbox update" ON public.mailboxes
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.mail_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES public.mailboxes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  folder text NOT NULL DEFAULT 'inbox',
  direction text NOT NULL DEFAULT 'in',
  from_address text NOT NULL,
  from_name text,
  to_address text NOT NULL,
  cc_address text,
  subject text NOT NULL DEFAULT '',
  body_text text NOT NULL DEFAULT '',
  body_html text,
  snippet text NOT NULL DEFAULT '',
  is_read boolean NOT NULL DEFAULT false,
  is_starred boolean NOT NULL DEFAULT false,
  spam_score int NOT NULL DEFAULT 0,
  origin text NOT NULL DEFAULT 'user',
  delivery_status text NOT NULL DEFAULT 'delivered',
  thread_id uuid,
  external_message_id text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mail_folder_chk CHECK (folder IN ('inbox','sent','spam','trash','drafts')),
  CONSTRAINT mail_direction_chk CHECK (direction IN ('in','out')),
  CONSTRAINT mail_origin_chk CHECK (origin IN ('user','ai','external','system')),
  CONSTRAINT mail_status_chk CHECK (delivery_status IN ('delivered','queued','sent','failed','blocked'))
);

CREATE INDEX IF NOT EXISTS mail_messages_box_folder_idx
  ON public.mail_messages (mailbox_id, folder, created_at DESC);
CREATE INDEX IF NOT EXISTS mail_messages_user_idx
  ON public.mail_messages (user_id, created_at DESC);

GRANT SELECT, UPDATE, DELETE ON public.mail_messages TO authenticated;
GRANT ALL ON public.mail_messages TO service_role;
ALTER TABLE public.mail_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own mail read" ON public.mail_messages;
CREATE POLICY "own mail read" ON public.mail_messages
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "own mail update" ON public.mail_messages;
CREATE POLICY "own mail update" ON public.mail_messages
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "own mail delete" ON public.mail_messages;
CREATE POLICY "own mail delete" ON public.mail_messages
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ---- helpers -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mail_slugify(_raw text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT COALESCE(
    NULLIF(regexp_replace(lower(COALESCE(_raw,'')), '[^a-z0-9]+', '.', 'g'), ''),
    'user'
  );
$$;

CREATE OR REPLACE FUNCTION public.ensure_mailbox(_user_id uuid, _hint text DEFAULT NULL)
RETURNS public.mailboxes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  box public.mailboxes;
  base text;
  candidate text;
  i int := 0;
BEGIN
  SELECT * INTO box FROM public.mailboxes WHERE user_id = _user_id;
  IF FOUND THEN RETURN box; END IF;

  base := trim(both '.' from public.mail_slugify(split_part(COALESCE(_hint, ''), '@', 1)));
  IF base IS NULL OR length(base) < 3 THEN
    base := 'user' || substr(replace(_user_id::text, '-', ''), 1, 6);
  END IF;
  base := substr(base, 1, 24);
  candidate := base;

  WHILE EXISTS (SELECT 1 FROM public.mailboxes WHERE username = candidate) LOOP
    i := i + 1;
    candidate := base || i::text;
  END LOOP;

  INSERT INTO public.mailboxes (user_id, username, address)
  VALUES (_user_id, candidate, candidate || '@megsyai.com')
  RETURNING * INTO box;
  RETURN box;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_my_mailbox()
RETURNS public.mailboxes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  hint text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT email INTO hint FROM auth.users WHERE id = uid;
  RETURN public.ensure_mailbox(uid, hint);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_mailbox() FROM public;
GRANT EXECUTE ON FUNCTION public.ensure_my_mailbox() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_mailbox(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.mail_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS mailboxes_touch ON public.mailboxes;
CREATE TRIGGER mailboxes_touch BEFORE UPDATE ON public.mailboxes
FOR EACH ROW EXECUTE FUNCTION public.mail_touch_updated_at();
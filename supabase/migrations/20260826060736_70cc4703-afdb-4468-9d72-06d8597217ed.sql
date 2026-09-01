CREATE OR REPLACE FUNCTION public.get_image_provider_key(p_provider text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_id uuid;
  v_key text;
BEGIN
  SELECT k.id, ds.decrypted_secret INTO v_id, v_key
  FROM public.image_provider_keys k
  JOIN vault.decrypted_secrets ds ON ds.id = k.vault_secret_id
  WHERE k.provider = p_provider
    AND k.enabled
    AND nullif(trim(ds.decrypted_secret), '') IS NOT NULL
  ORDER BY k.last_success_at DESC NULLS LAST, k.created_at ASC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.image_provider_keys SET last_used_at = now() WHERE id = v_id;
  END IF;
  RETURN v_key;
END;
$$;

REVOKE ALL ON FUNCTION public.get_image_provider_key(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_image_provider_key(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_image_provider_key(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_image_provider_key(text) TO service_role;

UPDATE public.image_provider_keys
SET enabled = true, disabled_at = NULL, consecutive_failures = 0, last_error_code = NULL, updated_at = now()
WHERE provider = 'r' AND NOT enabled;
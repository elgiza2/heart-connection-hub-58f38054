
-- 1. Prevent users from escalating credits/plan on their own profile
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- service_role bypasses (auth.uid() is null for service_role calls)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.credits IS DISTINCT FROM OLD.credits
     OR NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.image_free_uses IS DISTINCT FROM OLD.image_free_uses THEN
    RAISE EXCEPTION 'Not allowed to modify billing fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 2. Prevent workspace owner change / privilege escalation via UPDATE
DROP POLICY IF EXISTS "Owner/admin can update workspace" ON public.workspaces;
CREATE POLICY "Owner/admin can update workspace"
ON public.workspaces
FOR UPDATE
TO authenticated
USING (public.is_workspace_admin(id, auth.uid()))
WITH CHECK (public.is_workspace_admin(id, auth.uid()));

CREATE OR REPLACE FUNCTION public.prevent_workspace_owner_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'Cannot change workspace owner';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_workspace_owner_change ON public.workspaces;
CREATE TRIGGER trg_prevent_workspace_owner_change
BEFORE UPDATE ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.prevent_workspace_owner_change();

-- 3. Restrict admin_error_log inserts to service_role/admins only
DROP POLICY IF EXISTS "Users insert own error log" ON public.admin_error_log;
CREATE POLICY "Only admins can insert error log"
ON public.admin_error_log
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

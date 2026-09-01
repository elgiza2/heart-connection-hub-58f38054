CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.credits IS DISTINCT FROM OLD.credits
     OR NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.image_free_uses IS DISTINCT FROM OLD.image_free_uses
     OR NEW.is_banned IS DISTINCT FROM OLD.is_banned
     OR NEW.reward_balance IS DISTINCT FROM OLD.reward_balance
     OR NEW.reward_expires_at IS DISTINCT FROM OLD.reward_expires_at
     OR NEW.siri_balance IS DISTINCT FROM OLD.siri_balance
     OR NEW.ton_balance IS DISTINCT FROM OLD.ton_balance
     OR NEW.usdt_balance IS DISTINCT FROM OLD.usdt_balance
     OR NEW.referral_code IS DISTINCT FROM OLD.referral_code
     OR NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN
    RAISE EXCEPTION 'Not allowed to modify protected profile fields';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_workspace_billing_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.credits IS DISTINCT FROM OLD.credits
     OR NEW.plan IS DISTINCT FROM OLD.plan THEN
    RAISE EXCEPTION 'Not allowed to modify protected workspace fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_workspace_owner_change ON public.workspaces;
DROP TRIGGER IF EXISTS trg_prevent_workspace_billing_escalation ON public.workspaces;
CREATE TRIGGER trg_prevent_workspace_billing_escalation
BEFORE UPDATE ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.prevent_workspace_billing_escalation();

CREATE OR REPLACE FUNCTION public.prevent_reward_task_self_award()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.task_id IS DISTINCT FROM OLD.task_id
     OR NEW.awarded_credits IS DISTINCT FROM OLD.awarded_credits
     OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'Not allowed to modify protected reward fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_reward_task_self_award ON public.user_reward_tasks;
CREATE TRIGGER trg_prevent_reward_task_self_award
BEFORE UPDATE ON public.user_reward_tasks
FOR EACH ROW EXECUTE FUNCTION public.prevent_reward_task_self_award();

CREATE OR REPLACE FUNCTION public.prevent_workspace_usage_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.monthly_used IS DISTINCT FROM OLD.monthly_used
     OR NEW.monthly_period_start IS DISTINCT FROM OLD.monthly_period_start
     OR (NEW.user_id = auth.uid() AND NEW.monthly_limit IS DISTINCT FROM OLD.monthly_limit) THEN
    RAISE EXCEPTION 'Not allowed to modify protected workspace usage fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_workspace_usage_tampering ON public.workspace_members;
CREATE TRIGGER trg_prevent_workspace_usage_tampering
BEFORE UPDATE ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION public.prevent_workspace_usage_tampering();
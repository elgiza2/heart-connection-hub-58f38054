-- Run this once in the Supabase SQL editor.
-- Referral points + reward catalogue (100 subscriptions) + provider API key pool
-- with smart rotation (d = deapi, r = renderful).

-- ── 1. Referral points ────────────────────────────────────────────────
create table if not exists public.referral_points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  points integer not null default 0,
  source text not null default 'referral_signup',
  reference_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists referral_points_user_idx on public.referral_points(user_id);

grant select on public.referral_points to authenticated;
grant all on public.referral_points to service_role;
alter table public.referral_points enable row level security;

drop policy if exists "own points" on public.referral_points;
create policy "own points" on public.referral_points
  for select to authenticated using (auth.uid() = user_id);

-- ── 2. Reward catalogue ───────────────────────────────────────────────
create table if not exists public.reward_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text,
  plan text not null,
  billing_period text not null check (billing_period in ('monthly','yearly')),
  points_cost integer not null,
  stock_total integer not null default 0,
  stock_claimed integer not null default 0,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

grant select on public.reward_catalog to authenticated, anon;
grant all on public.reward_catalog to service_role;
alter table public.reward_catalog enable row level security;

drop policy if exists "catalog readable" on public.reward_catalog;
create policy "catalog readable" on public.reward_catalog
  for select to authenticated, anon using (active);

-- 100 subscriptions in total.
insert into public.reward_catalog
  (slug, title, description, plan, billing_period, points_cost, stock_total, sort_order)
values
  ('starter-monthly','Starter — 1 month','Unlimited chat plus monthly credits','starter','monthly',200,40,1),
  ('pro-monthly','Pro — 1 month','Everything in Starter with a bigger credit allowance','pro','monthly',450,35,2),
  ('pro-yearly','Pro — 1 year','A full year of Pro','pro','yearly',4200,15,3),
  ('elite-yearly','Elite — 1 year','Highest allowance and priority queue','elite','yearly',9000,10,4)
on conflict (slug) do nothing;

-- ── 3. Redemptions ────────────────────────────────────────────────────
create table if not exists public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reward_id uuid not null references public.reward_catalog(id),
  points_spent integer not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

grant select on public.reward_redemptions to authenticated;
grant all on public.reward_redemptions to service_role;
alter table public.reward_redemptions enable row level security;

drop policy if exists "own redemptions" on public.reward_redemptions;
create policy "own redemptions" on public.reward_redemptions
  for select to authenticated using (auth.uid() = user_id);

-- ── 4. Redeem RPC ─────────────────────────────────────────────────────
create or replace function public.redeem_reward(p_reward_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_reward public.reward_catalog%rowtype;
  v_balance integer;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_reward from public.reward_catalog
    where slug = p_reward_slug and active for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_reward.stock_claimed >= v_reward.stock_total then
    return jsonb_build_object('ok', false, 'error', 'out_of_stock');
  end if;

  select coalesce(sum(points), 0) into v_balance
    from public.referral_points where user_id = v_user;

  if v_balance < v_reward.points_cost then
    return jsonb_build_object('ok', false, 'error', 'insufficient_points');
  end if;

  insert into public.referral_points (user_id, points, source, reference_id)
    values (v_user, -v_reward.points_cost, 'reward_redemption', v_reward.id);

  update public.reward_catalog
    set stock_claimed = stock_claimed + 1 where id = v_reward.id;

  insert into public.reward_redemptions (user_id, reward_id, points_spent)
    values (v_user, v_reward.id, v_reward.points_cost);

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.redeem_reward(text) to authenticated;

-- Award 10 points per referral signup.
create or replace function public.award_referral_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.referral_points (user_id, points, source, reference_id)
    values (new.referrer_id, 10, 'referral_signup', new.id);
  return new;
end;
$$;

drop trigger if exists trg_award_referral_points on public.referrals;
create trigger trg_award_referral_points
  after insert on public.referrals
  for each row execute function public.award_referral_points();

-- ── 5. Provider key pool (d = deapi, r = renderful) ───────────────────
create table if not exists public.provider_api_keys (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('d','r')),
  api_key text not null,
  label text,
  status text not null default 'active' check (status in ('active','blocked')),
  failure_count integer not null default 0,
  last_used_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists provider_api_keys_pick_idx
  on public.provider_api_keys(provider, status, last_used_at);

grant all on public.provider_api_keys to service_role;
alter table public.provider_api_keys enable row level security;
-- No policies on purpose: only service_role (server side) can read the keys.

-- Least-recently-used active key for a provider.
create or replace function public.next_provider_key(p_provider text)
returns table (id uuid, api_key text)
language sql
security definer
set search_path = public
as $$
  update public.provider_api_keys k
     set last_used_at = now()
   where k.id = (
     select k2.id from public.provider_api_keys k2
      where k2.provider = p_provider and k2.status = 'active'
      order by k2.last_used_at nulls first, k2.created_at
      limit 1
      for update skip locked
   )
  returning k.id, k.api_key;
$$;

-- Count a failure; block the key after 3 strikes so rotation skips it.
create or replace function public.report_provider_key_failure(p_key_id uuid, p_error text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.provider_api_keys
     set failure_count = failure_count + 1,
         last_error = p_error,
         status = case when failure_count + 1 >= 3 then 'blocked' else status end
   where id = p_key_id;
$$;

-- A success clears the strike counter.
create or replace function public.report_provider_key_success(p_key_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.provider_api_keys
     set failure_count = 0, last_error = null
   where id = p_key_id;
$$;

-- Insert-only entry point used by the unlabeled /k page (admins only).
create or replace function public.store_provider_key(p_provider text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not public.has_role(v_user, 'admin') then
    return jsonb_build_object('ok', false);
  end if;
  if p_provider not in ('d','r') or coalesce(trim(p_value), '') = '' then
    return jsonb_build_object('ok', false);
  end if;
  insert into public.provider_api_keys (provider, api_key) values (p_provider, trim(p_value));
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.store_provider_key(text, text) to authenticated;

-- Summary view for the /k page (counts only, never the key values).
create or replace function public.provider_key_counts()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null or not public.has_role(auth.uid(), 'admin') then '{}'::jsonb
    else coalesce(jsonb_object_agg(provider || '_' || status, n), '{}'::jsonb)
  end
  from (
    select provider, status, count(*) as n
      from public.provider_api_keys group by provider, status
  ) s;
$$;

grant execute on function public.provider_key_counts() to authenticated;

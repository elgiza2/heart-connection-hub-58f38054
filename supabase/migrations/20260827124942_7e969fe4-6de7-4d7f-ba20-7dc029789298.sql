create table if not exists public.referral_points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
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

create table if not exists public.reward_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text,
  category text not null default 'plan',
  image_key text,
  plan text,
  billing_period text not null default 'monthly',
  points_cost integer not null,
  stock_total integer not null default 0,
  stock_claimed integer not null default 0,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.reward_catalog to anon, authenticated;
grant all on public.reward_catalog to service_role;
alter table public.reward_catalog enable row level security;
drop policy if exists "catalog readable" on public.reward_catalog;
create policy "catalog readable" on public.reward_catalog
  for select to anon, authenticated using (active);

create table if not exists public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
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

insert into public.reward_catalog
  (slug, title, description, category, image_key, plan, billing_period, points_cost, stock_total, sort_order)
values
  ('credits-500','500 credits','A top-up of 500 Megsy credits, added instantly.','credits','credits',null,'once',40,500,1),
  ('credits-2000','2,000 credits','A bigger top-up for heavy weeks.','credits','credits',null,'once',140,300,2),
  ('images-pack','100 AI images','A pack of 100 premium image generations.','pack','images',null,'once',90,300,3),
  ('video-pack','20 AI videos','A pack of 20 AI video generations.','pack','video',null,'once',180,150,4),
  ('starter-monthly','Starter — 1 month','Unlimited chat plus the monthly credit allowance.','plan','starter','starter','monthly',150,60,5),
  ('pro-monthly','Pro — 1 month','Everything in Starter with a much bigger allowance.','plan','pro','pro','monthly',300,50,6),
  ('pro-yearly','Pro — 1 year','A full year of Pro — the best value.','plan','pro','pro','yearly',2400,20,7),
  ('elite-yearly','Elite — 1 year','Highest allowance, priority queue and early features.','plan','elite','elite','yearly',5000,10,8)
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  image_key = excluded.image_key,
  points_cost = excluded.points_cost,
  stock_total = excluded.stock_total,
  sort_order = excluded.sort_order;
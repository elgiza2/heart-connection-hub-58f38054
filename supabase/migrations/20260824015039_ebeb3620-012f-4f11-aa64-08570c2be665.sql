create table if not exists public.provider_api_keys (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('d','r','y')),
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
  if p_provider not in ('d','r','y') or coalesce(trim(p_value), '') = '' then
    return jsonb_build_object('ok', false);
  end if;
  insert into public.provider_api_keys (provider, api_key) values (p_provider, trim(p_value));
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.store_provider_key(text, text) to authenticated;

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
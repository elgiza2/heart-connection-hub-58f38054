create table if not exists public.long_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid,
  kind text not null default 'computer',
  goal text not null default '',
  status text not null default 'queued' check (status in ('queued','running','paused','done','error','canceled')),
  phase text,
  status_text text,
  provider text,
  provider_key_id uuid,
  external_run_id text,
  sandbox_id text,
  live_view_url text,
  expires_at timestamptz,
  last_heartbeat_at timestamptz not null default now(),
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists long_runs_user_idx on public.long_runs(user_id, created_at desc);
create index if not exists long_runs_status_idx on public.long_runs(status, last_heartbeat_at);

create table if not exists public.long_run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.long_runs(id) on delete cascade,
  type text not null default 'step',
  title text not null default '',
  detail text,
  screenshot_url text,
  created_at timestamptz not null default now()
);

create index if not exists long_run_events_run_idx on public.long_run_events(run_id, created_at);

grant select, insert, update on public.long_runs to authenticated;
grant all on public.long_runs to service_role;
grant select on public.long_run_events to authenticated;
grant all on public.long_run_events to service_role;

alter table public.long_runs enable row level security;
alter table public.long_run_events enable row level security;

drop policy if exists "own long runs select" on public.long_runs;
create policy "own long runs select" on public.long_runs
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "own long runs insert" on public.long_runs;
create policy "own long runs insert" on public.long_runs
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "own long runs update" on public.long_runs;
create policy "own long runs update" on public.long_runs
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own long run events select" on public.long_run_events;
create policy "own long run events select" on public.long_run_events
  for select to authenticated using (
    exists (select 1 from public.long_runs r where r.id = run_id and r.user_id = auth.uid())
  );

create or replace function public.touch_long_run(p_run_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.long_runs
     set last_heartbeat_at = now(), updated_at = now()
   where id = p_run_id
     and (user_id = auth.uid() or auth.uid() is null);
$$;

grant execute on function public.touch_long_run(uuid) to authenticated, service_role;
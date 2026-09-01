create table if not exists public.long_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid null,
  kind text not null default 'computer',
  goal text not null,
  status text not null default 'queued' check (status in ('queued','running','paused','done','error','canceled')),
  phase text null,
  status_text text null,
  provider text null default 'browser-use',
  external_run_id text null,
  sandbox_id text null,
  live_view_url text null,
  expires_at timestamptz null,
  last_heartbeat_at timestamptz not null default now(),
  result jsonb null,
  error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists long_runs_user_idx on public.long_runs(user_id, created_at desc);

grant select on public.long_runs to authenticated;
grant all on public.long_runs to service_role;

alter table public.long_runs enable row level security;

create policy "Users read own long runs"
  on public.long_runs for select to authenticated
  using (auth.uid() = user_id);

create table if not exists public.long_run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.long_runs(id) on delete cascade,
  type text not null default 'log',
  title text not null,
  detail text null,
  screenshot_url text null,
  created_at timestamptz not null default now()
);

create index if not exists long_run_events_run_idx on public.long_run_events(run_id, created_at);

grant select on public.long_run_events to authenticated;
grant all on public.long_run_events to service_role;

alter table public.long_run_events enable row level security;

create policy "Users read events of own runs"
  on public.long_run_events for select to authenticated
  using (exists (
    select 1 from public.long_runs r
    where r.id = run_id and r.user_id = auth.uid()
  ));

do $$
begin
  alter publication supabase_realtime add table public.long_runs;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.long_run_events;
exception when duplicate_object then null;
end $$;
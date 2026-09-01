alter table public.long_runs replica identity full;
alter table public.long_run_events replica identity full;
do $$
begin
  begin
    alter publication supabase_realtime add table public.long_runs;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.long_run_events;
  exception when duplicate_object then null;
  end;
end $$;
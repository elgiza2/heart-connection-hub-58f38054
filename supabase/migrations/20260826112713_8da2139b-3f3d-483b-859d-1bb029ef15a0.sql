-- allow trigger.dev ('t') and computer/browser provider ('b') keys in the shared pool
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.provider_api_keys'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%provider%'
  loop
    execute format('alter table public.provider_api_keys drop constraint %I', c);
  end loop;
end $$;

alter table public.provider_api_keys
  add constraint provider_api_keys_provider_check
  check (provider in ('d','r','y','a','t','b'));

create or replace function public.store_provider_key(p_provider text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not public.has_role(v_user, 'admin') then
    return jsonb_build_object('ok', false);
  end if;
  if p_provider not in ('d','r','y','a','t','b') or coalesce(trim(p_value), '') = '' then
    return jsonb_build_object('ok', false);
  end if;
  insert into public.provider_api_keys (provider, api_key) values (p_provider, trim(p_value));
  return jsonb_build_object('ok', true);
end;
$function$;
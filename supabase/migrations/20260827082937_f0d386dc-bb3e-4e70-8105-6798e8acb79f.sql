alter table public.provider_api_keys drop constraint if exists provider_api_keys_provider_check;
alter table public.provider_api_keys
  add constraint provider_api_keys_provider_check
  check (provider in ('d','r','y','a','t','b','c','f'));

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
  if p_provider not in ('d','r','y','a','t','b','c','f') or coalesce(trim(p_value), '') = '' then
    return jsonb_build_object('ok', false);
  end if;
  insert into public.provider_api_keys (provider, api_key) values (p_provider, trim(p_value));
  return jsonb_build_object('ok', true);
end;
$function$;

insert into public.provider_api_keys (provider, api_key, label)
select 'f', 'UjR5VWvNK98vpRMrnnKE5F-5JBGWYwn4N3LX9JLQwqXic2aGbFjHWgSuxohSWzKWdtx', 'freestyle'
where not exists (
  select 1 from public.provider_api_keys
   where provider = 'f'
     and api_key = 'UjR5VWvNK98vpRMrnnKE5F-5JBGWYwn4N3LX9JLQwqXic2aGbFjHWgSuxohSWzKWdtx'
);
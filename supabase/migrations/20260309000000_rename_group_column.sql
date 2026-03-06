-- Use swimmer_group instead of "group" to avoid PostgreSQL reserved word issues
-- (Supabase/PostgREST can have trouble with reserved word column names in updates)
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'group') then
    alter table public.profiles rename column "group" to swimmer_group;
  elsif not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'swimmer_group') then
    alter table public.profiles add column swimmer_group text check (swimmer_group in ('Sprint', 'Middle distance', 'Distance'));
  end if;
end $$;

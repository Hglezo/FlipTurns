-- Fix a common typo: PostgREST errors mention `strenght_workouts` when that table exists instead of `strength_workouts`.
-- Safe no-op if the correctly named table already exists.

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'strenght_workouts'
  ) and not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'strength_workouts'
  ) then
    alter table public.strenght_workouts rename to strength_workouts;
  end if;
end $$;

notify pgrst, 'reload schema';

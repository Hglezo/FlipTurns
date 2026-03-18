-- Coach team name (shown in Team Management banner)
alter table public.profiles add column if not exists team_name text;
notify pgrst, 'reload schema';

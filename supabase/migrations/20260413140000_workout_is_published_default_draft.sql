-- Coach-created rows that omit is_published should default to draft (swimmers use RPC with explicit flag).
alter table public.workouts
  alter column is_published set default false;

notify pgrst, 'reload schema';

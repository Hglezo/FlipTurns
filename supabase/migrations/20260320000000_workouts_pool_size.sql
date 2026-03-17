-- Pool size for workouts: LCM (50m), SCM (25m), SCY (25yd)
-- When SCY, workout distances are in yards; analysis shows yd instead of m
alter table public.workouts add column if not exists pool_size text check (pool_size in ('LCM', 'SCM', 'SCY'));
notify pgrst, 'reload schema';

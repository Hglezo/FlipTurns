-- Migrate pool_size from 50m/25m/25y to LCM/SCM/SCY
alter table public.workouts drop constraint if exists workouts_pool_size_check;
update public.workouts set pool_size = 'LCM' where pool_size = '50m';
update public.workouts set pool_size = 'SCM' where pool_size = '25m';
update public.workouts set pool_size = 'SCY' where pool_size = '25y';
alter table public.workouts add constraint workouts_pool_size_check check (pool_size in ('LCM', 'SCM', 'SCY'));
notify pgrst, 'reload schema';

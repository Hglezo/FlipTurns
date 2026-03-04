-- Add workout type (Sprint, Middle distance, Distance) and category (Recovery, Aerobic, Pace, Tech suit)
alter table public.workouts add column if not exists workout_type text default '';
alter table public.workouts add column if not exists workout_category text default '';

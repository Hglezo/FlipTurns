-- Add swimmer_group to profiles (swimmers choose Sprint, Middle distance, or Distance)
alter table public.profiles
  add column if not exists swimmer_group text check (swimmer_group in ('Sprint', 'Middle distance', 'Distance'));

-- Add assigned_to_group to workouts (coach assigns to group instead of swimmer)
alter table public.workouts
  add column if not exists assigned_to_group text check (assigned_to_group in ('Sprint', 'Middle distance', 'Distance'));

-- Drop workout_type (replaced by assigned_to_group)
alter table public.workouts
  drop column if exists workout_type;

-- Allow multiple workouts per date (one per swimmer or per group)
alter table public.workouts
  drop constraint if exists workouts_date_key;

-- Link feedback to specific workout so each swimmer's feedback stays with their workout
alter table public.feedback
  add column if not exists workout_id uuid references public.workouts(id) on delete cascade;

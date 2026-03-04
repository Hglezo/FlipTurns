-- Allow multiple workouts per day (e.g., morning and afternoon)
alter table public.workouts drop constraint if exists workouts_date_key;

-- Add optional session label (e.g., "Morning", "Afternoon")
alter table public.workouts add column if not exists session text default '';

-- Allow delete for coaches to remove workouts
create policy "Anyone can delete workouts" on public.workouts for delete using (true);

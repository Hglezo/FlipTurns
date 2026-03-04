-- Link feedback to specific workout (optional - null means legacy date-only feedback)
alter table public.feedback add column if not exists workout_id uuid references public.workouts(id) on delete cascade;

-- Allow update and delete for swimmers to edit their feedback
create policy "Anyone can update feedback" on public.feedback for update using (true);
create policy "Anyone can delete feedback" on public.feedback for delete using (true);

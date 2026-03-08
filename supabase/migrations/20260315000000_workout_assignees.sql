-- Per-workout assignees: when set, these swimmers see this group workout (overrides default group).
-- Lets coach add/remove swimmers from a group workout for that day only.
create table if not exists public.workout_assignees (
  workout_id uuid not null references public.workouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (workout_id, user_id)
);

alter table public.workout_assignees enable row level security;

create policy "Coaches can manage workout_assignees"
  on public.workout_assignees for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'coach'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'coach'));

create policy "Authenticated can read workout_assignees"
  on public.workout_assignees for select
  using (auth.uid() is not null);

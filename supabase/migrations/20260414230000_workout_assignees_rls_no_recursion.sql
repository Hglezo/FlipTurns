-- workout_assignees policy "Swimmers can manage assignees for own workouts" used a subquery on
-- public.workouts. Workouts SELECT RLS references workout_assignees → infinite recursion.
-- Fix: use a security definer helper so reading created_by does not re-enter workouts RLS.

create or replace function public.workout_row_created_by(p_workout_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select w.created_by from public.workouts w where w.id = p_workout_id limit 1;
$$;

grant execute on function public.workout_row_created_by(uuid) to authenticated;

drop policy if exists "Swimmers can manage assignees for own workouts" on public.workout_assignees;

create policy "Swimmers can manage assignees for own workouts"
  on public.workout_assignees for all
  using (public.workout_row_created_by(workout_id) = (select auth.uid()))
  with check (public.workout_row_created_by(workout_id) = (select auth.uid()));

-- Re-backfill group rosters that still have no junction rows (e.g. after failed inserts).
insert into public.workout_assignees (workout_id, user_id)
select w.id, p.id
from public.workouts w
inner join public.profiles p
  on p.role = 'swimmer'
  and p.swimmer_group is not null
  and p.swimmer_group = w.assigned_to_group
where w.assigned_to_group in ('Sprint', 'Middle distance', 'Distance')
  and not exists (select 1 from public.workout_assignees wa where wa.workout_id = w.id)
on conflict do nothing;

notify pgrst, 'reload schema';

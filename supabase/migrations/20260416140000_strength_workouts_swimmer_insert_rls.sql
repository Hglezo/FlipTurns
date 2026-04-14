-- Allow swimmers to insert their own strength rows via the REST API (fallback when RPC is not in PostgREST cache).
-- Mirrors what insert_strength_workout_swimmer does: created_by must be the swimmer.

drop policy if exists "Swimmers insert own strength workouts" on public.strength_workouts;
create policy "Swimmers insert own strength workouts"
  on public.strength_workouts for insert
  with check (
    (select auth.uid()) is not null
    and created_by = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'swimmer'
    )
  );

notify pgrst, 'reload schema';

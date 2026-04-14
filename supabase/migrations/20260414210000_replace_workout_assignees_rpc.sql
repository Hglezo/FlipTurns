-- Replace junction rows in one shot (bypasses flaky client RLS / PostgREST behavior).
-- Coaches: any workout. Swimmers: only workouts they created (personal assignees, etc.).

create or replace function public.replace_workout_assignees(p_workout_id uuid, p_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not (
    exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'coach')
    or exists (select 1 from public.workouts w where w.id = p_workout_id and w.created_by = auth.uid())
  ) then
    raise exception 'Not authorized';
  end if;

  delete from public.workout_assignees where workout_id = p_workout_id;

  if p_user_ids is not null and array_length(p_user_ids, 1) is not null then
    insert into public.workout_assignees (workout_id, user_id)
    select p_workout_id, x from unnest(p_user_ids) as x;
  end if;
end;
$$;

grant execute on function public.replace_workout_assignees(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';

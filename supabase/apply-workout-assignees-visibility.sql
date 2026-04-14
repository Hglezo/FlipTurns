-- Paste this entire file into Supabase → SQL Editor → Run if `supabase link` / `db push` is not set up.
-- Includes: swimmer visibility for assigned/draft workouts, get_workouts_for_date, delete_workout_coach, replace_workout_assignees.

-- --- from 20260414200000_assigned_workout_visibility_and_coach_delete.sql ---

drop policy if exists "Workouts visible per publish rules" on public.workouts;

create policy "Workouts visible per publish rules"
  on public.workouts for select
  using (
    auth.uid() is not null
    and (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
      or public.workouts.created_by = auth.uid()
      or public.workouts.is_published = true
      or public.workouts.assigned_to = auth.uid()
      or exists (
        select 1
        from public.workout_assignees wa
        where wa.workout_id = public.workouts.id
          and wa.user_id = auth.uid()
      )
      or (
        public.workouts.assigned_to_group is not null
        and public.workouts.assigned_to_group <> 'Personal'
        and not exists (
          select 1 from public.workout_assignees wa2 where wa2.workout_id = public.workouts.id
        )
        and exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'swimmer'
            and p.swimmer_group is not null
            and p.swimmer_group = public.workouts.assigned_to_group
        )
      )
    )
  );

drop function if exists public.get_workouts_for_date(date);

create or replace function public.get_workouts_for_date(p_date date)
returns table (
  id uuid,
  date date,
  content text,
  session text,
  workout_category text,
  pool_size text,
  assigned_to uuid,
  assigned_to_group text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid,
  is_published boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  viewer_is_coach boolean;
begin
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
    into viewer_is_coach;
  return query
  select
    w.id,
    w.date,
    w.content,
    w.session,
    w.workout_category,
    w.pool_size,
    w.assigned_to,
    w.assigned_to_group,
    w.created_at,
    w.updated_at,
    w.created_by,
    w.is_published
  from public.workouts w
  where w.date = p_date
    and (
      viewer_is_coach
      or w.is_published = true
      or w.created_by = auth.uid()
      or w.assigned_to = auth.uid()
      or exists (
        select 1
        from public.workout_assignees wa
        where wa.workout_id = w.id
          and wa.user_id = auth.uid()
      )
      or (
        w.assigned_to_group is not null
        and w.assigned_to_group <> 'Personal'
        and not exists (select 1 from public.workout_assignees wa2 where wa2.workout_id = w.id)
        and exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'swimmer'
            and p.swimmer_group is not null
            and p.swimmer_group = w.assigned_to_group
        )
      )
    )
  order by w.created_at asc;
end;
$$;

grant execute on function public.get_workouts_for_date(date) to authenticated;

create or replace function public.delete_workout_coach(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'coach') then
    raise exception 'Not authorized';
  end if;
  delete from public.workouts where id = p_id;
end;
$$;

grant execute on function public.delete_workout_coach(uuid) to authenticated;

-- --- from 20260414210000_replace_workout_assignees_rpc.sql ---

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

-- Swimmers must see workouts assigned to them even when is_published is false (draft).
-- Otherwise coaches see full rosters in the UI but assignees get zero rows from RLS.
-- Also: group workouts with no junction rows still use implicit roster matching profiles.swimmer_group.

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

-- Reliable coach deletes (same semantics as RLS, but security definer avoids policy edge cases).
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

notify pgrst, 'reload schema';

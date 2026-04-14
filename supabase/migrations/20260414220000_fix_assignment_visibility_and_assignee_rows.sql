-- Fix coach ↔ swimmer assignment issues when the DB is missing visibility rules or junction rows.
--
-- 1) Swimmers read workouts via PostgREST on public.workouts (RLS). Without assignee-aware SELECT,
--    draft workouts assigned to a group or personal list are invisible to swimmers.
-- 2) Coaches read via get_workouts_for_date (security definer). Keep the same visibility rules there.
-- 3) workout_assignees: ensure coaches and workout creators can manage rows (direct client inserts).
-- 4) Backfill: group workouts with zero assignee rows get one row per swimmer in that training group
--    so the app does not treat them as "explicitly assigned to nobody" after merge.

-- --- Workouts SELECT policy (swimmers use direct .from("workouts") queries) ---
drop policy if exists "Authenticated users can view all workouts" on public.workouts;
drop policy if exists "Workouts visible per publish rules" on public.workouts;

create policy "Workouts visible per publish rules"
  on public.workouts for select
  using (
    (select auth.uid()) is not null
    and (
      exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'coach')
      or public.workouts.created_by = (select auth.uid())
      or public.workouts.is_published = true
      or public.workouts.assigned_to = (select auth.uid())
      or exists (
        select 1
        from public.workout_assignees wa
        where wa.workout_id = public.workouts.id
          and wa.user_id = (select auth.uid())
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
          where p.id = (select auth.uid())
            and p.role = 'swimmer'
            and p.swimmer_group is not null
            and p.swimmer_group = public.workouts.assigned_to_group
        )
      )
    )
  );

-- --- get_workouts_for_date: drop all overloads (json vs table return type from ad-hoc fixes) ---
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
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'coach')
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
      or w.created_by = (select auth.uid())
      or w.assigned_to = (select auth.uid())
      or exists (
        select 1
        from public.workout_assignees wa
        where wa.workout_id = w.id
          and wa.user_id = (select auth.uid())
      )
      or (
        w.assigned_to_group is not null
        and w.assigned_to_group <> 'Personal'
        and not exists (select 1 from public.workout_assignees wa2 where wa2.workout_id = w.id)
        and exists (
          select 1
          from public.profiles p
          where p.id = (select auth.uid())
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

-- --- Coach delete RPC (used by app when table delete hits RLS edge cases) ---
create or replace function public.delete_workout_coach(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'coach') then
    raise exception 'Not authorized';
  end if;
  delete from public.workouts where id = p_id;
end;
$$;

grant execute on function public.delete_workout_coach(uuid) to authenticated;

-- --- replace_workout_assignees (single round-trip; security definer) ---
create or replace function public.replace_workout_assignees(p_workout_id uuid, p_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;
  if not (
    exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.role = 'coach')
    or exists (select 1 from public.workouts w where w.id = p_workout_id and w.created_by = (select auth.uid()))
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

-- Read workouts.created_by without triggering workouts RLS (avoids cycle with workout_assignees policies).
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

-- --- workout_assignees RLS: coaches + creators of the workout row ---
drop policy if exists "Coaches can manage workout_assignees" on public.workout_assignees;
drop policy if exists "Authenticated can read workout_assignees" on public.workout_assignees;
drop policy if exists "Swimmers can manage assignees for own workouts" on public.workout_assignees;

alter table public.workout_assignees enable row level security;

grant select, insert, update, delete on public.workout_assignees to authenticated;

create policy "Coaches can manage workout_assignees"
  on public.workout_assignees for all
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'coach'))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'coach'));

create policy "Swimmers can manage assignees for own workouts"
  on public.workout_assignees for all
  using (public.workout_row_created_by(workout_id) = (select auth.uid()))
  with check (public.workout_row_created_by(workout_id) = (select auth.uid()));

create policy "Authenticated can read workout_assignees"
  on public.workout_assignees for select
  using ((select auth.uid()) is not null);

-- --- Backfill group rosters: workouts with training-group assignment but no junction rows ---
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

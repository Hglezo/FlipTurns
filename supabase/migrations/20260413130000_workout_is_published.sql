-- Draft vs published: swimmers only see published workouts (unless creator or coach)

alter table public.workouts
  add column if not exists is_published boolean not null default true;

drop function if exists public.insert_workout(date, text, text, text, text, uuid, text);
drop function if exists public.insert_workout_swimmer(date, text, text, text, text, uuid, text);

-- New coach workouts start as draft (optional publish on insert)
create or replace function public.update_workout(
  p_id uuid,
  p_content text,
  p_session text,
  p_workout_category text,
  p_pool_size text,
  p_assigned_to uuid,
  p_assigned_to_group text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'coach') then
    raise exception 'Not authorized';
  end if;
  update public.workouts
  set
    content = coalesce(p_content, ''),
    session = p_session,
    workout_category = p_workout_category,
    pool_size = case when p_pool_size in ('LCM','SCM','SCY') then p_pool_size else null end,
    assigned_to = p_assigned_to,
    assigned_to_group = p_assigned_to_group,
    updated_at = now(),
    created_by = auth.uid()
  where id = p_id;
end;
$$;

create or replace function public.insert_workout(
  p_date date,
  p_content text,
  p_session text,
  p_workout_category text,
  p_pool_size text,
  p_assigned_to uuid,
  p_assigned_to_group text,
  p_is_published boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'coach') then
    raise exception 'Not authorized';
  end if;
  insert into public.workouts (
    date, content, session, workout_category, pool_size, assigned_to, assigned_to_group,
    updated_at, created_by, is_published
  )
  values (
    p_date,
    coalesce(p_content, ''),
    p_session,
    p_workout_category,
    case when p_pool_size in ('LCM','SCM','SCY') then p_pool_size else null end,
    p_assigned_to,
    p_assigned_to_group,
    now(),
    auth.uid(),
    coalesce(p_is_published, false)
  )
  returning id into new_id;
  return new_id;
end;
$$;

grant execute on function public.insert_workout(date, text, text, text, text, uuid, text, boolean) to authenticated;

-- Swimmer-created workouts also start as draft
create or replace function public.insert_workout_swimmer(
  p_date date,
  p_content text,
  p_session text,
  p_workout_category text,
  p_pool_size text,
  p_assigned_to uuid,
  p_assigned_to_group text default null,
  p_is_published boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'swimmer') then
    raise exception 'Only swimmers can use this function';
  end if;
  insert into public.workouts (
    date, content, session, workout_category, pool_size, assigned_to, assigned_to_group,
    created_by, updated_at, is_published
  )
  values (
    p_date,
    coalesce(p_content, ''),
    p_session,
    p_workout_category,
    case when p_pool_size in ('LCM','SCM','SCY') then p_pool_size else null end,
    case when p_assigned_to_group = 'Personal' then null else p_assigned_to end,
    case when p_assigned_to_group = 'Personal' then 'Personal' else null end,
    auth.uid(),
    now(),
    coalesce(p_is_published, false)
  )
  returning id into new_id;
  return new_id;
end;
$$;

grant execute on function public.insert_workout_swimmer(date, text, text, text, text, uuid, text, boolean) to authenticated;

create or replace function public.update_workout_swimmer(
  p_id uuid,
  p_content text,
  p_session text,
  p_workout_category text,
  p_pool_size text,
  p_assigned_to uuid,
  p_assigned_to_group text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.workouts where id = p_id and created_by = auth.uid()) then
    raise exception 'Not authorized to update this workout';
  end if;
  update public.workouts set
    content = coalesce(p_content, ''),
    session = p_session,
    workout_category = p_workout_category,
    pool_size = case when p_pool_size in ('LCM','SCM','SCY') then p_pool_size else null end,
    assigned_to = case when p_assigned_to_group = 'Personal' then null else p_assigned_to end,
    assigned_to_group = case when p_assigned_to_group = 'Personal' then 'Personal' else null end,
    updated_at = now()
  where id = p_id;
end;
$$;

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
  where w.date = p_date and (
      viewer_is_coach
      or w.is_published
      or w.created_by = auth.uid()
    )
  order by w.created_at asc;
end;
$$;

grant execute on function public.get_workouts_for_date(date) to authenticated;

create or replace function public.set_workout_published(p_id uuid, p_published boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (
    select 1 from public.workouts w
    where w.id = p_id
      and (
        exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
        or w.created_by = auth.uid()
      )
  ) then
    raise exception 'Not authorized';
  end if;
  update public.workouts
  set is_published = p_published, updated_at = now()
  where id = p_id;
end;
$$;

grant execute on function public.set_workout_published(uuid, boolean) to authenticated;

drop policy if exists "Authenticated users can view all workouts" on public.workouts;
create policy "Workouts visible per publish rules"
  on public.workouts for select
  using (
    auth.uid() is not null
    and (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
      or public.workouts.created_by = auth.uid()
      or public.workouts.is_published = true
    )
  );

notify pgrst, 'reload schema';

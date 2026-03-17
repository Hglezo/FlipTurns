-- Track which coach created/updated each workout for notifications
alter table public.workouts add column if not exists created_by uuid references auth.users(id) on delete set null;

-- Update RPCs to set created_by
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
  p_assigned_to_group text
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
  insert into public.workouts (date, content, session, workout_category, pool_size, assigned_to, assigned_to_group, updated_at, created_by)
  values (
    p_date,
    coalesce(p_content, ''),
    p_session,
    p_workout_category,
    case when p_pool_size in ('LCM','SCM','SCY') then p_pool_size else null end,
    p_assigned_to,
    p_assigned_to_group,
    now(),
    auth.uid()
  )
  returning id into new_id;
  return new_id;
end;
$$;

-- Update get_workouts_for_date to include created_by (must drop first when changing return type)
drop function if exists public.get_workouts_for_date(date);

create or replace function public.get_workouts_for_date(p_date date)
returns table (
  id uuid, date date, content text, session text, workout_category text, pool_size text,
  assigned_to uuid, assigned_to_group text, created_at timestamptz, updated_at timestamptz, created_by uuid
)
language sql security definer set search_path = public stable as $$
  select w.id, w.date, w.content, w.session, w.workout_category, w.pool_size,
    w.assigned_to, w.assigned_to_group, w.created_at, w.updated_at, w.created_by
  from public.workouts w where w.date = p_date order by w.created_at asc;
$$;

grant execute on function public.get_workouts_for_date(date) to authenticated;

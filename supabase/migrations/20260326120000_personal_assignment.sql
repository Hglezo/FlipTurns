-- Allow "Personal" multi-assignee workouts (not tied to a training group)
alter table public.workouts drop constraint if exists workouts_assigned_to_group_check;
alter table public.workouts add constraint workouts_assigned_to_group_check
  check (
    assigned_to_group is null
    or assigned_to_group in ('Sprint', 'Middle distance', 'Distance', 'Personal')
  );

-- Swimmer workout RPCs: optional assigned_to_group (e.g. Personal)
drop function if exists public.insert_workout_swimmer(date, text, text, text, text, uuid);
drop function if exists public.update_workout_swimmer(uuid, text, text, text, text, uuid);

create or replace function public.insert_workout_swimmer(
  p_date date,
  p_content text,
  p_session text,
  p_workout_category text,
  p_pool_size text,
  p_assigned_to uuid,
  p_assigned_to_group text default null
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
  insert into public.workouts (date, content, session, workout_category, pool_size, assigned_to, assigned_to_group, created_by, updated_at)
  values (
    p_date,
    coalesce(p_content, ''),
    p_session,
    p_workout_category,
    case when p_pool_size in ('LCM','SCM','SCY') then p_pool_size else null end,
    case when p_assigned_to_group = 'Personal' then null else p_assigned_to end,
    case when p_assigned_to_group = 'Personal' then 'Personal' else null end,
    auth.uid(),
    now()
  )
  returning id into new_id;
  return new_id;
end;
$$;

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

grant execute on function public.insert_workout_swimmer(date, text, text, text, text, uuid, text) to authenticated;
grant execute on function public.update_workout_swimmer(uuid, text, text, text, text, uuid, text) to authenticated;

notify pgrst, 'reload schema';

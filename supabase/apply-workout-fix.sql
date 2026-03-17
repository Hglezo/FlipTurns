-- Run this entire file in Supabase SQL Editor to fix workout category & pool size not saving
-- Consolidates: columns + RPC functions (bypasses PostgREST schema cache)

-- 1. Add missing workout columns
alter table public.workouts add column if not exists session text default '';
alter table public.workouts add column if not exists workout_category text default '';
alter table public.workouts add column if not exists pool_size text check (pool_size in ('LCM', 'SCM', 'SCY'));

-- 2. RPC: update workout (bypasses schema cache)
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
    updated_at = now()
  where id = p_id;
end;
$$;

-- 3. RPC: insert workout (bypasses schema cache)
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
  insert into public.workouts (date, content, session, workout_category, pool_size, assigned_to, assigned_to_group, updated_at)
  values (
    p_date,
    coalesce(p_content, ''),
    p_session,
    p_workout_category,
    case when p_pool_size in ('LCM','SCM','SCY') then p_pool_size else null end,
    p_assigned_to,
    p_assigned_to_group,
    now()
  )
  returning id into new_id;
  return new_id;
end;
$$;

-- 4. RPC: fetch workouts by date (returns JSON to bypass any PostgREST serialization)
create or replace function public.get_workouts_for_date(p_date date)
returns json
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select json_agg(row_to_json(t))
     from (select id, date, content, session, workout_category, pool_size,
             assigned_to, assigned_to_group, created_at, updated_at
           from public.workouts where date = p_date order by created_at asc) t),
    '[]'::json
  );
$$;

-- 5. Grant execute to authenticated users
grant execute on function public.update_workout(uuid, text, text, text, text, uuid, text) to authenticated;
grant execute on function public.insert_workout(date, text, text, text, text, uuid, text) to authenticated;
grant execute on function public.get_workouts_for_date(date) to authenticated;

-- 6. Refresh PostgREST schema cache
notify pgrst, 'reload schema';

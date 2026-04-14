-- Strength / lifting workouts: separate from swim `workouts`; same visibility and assignment patterns.
-- Idempotent: safe to re-run if the table already exists (e.g. partial apply).

create table if not exists public.strength_workouts (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  content text not null default '',
  session text not null default 'PM',
  assigned_to uuid references auth.users(id) on delete set null,
  assigned_to_group text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_published boolean not null default false,
  constraint strength_workouts_assigned_to_group_check check (
    assigned_to_group is null
    or assigned_to_group in ('Sprint', 'Middle distance', 'Distance', 'Personal')
  )
);

create index if not exists strength_workouts_date_idx on public.strength_workouts (date);

drop trigger if exists strength_workouts_updated_at on public.strength_workouts;
create trigger strength_workouts_updated_at
  before update on public.strength_workouts
  for each row execute function public.handle_updated_at();

-- Junction (referenced by SELECT policy)
create table if not exists public.strength_workout_assignees (
  strength_workout_id uuid not null references public.strength_workouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (strength_workout_id, user_id)
);

-- Used by strength_workout_assignees RLS (must exist before those policies)
create or replace function public.strength_workout_row_created_by(p_strength_workout_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select s.created_by from public.strength_workouts s where s.id = p_strength_workout_id limit 1;
$$;

grant execute on function public.strength_workout_row_created_by(uuid) to authenticated;

alter table public.strength_workouts enable row level security;

drop policy if exists "Strength workouts visible per publish rules" on public.strength_workouts;
create policy "Strength workouts visible per publish rules"
  on public.strength_workouts for select
  using (
    (select auth.uid()) is not null
    and (
      exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'coach')
      or public.strength_workouts.created_by = (select auth.uid())
      or public.strength_workouts.is_published = true
      or public.strength_workouts.assigned_to = (select auth.uid())
      or exists (
        select 1
        from public.strength_workout_assignees sa
        where sa.strength_workout_id = public.strength_workouts.id
          and sa.user_id = (select auth.uid())
      )
      or (
        public.strength_workouts.assigned_to_group is not null
        and public.strength_workouts.assigned_to_group <> 'Personal'
        and not exists (
          select 1 from public.strength_workout_assignees sa2 where sa2.strength_workout_id = public.strength_workouts.id
        )
        and exists (
          select 1
          from public.profiles p
          where p.id = (select auth.uid())
            and p.role = 'swimmer'
            and p.swimmer_group is not null
            and p.swimmer_group = public.strength_workouts.assigned_to_group
        )
      )
    )
  );

drop policy if exists "Coaches insert strength workouts" on public.strength_workouts;
create policy "Coaches insert strength workouts"
  on public.strength_workouts for insert
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'coach'));

drop policy if exists "Coaches update strength workouts" on public.strength_workouts;
create policy "Coaches update strength workouts"
  on public.strength_workouts for update
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'coach'));

drop policy if exists "Coaches delete strength workouts" on public.strength_workouts;
create policy "Coaches delete strength workouts"
  on public.strength_workouts for delete
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'coach'));

drop policy if exists "Swimmers update own strength workouts" on public.strength_workouts;
create policy "Swimmers update own strength workouts"
  on public.strength_workouts for update
  using (public.strength_workouts.created_by = (select auth.uid()));

drop policy if exists "Swimmers delete own strength workouts" on public.strength_workouts;
create policy "Swimmers delete own strength workouts"
  on public.strength_workouts for delete
  using (public.strength_workouts.created_by = (select auth.uid()));

alter table public.strength_workout_assignees enable row level security;

grant select, insert, update, delete on public.strength_workout_assignees to authenticated;

drop policy if exists "Coaches can manage strength_workout_assignees" on public.strength_workout_assignees;
create policy "Coaches can manage strength_workout_assignees"
  on public.strength_workout_assignees for all
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'coach'))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'coach'));

drop policy if exists "Swimmers can manage assignees for own strength workouts" on public.strength_workout_assignees;
create policy "Swimmers can manage assignees for own strength workouts"
  on public.strength_workout_assignees for all
  using (public.strength_workout_row_created_by(strength_workout_id) = (select auth.uid()))
  with check (public.strength_workout_row_created_by(strength_workout_id) = (select auth.uid()));

drop policy if exists "Authenticated can read strength_workout_assignees" on public.strength_workout_assignees;
create policy "Authenticated can read strength_workout_assignees"
  on public.strength_workout_assignees for select
  using ((select auth.uid()) is not null);

-- Feedback: optional link to a strength workout (mutually exclusive with workout_id when both set)
alter table public.feedback
  add column if not exists strength_workout_id uuid references public.strength_workouts(id) on delete cascade;

alter table public.feedback drop constraint if exists feedback_workout_xor_strength;

alter table public.feedback
  add constraint feedback_workout_xor_strength check (
    not (workout_id is not null and strength_workout_id is not null)
  );

-- --- RPCs (security definer; mirror swim workout RPCs) ---

create or replace function public.replace_strength_workout_assignees(p_strength_workout_id uuid, p_user_ids uuid[])
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
    or exists (
      select 1 from public.strength_workouts s
      where s.id = p_strength_workout_id and s.created_by = (select auth.uid())
    )
  ) then
    raise exception 'Not authorized';
  end if;

  delete from public.strength_workout_assignees where strength_workout_id = p_strength_workout_id;

  if p_user_ids is not null and array_length(p_user_ids, 1) is not null then
    insert into public.strength_workout_assignees (strength_workout_id, user_id)
    select p_strength_workout_id, x from unnest(p_user_ids) as x;
  end if;
end;
$$;

grant execute on function public.replace_strength_workout_assignees(uuid, uuid[]) to authenticated;

create or replace function public.update_strength_workout(
  p_id uuid,
  p_content text,
  p_session text,
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
  update public.strength_workouts
  set
    content = coalesce(p_content, ''),
    session = coalesce(nullif(trim(p_session), ''), 'PM'),
    assigned_to = p_assigned_to,
    assigned_to_group = p_assigned_to_group,
    updated_at = now()
  where id = p_id;
end;
$$;

create or replace function public.insert_strength_workout(
  p_date date,
  p_content text,
  p_session text,
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
  sess text;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'coach') then
    raise exception 'Not authorized';
  end if;
  sess := coalesce(nullif(trim(p_session), ''), 'PM');
  insert into public.strength_workouts (
    date, content, session, assigned_to, assigned_to_group,
    updated_at, created_by, is_published
  )
  values (
    p_date,
    coalesce(p_content, ''),
    sess,
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

grant execute on function public.insert_strength_workout(date, text, text, uuid, text, boolean) to authenticated;
grant execute on function public.update_strength_workout(uuid, text, text, uuid, text) to authenticated;

create or replace function public.insert_strength_workout_swimmer(
  p_date date,
  p_content text,
  p_session text,
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
  sess text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'swimmer') then
    raise exception 'Only swimmers can use this function';
  end if;
  sess := coalesce(nullif(trim(p_session), ''), 'PM');
  insert into public.strength_workouts (
    date, content, session, assigned_to, assigned_to_group,
    created_by, updated_at, is_published
  )
  values (
    p_date,
    coalesce(p_content, ''),
    sess,
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

create or replace function public.update_strength_workout_swimmer(
  p_id uuid,
  p_content text,
  p_session text,
  p_assigned_to uuid,
  p_assigned_to_group text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.strength_workouts where id = p_id and created_by = auth.uid()) then
    raise exception 'Not authorized to update this workout';
  end if;
  update public.strength_workouts set
    content = coalesce(p_content, ''),
    session = coalesce(nullif(trim(p_session), ''), 'PM'),
    assigned_to = case when p_assigned_to_group = 'Personal' then null else p_assigned_to end,
    assigned_to_group = case when p_assigned_to_group = 'Personal' then 'Personal' else null end,
    updated_at = now()
  where id = p_id;
end;
$$;

grant execute on function public.insert_strength_workout_swimmer(date, text, text, uuid, text, boolean) to authenticated;
grant execute on function public.update_strength_workout_swimmer(uuid, text, text, uuid, text) to authenticated;

create or replace function public.set_strength_workout_published(p_id uuid, p_published boolean)
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
    select 1 from public.strength_workouts s
    where s.id = p_id
      and (
        exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
        or s.created_by = auth.uid()
      )
  ) then
    raise exception 'Not authorized';
  end if;
  update public.strength_workouts
  set is_published = p_published, updated_at = now()
  where id = p_id;
end;
$$;

grant execute on function public.set_strength_workout_published(uuid, boolean) to authenticated;

create or replace function public.delete_strength_workout_coach(p_id uuid)
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
  delete from public.strength_workouts where id = p_id;
end;
$$;

grant execute on function public.delete_strength_workout_coach(uuid) to authenticated;

notify pgrst, 'reload schema';

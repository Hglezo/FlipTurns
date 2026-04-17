"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { useState } from "react";

const FULL_SETUP_SQL = `-- ============================================================
-- FEEDBACK TABLE
-- Stores swimmer feedback (text + intensity ratings) per workout/day
-- ============================================================

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  feedback_text text,
  muscle_intensity smallint not null check (muscle_intensity >= 1 and muscle_intensity <= 10),
  cardio_intensity smallint not null check (cardio_intensity >= 1 and cardio_intensity <= 10),
  created_at timestamptz default now()
);

alter table public.feedback enable row level security;

-- Feedback: allow insert (swimmers submit feedback)
drop policy if exists "Anyone can insert feedback" on public.feedback;
create policy "Anyone can insert feedback" on public.feedback for insert with check (true);

-- Feedback: allow read (coaches and swimmers view feedback)
drop policy if exists "Anyone can read feedback" on public.feedback;
create policy "Anyone can read feedback" on public.feedback for select using (true);

-- Feedback: allow update & delete (swimmers edit/remove their feedback)
drop policy if exists "Anyone can update feedback" on public.feedback;
drop policy if exists "Anyone can delete feedback" on public.feedback;
create policy "Anyone can update feedback" on public.feedback for update using (true);
create policy "Anyone can delete feedback" on public.feedback for delete using (true);

-- ============================================================
-- WORKOUTS TABLE
-- Coaches add workouts; swimmers view them. Multiple per day allowed.
-- ============================================================

-- Remove unique constraint so we can have multiple workouts per day (e.g. morning + afternoon)
alter table public.workouts drop constraint if exists workouts_date_key;

-- Session label (legacy, optional). Type/category for Sprint|Middle|Distance and Recovery|Aerobic|Pace|Speed|Tech suit
alter table public.workouts add column if not exists session text default '';
alter table public.workouts add column if not exists workout_type text default '';
alter table public.workouts add column if not exists workout_category text default '';
alter table public.workouts add column if not exists pool_size text check (pool_size in ('LCM', 'SCM', 'SCY'));

-- Workouts: allow update (coaches edit) and delete (coaches remove)
drop policy if exists "Anyone can update workouts" on public.workouts;
drop policy if exists "Anyone can delete workouts" on public.workouts;
create policy "Anyone can update workouts" on public.workouts for update using (true);
create policy "Anyone can delete workouts" on public.workouts for delete using (true);

-- Refresh PostgREST schema cache (required for new columns to work)
notify pgrst, 'reload schema';`;

const FEEDBACK_POLICIES_SQL = `drop policy if exists "Anyone can update feedback" on public.feedback;
drop policy if exists "Anyone can delete feedback" on public.feedback;
create policy "Anyone can update feedback" on public.feedback for update using (true);
create policy "Anyone can delete feedback" on public.feedback for delete using (true);`;

const FEEDBACK_WORKOUT_ID_SQL = `-- Link feedback to specific workout (so each swimmer's feedback stays with their workout)
alter table public.feedback
  add column if not exists workout_id uuid references public.workouts(id) on delete cascade;`;

const FEEDBACK_USER_ID_SQL = `-- Link feedback to user so swimmers only see/edit their own
alter table public.feedback
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

drop policy if exists "Anyone can insert feedback" on public.feedback;
create policy "Users can insert own feedback" on public.feedback for insert with check (auth.uid() = user_id);

drop policy if exists "Anyone can read feedback" on public.feedback;
create policy "Users read own feedback, coaches read all" on public.feedback for select
  using (auth.uid() = user_id or exists (select 1 from public.profiles where id = auth.uid() and role = 'coach'));

drop policy if exists "Anyone can update feedback" on public.feedback;
create policy "Users can update own feedback" on public.feedback for update using (auth.uid() = user_id);

drop policy if exists "Anyone can delete feedback" on public.feedback;
create policy "Users can delete own feedback" on public.feedback for delete using (auth.uid() = user_id);`;

const FEEDBACK_ANONYMOUS_SQL = `alter table public.feedback add column if not exists anonymous boolean default false;`;

const FEEDBACK_OPTIONAL_INTENSITY_SQL = `-- Make intensity ratings optional (swimmers can add feedback without rating)
alter table public.feedback
  alter column muscle_intensity drop not null,
  alter column cardio_intensity drop not null;`;

// Widen checks from legacy 1–5 to 1–10; run if ratings 6–10 fail to save.
const FEEDBACK_INTENSITY_1_TO_10_SQL = `alter table public.feedback drop constraint if exists feedback_muscle_intensity_check;
alter table public.feedback drop constraint if exists feedback_cardio_intensity_check;

alter table public.feedback
  add constraint feedback_muscle_intensity_check check (muscle_intensity is null or (muscle_intensity >= 1 and muscle_intensity <= 10)),
  add constraint feedback_cardio_intensity_check check (cardio_intensity is null or (cardio_intensity >= 1 and cardio_intensity <= 10));`;

const WORKOUTS_SETUP_SQL = `alter table public.workouts drop constraint if exists workouts_date_key;
alter table public.workouts add column if not exists session text default '';
alter table public.workouts add column if not exists workout_type text default '';
alter table public.workouts add column if not exists workout_category text default '';
alter table public.workouts add column if not exists pool_size text check (pool_size in ('LCM', 'SCM', 'SCY'));
drop policy if exists "Anyone can update workouts" on public.workouts;
drop policy if exists "Anyone can delete workouts" on public.workouts;
create policy "Anyone can update workouts" on public.workouts for update using (true);
create policy "Anyone can delete workouts" on public.workouts for delete using (true);`;

const WORKOUT_GROUPS_SQL = `-- Group-based workout assignment: swimmers choose group in profile; coaches assign to swimmer or group
alter table public.profiles
  add column if not exists swimmer_group text check (swimmer_group in ('Sprint', 'Middle distance', 'Distance'));

alter table public.workouts
  add column if not exists assigned_to_group text check (assigned_to_group in ('Sprint', 'Middle distance', 'Distance'));

alter table public.workouts
  drop column if exists workout_type;

alter table public.workouts
  drop constraint if exists workouts_date_key;`;

const WORKOUT_ASSIGNEES_SQL = `-- Per-workout assignees: lets coach add/remove swimmers from a group workout (e.g. remove Hugo from Middle distance)
-- Run this if you get "Failed to save assignees" when adding/removing swimmers from group workouts
create table if not exists public.workout_assignees (
  workout_id uuid not null references public.workouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (workout_id, user_id)
);

alter table public.workout_assignees enable row level security;

drop policy if exists "Coaches can manage workout_assignees" on public.workout_assignees;
create policy "Coaches can manage workout_assignees"
  on public.workout_assignees for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'coach'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'coach'));

drop policy if exists "Authenticated can read workout_assignees" on public.workout_assignees;
create policy "Authenticated can read workout_assignees"
  on public.workout_assignees for select
  using (auth.uid() is not null);`;

const SWIMMER_WORKOUTS_SQL = `-- Swimmers can create workouts for themselves or other swimmers (not groups)
alter table public.workouts add column if not exists created_by uuid references auth.users(id) on delete set null;

drop policy if exists "Swimmers can manage assignees for own workouts" on public.workout_assignees;
create policy "Swimmers can manage assignees for own workouts"
  on public.workout_assignees for all
  using (
    exists (select 1 from public.workouts w where w.id = workout_assignees.workout_id and w.created_by = auth.uid())
  )
  with check (
    exists (select 1 from public.workouts w where w.id = workout_assignees.workout_id and w.created_by = auth.uid())
  );

create or replace function public.insert_workout_swimmer(
  p_date date, p_content text, p_session text, p_workout_category text, p_pool_size text,
  p_assigned_to uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'swimmer') then
    raise exception 'Only swimmers can use this function';
  end if;
  insert into public.workouts (date, content, session, workout_category, pool_size, assigned_to, assigned_to_group, created_by, updated_at)
  values (p_date, coalesce(p_content, ''), p_session, p_workout_category,
    case when p_pool_size in ('LCM','SCM','SCY') then p_pool_size else null end,
    p_assigned_to, null, auth.uid(), now())
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.update_workout_swimmer(
  p_id uuid, p_content text, p_session text, p_workout_category text, p_pool_size text,
  p_assigned_to uuid
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.workouts where id = p_id and created_by = auth.uid()) then
    raise exception 'Not authorized to update this workout';
  end if;
  update public.workouts set
    content = coalesce(p_content, ''),
    session = p_session,
    workout_category = p_workout_category,
    pool_size = case when p_pool_size in ('LCM','SCM','SCY') then p_pool_size else null end,
    assigned_to = p_assigned_to,
    assigned_to_group = null,
    updated_at = now()
  where id = p_id;
end;
$$;

create or replace function public.get_workouts_for_date(p_date date)
returns json language sql security definer set search_path = public stable as $$
  select coalesce(
    (select json_agg(row_to_json(t))
     from (select id, date, content, session, workout_category, pool_size,
             assigned_to, assigned_to_group, created_at, updated_at, created_by
           from public.workouts where date = p_date order by created_at asc) t),
    '[]'::json
  );
$$;

grant execute on function public.insert_workout_swimmer(date, text, text, text, text, uuid) to authenticated;
grant execute on function public.update_workout_swimmer(uuid, text, text, text, text, uuid) to authenticated;
notify pgrst, 'reload schema';`;

const TEAM_NAME_SQL = `-- Coach team name (shown in Team Management banner)
alter table public.profiles add column if not exists team_name text;
notify pgrst, 'reload schema';`;

const FIX_WORKOUT_SAVE_SQL = `-- Run this if coach workout save is broken (e.g. after adding group assignment)
alter table public.workouts add column if not exists assigned_to_group text check (assigned_to_group in ('Sprint', 'Middle distance', 'Distance'));
alter table public.workouts drop column if exists workout_type;
alter table public.workouts drop constraint if exists workouts_date_key;`;

const WORKOUTS_POOL_SIZE_SQL = `-- Pool size per workout: LCM, SCM, SCY. When SCY, analysis shows yards.
alter table public.workouts add column if not exists pool_size text check (pool_size in ('LCM', 'SCM', 'SCY'));
notify pgrst, 'reload schema';`;

const FIX_WORKOUT_COLUMNS_SQL = `-- Add workout category & pool size; refresh schema cache
alter table public.workouts add column if not exists session text default '';
alter table public.workouts add column if not exists workout_category text default '';
alter table public.workouts add column if not exists pool_size text check (pool_size in ('LCM', 'SCM', 'SCY'));
notify pgrst, 'reload schema';`;

const WORKOUT_SAVE_RPC_SQL = `-- Fix: workout category & pool size not saving (bypasses schema cache)
-- Run this if the fix above doesn't work
alter table public.workouts add column if not exists session text default '';
alter table public.workouts add column if not exists workout_category text default '';
alter table public.workouts add column if not exists pool_size text check (pool_size in ('LCM', 'SCM', 'SCY'));

create or replace function public.update_workout(
  p_id uuid, p_content text, p_session text, p_workout_category text, p_pool_size text,
  p_assigned_to uuid, p_assigned_to_group text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'coach') then
    raise exception 'Not authorized';
  end if;
  update public.workouts set
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

create or replace function public.insert_workout(
  p_date date, p_content text, p_session text, p_workout_category text, p_pool_size text,
  p_assigned_to uuid, p_assigned_to_group text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'coach') then
    raise exception 'Not authorized';
  end if;
  insert into public.workouts (date, content, session, workout_category, pool_size, assigned_to, assigned_to_group, updated_at)
  values (p_date, coalesce(p_content, ''), p_session, p_workout_category,
    case when p_pool_size in ('LCM','SCM','SCY') then p_pool_size else null end,
    p_assigned_to, p_assigned_to_group, now())
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.get_workouts_for_date(p_date date)
returns json language sql security definer set search_path = public stable as $$
  select coalesce(
    (select json_agg(row_to_json(t))
     from (select id, date, content, session, workout_category, pool_size,
             assigned_to, assigned_to_group, created_at, updated_at
           from public.workouts where date = p_date order by created_at asc) t),
    '[]'::json
  );
$$;

grant execute on function public.update_workout(uuid, text, text, text, text, uuid, text) to authenticated;
grant execute on function public.insert_workout(date, text, text, text, text, uuid, text) to authenticated;
grant execute on function public.get_workouts_for_date(date) to authenticated;
notify pgrst, 'reload schema';`;

const COACH_EDIT_ANY_WORKOUT_SQL = `-- Allow any coach to edit any workout (including another coach's)
create or replace function public.update_workout(
  p_id uuid, p_content text, p_session text, p_workout_category text, p_pool_size text,
  p_assigned_to uuid, p_assigned_to_group text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'coach') then
    raise exception 'Not authorized';
  end if;
  update public.workouts set
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
grant execute on function public.update_workout(uuid, text, text, text, text, uuid, text) to authenticated;
notify pgrst, 'reload schema';`;

const COACH_UPDATE_SWIMMER_GROUP_SQL = `-- Coaches can assign swimmers to groups in Team management (Settings)
drop policy if exists "Coaches can update swimmer profiles" on public.profiles;
create policy "Coaches can update swimmer profiles"
  on public.profiles for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach'))
  with check (true);`;

export default function SetupPage() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-dvh bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="app-shell mx-auto flex max-w-md flex-col px-5 pb-8 pt-6 lg:max-w-[34rem] lg:px-6">
        <div className="mb-6 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="size-10" aria-label="Back">
              <ArrowLeft className="size-6" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Database setup</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fix workout save</CardTitle>
            <p className="text-sm text-muted-foreground">
              If coaches can&apos;t save workouts, run this in Supabase SQL Editor.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-xs">
                <code>{FIX_WORKOUT_SAVE_SQL}</code>
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute right-2 top-2 gap-1"
                onClick={() => copy(FIX_WORKOUT_SAVE_SQL)}
              >
                {copied === FIX_WORKOUT_SAVE_SQL ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied === FIX_WORKOUT_SAVE_SQL ? "Copied" : "Copy"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Pool size per workout</CardTitle>
            <p className="text-sm text-muted-foreground">
              Lets coaches assign LCM, SCM, or SCY to each workout. When SCY, analysis shows yards.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-xs">
                <code>{WORKOUTS_POOL_SIZE_SQL}</code>
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute right-2 top-2 gap-1"
                onClick={() => copy(WORKOUTS_POOL_SIZE_SQL)}
              >
                {copied === WORKOUTS_POOL_SIZE_SQL ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied === WORKOUTS_POOL_SIZE_SQL ? "Copied" : "Copy"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Full setup (recommended)</CardTitle>
            <p className="text-sm text-muted-foreground">
              Complete SQL with comments. Run once in Supabase SQL Editor.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <pre className="max-h-[400px] overflow-auto rounded-lg border bg-muted/50 p-4 text-xs">
                <code>{FULL_SETUP_SQL}</code>
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute right-2 top-2 gap-1"
                onClick={() => copy(FULL_SETUP_SQL)}
              >
                {copied === FULL_SETUP_SQL ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied === FULL_SETUP_SQL ? "Copied" : "Copy all"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Feedback only (edit & delete)</CardTitle>
            <p className="text-sm text-muted-foreground">
              If swimmers can add feedback but cannot edit or delete it, run this SQL in your Supabase project.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-xs">
                <code>{FEEDBACK_POLICIES_SQL}</code>
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute right-2 top-2 gap-1"
                onClick={() => copy(FEEDBACK_POLICIES_SQL)}
              >
                {copied === FEEDBACK_POLICIES_SQL ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied === FEEDBACK_POLICIES_SQL ? "Copied" : "Copy"}
              </Button>
            </div>
            <ol className="list-decimal space-y-2 pl-4 text-sm text-muted-foreground">
              <li>Open <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-primary underline">Supabase Dashboard</a></li>
              <li>Select your project → SQL Editor</li>
              <li>Paste the SQL above and run it</li>
            </ol>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Feedback per workout</CardTitle>
            <p className="text-sm text-muted-foreground">
              If feedback from one swimmer appears on other swimmers&apos; workouts on the same day, run this to link feedback to each workout.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-xs">
                <code>{FEEDBACK_WORKOUT_ID_SQL}</code>
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute right-2 top-2 gap-1"
                onClick={() => copy(FEEDBACK_WORKOUT_ID_SQL)}
              >
                {copied === FEEDBACK_WORKOUT_ID_SQL ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied === FEEDBACK_WORKOUT_ID_SQL ? "Copied" : "Copy"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Feedback per user</CardTitle>
            <p className="text-sm text-muted-foreground">
              If swimmers can see or edit other swimmers&apos; feedback, run this to link feedback to each user.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <pre className="max-h-[280px] overflow-auto rounded-lg border bg-muted/50 p-4 text-xs">
                <code>{FEEDBACK_USER_ID_SQL}</code>
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute right-2 top-2 gap-1"
                onClick={() => copy(FEEDBACK_USER_ID_SQL)}
              >
                {copied === FEEDBACK_USER_ID_SQL ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied === FEEDBACK_USER_ID_SQL ? "Copied" : "Copy"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Anonymous feedback</CardTitle>
            <p className="text-sm text-muted-foreground">
              Allows swimmers to submit feedback anonymously. Coaches see &quot;Anonymous&quot; instead of the swimmer&apos;s name. After adding the column, run the schema reload below so coaches see &quot;Anonymous&quot; correctly.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-xs">
                <code>{FEEDBACK_ANONYMOUS_SQL}</code>
              </pre>
              <Button variant="outline" size="sm" className="absolute right-2 top-2 gap-1" onClick={() => copy(FEEDBACK_ANONYMOUS_SQL)}>
                {copied === FEEDBACK_ANONYMOUS_SQL ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied === FEEDBACK_ANONYMOUS_SQL ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Then run this to refresh the schema cache (required for anonymous to work):</p>
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-xs">
                <code>NOTIFY pgrst, &apos;reload schema&apos;;</code>
              </pre>
              <Button variant="outline" size="sm" className="absolute right-2 top-2 gap-1" onClick={() => copy("NOTIFY pgrst, 'reload schema';")}>
                {copied === "NOTIFY pgrst, 'reload schema';" ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied === "NOTIFY pgrst, 'reload schema';" ? "Copied" : "Copy"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Optional intensity ratings</CardTitle>
            <p className="text-sm text-muted-foreground">
              Allows swimmers to add feedback without rating muscle/cardio intensity (1–10).
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-xs">
                <code>{FEEDBACK_OPTIONAL_INTENSITY_SQL}</code>
              </pre>
              <Button variant="outline" size="sm" className="absolute right-2 top-2 gap-1" onClick={() => copy(FEEDBACK_OPTIONAL_INTENSITY_SQL)}>
                {copied === FEEDBACK_OPTIONAL_INTENSITY_SQL ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied === FEEDBACK_OPTIONAL_INTENSITY_SQL ? "Copied" : "Copy"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Feedback intensity 1–10 (ratings 6–10 won&apos;t save)</CardTitle>
            <p className="text-sm text-muted-foreground">
              The app uses a 1–10 scale. Older databases only allowed 1–5, which triggers a check constraint error for muscle or cardio ratings 6–10. Run this once in the SQL Editor to update the rules (safe to re-run).
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-xs">
                <code>{FEEDBACK_INTENSITY_1_TO_10_SQL}</code>
              </pre>
              <Button variant="outline" size="sm" className="absolute right-2 top-2 gap-1" onClick={() => copy(FEEDBACK_INTENSITY_1_TO_10_SQL)}>
                {copied === FEEDBACK_INTENSITY_1_TO_10_SQL ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied === FEEDBACK_INTENSITY_1_TO_10_SQL ? "Copied" : "Copy"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Workouts: save & type/category</CardTitle>
            <p className="text-sm text-muted-foreground">
              If coach cannot save workouts, or type/category don&apos;t work, run this SQL.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-xs">
                <code>{WORKOUTS_SETUP_SQL}</code>
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute right-2 top-2 gap-1"
                onClick={() => copy(WORKOUTS_SETUP_SQL)}
              >
                {copied === WORKOUTS_SETUP_SQL ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied === WORKOUTS_SETUP_SQL ? "Copied" : "Copy"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Workout groups (swimmer groups + group assignment)</CardTitle>
            <p className="text-sm text-muted-foreground">
              Enables assigning workouts to groups (Sprint, Middle distance, Distance). Swimmers choose their group in Settings; coaches assign to a swimmer or a group.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-xs">
                <code>{WORKOUT_GROUPS_SQL}</code>
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute right-2 top-2 gap-1"
                onClick={() => copy(WORKOUT_GROUPS_SQL)}
              >
                {copied === WORKOUT_GROUPS_SQL ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied === WORKOUT_GROUPS_SQL ? "Copied" : "Copy"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Swimmer-created workouts</CardTitle>
            <p className="text-sm text-muted-foreground">
              Allows swimmers to create and edit workouts for themselves or other swimmers (not groups).
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <pre className="max-h-[320px] overflow-auto rounded-lg border bg-muted/50 p-4 text-xs">
                <code>{SWIMMER_WORKOUTS_SQL}</code>
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute right-2 top-2 gap-1"
                onClick={() => copy(SWIMMER_WORKOUTS_SQL)}
              >
                {copied === SWIMMER_WORKOUTS_SQL ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied === SWIMMER_WORKOUTS_SQL ? "Copied" : "Copy"}
              </Button>
            </div>
            <ol className="list-decimal space-y-2 pl-4 text-sm text-muted-foreground">
              <li>Open <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-primary underline">Supabase Dashboard</a></li>
              <li>Select your project → SQL Editor</li>
              <li>Paste the SQL above and run it</li>
            </ol>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Coach team name</CardTitle>
            <p className="text-sm text-muted-foreground">
              Lets coaches set a custom team name (e.g. &quot;Sprint Team&quot;) shown in the Team Management banner. Run this in Supabase SQL Editor.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-xs">
                <code>{TEAM_NAME_SQL}</code>
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute right-2 top-2 gap-1"
                onClick={() => copy(TEAM_NAME_SQL)}
              >
                {copied === TEAM_NAME_SQL ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied === TEAM_NAME_SQL ? "Copied" : "Copy"}
              </Button>
            </div>
            <ol className="list-decimal space-y-2 pl-4 text-sm text-muted-foreground">
              <li>Open <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-primary underline">Supabase Dashboard</a></li>
              <li>Select your project → SQL Editor</li>
              <li>Paste the SQL above and run it</li>
            </ol>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Per-workout assignees (add/remove swimmers from group workouts)</CardTitle>
            <p className="text-sm text-muted-foreground">
              If you get &quot;Failed to save assignees&quot; when adding or removing swimmers from a group workout (e.g. Middle distance), run this SQL in Supabase.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-xs">
                <code>{WORKOUT_ASSIGNEES_SQL}</code>
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute right-2 top-2 gap-1"
                onClick={() => copy(WORKOUT_ASSIGNEES_SQL)}
              >
                {copied === WORKOUT_ASSIGNEES_SQL ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied === WORKOUT_ASSIGNEES_SQL ? "Copied" : "Copy"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Coach can edit any workout</CardTitle>
            <p className="text-sm text-muted-foreground">
              If you get &quot;Not authorized to update this workout&quot; when a coach edits another coach&apos;s workout, run this in Supabase SQL Editor.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-xs">
                <code>{COACH_EDIT_ANY_WORKOUT_SQL}</code>
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute right-2 top-2 gap-1"
                onClick={() => copy(COACH_EDIT_ANY_WORKOUT_SQL)}
              >
                {copied === COACH_EDIT_ANY_WORKOUT_SQL ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied === COACH_EDIT_ANY_WORKOUT_SQL ? "Copied" : "Copy"}
              </Button>
            </div>
            <ol className="list-decimal space-y-2 pl-4 text-sm text-muted-foreground">
              <li>Open <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-primary underline">Supabase Dashboard</a></li>
              <li>Select your project → SQL Editor</li>
              <li>Paste the SQL above and run it</li>
            </ol>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Coach team management (assign swimmers to groups)</CardTitle>
            <p className="text-sm text-muted-foreground">
              If moving swimmers to groups in Settings doesn&apos;t save, run this in Supabase SQL Editor.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-xs">
                <code>{COACH_UPDATE_SWIMMER_GROUP_SQL}</code>
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute right-2 top-2 gap-1"
                onClick={() => copy(COACH_UPDATE_SWIMMER_GROUP_SQL)}
              >
                {copied === COACH_UPDATE_SWIMMER_GROUP_SQL ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied === COACH_UPDATE_SWIMMER_GROUP_SQL ? "Copied" : "Copy"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Workout category &amp; pool size not saving</CardTitle>
            <p className="text-sm text-muted-foreground">
              If workout type (Recovery, Aerobic, etc.) or pool size (LCM, SCM, SCY) don&apos;t persist after save, run this in Supabase SQL Editor. It creates RPC functions that bypass the schema cache.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <pre className="max-h-[320px] overflow-auto rounded-lg border bg-muted/50 p-4 text-xs">
                <code>{WORKOUT_SAVE_RPC_SQL}</code>
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute right-2 top-2 gap-1"
                onClick={() => copy(WORKOUT_SAVE_RPC_SQL)}
              >
                {copied === WORKOUT_SAVE_RPC_SQL ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied === WORKOUT_SAVE_RPC_SQL ? "Copied" : "Copy"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Coach save: &quot;Could not find column in schema cache&quot;</CardTitle>
            <p className="text-sm text-muted-foreground">
              If coach save fails with a schema cache error, run <code className="rounded bg-muted px-1 py-0.5 text-xs">NOTIFY pgrst, &apos;reload schema&apos;;</code> in Supabase SQL Editor to refresh the schema cache.
            </p>
          </CardHeader>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Use &quot;Full setup&quot; for a fresh install, or the smaller blocks to fix specific issues.
        </p>
      </div>
    </div>
  );
}

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
  muscle_intensity smallint not null check (muscle_intensity >= 1 and muscle_intensity <= 5),
  cardio_intensity smallint not null check (cardio_intensity >= 1 and cardio_intensity <= 5),
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

-- Session label (legacy, optional). Type/category for Sprint|Middle|Distance and Recovery|Aerobic|Pace|Tech suit
alter table public.workouts add column if not exists session text default '';
alter table public.workouts add column if not exists workout_type text default '';
alter table public.workouts add column if not exists workout_category text default '';

-- Workouts: allow update (coaches edit) and delete (coaches remove)
drop policy if exists "Anyone can update workouts" on public.workouts;
drop policy if exists "Anyone can delete workouts" on public.workouts;
create policy "Anyone can update workouts" on public.workouts for update using (true);
create policy "Anyone can delete workouts" on public.workouts for delete using (true);`;

const FEEDBACK_POLICIES_SQL = `drop policy if exists "Anyone can update feedback" on public.feedback;
drop policy if exists "Anyone can delete feedback" on public.feedback;
create policy "Anyone can update feedback" on public.feedback for update using (true);
create policy "Anyone can delete feedback" on public.feedback for delete using (true);`;

const WORKOUTS_SETUP_SQL = `alter table public.workouts drop constraint if exists workouts_date_key;
alter table public.workouts add column if not exists session text default '';
alter table public.workouts add column if not exists workout_type text default '';
alter table public.workouts add column if not exists workout_category text default '';
drop policy if exists "Anyone can update workouts" on public.workouts;
drop policy if exists "Anyone can delete workouts" on public.workouts;
create policy "Anyone can update workouts" on public.workouts for update using (true);
create policy "Anyone can delete workouts" on public.workouts for delete using (true);`;

export default function SetupPage() {
  const [copied, setCopied] = useState(false);
  const [copiedWorkouts, setCopiedWorkouts] = useState(false);
  const [copiedFull, setCopiedFull] = useState(false);

  const copySql = () => {
    navigator.clipboard.writeText(FEEDBACK_POLICIES_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyWorkoutsSql = () => {
    navigator.clipboard.writeText(WORKOUTS_SETUP_SQL);
    setCopiedWorkouts(true);
    setTimeout(() => setCopiedWorkouts(false), 2000);
  };

  const copyFullSql = () => {
    navigator.clipboard.writeText(FULL_SETUP_SQL);
    setCopiedFull(true);
    setTimeout(() => setCopiedFull(false), 2000);
  };

  return (
    <div className="min-h-dvh bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-md flex-col px-5 pb-8 pt-6">
        <div className="mb-6 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="size-10" aria-label="Back">
              <ArrowLeft className="size-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Database setup</h1>
        </div>

        <Card>
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
                onClick={copyFullSql}
              >
                {copiedFull ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copiedFull ? "Copied" : "Copy all"}
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
                onClick={copySql}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy"}
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
                onClick={copyWorkoutsSql}
              >
                {copiedWorkouts ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copiedWorkouts ? "Copied" : "Copy"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Coach save: &quot;Could not find column in schema cache&quot;</CardTitle>
            <p className="text-sm text-muted-foreground">
              If coach save fails with a schema cache error, add <code className="rounded bg-muted px-1 py-0.5 text-xs">DATABASE_URL</code> to your <code className="rounded bg-muted px-1 py-0.5 text-xs">.env.local</code> file. The app will then save workouts via a direct database connection.
            </p>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>1. In Supabase Dashboard → Project Settings → Database</p>
            <p>2. Copy the &quot;Connection string&quot; (URI) — use <strong>Transaction</strong> mode (port 6543)</p>
            <p>3. In your project root, create or edit <code className="rounded bg-muted px-1 py-0.5 text-xs">.env.local</code> and add:</p>
            <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 text-xs">DATABASE_URL=&quot;postgresql://postgres.[ref]:[password]@...pooler.supabase.com:6543/postgres&quot;</pre>
            <p>4. Restart the dev server (<code className="rounded bg-muted px-1 py-0.5 text-xs">npm run dev</code>)</p>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Use &quot;Full setup&quot; for a fresh install, or the smaller blocks to fix specific issues.
        </p>
      </div>
    </div>
  );
}

-- Link feedback to the user who created it so swimmers only see/edit their own
alter table public.feedback
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- RLS: swimmers can only insert/update/delete their own feedback
drop policy if exists "Anyone can insert feedback" on public.feedback;
create policy "Users can insert own feedback"
  on public.feedback for insert
  with check (auth.uid() = user_id);

drop policy if exists "Anyone can read feedback" on public.feedback;
create policy "Users read own feedback, coaches read all"
  on public.feedback for select
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'coach')
  );

drop policy if exists "Anyone can update feedback" on public.feedback;
create policy "Users can update own feedback"
  on public.feedback for update
  using (auth.uid() = user_id);

drop policy if exists "Anyone can delete feedback" on public.feedback;
create policy "Users can delete own feedback"
  on public.feedback for delete
  using (auth.uid() = user_id);

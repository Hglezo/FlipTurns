-- Allow swimmers to edit and delete their feedback
drop policy if exists "Anyone can update feedback" on public.feedback;
drop policy if exists "Anyone can delete feedback" on public.feedback;
create policy "Anyone can update feedback" on public.feedback for update using (true);
create policy "Anyone can delete feedback" on public.feedback for delete using (true);

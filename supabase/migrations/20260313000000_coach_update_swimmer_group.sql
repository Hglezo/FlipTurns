-- Coaches can update swimmer_group on swimmer profiles (override swimmer's own choice)
drop policy if exists "Coaches can update swimmer profiles" on public.profiles;
create policy "Coaches can update swimmer profiles"
  on public.profiles for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach'))
  with check (true);

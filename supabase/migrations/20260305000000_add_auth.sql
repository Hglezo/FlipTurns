-- profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null check (role in ('coach', 'swimmer')),
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Authenticated users can view profiles"
  on public.profiles for select
  using (auth.uid() is not null);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'role', 'swimmer')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- add assigned_to column to workouts
alter table public.workouts
  add column if not exists assigned_to uuid references auth.users(id);

-- replace open RLS policies on workouts with role-based ones
drop policy if exists "Anyone can read workouts" on public.workouts;
drop policy if exists "Anyone can insert workouts" on public.workouts;
drop policy if exists "Anyone can update workouts" on public.workouts;
drop policy if exists "Anyone can delete workouts" on public.workouts;

create policy "Coaches can select workouts"
  on public.workouts for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'coach'));

create policy "Coaches can insert workouts"
  on public.workouts for insert
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'coach'));

create policy "Coaches can update workouts"
  on public.workouts for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'coach'));

create policy "Coaches can delete workouts"
  on public.workouts for delete
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'coach'));

create policy "Swimmers can view own workouts"
  on public.workouts for select
  using (assigned_to = auth.uid());

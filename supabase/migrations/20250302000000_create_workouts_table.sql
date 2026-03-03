create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  content text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger workouts_updated_at
  before update on public.workouts
  for each row execute procedure public.handle_updated_at();

alter table public.workouts enable row level security;

create policy "Anyone can read workouts" on public.workouts for select using (true);
create policy "Anyone can insert workouts" on public.workouts for insert with check (true);
create policy "Anyone can update workouts" on public.workouts for update using (true);

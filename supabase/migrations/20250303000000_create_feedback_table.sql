create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  feedback_text text,
  muscle_intensity smallint not null check (muscle_intensity >= 1 and muscle_intensity <= 5),
  cardio_intensity smallint not null check (cardio_intensity >= 1 and cardio_intensity <= 5),
  created_at timestamptz default now()
);

alter table public.feedback enable row level security;

create policy "Anyone can insert feedback" on public.feedback for insert with check (true);
create policy "Anyone can read feedback" on public.feedback for select using (true);

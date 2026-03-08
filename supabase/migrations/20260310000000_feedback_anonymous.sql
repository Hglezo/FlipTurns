-- Allow swimmers to submit anonymous feedback (coach sees "Anonymous" instead of name)
alter table public.feedback
  add column if not exists anonymous boolean default false;

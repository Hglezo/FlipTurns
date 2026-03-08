-- Make muscle_intensity and cardio_intensity optional (swimmers can add feedback without rating)
alter table public.feedback
  alter column muscle_intensity drop not null,
  alter column cardio_intensity drop not null;

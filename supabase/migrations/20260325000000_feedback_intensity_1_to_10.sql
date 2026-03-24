-- Intensity scale 1–10 (was 1–5). Keeps NULL allowed when optional-intensity migration ran.
alter table public.feedback drop constraint if exists feedback_muscle_intensity_check;
alter table public.feedback drop constraint if exists feedback_cardio_intensity_check;

alter table public.feedback
  add constraint feedback_muscle_intensity_check check (muscle_intensity is null or (muscle_intensity >= 1 and muscle_intensity <= 10)),
  add constraint feedback_cardio_intensity_check check (cardio_intensity is null or (cardio_intensity >= 1 and cardio_intensity <= 10));

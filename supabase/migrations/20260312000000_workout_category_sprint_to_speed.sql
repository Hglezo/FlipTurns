-- Rename workout category "Sprint" to "Speed"
update public.workouts set workout_category = 'Speed' where workout_category = 'Sprint';

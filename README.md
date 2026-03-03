# Swim – Workout Calendar

A mobile-optimized Next.js app for coaches and swimmers. Coaches write workouts per day; swimmers tap a day to view the workout. Data is stored in Supabase.

## Setup

1. **Supabase** – Credentials are already configured from the Supabase MCP (`.env.local`).

2. **Create the database table** – Run the migration in Supabase:
   - **Option A (Dashboard):** Open [Supabase SQL Editor](https://supabase.com/dashboard/project/ankjixmjzjaooeyqbtjr/sql/new) and paste the contents of `supabase/schema.sql`, then run it.
   - **Option B (CLI):**  
     `npx supabase link --project-ref ankjixmjzjaooeyqbtjr`  
     then  
     `npx supabase db push`

3. **Start the app:**

   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000).

## Modes

- **Swimmer** – Pick a day to view that day’s workout.
- **Coach** – Pick a day and write or edit the workout.

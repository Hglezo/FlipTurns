# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

FlipTurns is a mobile-optimized swim workout calendar (Next.js 16 / React 19 / Supabase). Coaches create daily workouts; swimmers view and give feedback. See `README.md` for full context.

### Running the app

- **Dev server:** `npm run dev` (port 3000).
- **Lint:** `npm run lint` — pre-existing lint errors/warnings exist in the repo; these do not block the build.
- **Build:** `npm run build` — runs a Turbopack production build.
- **No test suite** — no unit/integration/e2e tests exist in the repo.

### Key caveats

- The app requires Supabase credentials (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) in `.env.local` or as environment variables. Without them the app falls back to placeholder values and authentication will not work, but the UI still renders.
- `NEXT_PUBLIC_SUPABASE_URL` is the project URL (e.g. `https://<ref>.supabase.co`), **not** a JWT. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the anon/public JWT.
- `SUPABASE_SERVICE_ROLE_KEY` is only needed for the account-deletion API route.
- `ANTHROPIC_API_KEY` is only needed for the AI image-to-workout feature.
- Database migrations are in `supabase/migrations/`. Apply with `npx supabase db push` after linking to the Supabase project.
- The package manager is **npm** (lockfile: `package-lock.json`).
- After changing `.env.local`, restart the dev server — Next.js does not hot-reload env var changes.
- Sign-up works without email confirmation on the current Supabase project config. New users are logged in immediately.

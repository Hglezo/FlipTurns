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
- `SUPABASE_SERVICE_ROLE_KEY` is only needed for the account-deletion API route.
- `ANTHROPIC_API_KEY` is only needed for the AI image-to-workout feature.
- Database migrations are in `supabase/migrations/`. Apply with `npx supabase db push` after linking to the Supabase project.
- The package manager is **npm** (lockfile: `package-lock.json`).

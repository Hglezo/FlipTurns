# AGENTS.md

## Cursor Cloud specific instructions

### Overview

FlipTurns is a mobile-optimized swim workout calendar PWA built with **Next.js 16** (App Router), **React 19**, **Tailwind CSS 4**, and **Supabase** (Postgres + Auth). Coaches create workouts; swimmers view them and leave feedback. An optional Anthropic Claude integration enables image-to-workout transcription.

### Running the app

- **Dev server:** `npm run dev` (port 3000)
- **Build:** `npm run build`
- **Lint:** `npm run lint` (pre-existing warnings/errors in the codebase; the lint target is `eslint` with no extra flags)

### Environment variables

The app requires a `.env.local` file with Supabase credentials to connect to a real backend:

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase public/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | For admin APIs | Account deletion, role checks |
| `ANTHROPIC_API_KEY` | Optional | Image-to-workout AI feature |

Without these secrets, the app still builds and renders its UI (login, signup, setup pages), but database queries and auth will fail at runtime.

### Gotchas

- The Supabase client in `src/lib/supabase.ts` falls back to placeholder values when env vars are missing, so `npm run build` always succeeds even without `.env.local`.
- ESLint reports ~10 errors and ~12 warnings on `main` — these are pre-existing and not introduced by any agent changes.
- The project uses **npm** as its package manager (lockfile: `package-lock.json`).
- Node.js >= 18 is required (see `engines` in `package.json`).
- Database migrations are in `supabase/migrations/` — push with `npm run db:push` after linking to a Supabase project.

# FNR RaceDraw — Next Steps

_Last updated: 2026-05-22_

## What's Done

| Item | Status |
|---|---|
| Requirements (v2.1) | ✅ Complete — `REQUIREMENTS_FINAL.md` |
| Requirements review | ✅ Complete — `REQUIREMENTS_REVIEW.md` |
| League scoring expansion plan | ✅ Complete — `LEAGUE_SCORING_EXPANSION.md` |
| Next.js scaffold (App Router, TypeScript, Tailwind, shadcn/ui) | ✅ Complete |
| Supabase schema — all 8 tables, RLS, indexes, triggers | ✅ Complete — `supabase/migrations/001_initial_schema.sql` |
| TypeScript types for all tables | ✅ Complete — `src/lib/types/database.ts` |
| Supabase client utilities (browser, server, service role) | ✅ Complete — `src/lib/supabase/` |
| Middleware (session refresh + auth route guards) | ✅ Complete — `src/middleware.ts` |
| App constants and utilities | ✅ Complete — `src/lib/constants.ts`, `src/lib/utils.ts` |
| Vercel config (framework detection + cron jobs) | ✅ Complete — `vercel.json` |
| Email service — all 9 email templates via Resend | ✅ Complete — `src/lib/email/` |

## What's Pending (Implementation Wave 2)

These three agents were interrupted and need to be re-run:

### Task 2 — Authentication & User Management
**Agent prompt:** See task tracker task #2.
Files to create:
- `src/lib/actions/auth.ts` — signUp, signIn, signOut, resetPassword, updatePassword, updateProfile, deleteAccount
- `src/app/auth/signup/page.tsx`
- `src/app/auth/login/page.tsx`
- `src/app/auth/check-email/page.tsx`
- `src/app/auth/verify-success/page.tsx`
- `src/app/auth/forgot-password/page.tsx`
- `src/app/auth/reset-password/confirm/page.tsx`
- `src/app/auth/layout.tsx`
- `src/app/auth/callback/route.ts`
- `src/app/settings/profile/page.tsx`

### Task 3 — Club / Season / Race Event API Routes
Files to create:
- `src/lib/actions/clubs.ts`
- `src/lib/actions/seasons.ts`
- `src/lib/actions/race-events.ts`
- `src/lib/actions/registrations.ts`
- `src/lib/validations/index.ts`
- `src/app/api/clubs/search/route.ts`
- `src/app/api/registrations/[eventId]/route.ts`

### Task 4 — Draw Algorithm + Cron Endpoints
Files to create:
- `src/lib/draw/algorithm.ts` — the full priority-sorted draw with boat limit
- `src/app/api/cron/run-draws/route.ts`
- `src/app/api/cron/send-reminders/route.ts`
- `src/app/api/admin/trigger-draw/route.ts`

## What's Pending (Implementation Wave 3)

Blocked until Wave 2 is complete:

### Task 6 — User-Facing UI
- Landing page with club search
- User dashboard: upcoming races, season opt-in/out, per-race toggle
- Club join/leave flow
- Mobile-responsive throughout

### Task 7 — Race Chair Admin Dashboard
- Club settings (max boats, timezone)
- Season creation + date picker for Fridays
- Race event management (cancel, override boat limit)
- Registration overview per event
- Manual draw trigger button
- Past draw history

## What's Pending (Wave 4)

### Task 8 — Incremental QA
- After Wave 2: TypeScript build check, API route signatures vs schema, draw algorithm unit logic
- After Wave 3: Page routing, form validation, mobile layout, acceptance criteria pass

## Setup Required Before Deployment

Before any of this can be deployed to Vercel, you'll need:

1. **Supabase project** — create at supabase.com, run `supabase/migrations/001_initial_schema.sql` in the SQL editor
2. **Resend account** — create at resend.com, verify a sending domain, get API key
3. **Environment variables** — copy `.env.local.example` to `.env.local` and fill in real values:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`
   - `CRON_SECRET` (any random string, e.g. `openssl rand -hex 32`)
   - `NEXT_PUBLIC_APP_URL` (your Vercel domain once deployed)
4. **Vercel project** — connect this repo, add all env vars in Vercel dashboard
5. **Supabase email templates** — in Supabase Auth settings, update the email redirect URLs to point to your Vercel domain

## Key Design Decisions To Be Aware Of

- **Role preference fallback**: Users register with a `primary_role` (helm or crew) and an `accept_other_role` boolean. Flexible users fill role gaps in the draw.
- **Boat limit**: Clubs set `max_boats_per_race`; race chairs can override per event with `max_boats_override`. People cut by the limit become overflow with priority.
- **Overflow priority**: Integer stored on `race_registrations`. Computed at registration time by looking up the user's most recent overflow record for this club.
- **Draw timing**: `draw_time` is stored as UTC at event creation time. The cron runs every minute and picks up any event where `draw_time <= now()` and `status = 'upcoming'`. Idempotent via conditional update.
- **League scoring**: Planned but not implemented — see `LEAGUE_SCORING_EXPANSION.md` for the full expansion design.

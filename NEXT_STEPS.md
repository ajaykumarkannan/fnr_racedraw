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

## What's Done (Wave 2) — All Complete

### Task 2 — Authentication & User Management ✅
### Task 3 — Club / Season / Race Event API Routes ✅
### Task 4 — Draw Algorithm + Cron Endpoints ✅

## What's Done (Wave 3) — All Complete

### Task 6 — User-Facing UI ✅
- Landing page with working club search (`src/app/page.tsx`)
- Public club profile page (`src/app/clubs/[slug]/page.tsx`)
- Full user dashboard with club selector, upcoming races, registration toggles, priority display, past races, bulk actions (`src/app/dashboard/`)
- Club join/leave flow (from search + settings page)
- Mobile-responsive throughout
- Club memberships on profile page with leave option

### Task 7 — Race Chair Admin Dashboard ✅
- Chair layout with nav + auth guard (`src/app/chair/layout.tsx`)
- Season management — create, activate, deactivate (`src/app/chair/seasons/page.tsx`)
- Race event management — single + bulk create, cancel, trigger draw (`src/app/chair/events/page.tsx`)
- Registrations view per event (`src/app/chair/events/[eventId]/registrations/page.tsx`)
- Draw results view (`src/app/chair/events/[eventId]/results/page.tsx`)
- Club settings — name, timezone, max boats (`src/app/chair/settings/page.tsx`)
- Member management — promote/demote/list (`src/app/chair/members/page.tsx`)
- Manual draw trigger with confirmation dialog
- Draw results server action (`src/lib/actions/draw-results.ts`)

## What's Done (Wave 4) — QA ✅

### Task 8 — Build & Lint Validation
- TypeScript strict mode: 0 errors (`tsc --noEmit` passes)
- Next.js production build: all 24 routes compile and generate successfully
- ESLint: 0 errors (11 pre-existing warnings in non-critical paths)
- All API routes properly typed against the database schema
- All page routes render and static-generate correctly

## Setup Required Before Deployment

Before any of this can be deployed to Vercel, you'll need:

1. **Supabase project** — create at supabase.com, run `supabase/migrations/001_initial_schema.sql` in the SQL editor
2. **Resend account** — create at resend.com, verify a sending domain, get API key
3. **Environment variables** — copy `.env.local.example` to `.env.local` and fill in real values:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
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

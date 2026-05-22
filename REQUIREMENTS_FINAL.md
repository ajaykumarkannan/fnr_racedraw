# Friday Night Race Draw — Requirements (Final)

**Version:** 2.1  
**Date:** 2026-05-21  
**Status:** Final — Ready for Implementation  
**Supersedes:** REQUIREMENTS.md v1.0, REQUIREMENTS_FINAL.md v2.0

---

## Table of Contents

1. [Overview](#1-overview)
2. [Glossary](#2-glossary)
3. [User Roles & Permissions](#3-user-roles--permissions)
4. [Data Model](#4-data-model)
5. [Feature Requirements](#5-feature-requirements)
   - 5.1 [Authentication & User Management](#51-authentication--user-management)
   - 5.2 [Club Management](#52-club-management)
   - 5.3 [Season & Race Management](#53-season--race-management)
   - 5.4 [Race Registration](#54-race-registration)
   - 5.5 [Draw Engine](#55-draw-engine)
   - 5.6 [Overflow & Priority System](#56-overflow--priority-system)
   - 5.7 [Notifications & Email](#57-notifications--email)
   - 5.8 [User Dashboard](#58-user-dashboard)
   - 5.9 [Race Chair Dashboard](#59-race-chair-dashboard)
   - 5.10 [Public Landing Page](#510-public-landing-page)
   - 5.11 [Account Deletion & Data Privacy](#511-account-deletion--data-privacy)
6. [Non-Functional Requirements](#6-non-functional-requirements)
7. [Technical Architecture](#7-technical-architecture)
8. [Acceptance Criteria](#8-acceptance-criteria)
9. [Out of Scope](#9-out-of-scope)

---

## 1. Overview

The Friday Night Race Draw (FNR RaceDraw) is a multi-tenant web application for sailing club race series management. Each week, registered sailors opt in to race on Friday evening. On Wednesday at 7:00 PM (club-local time), the system automatically pairs helms with crew randomly. The results are emailed to all club members. Sailors who were registered but could not be paired (overflow) receive priority in the following week's draw.

The application supports multiple independent sailing clubs. Each club's data is logically isolated. Race chairs manage their own club's season, race schedule, and draw process.

---

## 2. Glossary

| Term | Definition |
|---|---|
| **Helm** | The sailor who steers the boat (skipper). |
| **Crew** | The sailor who assists the helm on the boat. |
| **Race Event** | A single Friday evening race (one date, one draw). |
| **Season** | A named collection of race events for a club, typically spanning a year or a portion of the year. |
| **Draw** | The automated random pairing of helms with crew for a specific race event. |
| **Overflow** | A registered user who could not be paired because no matching role was available, or who was cut due to the boat limit. |
| **Race Chair** | A club member with elevated permissions to manage seasons, race events, and draws. |
| **Draw Window** | The period during which users may register for a race event. Closes at Wednesday 7:00 PM local time, the same Wednesday that precedes the Friday race. |
| **Priority** | An integer count of consecutive overflow weeks. Higher priority users are paired first in the next draw. Resets to 0 after a successful pairing. |
| **Active Registration** | A `race_registrations` row where `cancelled_at IS NULL`. |

---

## 3. User Roles & Permissions

### 3.1 Anonymous User
- View the public landing page.
- Search for clubs by name.
- View club public profile (name, upcoming race dates).
- Access sign-up and login pages.

### 3.2 Authenticated Member
- All anonymous permissions.
- Join clubs (after email verification).
- Register for individual races or entire seasons.
- View their own dashboard, registrations, and draw history.
- Receive email notifications.
- Update their profile and preferences.
- Create a new club (any verified, authenticated user may do this).

### 3.3 Race Chair
- All authenticated member permissions, scoped to their club(s).
- Create and manage seasons for their club.
- Create, edit, and cancel race events for their club.
- Transition a `draw_complete` race event to `race_day_cancelled`.
- View all member registrations for their club's race events.
- Manually trigger a draw for a race event.
- View all past draws and pairings for their club.
- Designate other members as race chairs for their club.
- Remove members from their club.
- Cannot modify another club's data.

### 3.4 System (Automated)
- Execute scheduled draws at Wednesday 7:00 PM club-local time.
- Send all notification emails.

**Note:** There is no global super-admin role in v1. Race chairs have club-scoped authority only. Platform-level operations (deactivating clubs, abuse handling) are performed via direct database access or the Supabase admin panel.

---

## 4. Data Model

All SQL statements below are authoritative. Migrations must match these definitions exactly. All timestamps are stored as UTC (`TIMESTAMPTZ`). The application converts to club-local time for display.

### 4.1 users

```sql
CREATE TABLE users (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        TEXT        NOT NULL,
  email                       TEXT        UNIQUE,           -- NULL after soft-delete anonymization
  phone                       TEXT,                         -- E.164 international format; required at sign-up
  email_verified              BOOLEAN     NOT NULL DEFAULT false,
  deleted_at                  TIMESTAMPTZ,                  -- soft delete timestamp; NULL = active account
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Notes:**
- Authentication (password hash, verification tokens, reset tokens, sessions) is managed entirely by Supabase Auth. Do not store password hashes or auth tokens in this table.
- `email` is set to NULL when an account is soft-deleted (anonymized). The `UNIQUE` constraint permits multiple NULL values in PostgreSQL.
- `phone` is required at sign-up and validated as international format (E.164, e.g. `+12125551234`). It is cleared (set to NULL) on soft-delete.
- `name` is replaced with `"Deleted User"` on soft-delete.

### 4.2 clubs

```sql
CREATE TABLE clubs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT        NOT NULL UNIQUE,
  slug                TEXT        NOT NULL UNIQUE,
  timezone            TEXT        NOT NULL,   -- IANA timezone string, e.g. "America/New_York"
  max_boats_per_race  INTEGER,                -- NULL = no limit; caps pairs formed per draw
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Notes:**
- `name` uniqueness is enforced case-insensitively at the application layer before insert.
- `slug` is auto-generated from `name` (e.g. "Royal Yacht Club" → "royal-yacht-club"). If a collision occurs, append a numeric suffix (e.g. "royal-yacht-club-2").
- `max_boats_per_race` is NULL by default (no limit). When set, it caps the number of pairs the draw will form, regardless of how many registrations exist. Individual race events may override this value via `race_events.max_boats_override`.
- Clubs cannot be deleted in v1.

### 4.3 club_members

```sql
CREATE TABLE club_members (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_id   UUID        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  role      TEXT        NOT NULL DEFAULT 'member',   -- 'member' or 'race_chair'
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, club_id)
);
```

### 4.4 seasons

```sql
CREATE TABLE seasons (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id    UUID        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  year       INTEGER     NOT NULL,
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_by UUID        NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforce exactly one active season per club at the database level.
CREATE UNIQUE INDEX one_active_season_per_club
  ON seasons (club_id)
  WHERE is_active = true;
```

**Notes:**
- Activating a new season must atomically deactivate the previously active season for that club within the same database transaction.
- If no active season exists for a club, "Register for All Remaining Races" shows an appropriate empty state.

### 4.5 race_events

```sql
CREATE TABLE race_events (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id           UUID        NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  club_id             UUID        NOT NULL REFERENCES clubs(id),   -- denormalized for query convenience
  race_date           DATE        NOT NULL,                        -- must be a Friday
  draw_time           TIMESTAMPTZ NOT NULL,                        -- Wednesday 7:00 PM club-local, stored as UTC
  status              TEXT        NOT NULL DEFAULT 'upcoming',
                      -- Valid values: 'upcoming', 'draw_complete', 'cancelled', 'race_day_cancelled'
  max_boats_override  INTEGER,                                     -- NULL = use clubs.max_boats_per_race
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, race_date)
);
```

**Status values and transitions:**

| From | To | Actor | Condition |
|---|---|---|---|
| `upcoming` | `draw_complete` | System / Race Chair | Draw runs successfully |
| `upcoming` | `cancelled` | Race Chair | Before draw runs |
| `draw_complete` | `race_day_cancelled` | Race Chair | Any time after draw, before or on race day |

**Constraints:**
- `race_date` must be a Friday (enforced at application layer).
- `draw_time` is computed as the Wednesday preceding `race_date` at 7:00 PM in `clubs.timezone`, converted to UTC using a DST-aware library (`date-fns-tz` or `luxon`). It is computed once at creation time and stored.

### 4.6 race_registrations

```sql
CREATE TABLE race_registrations (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  race_event_id     UUID        NOT NULL REFERENCES race_events(id) ON DELETE CASCADE,
  primary_role      TEXT        NOT NULL,              -- 'helm' or 'crew'
  accept_other_role BOOLEAN     NOT NULL DEFAULT false, -- true = will sail the opposite role if needed
  overflow_priority INTEGER     NOT NULL DEFAULT 0,
  cancelled_at      TIMESTAMPTZ,                       -- NULL = active; set on cancellation (soft delete)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, race_event_id)
);
```

**Notes:**
- Registrations are never hard-deleted. Cancellation sets `cancelled_at` to the current timestamp.
- All queries for "active registrations" must include `WHERE cancelled_at IS NULL`.
- `overflow_priority` is set at registration time by looking up the user's current priority for this club (see Section 5.6).
- `primary_role` replaces the old `role_preference` column. The old `'either'` option is replaced by the combination of `primary_role` + `accept_other_role = true`.
- A registrant with `accept_other_role = false` is placed only in their `primary_role` pool. They become overflow if that role is over-subscribed relative to the other side.
- A registrant with `accept_other_role = true` is "flexible" and may be assigned to their non-primary role to fill a deficit (see Section 5.5.2).

### 4.7 draw_results

```sql
CREATE TABLE draw_results (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  race_event_id            UUID        NOT NULL REFERENCES race_events(id) ON DELETE CASCADE,
  helm_user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  crew_user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  helm_played_non_primary  BOOLEAN     NOT NULL DEFAULT false, -- true if helm's primary_role was 'crew'
  crew_played_non_primary  BOOLEAN     NOT NULL DEFAULT false, -- true if crew's primary_role was 'helm'
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (race_event_id, helm_user_id),
  UNIQUE (race_event_id, crew_user_id)
);
```

**Notes:**
- `ON DELETE RESTRICT` on `helm_user_id` and `crew_user_id` prevents hard deletion of a user while draw history exists. Soft-delete (anonymization) is used instead — the rows are preserved with `helm_user_id` / `crew_user_id` pointing to the anonymized user record.
- The unique constraints ensure a user appears at most once per draw, and cannot be both helm and crew.
- `helm_played_non_primary` is `true` when the person placed as helm had `primary_role = 'crew'` (i.e. they were flexible and filled the helm role to balance the draw).
- `crew_played_non_primary` is `true` when the person placed as crew had `primary_role = 'helm'`.

### 4.8 overflow_records

```sql
CREATE TABLE overflow_records (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  race_event_id     UUID        NOT NULL REFERENCES race_events(id) ON DELETE CASCADE,
  club_id           UUID        NOT NULL REFERENCES clubs(id),   -- denormalized for priority lookup
  primary_role      TEXT        NOT NULL,   -- primary_role the user registered with
  accept_other_role BOOLEAN     NOT NULL,   -- copied from the registration at draw time
  priority_at_draw  INTEGER     NOT NULL,   -- overflow_priority value at draw time
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, race_event_id)
);
```

**Notes:**
- `club_id` is denormalized here (matching the pattern used in `race_events`) to avoid multi-join chains in the priority computation hot path.
- `primary_role` and `accept_other_role` are copied from the registration at draw time for a complete audit trail (the registration may be mutated later).

---

## 5. Feature Requirements

---

### 5.1 Authentication & User Management

Authentication is implemented using **Supabase Auth**. Session management, token storage, and session invalidation (including on password change) are handled automatically by Supabase Auth. Do not implement custom session infrastructure.

#### 5.1.1 Sign-Up

- The sign-up form collects: full name, email address, phone number, and password.
- Phone number is **required** and must be validated as international format (E.164, e.g. `+12125551234`). A country-code prefix dropdown is recommended in the UI.
- Password must be at least 8 characters, containing at least one uppercase letter, one lowercase letter, and one digit.
- Email address must be unique across all users.
- On successful submission, the user record is created and a **welcome email containing an email verification link** is sent immediately (see Section 5.7.1).
- The verification link expires after 24 hours.
- The user is shown a confirmation screen instructing them to check their email.
- Until email is verified, the user cannot join clubs or register for races. They may log in but will see a persistent banner prompting verification.
- A "Resend verification email" option is available, rate-limited to once every 5 minutes per user.
- A privacy policy link must appear on the sign-up page (see Section 5.11.2).

#### 5.1.2 Email Verification

- Clicking the verification link sets the user's email as verified (managed by Supabase Auth) and redirects to the dashboard with a success message.
- If the token is expired or already used, the user sees an error with an option to request a new verification email.

#### 5.1.3 Login

- Login accepts email and password.
- Failed attempts return a generic "Invalid email or password" message (no enumeration of which field is wrong).
- Sessions are managed by Supabase Auth (secure, HTTP-only cookies).
- Unverified users can log in but see a persistent verification prompt.

#### 5.1.4 Password Reset

- A "Forgot password" link on the login page accepts an email address.
- If the email exists, a **password reset email** is sent (see Section 5.7.7). The same generic success message is shown regardless of whether the email exists (no enumeration).
- The reset link expires after 1 hour.
- Clicking the link presents a form to set a new password (with confirmation).
- After successful reset, Supabase Auth automatically invalidates all existing sessions for that user.

#### 5.1.5 Profile Management

- Authenticated users can update their name and phone number.
- Email address cannot be changed after registration (v1 simplification).
- Password change is handled via Supabase Auth; upon change, all prior sessions are automatically invalidated.

#### 5.1.6 Club Membership in Profile

- The profile page lists all clubs the user belongs to and their role in each.
- Users can leave a club from this page (removes their `club_members` record).
- Leaving a club automatically soft-cancels all active registrations for upcoming race events at that club (sets `cancelled_at`).
- Leaving a club does not affect past `draw_results` or `overflow_records` for historical integrity.

---

### 5.2 Club Management

#### 5.2.1 Club Creation

- Any verified, authenticated user can create a new club. There is no restriction on who may create clubs. Rate limiting applies: maximum 3 clubs created per user per day to prevent abuse.
- Club creation form collects: club name and timezone (selected from a dropdown of IANA timezone strings).
- Club name must be unique (case-insensitive check at application layer before insert).
- A URL-safe slug is auto-generated from the club name on creation (e.g., "Royal Yacht Club" → "royal-yacht-club"). If the slug collides, append a numeric suffix (e.g., "royal-yacht-club-2"). Slug must be unique.
- The user who creates the club is **automatically added as a member with the `race_chair` role**.
- Clubs cannot be deleted in v1 (to preserve historical race data).

#### 5.2.2 Club Search

- The public landing page and authenticated join flow both support searching for clubs by name.
- Search is case-insensitive and supports partial matches (e.g., searching "royal" returns "Royal Yacht Club").
- Search results display the club name and timezone.

#### 5.2.3 Joining a Club

- Verified users can join any club via the search results.
- Joining adds a `club_members` record with `role = 'member'`.
- Users can belong to multiple clubs simultaneously.
- There is no approval step in v1; joining is immediate.

#### 5.2.4 Race Chair Designation

- A race chair can promote any member of the same club to `race_chair` role.
- A race chair can demote another race chair to `member` role, provided at least one race chair remains in the club after the demotion.
- A race chair cannot demote themselves if they are the only race chair.
- Role changes take effect immediately.

#### 5.2.5 Member Removal by Race Chair

- Race chairs can remove members from the club (deletes the `club_members` record).
- Removing a member automatically soft-cancels all their active registrations for upcoming race events at that club (sets `cancelled_at`).
- The removed member receives a notification email.
- Historical `draw_results` and `overflow_records` for the removed member are preserved.
- A race chair cannot remove another race chair directly; they must first demote the race chair to member, then remove.

---

### 5.3 Season & Race Management

#### 5.3.1 Season Creation

- Race chairs can create seasons for their club.
- Season form collects: name (e.g., "Summer 2026") and year.
- Exactly one season may be `is_active = true` per club at any time. This is enforced by a partial unique index (see Section 4.4).
- When creating a new season, if an active season already exists the UI presents a choice: activate the new season now (which deactivates the current one atomically) or save the new season as inactive.
- Activating a season deactivates the previously active season within the same database transaction.

#### 5.3.2 Race Event Creation

- Race chairs create race events within a season.
- Race events must be scheduled on a Friday. The form restricts date selection to Fridays only.
- Race chairs may create events one at a time or in bulk.
- **Bulk creation:** The race chair specifies a start date (first Friday) and an end date (last Friday). The system generates a race event for every Friday in that range. A preview of all dates is shown before confirmation.
- `draw_time` is automatically computed as the preceding Wednesday at 7:00 PM in the club's timezone (using a DST-aware library) and stored as UTC.
- Duplicate race dates for the same club are rejected with an error.

#### 5.3.3 Race Event Status Transitions

| Current Status | Allowed Transition | By Whom | Notes |
|---|---|---|---|
| `upcoming` | `cancelled` | Race Chair | Before draw runs. All registered users receive a cancellation email. Users' priority is not affected (see Section 5.6.4). |
| `upcoming` | `draw_complete` | System / Race Chair | Draw executed. |
| `draw_complete` | `race_day_cancelled` | Race Chair | After draw has run. All paired sailors receive a cancellation notification email. No draw re-run. No priority changes. |

- Race events with status `draw_complete` or `race_day_cancelled` cannot be edited.
- Race chairs cannot change `race_date` after an event is created. Cancel and recreate if a date change is needed.

---

### 5.4 Race Registration

#### 5.4.1 Opt-In to a Single Race

- Authenticated, verified members who belong to the club can register for any upcoming race event (status = `upcoming`) where `current_time < draw_time`.
- Registration form asks for:
  - **Primary role**: Helm or Crew (required).
  - **Accept other role**: checkbox/toggle — "I will sail as [opposite role] if my primary role is not available" (default: unchecked / false).
- A **registration confirmation email** is sent upon registration (see Section 5.7.3).
- A user may update their `primary_role` or `accept_other_role` at any time before `draw_time`.
- A user may cancel (opt-out of) their registration at any time before `draw_time`; cancellation sets `cancelled_at` on the registration row.

#### 5.4.2 Opt-In to Full Season

- A "Register for All Remaining Races" button registers the user for every upcoming race event in the **active** season for a given club where `draw_time > now()`.
- If no active season exists for the club, an appropriate empty state is shown.
- The user is prompted to choose a default `primary_role` and `accept_other_role` preference for all newly created registrations.
- Any races the user is already actively registered for are unaffected.
- A single confirmation email summarizing all newly created registrations is sent.

#### 5.4.3 Opt-Out of Full Season

- An "Unregister from All Remaining Races" button soft-cancels all the user's active registrations for upcoming race events in the active season for a given club where `draw_time > now()`.
- Already-drawn races (`draw_complete`, `race_day_cancelled`) are not affected.
- A single confirmation email summarizing the cancellations is sent.

#### 5.4.4 Per-Race Registration Toggle

- The user dashboard shows each upcoming race event with a clear registered / not-registered status.
- A toggle or button allows switching between registered and not-registered per race.
- If registering, the user is prompted for their `primary_role` and `accept_other_role`.
- Changes are not possible after `draw_time` has passed.

#### 5.4.5 Registration Cutoff

- The registration cutoff for each race is `draw_time` (Wednesday 7:00 PM club-local time).
- After `draw_time`, registration and deregistration actions for that race are rejected with an appropriate error message.
- The UI disables registration controls for events whose `draw_time` has passed.

---

### 5.5 Draw Engine

#### 5.5.1 Automated Draw Trigger

- A cron job runs every minute (`* * * * *`) and identifies all race events where `draw_time <= now()` and `status = 'upcoming'`.
- For each qualifying race event, the draw is executed.
- The draw is idempotent: the status transition from `upcoming` to `draw_complete` acts as the distributed lock.
- Implementation: within a database transaction, `UPDATE race_events SET status = 'draw_complete' WHERE id = :id AND status = 'upcoming'`. If 0 rows are updated, another process already ran the draw — abort. If 1 row is updated, proceed with the draw, insert results, and commit. Email sending occurs **after** the transaction commits (outside the transaction).

#### 5.5.2 Draw Algorithm

The draw algorithm for a race event is as follows. All steps use only active registrations (`cancelled_at IS NULL`).

**Step 1 — Partition registrations:**

```
helm_primary  = registrations where primary_role == 'helm'  AND accept_other_role == false
crew_primary  = registrations where primary_role == 'crew'  AND accept_other_role == false
flexible      = registrations where accept_other_role == true
               (these may have primary_role of either 'helm' or 'crew')
```

**Step 2 — Sort each partition:**

Within each partition, sort by `overflow_priority DESC`. Within the same priority level, apply a Fisher-Yates shuffle (randomize). Preserve this sorted order throughout.

**Step 3 — Place everyone in their primary role first:**

```
helms = helm_primary  (sorted)
crews = crew_primary  (sorted)
```

Flexible users are held back; they will be used only to fill deficits.

**Step 4 — Use flexible users to fill the deficit role:**

```
helm_deficit = max(0, len(crews) - len(helms))
crew_deficit = max(0, len(helms) - len(crews))
```

Among flexible users, those whose `primary_role` already matches the deficit role are preferred — they are placed into that pool first. Remaining flexible users fill the other side. When multiple flexible users are available for the same deficit slot, prefer higher `overflow_priority` (they are already sorted in Step 2).

```
-- Flexible users whose primary_role matches the deficit role fill that deficit first
-- Remaining flexible users (if any) split across the remaining deficit (if any),
-- or are split 50/50 if no deficit exists.

flexible_helm_primary = flexible where primary_role == 'helm'  (sorted)
flexible_crew_primary = flexible where primary_role == 'crew'  (sorted)

if helm_deficit > 0:
    -- fill helm deficit from flexible, preferring those with primary_role == 'helm'
    to_helm = (flexible_helm_primary + flexible_crew_primary)[0 : helm_deficit]
    remaining_flexible = (flexible_helm_primary + flexible_crew_primary)[helm_deficit :]
    to_crew = remaining_flexible   -- any remaining go to crew

elif crew_deficit > 0:
    -- fill crew deficit from flexible, preferring those with primary_role == 'crew'
    to_crew = (flexible_crew_primary + flexible_helm_primary)[0 : crew_deficit]
    remaining_flexible = (flexible_crew_primary + flexible_helm_primary)[crew_deficit :]
    to_helm = remaining_flexible   -- any remaining go to helm

else:
    -- pools are balanced; split flexible 50/50
    -- prefer assigning each flexible user to their primary role where possible
    -- first assign flexible_helm_primary to helms, flexible_crew_primary to crews,
    -- then split any remainder 50/50 (odd remainder goes to crew)
    to_helm = flexible_helm_primary
    to_crew = flexible_crew_primary
    -- (if one side becomes larger due to this, no further rebalancing is done)
```

**Step 5 — Build final pools:**

```
helms = helm_primary + to_helm   (concatenated, preserving sorted order within each segment)
crews = crew_primary + to_crew
```

**Step 6 — Pair:**

```
pair_count = min(len(helms), len(crews))
pairs      = zip(helms[0:pair_count], crews[0:pair_count])
overflow   = helms[pair_count:] + crews[pair_count:]
```

**Step 7 — Apply boat limit:**

```
boat_limit = race_event.max_boats_override ?? club.max_boats_per_race ?? unlimited

if boat_limit is not null and pair_count > boat_limit:
    cut_pairs  = pairs[boat_limit:]       -- excess pairs are dissolved
    pairs      = pairs[0:boat_limit]
    overflow  += [helm for (helm, crew) in cut_pairs]
                 + [crew for (helm, crew) in cut_pairs]
    pair_count = boat_limit
```

People cut by the boat limit are added to overflow and receive the overflow notification email and priority in the next draw, identical to people who were unpaired due to role imbalance.

**Step 8 — Handle empty draw:**

- If there are zero active registrations for the race event: mark `status = 'draw_complete'`, send the "draw cancelled — no registrations" email (see Section 5.7.4).
- If there are **no helms** (helm_primary is empty and no flexible users exist): all crew-primary registrants are overflow. Send the "draw cancelled — insufficient registrations" email (see Section 5.7.4).
- If there are **no crews** (crew_primary is empty and no flexible users exist): all helm-primary registrants are overflow. Send the "draw cancelled — insufficient registrations" email.
- If there is exactly 1 helm and 1 crew after pool construction: pair them normally.

**Step 9 — Persist results (within transaction from Step 1):**

- Insert rows into `draw_results` for each pair, recording:
  - `helm_user_id`, `crew_user_id`
  - `helm_played_non_primary = true` if the helm's `primary_role` was `'crew'`
  - `crew_played_non_primary = true` if the crew's `primary_role` was `'helm'`
- Insert rows into `overflow_records` for each overflow user, recording `priority_at_draw`, `primary_role`, and `accept_other_role` copied from their registration.
- The status was already set to `draw_complete` in the idempotency check (Step 1 of Section 5.5.1).

**Step 10 — Trigger notifications (after transaction commit):**

- Send the post-draw results email to all club members (Section 5.7.5).
- Send overflow notification emails to overflow users (Section 5.7.6).

#### 5.5.3 Manual Draw Trigger

- Race chairs can manually trigger the draw for a race event from the race chair dashboard.
- Manual trigger is available only for events with status `upcoming`, regardless of whether `draw_time` has passed.
- The UI displays a confirmation modal: "This will run the draw now and cannot be undone. Pairing emails will be sent to all club members."
- Manual triggers are logged with the race chair's user ID and timestamp for audit purposes.
- After triggering, results are displayed immediately in the Draw Results View.
- The same idempotency mechanism applies: if the automated draw fired at the same moment, only one will proceed.

#### 5.5.4 Edge Cases

| Scenario | Behavior |
|---|---|
| Zero active registrations | Status → `draw_complete`. No pairs. No overflow records. Email sent noting no registrations. |
| Only helm-primary registrants, none flexible | All are overflow. "Draw cancelled — insufficient registrations" email sent. |
| Only crew-primary registrants, none flexible | All are overflow. "Draw cancelled — insufficient registrations" email sent. |
| Only 1 helm and 1 crew | Paired normally. |
| Single registration of any kind | That user is overflow. |
| All registrations are flexible (accept_other_role = true) | Flexible users with `primary_role = 'helm'` form the helm pool; flexible users with `primary_role = 'crew'` form the crew pool. If the pools are uneven, no further rebalancing is done (the deficit side has no one to fill it). If only one primary_role is represented, the draw is cancelled — insufficient registrations. |
| Helm-primary user with accept_other_role = true when helms are over-subscribed | That user may be assigned to crew to balance the pools (if crews are in deficit). |
| Helm-primary user with accept_other_role = false when no crew available | That user is overflow. |
| Boat limit applied (N pairs possible, limit = M < N) | First M pairs are kept. Remaining N−M pairs are dissolved; all 2(N−M) sailors go to overflow. Overflow notification sent to cut sailors. Email includes note that boat limit was applied. |
| Boat limit set to 0 or lower | Treat as unlimited (invalid configuration; application layer must validate positive integers). |
| Race cancelled before draw | No draw runs. No overflow records created. Users' accumulated priority is unchanged (see Section 5.6.4). All registered users receive cancellation email. |
| Race day cancellation (after draw) | Race chair transitions `draw_complete` → `race_day_cancelled`. Notification sent to all paired sailors. No priority changes. No draw re-run. |

---

### 5.6 Overflow & Priority System

#### 5.6.1 Overview

`overflow_priority` is an integer stored on `race_registrations`. It counts the number of consecutive weeks the user was overflow without being successfully paired, at the time they register for a race. Higher values mean higher priority in the draw. It resets to 0 after a successful pairing.

#### 5.6.2 Priority Computation at Registration Time

When a user creates a registration for race event `R` (at club `C`), the system computes their `overflow_priority` as follows:

1. Find the most recent `overflow_records` row for this user at club `C`, where no successful pairing in `draw_results` exists for this user at club `C` with a `race_date` after that overflow row and before the target race `R`'s date.
2. If such a row exists: `overflow_priority = overflow_records.priority_at_draw + 1`.
3. If no such row exists (user was never overflowed, or was successfully paired since their last overflow): `overflow_priority = 0`.

**Priority does not carry across seasons.** When computing the above, only `race_events` belonging to the current active season at club `C` are considered.

**Pseudocode / reference query:**

```sql
-- Compute next overflow_priority for (:user_id, :club_id, :target_race_date)
SELECT COALESCE(
  (
    SELECT or_.priority_at_draw + 1
    FROM overflow_records or_
    JOIN race_events re ON re.id = or_.race_event_id
    JOIN seasons s ON s.id = re.season_id
    WHERE or_.user_id = :user_id
      AND or_.club_id = :club_id
      AND s.is_active = true
      AND NOT EXISTS (
        SELECT 1
        FROM draw_results dr
        JOIN race_events re2 ON re2.id = dr.race_event_id
        JOIN seasons s2 ON s2.id = re2.season_id
        WHERE s2.club_id = :club_id
          AND s2.is_active = true
          AND (dr.helm_user_id = :user_id OR dr.crew_user_id = :user_id)
          AND re2.race_date > re.race_date
          AND re2.race_date < :target_race_date
      )
    ORDER BY re.race_date DESC
    LIMIT 1
  ),
  0
) AS next_overflow_priority;
```

#### 5.6.3 Priority Accumulation Rules

- Priority is stored per-registration (audit trail), not per-user.
- If a user skips a week (does not register), their accumulated priority is preserved and carried forward to the next race they register for (the query above finds the most recent overflow regardless of gaps).
- Priority resets to 0 after a successful pairing.
- If a race is cancelled before the draw, no overflow records are created and priority is not incremented for that event.
- If a race is cancelled on race day (`race_day_cancelled`), no overflow records are created and priority is not changed.

#### 5.6.4 Priority Display

- The user dashboard shows the user's current computed `overflow_priority` for each club they belong to.
- The race chair dashboard shows the `overflow_priority` for each registered user on the registrations list, sortable.

---

### 5.7 Notifications & Email

All transactional emails are sent via **Resend** (primary). Email sending occurs **after** any database transaction commits. Failures are logged but do not roll back draw results or registrations.

All bulk emails (draw results, reminders) must include an **unsubscribe link**. Unsubscribing suppresses non-transactional emails (draw results, reminders) for that user at that club. Account-related emails (verification, password reset) are always sent regardless of unsubscribe status.

#### 5.7.1 Welcome / Email Verification Email

- **Recipients:** The newly registered user.
- **Trigger:** Immediately on successful sign-up.
- **Content:** Welcome message, email verification link (expires 24 hours), brief explanation of the app.
- **Subject:** "Welcome to FNR RaceDraw — Please verify your email"

#### 5.7.2 Pre-Draw Reminder Email

- **Recipients:** All club members (subject to unsubscribe preferences).
- **Trigger:** Tuesday at 6:00 PM club-local time, the Tuesday preceding the Wednesday draw.
- **Content:**
  - Reminder that the draw closes **Wednesday at 7:00 PM** (club local timezone, explicitly labeled).
  - The user's current registration status for that specific race event (registered / not registered, and current primary role and accept-other-role preference if registered).
  - A direct link to their dashboard to register or modify registration.
- **Subject:** "[Club Name] Reminder: Friday Race Draw Closes Tomorrow at 7pm"
- **Implementation:** The reminder cron job runs hourly and finds race events where `draw_time` is between **23 and 25 hours** from `now()`. One reminder email is sent per qualifying race event per club. If two race events at the same club happen to fall within the window simultaneously (non-standard scheduling), a separate reminder email is sent for each.

#### 5.7.3 Registration Confirmation Email

- **Recipients:** The user who registered.
- **Trigger:** Upon successful creation of an active `race_registrations` record.
- **Content:**
  - Club name, race date, primary role selected, and whether the user has indicated willingness to accept the other role.
  - Reminder of draw cutoff time (Wednesday 7:00 PM club-local time, timezone labeled).
  - Link to dashboard to modify or cancel registration.
- **Subject:** "[Club Name] You're registered for [Date] — [Role]"
- **For bulk season registration:** One summary email listing all races registered for, not one email per race.

#### 5.7.4 Draw Cancelled — Insufficient Registrations Email

- **Recipients:** All active registrants for the race event.
- **Trigger:** When the draw runs but produces zero pairs because there are no helms or no crews available after flexible-user assignment.
- **Content:**
  - Club name, race date.
  - Message: "Draw cancelled — insufficient registrations (need at least one helm and one crew)."
  - List of registered users and their roles.
  - Encouragement to register for upcoming races.
- **Subject:** "[Club Name] Draw Cancelled — [Date] (Insufficient Registrations)"

#### 5.7.5 Post-Draw Results Email

- **Recipients:** All members of the club (subject to unsubscribe preferences).
- **Trigger:** Immediately after the draw completes and commits (automated or manual), if pairs were produced.
- **Content:**
  - Club name and race date.
  - List of pairings: "Helm: [Name] — Crew: [Name]" for each pair. Users who were assigned to their non-primary role are noted with an asterisk or "(filled in)" indicator (e.g. "Helm: [Name] * (primary: crew)").
  - List of overflow users: "[Name] (primary role: [role])" with a note that they have priority in the next draw.
  - If a boat limit was applied: a note such as "Boat limit of [N] applied — [X] additional pairs were dissolved and those sailors have priority next week."
  - Total count of pairs and overflow.
  - Club timezone and draw time for reference.
- **Subject:** "[Club Name] Friday Night Race Draw — [Date]"

#### 5.7.6 Overflow Notification Email

- **Recipients:** Each user in the overflow list.
- **Trigger:** Immediately after the draw completes (same trigger as post-draw results email).
- **Content:**
  - Club name, race date.
  - "You were not paired this week but you have priority in next week's draw."
  - Their current accumulated priority count.
  - Link to register for the next race.
- **Subject:** "[Club Name] You have priority for the next draw — [Date]"

#### 5.7.7 Race Event Cancellation Email

- **Recipients:** All users with active registrations for the cancelled event.
- **Trigger:** When a race chair sets a race event status to `cancelled` (before draw) or `race_day_cancelled` (after draw).
- **Content:**
  - Club name, race date.
  - Notice that the race is cancelled.
  - For `race_day_cancelled`: acknowledgment that the draw had already run and pairings are voided.
  - Encouragement to register for upcoming races.
  - For `race_day_cancelled`, recipients are all **paired** sailors (from `draw_results`), not only registrants.
- **Subject:** "[Club Name] Race Cancelled — [Date]"

#### 5.7.8 Password Reset Email

- **Recipients:** The user requesting the password reset.
- **Trigger:** On password reset request (managed by Supabase Auth).
- **Content:** Standard Supabase Auth password reset link (expires 1 hour).
- **Subject:** "Reset your FNR RaceDraw password"

#### 5.7.9 Registration Cancellation Email

- **Recipients:** The user who cancelled.
- **Trigger:** Upon successful soft-cancellation of a `race_registrations` record.
- **Content:**
  - Club name, race date(s) affected.
  - Confirmation that the registration is cancelled.
  - Link to re-register.
- **Subject:** "[Club Name] Registration cancelled for [Date]" (or "multiple dates" for bulk).

#### 5.7.10 Account Deletion Confirmation Email

- **Recipients:** The user deleting their account (sent before the email is anonymized).
- **Trigger:** Upon successful account deletion request, before anonymization.
- **Content:** Confirmation that the account has been deleted and data has been anonymized.
- **Subject:** "Your FNR RaceDraw account has been deleted"

---

### 5.8 User Dashboard

#### 5.8.1 Layout

- The dashboard is scoped to one club at a time.
- A club selector (dropdown or tabs) appears at the top if the user belongs to multiple clubs.
- Default club: the club the user most recently registered for a race at, falling back to the most recently joined club. This preference is stored in a cookie.

#### 5.8.2 Upcoming Races Panel

- Displays all upcoming race events for the selected club (status = `upcoming`).
- Each row shows:
  - Race date (formatted, e.g., "Friday, 6 June 2026").
  - Days until the draw closes (e.g., "Draw closes in 3 days").
  - User's registration status: "Registered as Helm", "Registered as Crew", "Registered as Helm (will crew if needed)", "Registered as Crew (will helm if needed)", or "Not Registered".
  - Current `overflow_priority` for this user at this club (shown as "Priority: [n]" when > 0).
  - A toggle or button to register/unregister, disabled after `draw_time`.
  - If registered, selectors for primary role and accept-other-role preference, both changeable before draw.

#### 5.8.3 Season Bulk Actions

- "Register for All Remaining Races": registers for all upcoming races in the active season with `draw_time > now()`. Prompts for default primary role and accept-other-role preference.
- "Unregister from All Remaining Races": soft-cancels all such registrations. Requires a confirmation dialog.

#### 5.8.4 Past Races Panel

- A collapsed or paginated section showing past race events (paginated at 20 per page).
- For each past event: race date, the user's pair (if paired), or "Overflow", or "Not Registered".

#### 5.8.5 Priority Summary

- A small info card shows the user's current computed overflow priority for the selected club.
- Explains what priority means (tooltip or expandable section).

---

### 5.9 Race Chair Dashboard

#### 5.9.1 Season Management

- List of seasons for the club with status indicators (active / inactive).
- Create new season button.
- Ability to mark a season as active (automatically deactivates current active season).

#### 5.9.2 Race Event Management

- List of all race events in the selected season.
- Per-event: date, status, registration count (helm-primary / crew-primary / flexible / total), draw time (club-local timezone, labeled), effective boat limit (if set).
- Actions: Cancel event (if `upcoming`), Transition to `race_day_cancelled` (if `draw_complete`), View registrations, Trigger draw manually, Edit boat limit override (if `upcoming`).
- Create single event button; bulk create events (date range, preview before confirm).
- Paginated at 20 events per page.
- Race chairs can set or clear `max_boats_override` on individual upcoming race events. The effective limit is shown as "Limit: [N] (event override)", "Limit: [N] (club default)", or "No limit".
- Club-level `max_boats_per_race` is editable in the club settings section of the race chair dashboard.

#### 5.9.3 Registrations View

- For any upcoming or past race event, view all active registered users.
- Columns: Name, Primary Role, Accept Other Role, Overflow Priority.
- Sortable by priority.
- Paginated at 50 per page.

#### 5.9.4 Draw Results View

- For completed race events, view the full draw results.
- Columns: Pair #, Helm Name, Crew Name.
- Separate section showing overflow users.

#### 5.9.5 Manual Draw Trigger

- Button to trigger draw for a selected race event (status = `upcoming` only).
- Confirmation modal: "This will run the draw now and cannot be undone. Pairing emails will be sent to all club members."
- After triggering, results displayed immediately in the Draw Results View.

#### 5.9.6 Member Management

- List of all club members with their role (member / race_chair). Paginated at 50 per page.
- Ability to promote/demote members to/from race chair (subject to at-least-one-chair constraint).
- Ability to remove a member from the club (sends notification email, soft-cancels their upcoming registrations).

---

### 5.10 Public Landing Page

#### 5.10.1 Content

- App name, tagline, and brief description.
- Club search bar: search by club name (partial match, case-insensitive).
- Search results: club name and timezone.
- From search results, links to:
  - "Join this club" (redirects to sign-up if not authenticated; after sign-up and verification, automatically completes the join for the originally intended club using a redirect parameter stored through the auth flow).
  - Club's public profile page.

#### 5.10.2 Public Club Profile Page

- Accessible at `/clubs/[slug]`.
- Shows: club name, timezone, list of upcoming race event dates.
- Does not show registrations, member names, or draw results.
- "Join Club" and "Log In" CTAs.

---

### 5.11 Account Deletion & Data Privacy

#### 5.11.1 Account Deletion

- Authenticated users can request deletion of their account from the profile settings page.
- A confirmation dialog is shown: "This will permanently anonymize your account. Your draw history will be retained with your name replaced by 'Deleted User'. This cannot be undone."
- Deletion is a **soft-delete**: the `users` row is anonymized (name → "Deleted User", email → NULL, phone → NULL, `deleted_at` → now()). Supabase Auth user is also deleted.
- `draw_results` rows are preserved with `helm_user_id` / `crew_user_id` pointing to the anonymized user record (historical pairings remain meaningful).
- All `club_members` records for the user are deleted.
- All active `race_registrations` are soft-cancelled (`cancelled_at` set).
- `overflow_records` are preserved (they reference the anonymized user).
- A **deletion confirmation email** is sent to the user's email address before the email is anonymized (Section 5.7.10).

#### 5.11.2 Privacy Obligations

- A privacy policy link must appear in the site footer and on the sign-up page.
- All bulk emails (draw results, reminders) must include an unsubscribe link.
- Unsubscribing suppresses non-transactional emails for that user at that club. Account emails (verification, password reset, deletion confirmation) are always sent.
- Data subject access requests are handled manually by the development team in v1.
- Data retention: draw results and overflow records are retained indefinitely unless a user deletes their account (at which point the user data is anonymized but records are preserved).

---

## 6. Non-Functional Requirements

### 6.1 Performance

- Page load (Time to First Byte) < 500ms for dashboard pages under normal load.
- Draw execution completes within 5 seconds for clubs with up to 100 active registrations.
- Email delivery initiated within 30 seconds of draw completion (after transaction commit).

### 6.2 Security

- Authentication and session management delegated to Supabase Auth (handles password hashing, token management, session invalidation on password change).
- All sensitive auth operations (verification, reset) use Supabase Auth's built-in token infrastructure.
- All API routes validate that the authenticated user has the appropriate club membership and role before performing club-scoped operations.
- CSRF protection on all state-mutating requests (handled by Supabase Auth + Next.js).
- Rate limiting on authentication endpoints: max 10 failed login attempts per IP per 15 minutes.
- Rate limiting on email sending: max 3 verification/reset emails per user per hour.
- Rate limiting on club creation: max 3 clubs per user per day.
- Multi-tenancy isolation: all queries returning club data must filter by `club_id`. No cross-club data leakage.
- Cron job endpoints protected by `CRON_SECRET` (see Section 7.3).

### 6.3 Reliability

- Draw cron job: if a draw fails (exception), the event remains in `upcoming` status and the failure is logged. The race chair can manually trigger the draw as a fallback.
- Error monitoring service (e.g., Sentry) must be configured to alert the development team on cron failures.
- Email failures are logged but do not affect draw results.

### 6.4 Accessibility

- WCAG 2.1 AA compliance.
- All form inputs have associated labels.
- Color is not the sole indicator of state (registration status uses both color and text).
- Keyboard-navigable dashboard.

### 6.5 Internationalisation

- All timestamps displayed in the club's local timezone, not UTC.
- Timezone is clearly labeled in all date displays (e.g., "Wednesday, 3 June 2026, 7:00 PM EDT").
- v1 supports English only.

### 6.6 Mobile Responsiveness

- All pages fully functional on mobile viewport (320px minimum width).
- Dashboard toggles and buttons meet 44×44px minimum tap target size.
- The registration toggle per race must be operable on touchscreen.

---

## 7. Technical Architecture

### 7.1 Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14+ with App Router |
| Language | TypeScript (strict mode) |
| Hosting | Vercel |
| Database | PostgreSQL via Supabase |
| ORM | Prisma or Drizzle ORM |
| Auth | Supabase Auth |
| Email | Resend |
| Cron | Vercel Cron Jobs |
| Styling | Tailwind CSS |
| UI Components | shadcn/ui or Radix UI primitives |
| Error Monitoring | Sentry (or equivalent) |
| Timezone | `date-fns-tz` or `luxon` (DST-aware; never use manual UTC offsets) |

### 7.2 Application Structure

- `/app` — Next.js App Router pages and layouts.
- `/app/api` — API Route Handlers for mutations and data fetching.
- `/app/api/cron` — Protected cron job handlers.
- `/app/(auth)` — Login, sign-up, password reset, email verification pages.
- `/app/(app)` — Authenticated user pages (dashboard, settings).
- `/app/(chair)` — Race chair pages (season management, draw management).
- `/app/clubs/[slug]` — Public club profile.
- `/components` — Shared UI components.
- `/lib` — Business logic: draw engine, email templates, auth helpers.
- `/prisma` or `/drizzle` — Database schema and migrations.

### 7.3 Cron Jobs

Two Vercel Cron jobs are required:

| Job | Route | Schedule | Responsibility |
|---|---|---|---|
| `draw-runner` | `/api/cron/draw-runner` | `* * * * *` (every minute) | Find race events where `draw_time <= now()` and `status = 'upcoming'`; execute draw for each. |
| `reminder-sender` | `/api/cron/reminder-sender` | `0 * * * *` (every hour) | Find race events where `draw_time` is between 23 and 25 hours from now; send reminder emails. |

**Cron Endpoint Security:**

All cron job API routes validate an `Authorization: Bearer <CRON_SECRET>` header. `CRON_SECRET` is an environment variable set in Vercel. Requests with a missing or invalid secret receive a 401 response and are not processed. The `CRON_SECRET` must also be configured in `vercel.json` under the cron job definition.

```json
{
  "crons": [
    {
      "path": "/api/cron/draw-runner",
      "schedule": "* * * * *"
    },
    {
      "path": "/api/cron/reminder-sender",
      "schedule": "0 * * * *"
    }
  ]
}
```

**Cron reliability:** Vercel Cron is not guaranteed to fire at the exact scheduled time. A draw that was supposed to run at 7:00 PM may run at 7:01 or 7:02 PM. This is acceptable given the use case. A complete Vercel outage would require the race chair to manually trigger the draw. The error monitoring service must alert the team on cron failures.

**Note:** Vercel Cron free tier supports one job per minute on Hobby. Pro tier supports multiple. If constrained to one job, both responsibilities may be combined into a single handler.

### 7.4 Timezone Handling

- `clubs.timezone` stores an IANA timezone string (e.g., `"America/Chicago"`).
- All `TIMESTAMPTZ` columns store UTC in the database.
- `draw_time` for each race event is computed at event creation time using a DST-aware library. Do not use manual UTC offsets.
- The frontend converts UTC timestamps to club-local time using the club's timezone for display.
- DST transitions are correctly handled by computing `draw_time` with a proper tz-aware library at creation time; the stored UTC value remains correct regardless of subsequent DST changes.

### 7.5 Multi-Tenancy

- All queries involving club-specific data must include a `club_id` filter.
- API routes validate that the authenticated user is a member of the club they are querying or mutating.
- Race chair routes additionally validate `role = 'race_chair'` in `club_members` for that club.
- Supabase Row-Level Security (RLS) policies provide a defense-in-depth layer, but application-layer checks are the primary enforcement mechanism.

### 7.6 Draw Engine Idempotency

The draw for a race event executes exactly once:

1. Within a database transaction, execute: `UPDATE race_events SET status = 'draw_complete', updated_at = now() WHERE id = :id AND status = 'upcoming'`.
2. If 0 rows updated: draw already ran (or event was cancelled). Abort and return.
3. If 1 row updated: execute the draw algorithm (Section 5.5.2), insert `draw_results` and `overflow_records` rows within the same transaction, then commit.
4. **After commit:** send notification emails. Email sending is never inside the database transaction.

---

## 8. Acceptance Criteria

---

### AC-1: User Sign-Up and Email Verification

**AC-1.1**
> Given I am on the sign-up page  
> When I submit a valid name, email, phone (international format), and password  
> Then my account is created, I receive a welcome email with a verification link, and I see a confirmation screen.

**AC-1.2**
> Given I have received a verification email  
> When I click the verification link within 24 hours  
> Then my email is marked as verified and I am redirected to my dashboard.

**AC-1.3**
> Given I have received a verification email  
> When I click the verification link after 24 hours  
> Then I see an error message and an option to request a new verification email.

**AC-1.4**
> Given I am logged in but not yet verified  
> When I attempt to join a club  
> Then I see a message requiring email verification, with an option to resend the verification email.

**AC-1.5**
> Given I request a resend of the verification email  
> When I request it a second time within 5 minutes  
> Then the request is rejected with a rate-limit message.

**AC-1.6**
> Given I am on the sign-up page  
> When I submit the form without a phone number, or with a phone number that is not in international format  
> Then I see a validation error and my account is not created.

---

### AC-2: Login and Session Management

**AC-2.1**
> Given I have a verified account  
> When I log in with correct credentials  
> Then I am redirected to my dashboard and my session persists across browser refreshes.

**AC-2.2**
> Given I have an account  
> When I log in with an incorrect password  
> Then I see "Invalid email or password" and am not logged in.

**AC-2.3**
> Given I am logged in  
> When I change my password  
> Then my previous session is automatically invalidated by Supabase Auth and I must re-authenticate.

---

### AC-3: Password Reset

**AC-3.1**
> Given I have forgotten my password  
> When I submit my email on the forgot-password page  
> Then I see a success message regardless of whether that email is registered.

**AC-3.2**
> Given I requested a password reset  
> When I click the reset link within 1 hour  
> Then I can set a new password and am redirected to the login page.

**AC-3.3**
> Given I requested a password reset  
> When I click the reset link after 1 hour  
> Then I see an error and the link is no longer valid.

---

### AC-4: Club Creation and Joining

**AC-4.1**
> Given I am a verified user  
> When I create a club with a unique name and valid timezone  
> Then the club is created, I am added as a race_chair member, and the club appears in search.

**AC-4.2**
> Given I am a verified user  
> When I search for a club by partial name  
> Then I see all clubs whose names contain the search term (case-insensitive).

**AC-4.3**
> Given I am a verified user  
> When I click "Join" on a club in search results  
> Then I am added to the club as a member and the club appears in my dashboard.

**AC-4.4**
> Given I belong to two clubs  
> When I view my dashboard  
> Then I can switch between clubs using the club selector.

**AC-4.5**
> Given I am a verified user who has already created 3 clubs today  
> When I attempt to create a fourth club  
> Then I see a rate-limit error and the club is not created.

---

### AC-5: Season and Race Event Management

**AC-5.1**
> Given I am a race chair for a club  
> When I create a season with a name and year  
> Then the season appears in my race chair dashboard.

**AC-5.2**
> Given I am a race chair with an active season  
> When I create a new season and choose to activate it  
> Then the new season becomes active and the previous active season becomes inactive in the same transaction.

**AC-5.3**
> Given I am a race chair  
> When I create a race event with a valid Friday date  
> Then the event is created with status `upcoming` and `draw_time` is set to the preceding Wednesday at 7:00 PM in the club's timezone (stored as UTC).

**AC-5.4**
> Given I am a race chair  
> When I attempt to create a race event on a non-Friday date  
> Then I see a validation error and the event is not created.

**AC-5.5**
> Given I am a race chair  
> When I use bulk creation with a valid Friday range (e.g., 4 Fridays)  
> Then I see a preview of 4 dates and, upon confirmation, all 4 race events are created.

**AC-5.6**
> Given I am a race chair  
> When I cancel a race event that has registrations  
> Then the event status changes to `cancelled` and all registered users receive a cancellation email.

**AC-5.7**
> Given I am a race chair  
> When I attempt to cancel a race event with status `draw_complete`  
> Then the action is rejected with an error. (Use `race_day_cancelled` transition instead.)

**AC-5.8**
> Given I am a race chair and a draw_complete race event needs to be called off  
> When I transition the event to `race_day_cancelled`  
> Then all paired sailors receive a cancellation notification email.

---

### AC-6: Race Registration

**AC-6.1**
> Given I am a verified club member  
> When I register for an upcoming race before the draw closes, selecting a primary role and an accept-other-role preference  
> Then my registration is saved with `primary_role` and `accept_other_role` set accordingly, and I receive a confirmation email.

**AC-6.2**
> Given I am registered for an upcoming race  
> When I change my primary role or accept-other-role preference before the draw closes  
> Then my registration is updated with the new values.

**AC-6.3**
> Given I am registered for an upcoming race  
> When I cancel my registration before the draw closes  
> Then my registration has `cancelled_at` set (not deleted), I receive a cancellation confirmation email, and the registration no longer appears as active.

**AC-6.4**
> Given the draw time has passed for a race  
> When I attempt to register or modify my registration  
> Then the action is rejected with a message that registration is closed.

**AC-6.5**
> Given I am a verified club member  
> When I click "Register for All Remaining Races" and select a primary role and accept-other-role preference  
> Then I am registered for all upcoming races in the active season where I have no active registration, and I receive a single summary email.

**AC-6.6**
> Given I am registered for multiple upcoming races  
> When I click "Unregister from All Remaining Races" and confirm  
> Then all my active registrations for upcoming races with open draws are soft-cancelled, and I receive a cancellation summary email.

---

### AC-7: Draw Execution

**AC-7.1**
> Given a race event's draw_time has passed  
> When the draw cron job runs  
> Then the draw executes, pairings and overflow records are created, and the race event status changes to `draw_complete`.

**AC-7.2**
> Given a race event's draw is complete  
> When the draw cron job runs again  
> Then no duplicate draw occurs (the event status is already `draw_complete`).

**AC-7.3**
> Given 4 helm-primary (accept_other_role = false) and 3 crew-primary (accept_other_role = false) are actively registered  
> When the draw runs  
> Then 3 pairs are created and 1 helm is in overflow.

**AC-7.4**
> Given 2 helm-primary (rigid) and 1 crew-primary (rigid) and 1 helm-primary (accept_other_role = true) are actively registered, with no overflow priority  
> When the draw runs  
> Then the flexible helm-primary user is assigned to crew to fill the crew deficit. Final: 2 helms, 2 crew. 2 pairs, 0 overflow.

**AC-7.5**
> Given 0 active registrations for a race event  
> When the draw runs  
> Then status changes to `draw_complete`, no pairs are created, and the results email notes zero registrations.

**AC-7.6**
> Given only helm-primary (accept_other_role = false) registrants, no crew-primary and no flexible  
> When the draw runs  
> Then all helms are overflow and a "draw cancelled — insufficient registrations" email is sent.

**AC-7.7**
> Given a race chair triggers the manual draw  
> When the confirmation modal is accepted  
> Then the draw runs immediately, results are saved, and emails are sent.

**AC-7.8**
> Given the cron endpoint is called without a valid Authorization: Bearer header  
> When the request is processed  
> Then the endpoint returns 401 and no draw runs.

**AC-7.9**
> Given User A has `primary_role = 'helm'` and `accept_other_role = true`, and helms are over-subscribed (more helms than crew)  
> When the draw runs  
> Then User A is assigned as crew (filling the crew deficit), `crew_played_non_primary = true` is recorded in `draw_results`, and the results email notes User A sailed crew.

**AC-7.10**
> Given User A has `primary_role = 'helm'` and `accept_other_role = false`, and no crew are registered  
> When the draw runs  
> Then User A is overflow (not assigned to crew), and the draw produces no pairs.

**AC-7.11**
> Given a race event with `max_boats_override = 3` and 5 pairs can be formed from registrations  
> When the draw runs  
> Then only 3 pairs are formed, the 4 sailors from the dissolved pairs are added to overflow, and the post-draw email states "Boat limit of 3 applied."

**AC-7.12**
> Given a race event with no `max_boats_override` and the club has `max_boats_per_race = 3`, and 5 pairs can be formed  
> When the draw runs  
> Then only 3 pairs are formed (club default limit applied), 4 sailors go to overflow, and the email states the boat limit was applied.

**AC-7.13**
> Given a race event with `max_boats_override = 10` and only 3 pairs can be formed  
> When the draw runs  
> Then all 3 pairs are formed (limit not reached), 0 additional overflow from the boat limit, and no boat-limit note appears in the email.

---

### AC-8: Overflow and Priority

**AC-8.1**
> Given User A was in overflow in Week 1 (overflow_priority = 0 at that draw)  
> When User A registers for Week 2  
> Then User A's registration for Week 2 has `overflow_priority = 1`.

**AC-8.2**
> Given User A has `overflow_priority = 1` for Week 2 and User B has `overflow_priority = 0`  
> When both register for Week 2's draw in the same role  
> Then User A is considered for pairing before User B.

**AC-8.3**
> Given User A was in overflow in Weeks 1 and 2 (not paired in either)  
> When User A registers for Week 3  
> Then User A's registration for Week 3 has `overflow_priority = 2`.

**AC-8.4**
> Given User A had overflow_priority = 2 and was successfully paired in Week 3  
> When User A registers for Week 4  
> Then User A's registration for Week 4 has `overflow_priority = 0`.

**AC-8.5**
> Given User A was in overflow in Week 1 but skips Week 2  
> When User A registers for Week 3  
> Then User A's registration for Week 3 has `overflow_priority = 1` (preserved across skip).

**AC-8.6**
> Given User A was registered for a race that was cancelled before the draw  
> When User A registers for the next race  
> Then User A's priority is unchanged (cancellation does not grant or reset priority).

---

### AC-9: Notifications

**AC-9.1**
> Given a draw has completed with pairings  
> When the draw commits  
> Then all members of the club receive a post-draw results email with the full pairings and overflow list.

**AC-9.2**
> Given it is Tuesday evening and a draw closes in 23–25 hours  
> When the reminder cron job runs  
> Then all club members receive a reminder email for the upcoming draw.

**AC-9.3**
> Given I am a club member who has not registered for the upcoming race  
> When I receive the reminder email  
> Then the email states I am not yet registered and provides a link to register.

**AC-9.4**
> Given I am a club member who has registered for the upcoming race  
> When I receive the reminder email  
> Then the email states my current registration status, primary role, and whether I have indicated willingness to accept the other role.

**AC-9.5**
> Given I was in overflow  
> When the draw completes  
> Then I receive an overflow notification email with my current priority count.

---

### AC-10: Dashboards

**AC-10.1**
> Given I belong to two clubs  
> When I select a different club in the dashboard selector  
> Then the upcoming races and registration statuses update to reflect the selected club.

**AC-10.2**
> Given I have an accumulated overflow priority of 2 for a club  
> When I view my dashboard for that club  
> Then I see "Priority: 2" displayed.

**AC-10.3**
> Given I am a race chair  
> When I view the race chair dashboard  
> Then I see all race events for my club with registration counts.

**AC-10.4**
> Given I am a regular member (not a race chair)  
> When I attempt to access the race chair dashboard URL directly  
> Then I am redirected with a "Not Authorized" message.

**AC-10.5**
> Given a draw is complete  
> When I view the race chair dashboard for that event  
> Then I see the pairings list and overflow list for that event.

---

### AC-11: Public Pages

**AC-11.1**
> Given I am not logged in  
> When I visit the landing page and search for "Royal"  
> Then I see a list of clubs whose names contain "Royal".

**AC-11.2**
> Given I am not logged in  
> When I visit the public club profile page for a club  
> Then I see the club name, timezone, and upcoming race dates — but no member names or registrations.

---

### AC-12: Account Deletion

**AC-12.1**
> Given I am an authenticated user  
> When I request account deletion and confirm the dialog  
> Then I receive a deletion confirmation email, my name is set to "Deleted User", my email and phone are cleared, my club memberships are removed, my active registrations are soft-cancelled, and I am logged out.

**AC-12.2**
> Given User A has been soft-deleted  
> When a race chair views the draw results from a race User A participated in  
> Then the pairing shows "Deleted User" in place of User A's name, but the pairing record is preserved.

---

## 9. Out of Scope (v1)

- Social login (Google, Apple, etc.)
- In-app messaging between helms and crew.
- Boat/equipment tracking or assignment.
- Payment or membership fee processing.
- Push notifications (mobile) or SMS notifications.
- Native mobile applications.
- Race result recording (finishing positions, scoring).
- Waitlist management beyond the overflow priority system described above.
- Club logo or branding customization.
- Exporting draw results to external formats (CSV, PDF).
- Admin super-user role for platform management (handled via direct DB / Supabase admin panel).
- Email address changes after registration.
- Club deletion or merging.
- Club invitation / approval flow (joining is open and immediate).
- Localization / languages other than English.
- Integration with third-party sailing results databases.
- Automated data subject access request tooling (handled manually).
- Audit log UI (manual draw triggers are logged; other admin actions are not surfaced in UI in v1).
- Soft-delete audit trail UI for cancelled registrations (the data is preserved in the DB but not exposed in the UI in v1).

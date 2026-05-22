# Friday Night Race Draw — Requirements Document

**Version:** 1.0  
**Date:** 2026-05-21  
**Status:** Draft

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
| **Overflow** | A registered user who could not be paired because no matching role was available. |
| **Race Chair** | A club member with elevated permissions to manage seasons, race events, and draws. |
| **Draw Window** | The period during which users may register for a race event. Closes at Wednesday 7:00 PM local time, the same Wednesday that precedes the Friday race. |
| **Priority** | An integer count of consecutive overflow weeks. Higher priority users are paired first in the next draw. |

---

## 3. User Roles & Permissions

### 3.1 Anonymous User
- View the public landing page.
- Search for clubs by name.
- View club public profile (name, upcoming race dates).
- Access sign-up and login pages.

### 3.2 Authenticated Member
- All anonymous permissions.
- Join clubs.
- Register for individual races or entire seasons.
- View their own dashboard, registrations, and draw history.
- Receive email notifications.
- Update their profile and preferences.

### 3.3 Race Chair
- All authenticated member permissions, scoped to their club(s).
- Create and manage seasons for their club.
- Create, edit, and cancel race events for their club.
- View all member registrations for their club's race events.
- Manually trigger a draw for testing purposes.
- View all past draws and pairings for their club.
- Designate other members as race chairs for their club.
- Cannot modify another club's data.

### 3.4 System (Automated)
- Execute scheduled draws at Wednesday 7:00 PM club-local time.
- Send all notification emails.

**Note:** There is no global super-admin role in the initial version. Race chairs have club-scoped authority only.

---

## 4. Data Model

### 4.1 users

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | |
| name | TEXT | NOT NULL | Full name |
| email | TEXT | NOT NULL, UNIQUE | Lowercase, trimmed |
| phone | TEXT | NULLABLE | E.164 format recommended |
| password_hash | TEXT | NOT NULL | bcrypt, cost factor ≥ 12 |
| email_verified | BOOLEAN | NOT NULL, DEFAULT false | |
| email_verification_token | TEXT | NULLABLE | Hex token, single-use |
| email_verification_sent_at | TIMESTAMPTZ | NULLABLE | For rate-limiting resend |
| password_reset_token | TEXT | NULLABLE | Hex token, single-use, expires |
| password_reset_expires_at | TIMESTAMPTZ | NULLABLE | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

### 4.2 clubs

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | |
| name | TEXT | NOT NULL, UNIQUE | Searchable, display name |
| slug | TEXT | NOT NULL, UNIQUE | URL-safe identifier, e.g. "royal-yacht-club" |
| timezone | TEXT | NOT NULL | IANA timezone string, e.g. "America/New_York" |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

### 4.3 club_members

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | |
| user_id | UUID | NOT NULL, FK → users.id ON DELETE CASCADE | |
| club_id | UUID | NOT NULL, FK → clubs.id ON DELETE CASCADE | |
| role | TEXT | NOT NULL, DEFAULT 'member' | 'member' or 'race_chair' |
| joined_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| UNIQUE | | (user_id, club_id) | One membership record per user per club |

### 4.4 seasons

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | |
| club_id | UUID | NOT NULL, FK → clubs.id ON DELETE CASCADE | |
| name | TEXT | NOT NULL | e.g. "Summer 2026" |
| year | INTEGER | NOT NULL | Calendar year |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | Only one active season per club recommended |
| created_by | UUID | NOT NULL, FK → users.id | Race chair who created it |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

### 4.5 race_events

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | |
| season_id | UUID | NOT NULL, FK → seasons.id ON DELETE CASCADE | |
| club_id | UUID | NOT NULL, FK → clubs.id | Denormalized for query convenience |
| race_date | DATE | NOT NULL | Must be a Friday |
| draw_time | TIMESTAMPTZ | NOT NULL | Wednesday 7:00 PM in club's timezone, auto-computed |
| status | TEXT | NOT NULL, DEFAULT 'upcoming' | 'upcoming', 'draw_complete', 'cancelled' |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| UNIQUE | | (club_id, race_date) | No duplicate race dates per club |

**Constraint:** `race_date` must fall on a Friday (day-of-week = 5). Enforced at application layer.  
**Computed field:** `draw_time` = the Wednesday preceding `race_date` at 7:00 PM in `clubs.timezone`, stored as UTC.

### 4.6 race_registrations

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | |
| user_id | UUID | NOT NULL, FK → users.id ON DELETE CASCADE | |
| race_event_id | UUID | NOT NULL, FK → race_events.id ON DELETE CASCADE | |
| role_preference | TEXT | NOT NULL | 'helm', 'crew', or 'either' |
| overflow_priority | INTEGER | NOT NULL, DEFAULT 0 | Accumulated overflow count from consecutive weeks |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| UNIQUE | | (user_id, race_event_id) | One registration per user per race |

**Note:** `overflow_priority` is copied forward from the prior week's overflow record when a user registers for a subsequent race. See Section 5.6 for priority rules.

### 4.7 draw_results

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | |
| race_event_id | UUID | NOT NULL, FK → race_events.id ON DELETE CASCADE | |
| helm_user_id | UUID | NOT NULL, FK → users.id | |
| crew_user_id | UUID | NOT NULL, FK → users.id | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Constraint:** A given race_event_id should have exactly one draw triggered (enforced by `race_events.status` transition to `draw_complete`).

### 4.8 overflow_records

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | |
| user_id | UUID | NOT NULL, FK → users.id ON DELETE CASCADE | |
| race_event_id | UUID | NOT NULL, FK → race_events.id ON DELETE CASCADE | |
| role_preference | TEXT | NOT NULL | Role the user registered with |
| priority_at_draw | INTEGER | NOT NULL | The overflow_priority value at the time of draw |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| UNIQUE | | (user_id, race_event_id) | One overflow record per user per race |

---

## 5. Feature Requirements

---

### 5.1 Authentication & User Management

#### 5.1.1 Sign-Up

- The sign-up form collects: full name, email address, phone number, and password.
- Password must be at least 8 characters, containing at least one uppercase letter, one lowercase letter, and one digit.
- Email address must be unique across all users.
- On successful submission, the user record is created with `email_verified = false`.
- A verification email is sent immediately to the provided email address containing a single-use verification link.
- The verification link expires after 24 hours.
- The user is shown a confirmation screen instructing them to check their email.
- Until email is verified, the user cannot join clubs or register for races. They may log in but will see a banner prompting verification.
- A "Resend verification email" option is available, rate-limited to once every 5 minutes per user.

#### 5.1.2 Email Verification

- Clicking the verification link sets `email_verified = true` and clears the verification token.
- The user is redirected to their dashboard with a success message.
- If the token is expired or already used, the user sees an error with an option to request a new verification email.

#### 5.1.3 Login

- Login accepts email and password.
- Failed attempts return a generic "Invalid email or password" message (no enumeration of which field is wrong).
- Sessions use secure, HTTP-only cookies. Session lifetime is 30 days with a sliding window.
- Unverified users can log in but see a persistent verification prompt.

#### 5.1.4 Password Reset

- A "Forgot password" link on the login page accepts an email address.
- If the email exists, a password reset link is sent. The same generic success message is shown regardless of whether the email exists (no enumeration).
- The reset link expires after 1 hour.
- Clicking the link presents a form to set a new password (with confirmation).
- After successful reset, all existing sessions for that user are invalidated.

#### 5.1.5 Profile Management

- Authenticated users can update their name, phone number, and password.
- Email address cannot be changed after registration (simplification for v1).
- Password change requires the current password to be entered.

#### 5.1.6 Club Membership in Profile

- The profile page lists all clubs the user belongs to and their role in each.
- Users can leave a club from this page (removes their club_members record).
- Leaving a club does not delete past draw_results or registrations for historical integrity.

---

### 5.2 Club Management

#### 5.2.1 Club Creation

- Any verified, authenticated user can create a new club.
- Club creation form collects: club name, and timezone (selected from a dropdown of IANA timezone strings).
- Club name must be unique (case-insensitive).
- A URL-safe slug is auto-generated from the club name on creation (e.g., "Royal Yacht Club" → "royal-yacht-club"). Slug must be unique.
- The user who creates the club is automatically added as a member with the `race_chair` role.
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

---

### 5.3 Season & Race Management

#### 5.3.1 Season Creation

- Race chairs can create seasons for their club.
- Season form collects: name (e.g., "Summer 2026") and year.
- Multiple seasons can exist per club, but only one should be marked `is_active` at a time.
- When a race chair creates a new season, the UI warns if another active season already exists and offers to deactivate the old one.

#### 5.3.2 Race Event Creation

- Race chairs create race events within a season.
- Race events must be scheduled on a Friday. The form should restrict date selection to Fridays only.
- Race chairs may create events one at a time or in bulk.
- **Bulk creation:** The race chair specifies a start date (first Friday) and an end date (last Friday), and the system generates a race event for every Friday in that range.
- On bulk creation, the system shows a preview of all dates to be created before confirming.
- `draw_time` is automatically computed as the preceding Wednesday at 7:00 PM in the club's timezone and stored as UTC.
- Duplicate race dates for the same club are rejected with an error.

#### 5.3.3 Race Event Editing

- Race chairs can cancel a race event (transitions status to `cancelled`) at any time before the draw.
- Cancelled events do not trigger a draw.
- Cancelled events notify all registered users for that event via email.
- Race events with status `draw_complete` cannot be edited or cancelled.
- Race chairs cannot change the `race_date` after the event is created (to prevent registration confusion). They must cancel and recreate if a date change is needed.

---

### 5.4 Race Registration

#### 5.4.1 Opt-In to a Single Race

- Authenticated, verified members who belong to the club can register for any upcoming race event (status = `upcoming`) where the draw has not yet occurred (current time < `draw_time`).
- Registration form asks for `role_preference`: Helm, Crew, or Either.
- Confirmation email is sent upon registration (see Section 5.7.3).
- A user may update their `role_preference` at any time before `draw_time`.
- A user may cancel (opt-out of) their registration at any time before `draw_time`.

#### 5.4.2 Opt-In to Full Season

- A "Register for All Remaining Races" button on the user dashboard registers the user for every upcoming race event in the active season for a given club where the draw has not yet occurred.
- The user is prompted to choose a default `role_preference` that applies to all newly created registrations.
- Any races the user is already registered for are unaffected (existing registrations are not overwritten).
- A single confirmation email summarizing all newly created registrations is sent.

#### 5.4.3 Opt-Out of Full Season

- An "Unregister from All Remaining Races" button cancels all the user's registrations for upcoming race events (status = `upcoming`, current time < `draw_time`) in the active season for a given club.
- Already-drawn races (status = `draw_complete`) are not affected.
- A single confirmation email summarizing the cancellations is sent.

#### 5.4.4 Per-Race Registration Toggle

- The user dashboard shows each upcoming race event with a clear registered/not-registered status.
- A toggle or button allows switching between registered and not-registered per race.
- If registering, the user is prompted for their `role_preference`.
- Changes are not possible after `draw_time` has passed.

#### 5.4.5 Registration Cutoff

- The registration cutoff for each race is `draw_time` (Wednesday 7:00 PM club-local time).
- After `draw_time`, registration and deregistration actions for that race are rejected with an appropriate error message.
- The UI disables registration controls for events whose `draw_time` has passed.

---

### 5.5 Draw Engine

#### 5.5.1 Automated Draw Trigger

- A cron job runs at least every minute (e.g., Vercel Cron at `* * * * *`) and identifies all race events where `draw_time <= now()` and `status = 'upcoming'`.
- For each qualifying race event, the draw is executed.
- The draw is idempotent: if triggered multiple times for the same event, it executes only once. The status transition from `upcoming` to `draw_complete` acts as the lock.
- The draw uses a database transaction to atomically update status and insert results.

#### 5.5.2 Draw Algorithm

The draw algorithm for a race event proceeds as follows:

1. **Retrieve registrations:** Fetch all `race_registrations` for the `race_event_id`.
2. **Expand roles:** For registrations with `role_preference = 'either'`, the user is eligible for both helm and crew.
3. **Sort by priority:** Sort all eligible users by `overflow_priority` descending (higher priority is paired first). Within the same priority level, randomize order.
4. **Build candidate pools:**
   - Helm pool: users with `role_preference = 'helm'` or `'either'`, sorted by priority then random.
   - Crew pool: users with `role_preference = 'crew'` or `'either'`, sorted by priority then random.
5. **Pair greedily:**
   - Iterate through the helm pool in sorted order. For each helm, attempt to find the highest-priority available crew.
   - An "either" user may be assigned to either role. Once assigned, they are removed from both pools.
   - Continue until one or both pools are exhausted.
6. **Identify overflow:** Any user remaining in either pool after pairing is complete is overflow.
7. **Persist results:**
   - Insert rows into `draw_results` for each pair.
   - Insert rows into `overflow_records` for each overflow user, recording their `priority_at_draw`.
   - Update `race_events.status` to `draw_complete`.
8. **Trigger notifications:** Send the results email to all club members (Section 5.7.1).

**Priority tie-breaking:** Within the same `overflow_priority` level, order is randomized per draw (Fisher-Yates shuffle or equivalent).

**"Either" role assignment fairness:** When an "either" user is paired, they are assigned the role that most reduces overflow. If both assignments are equivalent, assignment is random.

#### 5.5.3 Manual Draw Trigger

- Race chairs can manually trigger the draw for a race event from the race chair dashboard.
- Manual trigger is available only for events with status `upcoming`, regardless of whether `draw_time` has passed.
- Manual trigger is intended for testing and exceptional circumstances.
- Manual triggers are logged with the race chair's user ID and timestamp for audit purposes.
- The UI displays a confirmation modal before executing: "This will run the draw now and cannot be undone. Pairing emails will be sent to all club members."

#### 5.5.4 Edge Cases

| Scenario | Behavior |
|---|---|
| Zero registrations | Draw runs, produces no pairs, no overflow. Email sent noting no registrations. |
| Only helms, no crew | All helms are overflow. |
| Only crew, no helms | All crew are overflow. |
| Single registration | That user is overflow. |
| All registrations are "either" | Algorithm pairs first half as helm, second half as crew (randomized). Overflow if odd count. |
| Odd number of "either" users, no pure helms/crew | One user is overflow. |

---

### 5.6 Overflow & Priority System

#### 5.6.1 Priority Accumulation

- When a user is placed in overflow after a draw, their `overflow_priority` for that event is recorded in `overflow_records`.
- When the same user registers for a subsequent race event in the same club, the system looks up their most recent `overflow_records.priority_at_draw` for that club and sets `race_registrations.overflow_priority = prior_priority + 1`.
- Priority accumulation is only applied automatically when the user registers (not retroactively).
- If a user skips a week (does not register), their accumulated priority is preserved and carried forward to the next race they register for.
- Priority resets to 0 after a user is successfully paired in a draw.

#### 5.6.2 Priority Display

- The user dashboard shows the user's current `overflow_priority` for each club they belong to.
- The race chair dashboard shows the `overflow_priority` for each registered user on the registrations list.

#### 5.6.3 Priority Persistence

- Priority is stored per-registration (not per-user) to maintain an audit trail.
- The effective priority for a user's next registration is derived by querying the most recent `overflow_records` for that user in that club and computing accumulated value.

---

### 5.7 Notifications & Email

All transactional emails are sent via Resend (primary) with SendGrid as a fallback. Email sending is fire-and-forget from the application's perspective; failures are logged but do not roll back draw results or registrations.

#### 5.7.1 Post-Draw Results Email

- **Recipients:** All members of the club (all users in `club_members` for the club, regardless of whether they registered for that race).
- **Trigger:** Immediately after the draw completes (automated or manual).
- **Content:**
  - Club name and race date.
  - List of pairings: "Helm: [Name] — Crew: [Name]" for each pair.
  - List of overflow users: "[Name] (registered as [role])" with a note that they have priority in the next draw.
  - Total count of pairs and overflow.
  - Club timezone and draw time for reference.
- **Subject:** "[Club Name] Friday Night Race Draw — [Date]"

#### 5.7.2 Pre-Draw Reminder Email

- **Recipients:** All club members.
- **Trigger:** Tuesday evening at 6:00 PM club-local time, the Tuesday preceding the Wednesday draw.
- **Content:**
  - Reminder that the draw closes Wednesday at 7:00 PM.
  - The user's current registration status for that race (registered/not registered).
  - A direct link to their dashboard to register or modify registration.
- **Subject:** "[Club Name] Reminder: Friday Race Draw Closes Tomorrow"
- **Implementation:** Separate cron job or same cron job checks for events whose draw is between 24–25 hours away.

#### 5.7.3 Registration Confirmation Email

- **Recipients:** The user who registered.
- **Trigger:** Upon successful creation of a `race_registrations` record.
- **Content:**
  - Club name, race date, role preference selected.
  - Reminder of draw cutoff time (Wednesday 7:00 PM club-local time).
  - Link to dashboard to modify or cancel registration.
- **Subject:** "[Club Name] You're registered for [Date] — [Role]"
- **For bulk season registration:** One summary email listing all races registered for, not one email per race.

#### 5.7.4 Registration Cancellation Email

- **Recipients:** The user who cancelled.
- **Trigger:** Upon successful deletion of a `race_registrations` record.
- **Content:**
  - Club name, race date(s) affected.
  - Confirmation that the registration is cancelled.
  - Link to re-register.
- **Subject:** "[Club Name] Registration cancelled for [Date]" (or "multiple dates" for bulk).

#### 5.7.5 Race Event Cancellation Email

- **Recipients:** All users registered for the cancelled event.
- **Trigger:** When a race chair sets a race event status to `cancelled`.
- **Content:**
  - Club name, race date.
  - Notice that the race is cancelled.
  - Encouragement to register for upcoming races.
- **Subject:** "[Club Name] Race Cancelled — [Date]"

#### 5.7.6 Email Verification Email

- Standard email verification link. See Section 5.1.1.

#### 5.7.7 Password Reset Email

- Standard password reset link. See Section 5.1.4.

---

### 5.8 User Dashboard

The user dashboard is the primary screen for authenticated members after login.

#### 5.8.1 Layout

- The dashboard is scoped to one club at a time.
- A club selector (dropdown or tabs) appears at the top if the user belongs to multiple clubs.
- Defaults to the most recently active club.

#### 5.8.2 Upcoming Races Panel

- Displays a list of all upcoming race events for the selected club (status = `upcoming`).
- Each row shows:
  - Race date (formatted, e.g., "Friday, 6 June 2026").
  - Days until the draw closes (e.g., "Draw closes in 3 days").
  - User's registration status: "Registered as Helm", "Registered as Crew", "Registered as Either", or "Not Registered".
  - Current `overflow_priority` for this user at this club (shown as "Priority: [n]" when > 0).
  - A toggle or button to register/unregister, disabled after `draw_time`.
  - If registered, a role preference selector (Helm / Crew / Either) to change preference before draw.

#### 5.8.3 Season Bulk Actions

- "Register for All Remaining Races" button: Registers the user for all upcoming races with `draw_time` in the future. Prompts for default role preference.
- "Unregister from All Remaining Races" button: Cancels all such registrations. Requires a confirmation dialog.

#### 5.8.4 Past Races Panel

- A collapsed or paginated section showing past race events.
- For each past event, shows: race date, the user's pair (if they were paired), or "Overflow" if they were in overflow, or "Not Registered" if they did not register.

#### 5.8.5 Priority Summary

- A small info card shows the user's current accumulated overflow priority for the selected club.
- Explains what priority means (tooltip or expandable section).

---

### 5.9 Race Chair Dashboard

Race chairs see an additional dashboard view when in a club where they hold the `race_chair` role.

#### 5.9.1 Season Management

- List of seasons for the club with status indicators.
- Create new season button.
- Ability to mark a season as active/inactive.

#### 5.9.2 Race Event Management

- List of all race events in the selected season.
- Per-event: date, status, registration count (helm / crew / either / total), draw time.
- Actions: Cancel event (if status = `upcoming`), View registrations, Trigger draw manually.
- Create single event button.
- Bulk create events: specify date range and generate all Fridays in that range (with preview).

#### 5.9.3 Registrations View

- For any upcoming or past race event, view all registered users.
- Columns: Name, Role Preference, Overflow Priority.
- Sortable by priority.

#### 5.9.4 Draw Results View

- For completed race events, view the full draw results.
- Columns: Pair #, Helm Name, Crew Name.
- Separate section showing overflow users.
- Option to download/print pairings (plain text or PDF in v1 is optional stretch goal).

#### 5.9.5 Manual Draw Trigger

- Button to trigger draw for a selected race event.
- Available only for events with status `upcoming`.
- Confirmation modal (see Section 5.5.3).
- After triggering, results are displayed immediately in the Draw Results View.

#### 5.9.6 Member Management

- List of all club members with their role (member / race_chair).
- Ability to promote/demote members to/from race chair.

---

### 5.10 Public Landing Page

#### 5.10.1 Content

- App name, tagline, and brief description.
- Club search bar: search by club name (partial match, case-insensitive).
- Search results: club name and timezone.
- From search results, links to:
  - "Join this club" (redirects to sign-up if not authenticated, then joins).
  - Club's public profile page (club name, active season name, upcoming race dates — no personal data).

#### 5.10.2 Public Club Profile Page

- Accessible at `/clubs/[slug]`.
- Shows: club name, timezone, list of upcoming race event dates.
- Does not show registrations, member names, or draw results.
- "Join Club" and "Log In" CTAs.

---

## 6. Non-Functional Requirements

### 6.1 Performance

- Page load (Time to First Byte) < 500ms for dashboard pages under normal load.
- Draw execution completes within 5 seconds for clubs with up to 100 registrations.
- Email delivery initiated within 30 seconds of draw completion.

### 6.2 Security

- All passwords stored as bcrypt hashes with cost factor ≥ 12.
- All sensitive tokens (email verification, password reset) generated with a cryptographically secure random number generator (minimum 32 bytes of entropy).
- Password reset tokens expire after 1 hour.
- All API routes validate that the authenticated user has the appropriate club membership and role before performing club-scoped operations.
- CSRF protection on all state-mutating requests.
- Rate limiting on authentication endpoints: max 10 failed login attempts per IP per 15 minutes.
- Rate limiting on email sending: max 3 verification/reset emails per user per hour.
- Multi-tenancy isolation: all queries that return club data must filter by club_id. No cross-club data leakage.
- Sessions invalidated on password change and account deletion.

### 6.3 Reliability

- Draw cron job: if a draw fails (exception), the event remains in `upcoming` status and the failure is logged. An alert mechanism (e.g., Vercel log drain or error monitoring service) should notify the development team. The race chair can manually trigger the draw as a fallback.
- Email failures are logged but do not affect draw results.

### 6.4 Accessibility

- WCAG 2.1 AA compliance.
- All form inputs have associated labels.
- Color is not the sole indicator of state (e.g., registration status uses both color and text).
- Keyboard-navigable dashboard.

### 6.5 Internationalisation

- All timestamps displayed in the club's local timezone, not UTC.
- Timezone is clearly labeled in all date displays (e.g., "Wednesday, 3 June 2026, 7:00 PM EDT").
- v1 supports English only.

### 6.6 Mobile Responsiveness

- All pages must be fully functional on mobile viewport (320px minimum width).
- Dashboard toggles and buttons must meet 44×44px minimum tap target size.
- The registration toggle per race must be operable on touchscreen.

---

## 7. Technical Architecture

### 7.1 Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14+ with App Router |
| Language | TypeScript (strict mode) |
| Hosting | Vercel |
| Database | PostgreSQL via Supabase or Neon |
| ORM | Prisma or Drizzle ORM |
| Auth | Custom sessions (jose JWT or iron-session) or NextAuth.js v5 with Credentials provider |
| Email | Resend (primary), SendGrid (fallback) |
| Cron | Vercel Cron Jobs |
| Styling | Tailwind CSS |
| UI Components | shadcn/ui or Radix UI primitives |

### 7.2 Application Structure

- `/app` — Next.js App Router pages and layouts.
- `/app/api` — API Route Handlers for mutations and data fetching.
- `/app/(auth)` — Login, sign-up, password reset, email verification pages.
- `/app/(app)` — Authenticated user pages (dashboard, settings).
- `/app/(chair)` — Race chair pages (season management, draw management).
- `/app/clubs/[slug]` — Public club profile.
- `/components` — Shared UI components.
- `/lib` — Business logic: draw engine, email templates, auth helpers.
- `/prisma` or `/drizzle` — Database schema and migrations.

### 7.3 Cron Jobs

Two Vercel Cron jobs are required:

| Job | Schedule | Responsibility |
|---|---|---|
| `draw-runner` | `* * * * *` (every minute) | Find race events where `draw_time <= now()` and `status = 'upcoming'`; execute draw for each. |
| `reminder-sender` | `0 * * * *` (every hour) | Find race events where `draw_time` is between 23 and 25 hours from now; send reminder emails to club members. |

**Note:** Vercel Cron free tier supports one job per minute on Hobby. Pro tier supports multiple. If constrained to one job, both responsibilities can be combined into a single handler.

### 7.4 Timezone Handling

- `clubs.timezone` stores an IANA timezone string (e.g., `"America/Chicago"`).
- All `TIMESTAMPTZ` columns store UTC in the database.
- `draw_time` for each race event is computed as Wednesday 7:00 PM in the club's timezone converted to UTC at event creation time.
- The frontend converts UTC timestamps to club-local time using the club's timezone for display.
- Recommended library: `date-fns-tz` or `luxon`.

### 7.5 Multi-Tenancy

- All queries involving club-specific data (seasons, race events, registrations, results) must include a `club_id` filter.
- API routes validate that the authenticated user is a member of the club they are querying or mutating.
- Race chair routes additionally validate that the user has `role = 'race_chair'` in `club_members` for that club.
- Row-Level Security (RLS) policies on Supabase (if used) provide a defense-in-depth layer, but application-layer checks are the primary enforcement mechanism.

### 7.6 Draw Engine Idempotency

The draw for a race event must execute exactly once. Implementation:

1. Within a database transaction, attempt to update `race_events.status` from `'upcoming'` to `'draw_complete'` for the target `race_event_id` with a condition: `WHERE status = 'upcoming'`.
2. If 0 rows are updated (already processed), abort and return.
3. If 1 row is updated, proceed with the draw, insert results, and commit.

This pattern prevents duplicate draws if the cron job fires multiple times or if a manual and automated trigger overlap.

---

## 8. Acceptance Criteria

Acceptance criteria are written as user stories with Given/When/Then format.

---

### AC-1: User Sign-Up and Email Verification

**Story:** As a new user, I want to create an account and verify my email so that I can join clubs and register for races.

**AC-1.1**
> Given I am on the sign-up page  
> When I submit a valid name, email, phone, and password  
> Then my account is created, I receive a verification email, and I see a confirmation screen.

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
> Then I am required to re-authenticate; my previous session cookie is no longer valid.

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

---

### AC-5: Season and Race Event Management

**AC-5.1**
> Given I am a race chair for a club  
> When I create a season with a name and year  
> Then the season appears in my race chair dashboard.

**AC-5.2**
> Given I am a race chair  
> When I create a race event with a valid Friday date  
> Then the event is created with status `upcoming` and the draw_time is set to the preceding Wednesday at 7:00 PM in the club's timezone.

**AC-5.3**
> Given I am a race chair  
> When I attempt to create a race event on a non-Friday date  
> Then I see a validation error and the event is not created.

**AC-5.4**
> Given I am a race chair  
> When I use bulk creation with a valid Friday range (e.g., 4 Fridays)  
> Then I see a preview of 4 dates and, upon confirmation, all 4 race events are created.

**AC-5.5**
> Given I am a race chair  
> When I cancel a race event that has registrations  
> Then the event status changes to `cancelled`, and all registered users receive a cancellation email.

**AC-5.6**
> Given I am a race chair  
> When I attempt to cancel a race event with status `draw_complete`  
> Then the action is rejected with an error.

---

### AC-6: Race Registration

**AC-6.1**
> Given I am a verified club member  
> When I register for an upcoming race before the draw closes  
> Then my registration is saved with my chosen role preference, and I receive a confirmation email.

**AC-6.2**
> Given I am registered for an upcoming race  
> When I change my role preference before the draw closes  
> Then my registration is updated with the new preference.

**AC-6.3**
> Given I am registered for an upcoming race  
> When I cancel my registration before the draw closes  
> Then my registration is removed and I receive a cancellation confirmation email.

**AC-6.4**
> Given the draw time has passed for a race  
> When I attempt to register or modify my registration  
> Then the action is rejected with a message that registration is closed.

**AC-6.5**
> Given I am a verified club member  
> When I click "Register for All Remaining Races" and select a role preference  
> Then I am registered for all upcoming races in the active season where I am not already registered, and I receive a single summary email.

**AC-6.6**
> Given I am registered for multiple upcoming races  
> When I click "Unregister from All Remaining Races" and confirm  
> Then all my registrations for upcoming races with open draws are removed, and I receive a cancellation summary email.

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
> Given 4 helms and 3 crew are registered  
> When the draw runs  
> Then 3 pairs are created and 1 helm is in overflow.

**AC-7.4**
> Given 2 helms, 2 crew, and 1 "either" are registered, with no overflow priority  
> When the draw runs  
> Then 3 pairs are created (the "either" fills a gap) and 0 overflow.

**AC-7.5**
> Given 0 registrations for a race event  
> When the draw runs  
> Then the status changes to `draw_complete`, no pairs are created, and the results email notes zero registrations.

**AC-7.6**
> Given a race chair triggers the manual draw  
> When the confirmation modal is accepted  
> Then the draw runs immediately, results are saved, and the results email is sent.

---

### AC-8: Overflow and Priority

**AC-8.1**
> Given User A was in overflow in Week 1 with priority 0  
> When User A registers for Week 2  
> Then User A's registration for Week 2 has `overflow_priority = 1`.

**AC-8.2**
> Given User A has `overflow_priority = 1` for Week 2 and User B has `overflow_priority = 0`  
> When both register for Week 2's draw (same role)  
> Then User A is considered for pairing before User B.

**AC-8.3**
> Given User A was in overflow in Weeks 1 and 2 (accumulating priority)  
> When User A registers for Week 3  
> Then User A's registration for Week 3 has `overflow_priority = 2`.

**AC-8.4**
> Given User A had overflow_priority = 2 and was successfully paired in Week 3  
> When User A registers for Week 4  
> Then User A's registration for Week 4 has `overflow_priority = 0` (reset after being paired).

**AC-8.5**
> Given User A was in overflow in Week 1 but skips Week 2  
> When User A registers for Week 3  
> Then User A's registration for Week 3 has `overflow_priority = 1` (preserved across skip).

---

### AC-9: Notifications

**AC-9.1**
> Given a draw has completed  
> When the notification job runs  
> Then all members of the club receive an email with the full pairings list and overflow list.

**AC-9.2**
> Given it is Tuesday evening at 6:00 PM club-local time  
> When the reminder cron job runs  
> Then all club members receive a reminder email for the upcoming Wednesday draw.

**AC-9.3**
> Given I am a club member who has not registered for the upcoming race  
> When I receive the reminder email  
> Then the email states I am not yet registered and provides a link to register.

**AC-9.4**
> Given I am a club member who has registered for the upcoming race  
> When I receive the reminder email  
> Then the email states my current registration status and role preference.

---

### AC-10: Dashboards

**AC-10.1**
> Given I belong to two clubs  
> When I select a different club in the dashboard selector  
> Then the upcoming races and registration statuses shown update to reflect the selected club.

**AC-10.2**
> Given I have an accumulated overflow priority of 2 for a club  
> When I view my dashboard for that club  
> Then I see "Priority: 2" displayed on the dashboard.

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

## 9. Out of Scope (v1)

The following features are explicitly out of scope for v1 and may be considered for future iterations:

- Social login (Google, Apple, etc.)
- In-app messaging between helms and crew.
- Boat/equipment tracking or assignment.
- Payment or membership fee processing.
- Push notifications (mobile).
- Native mobile applications.
- Race result recording (finishing positions, scoring).
- Waitlist management beyond the overflow priority system described above.
- Club logo or branding customization.
- Exporting draw results to external formats (CSV, PDF).
- Admin super-user role for platform management.
- Email address changes after registration.
- Club deletion or merging.
- Localization / languages other than English.
- Integration with third-party sailing results databases.

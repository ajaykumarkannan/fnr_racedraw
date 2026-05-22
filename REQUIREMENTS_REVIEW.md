# Friday Night Race Draw — Requirements Review

**Reviewer:** Senior Software Architect / Product Manager  
**Review Date:** 2026-05-21  
**Document Reviewed:** REQUIREMENTS.md v1.0  
**Overall Readiness Score: 6 / 10**

The requirements document is well-structured and covers most happy-path flows. However, it contains significant gaps in draw algorithm specification, ambiguous priority logic, unspecified data retention and privacy obligations, and several concurrency and operational risks that will surface during implementation. The document should be revised before engineering work begins.

---

## 1. Gaps — Missing Requirements

### G-1: No Account Deletion Flow
The requirements describe session invalidation "on password change and account deletion" (Section 6.2), but there is no feature requirement for account deletion. What happens when a user wants to delete their account? What happens to their draw_results and overflow_records? The data model uses `ON DELETE CASCADE` for registrations and overflow records, but `draw_results` only has `helm_user_id` / `crew_user_id` foreign keys with no cascade behaviour specified, meaning deletion of a user would violate FK constraints or silently orphan historical records.

**Required additions:**
- An explicit "delete my account" feature (or explicit statement that v1 does not support it).
- A data retention policy: do draw results get anonymized, soft-deleted, or hard-deleted?
- Cascade or nullify behaviour on draw_results when a user is deleted.

### G-2: GDPR / Data Privacy Obligations
The requirements document has no privacy section. The app collects names, email addresses, and phone numbers. If any club is based in (or has members in) the EU/UK/EEA, GDPR applies. Even for US-based clubs, state privacy laws (CCPA etc.) may apply.

**Required additions:**
- Privacy policy / terms of service links on the sign-up page.
- Lawful basis for processing personal data (legitimate interest / contract).
- Explicit data retention limits (how long are draw results kept?).
- Right of access / right to erasure workflow (at minimum a GDPR section in Out of Scope if intentionally deferred).
- Whether phone number is mandatory (Section 5.1.1 lists it as collected, but the data model marks it NULLABLE — the form requirement and schema are inconsistent).

### G-3: Phone Number Mandatory vs Optional
Section 5.1.1 says the sign-up form "collects: full name, email address, phone number, and password," implying phone is required. The data model (Section 4.1) marks `phone` as NULLABLE. These are contradictory. Is phone required at sign-up? Can users omit it? Is it used for anything (SMS notifications are not mentioned)?

### G-4: No Club Invitation / Approval Mechanism
Section 5.2.3 says joining is open and immediate with no approval step. This means any verified user can join any club and see its upcoming race dates. For a private or members-only sailing club this may be unacceptable. The requirements do not address:
- Whether clubs should be able to restrict who can join (invite-only, approval required).
- Whether club member lists are visible to other club members.
- Whether a race chair can remove a member from their club.

A "remove member" action is absent from Section 5.9.6 (Member Management), which only describes promoting/demoting.

### G-5: What Happens to Registrations When a User Leaves a Club
Section 5.1.6 says leaving a club "removes their club_members record" and "does not delete past draw_results or registrations." But it does not say whether *future* registrations (upcoming races) are automatically cancelled when a user leaves, and whether cancellation emails are sent. This is a correctness issue: if a user leaves and then the draw runs, their registration is still in the database but they are no longer a club member.

### G-6: Race Event Cancellation After Draw Closes But Before Race
There is a gap between when the draw runs (Wednesday 7 PM) and when the race occurs (Friday). If a race needs to be cancelled after the draw has run, `draw_complete` events cannot be cancelled (Section 5.3.3). There is no mechanism to notify already-paired sailors that the Friday event is not happening. This seems like a real operational need for a sailing club (weather cancellations etc.).

**Required:** A "post-draw cancellation" flow (even if limited — e.g., race chair can mark a `draw_complete` event as `race_cancelled` and notify paired sailors).

### G-7: No Unsubscribe / Email Preferences
All results emails go to all club members regardless of whether they were registered or not. There is no way for a member to opt out of certain email types. This is both a usability issue (members who are inactive may not want weekly emails) and potentially a CAN-SPAM / GDPR compliance issue (recipients must be able to opt out of marketing-adjacent communications). At minimum, an unsubscribe link must be present in all bulk emails.

### G-8: Who Creates the First Club and How Platform Is Bootstrapped
Any verified user can create a club. But Section 3 explicitly notes "There is no global super-admin role." This means there is no way to:
- Monitor or moderate clubs created on the platform.
- Deactivate a malicious or duplicate club.
- See a platform-wide list of clubs.
- Handle abuse (someone creating hundreds of clubs).

Even if a super-admin role is out of scope for v1, the requirements should address what operational tooling (direct DB access? Supabase admin panel?) will be used to manage the platform.

### G-9: Reminder Email — Which Race Event
Section 5.7.2 describes the reminder email as being sent on Tuesday at 6 PM for the upcoming draw. If a club has multiple race events in a season, the reminder job (Section 7.3) finds events where `draw_time` is 23–25 hours away. This is correct for a single next race. But the reminder email content says "the user's current registration status for that race" — singular. If two draws happen to be within 23–25 hours of each other (e.g., two clubs with overlapping schedules, or a club with non-standard scheduling), the reminder logic could double-send. The 23–25 hour window should be tightened or specified more precisely, and the behavior for edge cases documented.

### G-10: Draw Results — Missing Cascade Constraint
In Section 4.7 (draw_results), `helm_user_id` and `crew_user_id` are FK → users.id but no ON DELETE behavior is specified. If a user is deleted, these records will either cascade-delete (losing historical data) or block deletion (preventing account deletion). This must be specified.

### G-11: Overflow Records and Race Cancellation Interaction
If a race is cancelled after registrations are taken but before the draw, the registered users are overflow-like (they tried to register and can't race). The requirements say cancelled events do not trigger a draw. But no overflow records are created either. Does priority accumulate for users who were registered for a cancelled race? This is a fairness question that will definitely come up and must be specified.

### G-12: Season-Level Priority vs Club-Level Priority
Section 5.6 says priority is derived from the "most recent overflow_records for that user in that club." It does not specify whether priority carries across seasons. If Season 2026 starts after Season 2025, does a user's end-of-season accumulated overflow carry into the new season? Likely not, but this must be explicit.

### G-13: No Logging / Audit Trail Requirements (Beyond Manual Draw)
Only the manual draw trigger is called out for audit logging (Section 5.5.3). There are no audit log requirements for:
- Race chair role assignments.
- Season creation / deactivation.
- Race event creation and cancellation.
- Bulk registrations.

For a club secretary managing race history, this is operationally important.

### G-14: Vercel Cron Execution Timeout and Failure Handling
Vercel Cron serverless functions have a maximum execution timeout (10 seconds on Hobby, 60 seconds on Pro). If a cron invocation must process many clubs' draws simultaneously, the function may time out. Section 6.1 says draws complete within 5 seconds for up to 100 registrations, but does not bound the number of clubs with simultaneous draws. No fan-out or queue strategy is described for scale.

### G-15: No Rate Limiting on Club Creation or Registration
Rate limiting is specified for authentication endpoints and email sending, but not for club creation (preventing spam clubs) or race registrations (preventing accidental double-submissions). The registration UNIQUE constraint handles idempotency but returns a DB error that must be gracefully handled.

---

## 2. Ambiguities

### A-1: "Either" Role Assignment Algorithm Is Underspecified
Section 5.5.2 Step 5 says "either" users are paired greedily: iterate through the helm pool, find the highest-priority available crew. But the helm pool includes "either" users. So an "either" user could appear as the helm being iterated AND as an available crew. The algorithm does not clearly define:
- Whether "either" users are iterated in the helm pass, the crew pass, or a separate pass.
- What "most reduces overflow" means precisely when one assignment leads to the same overflow count as another but different downstream pairings.
- Whether the algorithm is a single greedy pass or whether it backtracks.

The edge case row "All registrations are 'either'" says "Algorithm pairs first half as helm, second half as crew (randomized)" — this contradicts the greedy pairing algorithm described above, which never explicitly handles this case as a batch assignment. These two descriptions need to be reconciled into a single deterministic algorithm.

**Specifically:** In Step 4, both the helm pool and crew pool contain "either" users. In Step 5, when iterating the helm pool and an "either" user is selected as helm, they are removed from both pools. But what if selecting them as crew instead would produce a better pairing? The greedy approach is not globally optimal and this should be explicitly acknowledged and accepted.

### A-2: Priority Accumulation — When Is It Computed
Section 5.6.1 says priority is "copied forward from the prior week's overflow record when a user registers." But Section 4.6 says `overflow_priority` is stored on the registration. This creates a question: if a user's `overflow_priority` at registration time was 1, and then they are overflowed again, does their NEXT registration get priority = 2 (overflow_records.priority_at_draw + 1)? The formula "prior_priority + 1" seems to use the `priority_at_draw` value from `overflow_records`, not from the registration. These must be reconciled clearly. What is the exact query and formula for computing the next registration's `overflow_priority`?

### A-3: "Most Recent overflow_records" Across Clubs vs Within Club
Section 5.6.3 says priority is derived from "the most recent overflow_records for that user in that club." The join condition to determine "that club" requires going through race_events → seasons → clubs. This query path is not trivially obvious and should be spelled out, or the data model should add a `club_id` denormalization to `overflow_records` (as is done with `race_events.club_id`).

### A-4: Active Season Constraint Not Enforced
Section 5.3.1 says "only one active season per club is recommended" — this is advisory, not enforced. The data model has no UNIQUE constraint on `(club_id, is_active)` where `is_active = true`. "Recommended" means engineers may not add an enforcement layer. This should be "only one active season per club is permitted" with enforcement specified (DB partial unique index or application-layer check).

### A-5: Bulk Season Registration — Which Season
Section 5.4.2 says "Register for All Remaining Races" registers the user for every upcoming race in "the active season for a given club." What if there is no active season? What if there are multiple active seasons (permitted by the data model)? Both cases need defined behavior.

### A-6: Dashboard "Defaults to Most Recently Active Club"
Section 5.8.1 says the dashboard defaults to "the most recently active club." This is ambiguous: most recently joined? Most recently viewed? Most recently having had a draw? If it's stored as a preference, where is it stored (cookie, DB)? This is a minor UX detail but will cause implementation disagreement.

### A-7: Pre-Draw Reminder Window
Section 5.7.2 says the reminder is sent when the draw is "between 24–25 hours away." Section 7.3 says the reminder cron runs hourly and finds events where `draw_time` is "between 23 and 25 hours from now." These two ranges (24–25 and 23–25) are inconsistent. Use one definition.

### A-8: Manual Draw "Regardless of Whether draw_time Has Passed"
Section 5.5.3 says manual draw is available "only for events with status `upcoming`, regardless of whether `draw_time` has passed." This means a race chair can run a draw before the registration window closes. This could lock out sailors who intended to register before Wednesday 7 PM. Should the manual draw be blocked before `draw_time` except in a special override mode? Or is this acceptable as an intentional override? The UX for this case (draw triggered early, sailors who haven't registered yet) must be specified.

### A-9: Cron Job Security
Section 7.3 defines the two cron jobs but does not specify how they are authenticated. Vercel Cron invokes a URL endpoint. Any knowledge of that URL could allow external parties to trigger draws at will. The requirements should specify that the cron endpoint is protected by a Vercel Cron secret header (or equivalent) and how that secret is managed.

### A-10: Email Fallback Mechanism
Section 5.7 says "Resend (primary) with SendGrid as a fallback." No specification is given for:
- What constitutes a failure on the primary that triggers fallback (timeout, HTTP 5xx, specific error codes).
- Whether the fallback is automatic or requires manual intervention.
- Whether both providers are wired simultaneously or sequentially.
- How duplicate sends are prevented if both fire.

### A-11: "Join This Club" From Public Page Before Authentication
Section 5.10.1 says clicking "Join this club" "redirects to sign-up if not authenticated, then joins." After sign-up and email verification, the user must still be redirected back to join the club they originally clicked on. This redirect-after-auth flow requires storing the intended destination (club join intent) across the auth flow, which is a multi-step redirect chain that is easy to get wrong. This needs more detail.

### A-12: draw_results Uniqueness
Section 4.7 (draw_results) has no UNIQUE constraint defined. If a draw runs for a race_event and some error causes it to retry mid-transaction, duplicate pair rows could be inserted. The idempotency mechanism in Section 7.6 (status update as lock) should prevent this, but it is worth specifying that `(race_event_id, helm_user_id)` and `(race_event_id, crew_user_id)` should each be unique (a person cannot be both helm and crew, and cannot appear twice in the same draw).

---

## 3. Technical Risks

### TR-1: Vercel Cron Granularity and Reliability
Vercel Cron runs at most once per minute but is not guaranteed to fire within the minute — serverless cold starts, function timeouts, and platform degradation can all cause late or missed invocations. A draw that was supposed to run at 7:00 PM may run at 7:01 or 7:02 PM. For the stated use case this is likely acceptable, but there is no SLA on cron delivery and the requirements do not address what happens if a draw is missed entirely (e.g., due to a Vercel outage). The manual draw fallback is the recovery, but race chairs need to know to check.

**Risk level:** Medium. The draw window is fixed so a 1–2 minute delay is acceptable, but a complete outage is not. The requirements should document the monitoring/alerting mechanism more concretely (Section 6.3 mentions "alert mechanism" but doesn't specify one).

### TR-2: Draw Algorithm Correctness for "Either" Users
The greedy pairing algorithm for "either" users is not globally optimal and can produce more overflow than a maximum-matching algorithm (e.g., Hopcroft-Karp). For small clubs (< 100 sailors) this is unlikely to matter in practice, but the algorithm as written can produce suboptimal results.

Example: 1 helm, 1 crew, 1 either. Greedy iterates helm pool = [helm, either]. Pairs helm with crew. Either is left over. But if either had been assigned to crew instead, we'd still have 1 pair. Result is the same. However: 0 helms, 2 crew, 1 either — greedy iterates helm pool = [either], pairs either (as helm) with one crew. 1 pair, 1 overflow. Optimal: same. But with 2 "either" and 0 pure roles: greedy must pick one as helm and one as crew. The algorithm statement "pairs first half as helm, second half as crew" is a different approach than the greedy algorithm described in steps 1–6 and these must be reconciled.

### TR-3: Timezone Computation at Event Creation Time vs Display Time
`draw_time` is stored as UTC at event creation time based on the club's timezone at that time. If a club changes timezone (e.g., during daylight saving transitions or a real timezone change), the stored UTC values remain correct. However, if the club's timezone is ever edited (not currently possible in v1 — this is a gap: there is no "edit club timezone" feature), the stored draw times would become inconsistent with the new timezone. Even without edits, displaying `draw_time` correctly requires consistent use of the stored club timezone.

DST transitions are a concrete risk: `draw_time` for an event in November (EST) computed in August (EDT) will be wrong by 1 hour if the club timezone is `America/New_York` but the conversion was done incorrectly. Engineers must use proper tz-aware libraries (`date-fns-tz`, `luxon`) — not manual UTC offsets. This should be a documented constraint, not left implicit.

### TR-4: Concurrent Registration Modifications
Section 5.4 allows users to update their `role_preference` at any time before `draw_time`. If two requests arrive simultaneously (e.g., mobile background sync + user tap), the UNIQUE constraint on `(user_id, race_event_id)` prevents double-registration but the update semantics need a last-write-wins or optimistic lock strategy. This is low-risk with a simple update but should be acknowledged.

### TR-5: Cron Job Database Connection Exhaustion
The cron job runs every minute across potentially many clubs simultaneously. Serverless functions each open their own DB connection. With Supabase (PgBouncer) or Neon (serverless driver), connection pooling is handled, but a spike in clubs with simultaneous draws could exhaust the connection pool. The requirements make no mention of connection pool configuration.

### TR-6: Email Volume and Rate Limits
If a club has 200 members, the post-draw email goes to all 200 members regardless of registration status. A large club with a weekly draw generates 200+ emails per event. Resend's free tier limits outbound volume. The requirements should document expected maximum club size, expected email volume per draw, and ensure the chosen email provider tier supports it.

### TR-7: Session Token Storage Architecture
The requirements specify "secure, HTTP-only cookies" with a "30-day sliding window." The session implementation (jose JWT or iron-session) will store session data in the cookie itself (stateless) or reference a server-side session store. If stateless (JWT), password change session invalidation (Section 5.1.4 and 6.2) requires a token blocklist or a `sessions_invalidated_at` timestamp per user, since JWTs cannot be revoked without extra infrastructure. This is a non-trivial implementation detail that must be resolved before implementation.

### TR-8: Idempotency Gap in Draw — Between Status Update and Result Insertion
Section 7.6 describes the draw idempotency mechanism: update status in a transaction, then insert results in the same transaction. If the transaction is large (many registrations, many email sends), a long-running transaction increases the risk of deadlock or timeout. Email sending in particular should NOT be inside the DB transaction — it should be triggered after commit. The requirements say "trigger notifications" is step 8 of the draw, but do not explicitly state that email sending is outside the transaction. This must be made explicit.

### TR-9: Slug Collision on Club Name Edit (Not Applicable v1) and Uniqueness
Club slugs are auto-generated from club names. If two clubs have names that normalize to the same slug (e.g., "Royal Yacht-Club" and "Royal Yacht Club"), there will be a collision. The requirements say the slug must be unique but don't specify the collision resolution strategy (append a number? reject the club name? prompt for a manual slug?).

### TR-10: No Soft Delete on Race Registrations
When a user cancels a registration, the `race_registrations` row is deleted. There is no soft-delete or audit trail of cancellations. If a user claims they registered and were dropped from the draw, there is no way to verify. This may be acceptable for v1 but should be a conscious decision. Consider adding a `cancelled_at` timestamp instead of hard deletes.

---

## 4. Suggested Improvements and Clarifications

### I-1: Specify the Exact Priority Computation Query
Add a pseudocode or SQL snippet showing exactly how `overflow_priority` is computed when a new registration is created. This prevents implementors from interpreting Section 5.6 differently.

Suggested logic:
```sql
-- When creating a new registration for (user_id, race_event_id):
SELECT COALESCE(MAX(or.priority_at_draw), 0) + 1 AS next_priority
FROM overflow_records or
JOIN race_events re ON re.id = or.race_event_id
JOIN seasons s ON s.id = re.season_id
WHERE or.user_id = :user_id
  AND s.club_id = :club_id
  AND NOT EXISTS (
    -- User was successfully paired after this overflow
    SELECT 1 FROM draw_results dr
    JOIN race_events re2 ON re2.id = dr.race_event_id
    JOIN seasons s2 ON s2.id = re2.season_id
    WHERE s2.club_id = :club_id
      AND (dr.helm_user_id = :user_id OR dr.crew_user_id = :user_id)
      AND re2.race_date > re.race_date
      AND re2.race_date < :target_race_date
  )
```
(The exact query will vary by ORM but the intent should be this explicit.)

### I-2: Add a `club_id` to overflow_records
Denormalize `club_id` onto `overflow_records` (mirroring the pattern already used in `race_events`) to simplify the priority lookup query and avoid multi-join chains on a hot code path.

### I-3: Add Partial Unique Index for Active Season
```sql
CREATE UNIQUE INDEX one_active_season_per_club
  ON seasons (club_id)
  WHERE is_active = true;
```
This enforces the "one active season" constraint at the database level rather than relying on advisory language.

### I-4: Add `cancelled_at` Soft-Delete to race_registrations
Replace hard deletes with soft deletes to preserve the audit trail:
```sql
ALTER TABLE race_registrations ADD COLUMN cancelled_at TIMESTAMPTZ;
```
All active registration queries add `WHERE cancelled_at IS NULL`.

### I-5: Specify Cron Endpoint Authentication
Document that the cron job endpoints require a `CRON_SECRET` environment variable and validate the `Authorization: Bearer <secret>` header sent by Vercel Cron.

### I-6: Define "Edit Club" for Timezone and Name Corrections
Race chairs or the club creator should be able to edit the club's name and timezone. Timezone edits should warn that existing `draw_time` values will not be recomputed and may require review.

### I-7: Add a `role` to draw_results
Currently `draw_results` only stores `helm_user_id` and `crew_user_id`. Adding an explicit `assigned_role` column on overflow_records (already present) but not on draw_results means the display "User was helm in Week 3" requires interpreting which column they appear in. This is workable but fragile. It is already implicit in the column names; just document the convention explicitly.

### I-8: Specify Behavior of "Either" Users in the Results Email
The post-draw results email says "Helm: [Name] — Crew: [Name]." For users who registered as "either" but were assigned helm or crew, the email should reflect their actual assigned role, not their preference. This should be explicitly stated.

### I-9: Add Maximum Registration Count Per Club
Without a limit, a club could theoretically have thousands of members all registering, making the draw email extremely long. Consider a soft cap or pagination of draw results in the email.

### I-10: Define Behavior When draw_time Falls on a Timezone DST Transition
If a club is in `America/New_York` and the Wednesday draw time falls on the night clocks spring forward (2:00 AM → 3:00 AM), the UTC value of 7:00 PM ET shifts. The `draw_time` is computed once at event creation using the correct DST-aware library, so this should be correct. But this scenario should be explicitly called out as a test case.

### I-11: Specify Pagination on Long Lists
The race chair registrations view, member management view, and draw results view have no pagination specified. For clubs with many members this is important for both performance and usability.

### I-12: Specify What Happens to Priority When a Race Is Cancelled
Add this row to the edge cases table:

| A registered user's race is cancelled | No overflow record is created. Priority is not changed. |

Or alternatively: cancelled-race registrations count as an overflow (to be fair to sailors who signed up for a race that was taken away from them). This is a product decision that must be made explicitly.

### I-13: Specify the draw_results Uniqueness Constraint
Add constraints:
- `UNIQUE (race_event_id, helm_user_id)`
- `UNIQUE (race_event_id, crew_user_id)`

A user should not appear twice in the same draw result.

### I-14: Rate-Limit Club Creation
Prevent abuse by limiting club creation to N clubs per user per time window (e.g., max 3 clubs per day per user).

### I-15: Clarify Whether Registration Is Per-Season or Per-Club for Priority
Section 5.6.1 says "same club" for priority tracking but the query traverses race_events → seasons. Make explicit: priority resets at the start of a new season, or priority carries across seasons within the same club.

---

## 5. Overall Readiness Score: 6 / 10

**Rationale:**

| Area | Score | Notes |
|---|---|---|
| Data model | 7/10 | Solid foundation; missing cascade on draw_results, missing soft-delete on registrations, missing overflow_records.club_id denormalization |
| Draw algorithm | 5/10 | Greedy approach described but "either" handling contradicts itself; needs pseudocode |
| Priority system | 6/10 | Conceptually clear but the exact computation is ambiguous; cross-season behavior unspecified |
| Auth & sessions | 7/10 | Good coverage; JWT vs server-side session invalidation risk not resolved |
| Email flows | 7/10 | All major flows covered; fallback mechanism unspecified; no unsubscribe |
| Data privacy | 2/10 | No GDPR section, no account deletion, phone number inconsistency |
| Edge cases | 6/10 | Good start in Section 5.5.4; cancelled race priority gap, post-draw cancellation gap |
| Technical architecture | 6/10 | Vercel Cron risks not addressed; cron security not specified |
| Acceptance criteria | 8/10 | Well-formed Given/When/Then; covers most happy paths |
| Operational readiness | 4/10 | No monitoring spec, no DB migration strategy, no rollback plan |

The document is ready enough to begin low-risk work (DB schema setup, auth scaffolding, basic UI) but the draw engine and priority system must be fully specified before those components are implemented, or there will be conflicting interpretations between engineers.

---

## 6. Revised / Amended Section

The following additions and clarifications should be incorporated into REQUIREMENTS.md before implementation begins.

---

### AMENDMENT A: Data Privacy and Account Deletion (New Section 5.11)

#### 5.11.1 Account Deletion
- Authenticated users can request deletion of their account from the profile settings page.
- Deletion is a soft-delete in v1: the user record is anonymized (name replaced with "Deleted User", email cleared, phone cleared, password hash cleared) and a `deleted_at` timestamp is set.
- `draw_results` records are preserved with the anonymized name so historical pairings remain meaningful.
- All future registrations, sessions, and club memberships are removed.
- A confirmation email (to the address on file, before clearing) is sent confirming deletion.

#### 5.11.2 Privacy Obligations
- A privacy policy link must appear in the site footer and on the sign-up page.
- All emails must include an unsubscribe link. Unsubscribing suppresses all non-transactional emails (draw results, reminders) for that user at that club. Account-related emails (verification, password reset) are always sent.
- User data subject access requests will be handled manually by the development team in v1 (out of scope for automated tooling).

---

### AMENDMENT B: Phone Number Field Clarification

In Section 5.1.1, change:
> "The sign-up form collects: full name, email address, phone number, and password."

To:
> "The sign-up form collects: full name, email address, optional phone number, and password. Phone number is not required and is reserved for future SMS notification features."

---

### AMENDMENT C: Draw Algorithm Pseudocode (Replace Section 5.5.2 Step 5)

Replace the current step 5 with the following deterministic pseudocode:

```
1. partition registrations into:
   - pure_helms: role_preference == 'helm'
   - pure_crew:  role_preference == 'crew'
   - eithers:    role_preference == 'either'

2. sort each list by overflow_priority DESC, then shuffle within each priority tier (Fisher-Yates)

3. assign eithers to balance the pools:
   helm_deficit = max(0, len(pure_crew) - len(pure_helms))
   crew_deficit = max(0, len(pure_helms) - len(pure_crew))
   
   assign first min(helm_deficit, len(eithers)) eithers to helm pool
   remaining eithers → crew pool
   (if pools are equal size, split eithers 50/50, rounding remainder to crew pool)

4. helms = pure_helms + eithers_assigned_helm  (preserve sorted order)
   crews  = pure_crew  + eithers_assigned_crew

5. pairs = zip(helms, crews)  -- pair index-by-index
6. overflow = helms[len(pairs):] + crews[len(pairs):]
```

This is deterministic, eliminates the greedy/batch contradiction, and is easy to test.

---

### AMENDMENT D: Priority Accumulation Exact Specification (New Section 5.6.4)

When a user creates a registration for a new race event, the system computes their `overflow_priority` as follows:

1. Find the most recent `overflow_records` row for this user in this club (ordered by the `race_events.race_date` of the associated race_event), where no successful pairing in `draw_results` exists for this user at any race in this club with a `race_date` after that overflow and before the target race date.
2. If such a row exists, set `overflow_priority = overflow_records.priority_at_draw + 1`.
3. If no such row exists (user was either never overflowed, or was successfully paired in their most recent race), set `overflow_priority = 0`.

Priority does NOT carry across seasons. When computing the above, only `race_events` belonging to the current club's currently-active season are considered.

---

### AMENDMENT E: Cancelled Race Priority Behavior (Addition to Section 5.5.4)

Add to the edge cases table:

| Scenario | Behavior |
|---|---|
| Race event cancelled after registrations but before draw | No overflow_records created. Registered users' priority is not changed. Their existing accumulated priority (if any) is preserved for the next race they register for. |
| Race event draw_complete but race-day cancellation needed | Race chair can transition status from `draw_complete` to `race_day_cancelled`. This sends a notification to all paired sailors. No priority changes occur. No draw re-run. |

This requires adding `race_day_cancelled` as a valid `status` value in `race_events`.

---

### AMENDMENT F: Active Season Enforcement (Replace Advisory in Section 5.3.1)

Replace:
> "Multiple seasons can exist per club, but only one should be marked `is_active` at a time."

With:
> "Multiple seasons can exist per club, but exactly one may be marked `is_active = true` at a time. This is enforced by a partial unique index: `UNIQUE (club_id) WHERE is_active = true`. Activating a new season automatically deactivates the prior active season within the same database transaction."

---

### AMENDMENT G: Cron Endpoint Security (Addition to Section 7.3)

Add:
> All cron job API routes (`/api/cron/draw-runner` and `/api/cron/reminder-sender`) validate an `Authorization: Bearer <CRON_SECRET>` header, where `CRON_SECRET` is an environment variable set in Vercel. Requests missing or with an invalid secret receive a 401 response. This secret must be configured in both Vercel's environment and the `vercel.json` cron job definition via the `Authorization` header.

---

### AMENDMENT H: Member Removal by Race Chair (Addition to Section 5.9.6)

Add:
> Race chairs can remove members from the club. Removing a member cancels all their future (upcoming, draw-not-yet-run) registrations and sends them a notification email. Historical draw_results and overflow_records are preserved. A race chair cannot remove another race chair (they must demote them to member first, then remove).

---

### AMENDMENT I: draw_results Uniqueness Constraints (Addition to Section 4.7)

Add to Section 4.7:

```
| UNIQUE | | (race_event_id, helm_user_id) | A user can only be helm once per race |
| UNIQUE | | (race_event_id, crew_user_id) | A user can only be crew once per race |
```

---

### AMENDMENT J: Soft Delete on race_registrations (Modification to Section 4.6)

Add column to `race_registrations`:

| Column | Type | Constraints | Notes |
|---|---|---|---|
| cancelled_at | TIMESTAMPTZ | NULLABLE | Set when user cancels; NULL = active registration |

All queries for "active registrations" must include `WHERE cancelled_at IS NULL`. Cancellation sets this timestamp rather than deleting the row.

---

*End of Requirements Review*

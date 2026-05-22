# FNR RaceDraw — League Scoring Expansion Plan

**Version:** 1.0  
**Date:** 2026-05-21  
**Status:** Design / Pre-Implementation  
**Scope:** Additive expansion only — no existing functionality is modified or broken.

---

## Table of Contents

1. [What the Expansion Should Support](#1-what-the-expansion-should-support)
2. [How the Existing Schema Already Supports This](#2-how-the-existing-schema-already-supports-this)
3. [New Data Model Additions](#3-new-data-model-additions)
4. [Changes Needed to Existing Tables](#4-changes-needed-to-existing-tables)
5. [Implementation Roadmap](#5-implementation-roadmap)
6. [UI Concepts](#6-ui-concepts)
7. [Notes on Not Breaking Existing Functionality](#7-notes-on-not-breaking-existing-functionality)

---

## 1. What the Expansion Should Support

### 1.1 Recording Finish Positions

Each boat (a `draw_results` pair) gets a result recorded after the race. A result captures:

- **Finish position**: the integer order in which the boat crossed the finish line (1st, 2nd, etc.)
- **Result code**: standard sailing codes for boats that did not finish normally — `DNF` (Did Not Finish), `DNS` (Did Not Start), `DSQ` (Disqualified), `RET` (Retired), `OCS` (On Course Side, i.e. premature start). These are stored in a dedicated column alongside a numeric equivalent used for scoring (see Section 3.1).
- **Corrected time** (optional, Phase 4): for handicap racing, the elapsed time after applying a handicap coefficient. Can be stored alongside or instead of finish position.

### 1.2 Scoring Systems

Clubs configure one scoring system per season. The following systems must be supported:

| System | How Points Are Assigned |
|---|---|
| **Low Point (Pursuit / Place)** | Points = finish position. 1st = 1 pt, 2nd = 2 pt, etc. Lower accumulated score is better. Standard ISAF/World Sailing low-point system. |
| **High Point** | Points = (number of starters − finish position + 1). 1st gets N points, last gets 1 point. Higher accumulated score is better. |
| **Custom Table** | Race chair defines a mapping of position → points. E.g. 1st=10, 2nd=8, 3rd=6, etc. Useful for clubs using legacy point tables. |
| **Handicap / Corrected Time** | Boats are ranked by corrected time rather than (or alongside) finish position. Points are then assigned from that ranking using any of the above systems. Phase 4 only. |

### 1.3 Non-Finish Result Codes

Standard sailing protest/retirement codes must be handled without breaking the scoring calculation:

| Code | Meaning | Default Penalty Score (Low Point) |
|---|---|---|
| `DNF` | Did Not Finish | number of starters + 1 |
| `DNS` | Did Not Start | number of starters + 1 |
| `DSQ` | Disqualified | number of starters + 2 |
| `RET` | Retired (before finish) | number of starters + 1 |
| `OCS` | On Course Side (premature start, not recalled) | number of starters + 2 |

These penalty values follow World Sailing Racing Rules of Sailing Appendix A conventions. For High Point scoring, penalised boats receive 0 points. For Custom Table scoring, the race chair defines the penalty score directly in the custom table configuration.

### 1.4 Discards

A configurable number of a sailor's worst race scores can be dropped when computing their season total. For example: "drop your two worst scores from the season." This is set per-season in the scoring configuration and applies uniformly to all sailors in that season.

Rules for discards:
- Discards apply to the computed points for a race, not raw positions.
- If a sailor has sailed fewer races than the discard count, all their scores count (no negative discards).
- The leaderboard must show both gross (before discards) and net (after discards) standings, with net being the primary sort key.

### 1.5 Season Leaderboard

A ranked table of all sailors who have participated in at least one race in the season, showing:
- Net points (after discards applied) — primary sort
- Gross points (before discards)
- Races sailed
- Individual race scores (with discarded races marked)

### 1.6 Per-Race Results View

A results table for a single race event showing finish order, result code (if any), and points awarded.

### 1.7 Historical Results Across Seasons

Past seasons' leaderboards and per-race results are preserved and browsable. No data is ever deleted when a season is deactivated.

---

## 2. How the Existing Schema Already Supports This

The current schema was designed with clean foreign-key chains that make this expansion natural. No existing tables need to be dropped or restructured.

### 2.1 `race_events` is the anchor

`race_events` already has:
- `id` — the natural primary key for attaching race results
- `status` — results should only be enterable when `status = 'draw_complete'` or `status = 'race_day_cancelled'` (the race happened but was cancelled on the day; a race chair may still want to record results)
- `race_date` — used for ordering races within a season on the leaderboard
- `season_id` — chains results up to the season and club without extra joins
- `club_id` (denormalized) — available directly on the row for efficient queries

### 2.2 `draw_results` is the unit of participation

Each row in `draw_results` represents one boat (helm + crew pair) that started the race. This is already the correct granularity for recording a finish result. The new `race_results` table simply adds a 1:1 row per `draw_results` row.

`draw_results` also has:
- `boat_number` — already present; can be displayed alongside the result
- `helm_user_id` / `crew_user_id` — allows per-sailor aggregation for the leaderboard (each person on a boat shares the result)

### 2.3 `seasons` scopes the leaderboard

`seasons` links to `clubs` via `club_id`. A season leaderboard is simply an aggregation of `race_results` joined through `race_events` where `season_id` matches. The existing `is_active` flag cleanly separates current from historical seasons.

### 2.4 `profiles` is the sailor identity

All results trace back to `profiles` via `draw_results.helm_user_id` and `draw_results.crew_user_id`. Per-sailor career stats are a join across seasons and clubs.

### 2.5 `overflow_records` is already excluded

Sailors who overflowed (were not paired) have no `draw_results` row. They therefore naturally have no result for that race. They are not in the scoring table for that race, and the "number of starters" count is the number of `draw_results` rows, not `race_registrations` rows.

---

## 3. New Data Model Additions

These tables should be created in a future migration. Do not create this migration file until Phase 1 development begins. SQL is provided here as the authoritative design reference.

### 3.1 `race_results`

One row per `draw_results` row (i.e., one row per boat per race). This is the core results table.

```sql
CREATE TABLE public.race_results (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- What race and what boat
  race_event_id     UUID        NOT NULL REFERENCES public.race_events(id) ON DELETE RESTRICT,
  draw_result_id    UUID        NOT NULL REFERENCES public.draw_results(id) ON DELETE RESTRICT,

  -- Finish position as recorded on the water (1 = first across the line)
  -- NULL when a result_code is recorded instead of a clean finish
  finish_position   INTEGER     NULL CHECK (finish_position > 0),

  -- Standard sailing non-finish codes. NULL = clean finish.
  result_code       TEXT        NULL CHECK (result_code IN ('DNF', 'DNS', 'DSQ', 'RET', 'OCS')),

  -- The computed score for this boat in this race, after applying the
  -- season's scoring system. Stored so the leaderboard never needs to
  -- recompute. Recomputed and updated whenever scoring_config changes.
  computed_score    NUMERIC(8,2) NULL,

  -- Whether this race score is a discard for this boat in the season standings.
  -- Recomputed whenever scoring_config changes or results are edited.
  is_discard        BOOLEAN     NOT NULL DEFAULT false,

  -- Corrected time in seconds (Phase 4, handicap racing). NULL until Phase 4.
  corrected_time_seconds INTEGER NULL,

  -- Audit
  recorded_by       UUID        NOT NULL REFERENCES public.profiles(id),
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A boat gets exactly one result row per race
  UNIQUE (draw_result_id),
  -- Finish positions within a race must be unique (no two boats share 1st place)
  -- Enforced at application layer; partial unique index excludes NULL positions:
  UNIQUE (race_event_id, finish_position)
);

CREATE INDEX idx_race_results_race_event_id ON public.race_results(race_event_id);
CREATE INDEX idx_race_results_draw_result_id ON public.race_results(draw_result_id);
```

**Design notes:**

- Either `finish_position` or `result_code` must be set, not both, not neither. This constraint is enforced at the application layer (a CHECK constraint covering both columns simultaneously is awkward in SQL but trivial in application code).
- `computed_score` is stored (denormalized) rather than computed at query time. Leaderboard queries over a full season with many races must be fast. Recomputing scores for all sailors on every page load is not acceptable at scale.
- `is_discard` is similarly stored. When a new race result is added to the season, or `scoring_configs.discard_count` is changed, the application recomputes discards for all affected sailors and updates these flags in a background job.
- `corrected_time_seconds` is nullable so it can be added in Phase 4 without a schema change.

### 3.2 `scoring_configs`

One row per season. Defines how scores are computed for all races in that season.

```sql
CREATE TABLE public.scoring_configs (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id             UUID        NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,

  -- Which scoring system to use
  scoring_system        TEXT        NOT NULL DEFAULT 'low_point'
                          CHECK (scoring_system IN ('low_point', 'high_point', 'custom')),

  -- Number of worst scores a sailor may drop over the season.
  -- 0 = no discards. Must be >= 0.
  discard_count         INTEGER     NOT NULL DEFAULT 0 CHECK (discard_count >= 0),

  -- For 'low_point' and 'high_point': penalty score multiplier for non-finish codes.
  -- Default follows World Sailing RRS Appendix A: DNF/DNS/RET = starters+1, DSQ/OCS = starters+2.
  -- When NULL, World Sailing defaults are used. Can be overridden per-club.
  -- Stored as a JSON object: {"DNF": "starters+1", "DSQ": "starters+2", ...}
  -- Values are expressions: "starters+N" or a literal numeric string.
  penalty_expressions   JSONB       NULL,

  -- Whether to use corrected_time_seconds for ranking before applying points (Phase 4)
  use_handicap_time     BOOLEAN     NOT NULL DEFAULT false,

  created_by            UUID        NOT NULL REFERENCES public.profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One scoring config per season
  UNIQUE (season_id)
);
```

**Design notes:**

- The `UNIQUE (season_id)` constraint means a race chair can create or update the season's scoring config, but only one exists. This keeps the leaderboard computation unambiguous.
- Changing `scoring_system` or `discard_count` mid-season triggers a full recomputation of `computed_score` and `is_discard` across all `race_results` for that season. This is intentional — it is analogous to a regatta re-scoring under a protest.
- `penalty_expressions` is JSONB rather than rigid columns so that custom penalty overrides can be added per code without new columns.

### 3.3 `custom_scoring_tables`

Used only when `scoring_configs.scoring_system = 'custom'`. Defines the points awarded for each finish position.

```sql
CREATE TABLE public.custom_scoring_tables (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id       UUID        NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,

  -- Finish position this row applies to (1, 2, 3, ...)
  finish_position INTEGER     NOT NULL CHECK (finish_position > 0),

  -- Points awarded for this position
  points          NUMERIC(8,2) NOT NULL,

  -- Penalty points for non-finish codes at this position's "level"
  -- If NULL, falls back to scoring_configs.penalty_expressions defaults
  dnf_points      NUMERIC(8,2) NULL,
  dsq_points      NUMERIC(8,2) NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (season_id, finish_position)
);

CREATE INDEX idx_custom_scoring_tables_season_id ON public.custom_scoring_tables(season_id);
```

**Design notes:**

- Rows only need to cover positions that will actually occur (e.g., up to the maximum number of boats per race). If a race has more finishers than rows in this table, the application falls back to a configurable default (e.g., 0 points, or the lowest defined points value).
- Race chairs enter this table through a UI grid in the Race Chair Dashboard, not raw SQL.
- The table is per-season so clubs can change their custom scoring table each year without affecting historical records.

### 3.4 Non-Finish Result Code Storage Pattern

The `result_code` column on `race_results` stores the sailing code as a text enum (`DNF`, `DNS`, etc.). The numeric penalty for that code is computed at score-recording time using the rules in `scoring_configs.penalty_expressions` (or the custom table) and stored in `computed_score`.

This means:
- The raw reason (DNF vs. DNS) is always preserved in `result_code` for display and protest review.
- The numeric score (`computed_score`) can be updated if the scoring config changes, without losing the underlying reason.
- `finish_position` remains NULL for non-finishers. The UNIQUE constraint on `(race_event_id, finish_position)` is a partial unique index (PostgreSQL allows multiple NULLs) so multiple non-finishers do not conflict.

---

## 4. Changes Needed to Existing Tables

The goal is to add results without any destructive changes. The following are the only additions needed to existing tables, and all are backwards-compatible (nullable columns or new indexes).

### 4.1 `race_events` — add `results_locked` flag

```sql
ALTER TABLE public.race_events
  ADD COLUMN results_locked BOOLEAN NOT NULL DEFAULT false;
```

**Why:** Race chairs should be able to close off result entry once the race is formally scored (e.g., after the protest window closes). Once `results_locked = true`, no further edits to `race_results` for that event are permitted. Defaults to `false` so all existing rows are unaffected.

### 4.2 `draw_results` — no changes required

`draw_results` already has everything needed (`id`, `race_event_id`, `helm_user_id`, `crew_user_id`, `boat_number`). The new `race_results` table references `draw_results.id`.

### 4.3 `seasons` — no changes required

`seasons` already has `id`, `club_id`, `year`, `is_active`. The new `scoring_configs` table references `seasons.id`.

### 4.4 `profiles` — no changes required

Per-sailor leaderboard data is derived by joining `race_results` → `draw_results` → `profiles`. No new columns are needed on `profiles`.

**Summary of changes to existing tables:**

| Table | Change | Type |
|---|---|---|
| `race_events` | Add `results_locked BOOLEAN NOT NULL DEFAULT false` | Additive, non-breaking |
| All others | No changes | — |

---

## 5. Implementation Roadmap

### Phase 1 — Basic Result Entry

**Goal:** Race chairs can record finish results for a completed race. No scoring or leaderboard yet.

Deliverables:
- Create the `race_results` table (migration).
- Add `results_locked` to `race_events` (migration).
- Race Chair Dashboard: "Enter Results" action appears for any `draw_complete` race event that is not `results_locked`.
- Result entry UI: a list of all boats from `draw_results` for that race, with a position field and a result-code dropdown (Clean Finish / DNF / DNS / DSQ / RET / OCS) for each.
- Validation: finish positions must be unique and contiguous starting from 1. Non-finish codes cannot have a position. At least one boat must have a clean finish to make positions meaningful.
- Per-race results view: a read-only table of finish results, visible to all club members once at least one result is entered.
- "Lock results" button for race chairs.
- RLS policies for `race_results` (club members read, race chairs write).

**What is not included:** scoring, leaderboard, discards.

---

### Phase 2 — Scoring Configuration and Season Leaderboard

**Goal:** The club configures a scoring system for the season and a live leaderboard appears.

Deliverables:
- Create `scoring_configs` table (migration).
- Race Chair Dashboard: "Scoring Configuration" section within season management. Fields: scoring system (dropdown), discard count (integer). Saving the config triggers a full recomputation of `computed_score` on all existing `race_results` for that season.
- Score computation logic (server-side):
  - Low point: `computed_score = finish_position` (or penalty for non-finishers)
  - High point: `computed_score = starters − finish_position + 1` (or 0 for non-finishers)
  - Number of starters = count of `race_results` rows for that `race_event_id`
  - Non-finish penalties follow World Sailing defaults unless overridden in `scoring_configs.penalty_expressions`
- Season leaderboard page: tabular view of all participating sailors, sorted by net points (ascending for low-point, descending for high-point). Columns: Rank, Sailor Name, Race 1, Race 2, …, Race N, Gross, Discards, Net.
- Leaderboard accessible to all club members (public within the club); no login required for clubs that choose public access (design consideration for Phase 2).
- Re-score trigger: when a result is edited after scoring is configured, recompute affected `computed_score` values and recalculate discards.

---

### Phase 3 — Discards and Custom Scoring Tables

**Goal:** The club can configure custom scoring tables and drop worst scores.

Deliverables:
- Create `custom_scoring_tables` table (migration).
- Race Chair Dashboard: extend Scoring Configuration to include:
  - Discard count field (already in `scoring_configs`, now exposed in the UI).
  - When `scoring_system = 'custom'`: a grid editor for position → points mapping.
- Discard calculation: for each sailor in the season, sort their race scores worst-first; mark the first `discard_count` rows as `is_discard = true` in `race_results`.
- Leaderboard updates: net score column subtracts discard scores. Discarded race cells are visually marked (strikethrough or greyed out).
- Trigger: whenever a new result is added, or discard count changes, or a result is edited, recompute discards for all affected sailors in that season.

---

### Phase 4 — Handicap and Corrected Time Support

**Goal:** Clubs using Portsmouth Yardstick, IRC, or other time-based handicap systems can record corrected times and derive finish order from them.

Deliverables:
- Add `corrected_time_seconds` to result entry UI (already nullable in the schema from Phase 1 — just expose it).
- Add `use_handicap_time` toggle to `scoring_configs` (already in schema — expose it).
- When `use_handicap_time = true`:
  - Finish positions on the results entry form are derived automatically from the corrected time ranking (shortest time = 1st place).
  - Race chairs enter corrected times, not positions.
  - Positions are computed server-side and stored in `finish_position` before scoring.
- Handicap coefficient storage: consider a `boat_handicaps` table (per boat per race event) if clubs need to record each boat's handicap rating. This is left as a Phase 4 detail design decision.

---

## 6. UI Concepts

These are wireframe descriptions — no code, no implementation detail. They describe the user experience at a conceptual level.

### 6.1 Result Entry (Race Chair)

**Where:** Race Chair Dashboard → Race Event detail → "Enter Results" button (appears only for `draw_complete` events that are not `results_locked`).

**Screen layout:**

```
[ Race: Friday 6 June 2026 — Enter Results ]

  Boat  Helm              Crew              Finish   Result Code
  ----  ----------------  ----------------  -------  -----------
  1     Alex Thompson     Jordan Lee        [ 1   ]  [ Clean ▼ ]
  2     Sam Rivera        Morgan Chen       [ 2   ]  [ Clean ▼ ]
  3     Dana Kim          Riley Park        [     ]  [ DNF   ▼ ]
  4     Casey Brown       Jamie Wu          [ 3   ]  [ Clean ▼ ]
  5     Taylor Nguyen     Quinn Davis       [     ]  [ DNS   ▼ ]

  [ Save Results ]    [ Save & Lock Results ]    [ Cancel ]

  ⚠ Positions must be unique. Non-finish boats do not get a position.
```

**Behaviour:**
- Positions auto-fill sequentially as the race chair enters them, but can be changed.
- Selecting a non-Clean result code clears and disables the position field for that row.
- Saving without locking allows further edits (useful during protests).
- Saving with lock sets `results_locked = true` and disables further edits.
- After save, the race chair sees a confirmation showing points awarded per boat based on the season's scoring config (if configured).

---

### 6.2 Season Leaderboard Table

**Where:** Club page → Season tab → Leaderboard sub-tab. Visible to all club members.

**Layout:**

```
[ Summer 2026 — Season Leaderboard ]
[ Scoring: Low Point | Discards: 1 | Races Sailed: 6 of 10 ]

  Rank  Sailor              R1   R2   R3   R4   R5   R6   Gross  -Disc  Net
  ----  ------------------  ---  ---  ---  ---  ---  ---  -----  -----  ---
  1     Alex Thompson        1    2   DNF   1    2    1     13     6      7
  2     Sam Rivera           2    1    2    3    1   DNS    17     7     10
  3     Dana Kim             3    3    1    2    3    2     14     3     11
  4     Casey Brown          4    4    3   DNF   4    3     25     7     18
  —     Riley Park           —    —    —    —    —    —      —     —      —
        (not yet sailed)

  Worst-score discards shown in strikethrough. Net score = gross − discarded score.
  DNF/DNS shown in red. Discarded cells have strikethrough styling.
```

**Notes:**
- Sailors who have not sailed any race appear below the table in an "Eligible sailors" section but are not ranked.
- Each race column links to the per-race results view.
- A "Download CSV" export button (Phase 2 stretch goal — see Out of Scope in v1; this replaces the spreadsheet workflow).

---

### 6.3 Per-Race Results View

**Where:** Club page → Race Event → Results tab. Accessible to all club members once results are entered.

**Layout:**

```
[ Friday 6 June 2026 — Race Results ]
[ 5 starters | Low Point scoring | Results locked ]

  Pos  Boat  Helm              Crew              Points
  ---  ----  ----------------  ----------------  ------
  1    1     Alex Thompson     Jordan Lee        1
  2    4     Casey Brown       Jamie Wu          2
  3    2     Sam Rivera        Morgan Chen       3
  DNF  3     Dana Kim          Riley Park        6 (5+1)
  DNS  5     Taylor Nguyen     Quinn Davis       6 (5+1)

  [ ← Back to Season ]
```

**Notes:**
- Penalty score derivation is shown in parentheses (e.g., "5+1" = starters + 1) so sailors can verify it.
- If results are not yet locked, a note reads "Results provisional — protest window open."

---

### 6.4 Per-Sailor Career Stats View

**Where:** User Dashboard → "My Results" tab (new tab alongside existing Upcoming Races and Past Races panels).

**Layout:**

```
[ Alex Thompson — Career Stats at Royal Yacht Club ]

  Season           Races  Wins  Avg Pos  Net Pts  Rank
  ---------------  -----  ----  -------  -------  ----
  Summer 2026       6/10    3     1.8       7       1st
  Spring 2026        10    2     2.4      12       2nd
  Autumn 2025         8    1     3.1      22       4th

  [ View full season leaderboard → ]

───────────────────────────────────────────────────────
  Career across all seasons:  24 races  |  6 wins  |  avg position: 2.4
```

**Notes:**
- This view aggregates across all seasons the sailor has participated in at this club.
- Wins = number of 1st place finishes (clean, not gifted by DSQ of others).
- Average position excludes races where the sailor received a non-finish code.
- A separate section per club if the sailor is a member of multiple clubs.
- This view is read-only and visible only to the sailor themselves and race chairs of the club.

---

### 6.5 Scoring Configuration (Race Chair)

**Where:** Race Chair Dashboard → Season Management → "Configure Scoring" button.

**Layout:**

```
[ Summer 2026 — Scoring Configuration ]

  Scoring System:    [ Low Point (ISAF) ▼ ]
                     Options: Low Point / High Point / Custom Table

  Discard Count:     [ 1 ] worst score(s) dropped per sailor

  [ If Custom Table selected, a grid appears: ]
  Position  Points
  --------  ------
  1st       [ 10 ]
  2nd       [  8 ]
  3rd       [  6 ]
  4th       [  4 ]
  5th       [  2 ]
  DNF/RET   [  0 ]
  DNS/OCS   [  0 ]
  DSQ       [  0 ]
  [ + Add position ]

  ⚠ Changing the scoring system will recompute all existing results
    for this season. This cannot be undone.

  [ Save Configuration ]   [ Cancel ]
```

---

## 7. Notes on Not Breaking Existing Functionality

### 7.1 Purely Additive Schema

All new tables (`race_results`, `scoring_configs`, `custom_scoring_tables`) reference existing tables via foreign keys but are not referenced by any existing table. The only change to an existing table is adding a nullable-with-default column (`results_locked`) to `race_events`. This is a backwards-compatible DDL operation in PostgreSQL and does not affect any existing queries, indexes, or application code.

### 7.2 The Draw Engine is Untouched

The draw algorithm (Section 5.5 of the requirements), the overflow priority system, the cron jobs, and all registration logic are completely independent of result recording. Results are entered after the draw has run; the draw code has no awareness of the results tables.

### 7.3 Existing Status Transitions are Unchanged

The `race_events.status` state machine (`upcoming` → `draw_complete` → `race_day_cancelled`) is not modified. Results can only be entered when `status = 'draw_complete'` (or optionally `race_day_cancelled` — a policy decision for Phase 1). The new `results_locked` column is orthogonal to status.

### 7.4 New Routes, Not Modified Routes

All result-recording API routes and pages should live in new paths:
- `/app/(chair)/results/[race_event_id]` — result entry for race chairs
- `/app/(app)/seasons/[season_id]/leaderboard` — member-facing leaderboard
- `/app/(app)/results/[race_event_id]` — per-race results view
- `/app/(app)/my-results` — career stats

None of these paths conflict with existing routes defined in the current application structure.

### 7.5 RLS Policies are Additive

New RLS policies on the new tables follow the same pattern as existing policies. Existing policies on existing tables are not modified. There is no risk of existing queries being blocked or granted unexpected access.

### 7.6 Email Notifications are Unchanged

The results feature does not require new transactional emails in Phase 1–3. Phase 4 could optionally add a "race results published" notification, but this is a new email type with no overlap with existing email logic.

### 7.7 Account Deletion Behaviour Extends Naturally

When a user soft-deletes their account, `draw_results` rows are preserved (existing behaviour). Because `race_results` references `draw_results` (not `profiles` directly), the user's anonymized profile (`"Deleted User"`) will appear in historical leaderboards automatically. No change to the deletion flow is required.

### 7.8 Multi-Tenancy is Preserved

All new tables either carry a `season_id` (which chains to `club_id` via `seasons`) or a `race_event_id` (which chains to `club_id` via `race_events`). The same multi-tenancy principle from the existing schema — all queries filter by `club_id` — applies identically to the new tables.

---

## Appendix: Key Design Decisions and Rationale

| Decision | Rationale |
|---|---|
| `computed_score` stored on `race_results`, not computed at query time | Season leaderboard queries across 10+ races and 30+ sailors must be fast. Pre-computed scores allow a simple `SUM` query; recomputation is triggered only when results or config change. |
| Scoring config is 1:1 with season, not 1:1 with race | Clubs configure scoring once per season. Per-race scoring systems are uncommon in club racing and would multiply complexity. Can be revisited. |
| Result codes stored as text, not as a foreign key to a reference table | The set of standard sailing codes is small and stable (defined by World Sailing RRS). A CHECK constraint is sufficient and avoids an extra join on every result query. |
| `finish_position` and `result_code` are mutually exclusive, enforced at application layer | A combined CHECK constraint (`(finish_position IS NULL) != (result_code IS NULL)`) is technically possible in SQL but confusing to maintain. Application validation is clearer and testable. |
| Discards stored as `is_discard` boolean, not computed at query time | Same rationale as `computed_score` — avoids re-sorting all scores per sailor on every leaderboard render. |
| Phase 4 handicap fields are already in the schema but hidden | Adding `corrected_time_seconds` in Phase 1 as a nullable column means Phase 4 requires no schema migration, only UI exposure. This avoids a migration on a table that may have substantial data by then. |

/**
 * execute.ts — Shared draw execution logic used by both the cron endpoint and
 * the manual admin trigger.
 *
 * The flow is:
 *  1. Atomically claim the event (status upcoming → draw_complete).
 *  2. Fetch all active registrations + profiles.
 *  3. Run the draw algorithm.
 *  4. Insert draw_results and overflow_records.
 *  5. AFTER the DB writes succeed, trigger notification emails.
 *
 * NOTE: Supabase's generic type inference does not resolve perfectly with our
 * hand-crafted Database type, so all write operations use `as never` casts on
 * the payload and `as SBResult<T>` casts on the return value — the same
 * pattern used throughout the rest of the codebase.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { DrawParticipant, DrawOutput } from '@/lib/draw/algorithm'
import { runDraw } from '@/lib/draw/algorithm'
import {
  sendDrawResultsEmail,
  sendOverflowNotificationEmails,
  sendInsufficientRegistrationsEmail,
  sendNoRegistrationsEmail,
} from '@/lib/email/draw-notifications'
import type {
  Club,
  RaceEvent,
  Profile,
  RaceRegistration,
  DrawResultInsert,
  OverflowRecordInsert,
} from '@/lib/types/database'

type SBResult<T> = { data: T | null; error: { message: string } | null }

export interface ExecuteDrawResult {
  /** Whether the draw actually ran (false if already claimed by another process) */
  claimed: boolean
  pairsFormed: number
  overflowCount: number
  error?: string
}

/**
 * Execute a draw for a single race event.
 *
 * @param supabase - Service-role Supabase client (bypasses RLS).
 * @param eventId  - ID of the race_event to draw.
 * @returns        Result metadata.
 */
export async function executeDrawForEvent(
  supabase: SupabaseClient<Database>,
  eventId: string
): Promise<ExecuteDrawResult> {
  // ── Step 1: Atomically claim the event ────────────────────────────────────────
  // UPDATE race_events SET status='draw_complete' WHERE id=? AND status='upcoming'
  // If 0 rows updated: another process beat us. Skip.
  const { data: claimedRows, error: claimError } = (await supabase
    .from('race_events')
    .update({ status: 'draw_complete' } as never)
    .eq('id', eventId)
    .eq('status', 'upcoming')
    .select()) as { data: RaceEvent[] | null; error: { message: string } | null }

  if (claimError) {
    return { claimed: false, pairsFormed: 0, overflowCount: 0, error: claimError.message }
  }

  if (!claimedRows || claimedRows.length === 0) {
    // Another process already ran the draw (or event was cancelled). Skip.
    return { claimed: false, pairsFormed: 0, overflowCount: 0 }
  }

  const event = claimedRows[0]

  // ── Step 2: Fetch club info ────────────────────────────────────────────────────
  const { data: clubData, error: clubError } = (await supabase
    .from('clubs')
    .select('*')
    .eq('id', event.club_id)
    .single()) as SBResult<Club>

  if (clubError || !clubData) {
    return {
      claimed: true,
      pairsFormed: 0,
      overflowCount: 0,
      error: `Failed to fetch club: ${clubError?.message ?? 'not found'}`,
    }
  }
  const club = clubData

  // Effective boat limit: event override takes precedence over club default
  const maxBoats =
    event.max_boats_override !== null
      ? event.max_boats_override
      : club.max_boats_per_race !== null
        ? club.max_boats_per_race
        : null

  // ── Step 3: Fetch all active registrations ────────────────────────────────────
  const { data: registrations, error: regError } = (await supabase
    .from('race_registrations')
    .select('*')
    .eq('race_event_id', eventId)
    .is('cancelled_at', null)) as {
    data: RaceRegistration[] | null
    error: { message: string } | null
  }

  if (regError) {
    return {
      claimed: true,
      pairsFormed: 0,
      overflowCount: 0,
      error: `Failed to fetch registrations: ${regError.message}`,
    }
  }

  const activeRegistrations = registrations ?? []

  // ── Step 4: Fetch profiles for registrants + all club members ─────────────────
  const registrantUserIds = activeRegistrations.map((r) => r.user_id)

  const { data: clubMemberRows, error: memberError } = (await supabase
    .from('club_members')
    .select('user_id')
    .eq('club_id', event.club_id)) as {
    data: { user_id: string }[] | null
    error: { message: string } | null
  }

  if (memberError) {
    return {
      claimed: true,
      pairsFormed: 0,
      overflowCount: 0,
      error: `Failed to fetch club members: ${memberError.message}`,
    }
  }

  const allMemberUserIds = (clubMemberRows ?? []).map((m) => m.user_id)
  const allUserIds = [...new Set([...registrantUserIds, ...allMemberUserIds])]

  const profileMap = new Map<string, Profile>()

  if (allUserIds.length > 0) {
    const { data: profileRows, error: profileError } = (await supabase
      .from('profiles')
      .select('*')
      .in('id', allUserIds)) as {
      data: Profile[] | null
      error: { message: string } | null
    }

    if (profileError) {
      return {
        claimed: true,
        pairsFormed: 0,
        overflowCount: 0,
        error: `Failed to fetch profiles: ${profileError.message}`,
      }
    }

    for (const p of profileRows ?? []) {
      profileMap.set(p.id, p)
    }
  }

  const clubMemberProfiles = allMemberUserIds
    .map((id) => profileMap.get(id))
    .filter((p): p is Profile => p != null)

  // ── Step 5: Handle zero-registration edge case ────────────────────────────────
  if (activeRegistrations.length === 0) {
    sendNoRegistrationsEmail(club, event, clubMemberProfiles).catch((err) =>
      console.error('[draw] sendNoRegistrationsEmail error:', err)
    )
    return { claimed: true, pairsFormed: 0, overflowCount: 0 }
  }

  // ── Step 6: Build DrawParticipant array ────────────────────────────────────────
  const participants: DrawParticipant[] = activeRegistrations
    .map((reg) => {
      const profile = profileMap.get(reg.user_id)
      if (!profile) return null
      return {
        userId: reg.user_id,
        name: profile.name,
        email: profile.email,
        primaryRole: reg.primary_role as 'helm' | 'crew',
        acceptOtherRole: reg.accept_other_role,
        overflowPriority: reg.overflow_priority,
        registrationId: reg.id,
      } satisfies DrawParticipant
    })
    .filter((p): p is DrawParticipant => p != null)

  // ── Step 7: Run the algorithm ─────────────────────────────────────────────────
  const drawOutput: DrawOutput = runDraw(participants, maxBoats)

  // ── Step 8: Handle insufficient registrations (no pairs possible) ─────────────
  if (drawOutput.pairs.length === 0 && participants.length > 0) {
    const overflowInserts: OverflowRecordInsert[] = participants.map((p) => ({
      user_id: p.userId,
      race_event_id: eventId,
      club_id: event.club_id,
      primary_role: p.primaryRole,
      accept_other_role: p.acceptOtherRole,
      priority_at_draw: p.overflowPriority,
      reason: (drawOutput.overflowReason.get(p.userId) ??
        'no_pair_available') as OverflowRecordInsert['reason'],
    }))

    const { error: overflowInsertError } = (await supabase
      .from('overflow_records')
      .insert(overflowInserts as never[])) as SBResult<never>

    if (overflowInsertError) {
      console.error('[draw] Failed to insert overflow records:', overflowInsertError.message)
    }

    sendInsufficientRegistrationsEmail({
      club,
      event,
      pairs: [],
      overflow: participants,
      overflowReason: drawOutput.overflowReason,
      boatLimitApplied: false,
      effectiveBoatLimit: maxBoats,
      profiles: profileMap,
      clubMembers: clubMemberProfiles,
    }).catch((err) => console.error('[draw] sendInsufficientRegistrationsEmail error:', err))

    return { claimed: true, pairsFormed: 0, overflowCount: participants.length }
  }

  // ── Step 9: Insert draw_results ───────────────────────────────────────────────
  if (drawOutput.pairs.length > 0) {
    const drawResultInserts: DrawResultInsert[] = drawOutput.pairs.map((pair) => ({
      race_event_id: eventId,
      helm_user_id: pair.helmUserId,
      crew_user_id: pair.crewUserId,
      helm_played_non_primary: pair.helmPlayedNonPrimary,
      crew_played_non_primary: pair.crewPlayedNonPrimary,
      boat_number: pair.boatNumber,
    }))

    const { error: drError } = (await supabase
      .from('draw_results')
      .insert(drawResultInserts as never[])) as SBResult<never>

    if (drError) {
      return {
        claimed: true,
        pairsFormed: 0,
        overflowCount: 0,
        error: `Failed to insert draw_results: ${drError.message}`,
      }
    }
  }

  // ── Step 10: Insert overflow_records ──────────────────────────────────────────
  if (drawOutput.overflow.length > 0) {
    const overflowInserts: OverflowRecordInsert[] = drawOutput.overflow.map((p) => ({
      user_id: p.userId,
      race_event_id: eventId,
      club_id: event.club_id,
      primary_role: p.primaryRole,
      accept_other_role: p.acceptOtherRole,
      priority_at_draw: p.overflowPriority,
      reason: (drawOutput.overflowReason.get(p.userId) ?? 'unmatched') as OverflowRecordInsert['reason'],
    }))

    const { error: orError } = (await supabase
      .from('overflow_records')
      .insert(overflowInserts as never[])) as SBResult<never>

    if (orError) {
      // Non-fatal: log and continue
      console.error('[draw] Failed to insert overflow_records:', orError.message)
    }
  }

  // ── Step 11: Send notification emails (outside transaction, after DB writes) ───
  const emailCtx = {
    club,
    event,
    pairs: drawOutput.pairs,
    overflow: drawOutput.overflow,
    overflowReason: drawOutput.overflowReason,
    boatLimitApplied: drawOutput.boatLimitApplied,
    effectiveBoatLimit: drawOutput.effectiveBoatLimit,
    profiles: profileMap,
    clubMembers: clubMemberProfiles,
  }

  sendDrawResultsEmail(emailCtx).catch((err) =>
    console.error('[draw] sendDrawResultsEmail error:', err)
  )

  if (drawOutput.overflow.length > 0) {
    sendOverflowNotificationEmails(emailCtx).catch((err) =>
      console.error('[draw] sendOverflowNotificationEmails error:', err)
    )
  }

  return {
    claimed: true,
    pairsFormed: drawOutput.pairs.length,
    overflowCount: drawOutput.overflow.length,
  }
}

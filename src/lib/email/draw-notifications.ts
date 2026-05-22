/**
 * Draw notification email stubs.
 * The real implementations are built by the email-service agent.
 * These stubs log and resolve so the draw engine can call them without errors.
 */

import type { DrawParticipant, DrawPair } from '@/lib/draw/algorithm'
import type { Club, RaceEvent, Profile } from '@/lib/types/database'

export interface DrawEmailContext {
  club: Club
  event: RaceEvent
  pairs: DrawPair[]
  overflow: DrawParticipant[]
  overflowReason: Map<string, 'unmatched' | 'boat_limit' | 'no_pair_available'>
  boatLimitApplied: boolean
  effectiveBoatLimit: number | null
  /** Map of userId → Profile for all participants */
  profiles: Map<string, Profile>
  /** All club member profiles (for the post-draw club-wide email) */
  clubMembers: Profile[]
}

/**
 * Send the post-draw results email to all club members.
 * Stub: logs the call. Replace with real Resend implementation.
 */
export async function sendDrawResultsEmail(ctx: DrawEmailContext): Promise<void> {
  console.log(
    `[email stub] sendDrawResultsEmail: club=${ctx.club.name} event=${ctx.event.id} ` +
      `pairs=${ctx.pairs.length} overflow=${ctx.overflow.length}`
  )
}

/**
 * Send overflow notification email to each overflow participant.
 * Stub: logs the call. Replace with real Resend implementation.
 */
export async function sendOverflowNotificationEmails(ctx: DrawEmailContext): Promise<void> {
  console.log(
    `[email stub] sendOverflowNotificationEmails: club=${ctx.club.name} event=${ctx.event.id} ` +
      `overflow=${ctx.overflow.length}`
  )
}

/**
 * Send the "draw cancelled — insufficient registrations" email.
 * Called when there are registrations but no pairs can be formed.
 * Stub: logs the call.
 */
export async function sendInsufficientRegistrationsEmail(ctx: DrawEmailContext): Promise<void> {
  console.log(
    `[email stub] sendInsufficientRegistrationsEmail: club=${ctx.club.name} event=${ctx.event.id}`
  )
}

/**
 * Send the "draw cancelled — no registrations" email.
 * Called when there are zero active registrations for the event.
 * Stub: logs the call.
 */
export async function sendNoRegistrationsEmail(
  club: Club,
  event: RaceEvent,
  clubMembers: Profile[]
): Promise<void> {
  console.log(
    `[email stub] sendNoRegistrationsEmail: club=${club.name} event=${event.id} members=${clubMembers.length}`
  )
}

/**
 * Send pre-draw reminder emails for a race event.
 * Called by the reminder cron job.
 * Stub: logs the call.
 */
export async function sendReminderEmails(
  club: Club,
  event: RaceEvent,
  clubMembers: Profile[],
  /** Map of userId → active registration (if any) */
  registrationMap: Map<string, { primaryRole: 'helm' | 'crew'; acceptOtherRole: boolean }>
): Promise<number> {
  console.log(
    `[email stub] sendReminderEmails: club=${club.name} event=${event.id} ` +
      `members=${clubMembers.length}`
  )
  return clubMembers.length
}

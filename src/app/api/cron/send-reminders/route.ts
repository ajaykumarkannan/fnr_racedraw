/**
 * GET /api/cron/send-reminders
 *
 * Vercel Cron: runs every hour (0 * * * *).
 * Finds race_events where draw_time is between (now + 23h) and (now + 25h)
 * and status = 'upcoming'. Sends pre-draw reminder emails to all club members.
 *
 * Protected by Authorization: Bearer <CRON_SECRET>.
 *
 * Per requirements (Section 5.7.2), the reminder fires when draw_time is
 * between 23 and 25 hours away — this catches Tuesday 6 PM for Wednesday 7 PM
 * draws regardless of which exact minute the cron fires.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendReminderEmails } from '@/lib/email/draw-notifications'
import type { Club, RaceEvent, Profile } from '@/lib/types/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Window: 23–25 hours from now
const WINDOW_MIN_HOURS = 23
const WINDOW_MAX_HOURS = 25

export async function GET(request: NextRequest) {
  // ── Auth check ────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('Authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  let sent = 0
  const errors: string[] = []

  try {
    const now = Date.now()
    const windowStart = new Date(now + WINDOW_MIN_HOURS * 60 * 60 * 1000).toISOString()
    const windowEnd = new Date(now + WINDOW_MAX_HOURS * 60 * 60 * 1000).toISOString()

    // ── Find qualifying events ────────────────────────────────────────────────────
    const { data: events, error: fetchError } = await supabase
      .from('race_events')
      .select('*')
      .eq('status', 'upcoming')
      .gte('draw_time', windowStart)
      .lte('draw_time', windowEnd)

    if (fetchError) {
      console.error('[cron/send-reminders] Failed to fetch events:', fetchError.message)
      return NextResponse.json({ sent: 0, errors: [fetchError.message] }, { status: 500 })
    }

    if (!events || events.length === 0) {
      return NextResponse.json({ sent: 0, errors: [] })
    }

    // ── For each qualifying event, send reminders ─────────────────────────────────
    for (const event of events as RaceEvent[]) {
      try {
        // Fetch club
        const { data: clubData, error: clubError } = await supabase
          .from('clubs')
          .select('*')
          .eq('id', event.club_id)
          .single()

        if (clubError || !clubData) {
          const msg = `Event ${event.id}: club not found`
          console.error('[cron/send-reminders]', msg)
          errors.push(msg)
          continue
        }
        const club = clubData as Club

        // Fetch all club members
        const { data: memberRows, error: memberError } = await supabase
          .from('club_members')
          .select('user_id')
          .eq('club_id', event.club_id) as { data: { user_id: string }[] | null; error: { message: string } | null }

        if (memberError) {
          const msg = `Event ${event.id}: failed to fetch members — ${memberError.message}`
          console.error('[cron/send-reminders]', msg)
          errors.push(msg)
          continue
        }

        const memberUserIds = (memberRows ?? []).map((m) => m.user_id)

        if (memberUserIds.length === 0) {
          continue
        }

        // Fetch profiles for all club members
        const { data: profileRows, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .in('id', memberUserIds)

        if (profileError) {
          const msg = `Event ${event.id}: failed to fetch profiles — ${profileError.message}`
          console.error('[cron/send-reminders]', msg)
          errors.push(msg)
          continue
        }

        const memberProfiles = (profileRows ?? []) as Profile[]

        // Fetch active registrations for this event to show each member their status
        const { data: registrationRows, error: regError } = await supabase
          .from('race_registrations')
          .select('user_id, primary_role, accept_other_role')
          .eq('race_event_id', event.id)
          .is('cancelled_at', null) as {
            data: { user_id: string; primary_role: string; accept_other_role: boolean }[] | null
            error: { message: string } | null
          }

        if (regError) {
          const msg = `Event ${event.id}: failed to fetch registrations — ${regError.message}`
          console.error('[cron/send-reminders]', msg)
          errors.push(msg)
          continue
        }

        // Build registration map: userId → { primaryRole, acceptOtherRole }
        const registrationMap = new Map<
          string,
          { primaryRole: 'helm' | 'crew'; acceptOtherRole: boolean }
        >()
        for (const reg of registrationRows ?? []) {
          registrationMap.set(reg.user_id, {
            primaryRole: reg.primary_role as 'helm' | 'crew',
            acceptOtherRole: reg.accept_other_role,
          })
        }

        // Send reminder emails
        const count = await sendReminderEmails(club, event, memberProfiles, registrationMap)
        sent += count

        console.log(
          `[cron/send-reminders] Sent ${count} reminders for event ${event.id} (${club.name})`
        )
      } catch (err) {
        const msg = `Event ${event.id}: ${err instanceof Error ? err.message : String(err)}`
        console.error('[cron/send-reminders] Unexpected error:', msg)
        errors.push(msg)
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[cron/send-reminders] Top-level error:', msg)
    return NextResponse.json({ sent, errors: [...errors, msg] }, { status: 500 })
  }

  return NextResponse.json({ sent, errors })
}

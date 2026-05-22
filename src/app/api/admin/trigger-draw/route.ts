/**
 * POST /api/admin/trigger-draw
 *
 * Manually trigger the draw for a race event.
 * Requires the authenticated user to be a race_chair for the event's club.
 *
 * Request body: { eventId: string }
 *
 * Response:
 *   200 { pairsFormed, overflowCount, pairs, overflow }   — draw ran successfully
 *   208 { message }                                       — draw already ran
 *   400 { error }                                         — bad request
 *   401 { error }                                         — not authenticated
 *   403 { error }                                         — not a race chair
 *   404 { error }                                         — event not found
 *   409 { error }                                         — event not in 'upcoming' status
 *   500 { error }                                         — internal error
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { executeDrawForEvent } from '@/lib/draw/execute'
import type { RaceEvent } from '@/lib/types/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // ── Authenticate the calling user ─────────────────────────────────────────────
  const userClient = await createClient()
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Parse and validate request body ───────────────────────────────────────────
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('eventId' in body) ||
    typeof (body as Record<string, unknown>).eventId !== 'string'
  ) {
    return NextResponse.json({ error: 'Missing required field: eventId' }, { status: 400 })
  }

  const { eventId } = body as { eventId: string }

  // ── Fetch the event (using service client to bypass RLS) ──────────────────────
  const serviceClient = await createServiceClient()

  const { data: eventData, error: eventError } = await serviceClient
    .from('race_events')
    .select('*')
    .eq('id', eventId)
    .single()

  if (eventError || !eventData) {
    return NextResponse.json({ error: 'Race event not found' }, { status: 404 })
  }

  const event = eventData as RaceEvent

  // ── Check event is still upcoming ─────────────────────────────────────────────
  if (event.status !== 'upcoming') {
    return NextResponse.json(
      {
        error: `Cannot trigger draw: event status is '${event.status}'. Only 'upcoming' events can be drawn.`,
      },
      { status: 409 }
    )
  }

  // ── Verify the user is a race_chair for this club ─────────────────────────────
  const { data: memberRow, error: memberError } = await serviceClient
    .from('club_members')
    .select('role')
    .eq('club_id', event.club_id)
    .eq('user_id', user.id)
    .single() as { data: { role: string } | null; error: unknown }

  if (memberError || !memberRow) {
    return NextResponse.json(
      { error: 'Forbidden: you are not a member of this club' },
      { status: 403 }
    )
  }

  if (memberRow.role !== 'race_chair') {
    return NextResponse.json(
      { error: 'Forbidden: only race chairs can trigger the draw' },
      { status: 403 }
    )
  }

  // ── Execute the draw ──────────────────────────────────────────────────────────
  let result
  try {
    result = await executeDrawForEvent(serviceClient, eventId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[admin/trigger-draw] Unexpected error:', msg)
    return NextResponse.json({ error: `Draw failed: ${msg}` }, { status: 500 })
  }

  if (result.error) {
    console.error('[admin/trigger-draw] Draw error:', result.error)
    return NextResponse.json({ error: `Draw failed: ${result.error}` }, { status: 500 })
  }

  if (!result.claimed) {
    // Another process already ran the draw at the same time
    return NextResponse.json(
      { message: 'Draw already completed by another process.' },
      { status: 208 }
    )
  }

  // ── Fetch the persisted results to return to the caller ───────────────────────
  const { data: drawResults } = await serviceClient
    .from('draw_results')
    .select('*')
    .eq('race_event_id', eventId)
    .order('boat_number')

  const { data: overflowRecords } = await serviceClient
    .from('overflow_records')
    .select('*')
    .eq('race_event_id', eventId)

  return NextResponse.json({
    pairsFormed: result.pairsFormed,
    overflowCount: result.overflowCount,
    pairs: drawResults ?? [],
    overflow: overflowRecords ?? [],
  })
}

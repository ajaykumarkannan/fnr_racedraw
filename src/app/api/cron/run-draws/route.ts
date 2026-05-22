/**
 * GET /api/cron/run-draws
 *
 * Vercel Cron: runs every minute (* * * * *).
 * Finds all race_events where status = 'upcoming' AND draw_time <= now(),
 * then executes the draw for each.
 *
 * Protected by Authorization: Bearer <CRON_SECRET>.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { executeDrawForEvent } from '@/lib/draw/execute'
import type { RaceEvent } from '@/lib/types/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // ── Auth check ────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('Authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const errors: string[] = []
  let processed = 0

  try {
    // ── Find qualifying events ────────────────────────────────────────────────────
    const now = new Date().toISOString()

    const { data: events, error: fetchError } = await supabase
      .from('race_events')
      .select('id')
      .eq('status', 'upcoming')
      .lte('draw_time', now) as { data: Pick<RaceEvent, 'id'>[] | null; error: { message: string } | null }

    if (fetchError) {
      console.error('[cron/run-draws] Failed to fetch events:', fetchError.message)
      return NextResponse.json(
        { processed: 0, errors: [fetchError.message] },
        { status: 500 }
      )
    }

    if (!events || events.length === 0) {
      return NextResponse.json({ processed: 0, errors: [] })
    }

    // ── Execute draw for each qualifying event ────────────────────────────────────
    for (const event of events) {
      try {
        const result = await executeDrawForEvent(supabase, event.id)

        if (result.error) {
          const msg = `Event ${event.id}: ${result.error}`
          console.error('[cron/run-draws]', msg)
          errors.push(msg)
          continue
        }

        if (result.claimed) {
          processed++
          console.log(
            `[cron/run-draws] Drew event ${event.id}: ` +
              `pairs=${result.pairsFormed} overflow=${result.overflowCount}`
          )
        } else {
          // Already claimed by another process — not an error
          console.log(`[cron/run-draws] Event ${event.id} already claimed, skipping.`)
        }
      } catch (err) {
        const msg = `Event ${event.id}: ${err instanceof Error ? err.message : String(err)}`
        console.error('[cron/run-draws] Unexpected error:', msg)
        errors.push(msg)
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[cron/run-draws] Top-level error:', msg)
    return NextResponse.json({ processed, errors: [...errors, msg] }, { status: 500 })
  }

  return NextResponse.json({ processed, errors })
}

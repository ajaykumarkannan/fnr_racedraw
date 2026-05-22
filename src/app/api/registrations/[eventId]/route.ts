import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { RaceEvent, ClubMember } from '@/lib/types/database'

/**
 * GET /api/registrations/[eventId]
 * Returns registrations for an event.
 * Requires auth + club membership (enforced by Supabase RLS).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Fetch the event first to verify it exists and the user has access via RLS
    const { data: event, error: eventError } = await supabase
      .from('race_events')
      .select('id, club_id, race_date, draw_time, status')
      .eq('id', eventId)
      .single() as { data: Pick<RaceEvent, 'id' | 'club_id' | 'race_date' | 'draw_time' | 'status'> | null; error: { message: string } | null }

    if (eventError || !event) {
      return NextResponse.json({ error: 'Race event not found' }, { status: 404 })
    }

    // Verify the user is a member of the club
    const { data: membership } = await supabase
      .from('club_members')
      .select('id, role')
      .eq('user_id', user.id)
      .eq('club_id', event.club_id)
      .maybeSingle() as { data: Pick<ClubMember, 'id' | 'role'> | null; error: unknown }

    if (!membership) {
      return NextResponse.json(
        { error: 'You must be a member of this club to view registrations' },
        { status: 403 }
      )
    }

    // Fetch active registrations with profiles
    const { data: registrations, error: regError } = await supabase
      .from('race_registrations')
      .select('*, profile:profiles(*)')
      .eq('race_event_id', eventId)
      .is('cancelled_at', null)
      .order('overflow_priority', { ascending: false })
      .order('created_at', { ascending: true })

    if (regError) {
      return NextResponse.json({ error: regError.message }, { status: 500 })
    }

    return NextResponse.json({
      event,
      registrations: registrations ?? [],
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

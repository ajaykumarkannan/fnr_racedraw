'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { computeDrawTime } from '@/lib/utils'
import { RaceEventSchema, RaceEventUpdateSchema } from '@/lib/validations'
import type {
  RaceEvent,
  RaceEventWithSeason,
  Season,
  Club,
  ClubMember,
  RegistrationWithProfile,
} from '@/lib/types/database'

type SBResult<T> = { data: T | null; error: { message: string; code?: string } | null }

// ─── Helper: assert race chair ────────────────────────────────────────────────

async function assertRaceChair(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  clubId: string
): Promise<string | null> {
  const { data: membership } = (await supabase
    .from('club_members')
    .select('role')
    .eq('user_id', userId)
    .eq('club_id', clubId)
    .maybeSingle()) as SBResult<Pick<ClubMember, 'role'>>

  if (!membership || membership.role !== 'race_chair') {
    return 'Only race chairs can manage race events'
  }
  return null
}

// ─── createRaceEvent ──────────────────────────────────────────────────────────

export async function createRaceEvent(
  seasonId: string,
  date: string
): Promise<{ error: string } | { event: RaceEvent }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const parsed = RaceEventSchema.safeParse({ date })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid date' }
  }

  // Fetch season + club timezone
  const { data: season, error: seasonError } = (await supabase
    .from('seasons')
    .select('club_id, clubs(timezone)')
    .eq('id', seasonId)
    .single()) as SBResult<Pick<Season, 'club_id'> & { clubs: Pick<Club, 'timezone'> | null }>

  if (seasonError || !season) return { error: 'Season not found' }

  const clubId = season.club_id
  const timezone = season.clubs?.timezone ?? 'UTC'

  const chairError = await assertRaceChair(supabase, user.id, clubId)
  if (chairError) return { error: chairError }

  const drawTime = computeDrawTime(parsed.data.date, timezone)

  const { data: event, error } = (await supabase
    .from('race_events')
    .insert({
      season_id: seasonId,
      club_id: clubId,
      race_date: parsed.data.date,
      draw_time: drawTime.toISOString(),
      status: 'upcoming',
    } as never)
    .select()
    .single()) as SBResult<RaceEvent>

  if (error) {
    if (error.code === '23505') return { error: 'A race event already exists for that date' }
    return { error: error.message }
  }
  if (!event) return { error: 'Failed to create race event' }

  revalidatePath('/chair')
  revalidatePath('/dashboard')
  return { event }
}

// ─── createBulkRaceEvents ─────────────────────────────────────────────────────

export async function createBulkRaceEvents(
  seasonId: string,
  dates: string[]
): Promise<{ error: string } | { events: RaceEvent[]; skipped: number }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  if (dates.length === 0) return { events: [], skipped: 0 }

  // Validate all dates are Fridays
  for (const date of dates) {
    const parsed = RaceEventSchema.safeParse({ date })
    if (!parsed.success) {
      return {
        error: `Invalid date ${date}: ${parsed.error.issues[0]?.message ?? 'Must be a Friday'}`,
      }
    }
  }

  // Fetch season + club timezone
  const { data: season, error: seasonError } = (await supabase
    .from('seasons')
    .select('club_id, clubs(timezone)')
    .eq('id', seasonId)
    .single()) as SBResult<Pick<Season, 'club_id'> & { clubs: Pick<Club, 'timezone'> | null }>

  if (seasonError || !season) return { error: 'Season not found' }

  const clubId = season.club_id
  const timezone = season.clubs?.timezone ?? 'UTC'

  const chairError = await assertRaceChair(supabase, user.id, clubId)
  if (chairError) return { error: chairError }

  // Build insert rows
  const rows = dates.map((date) => ({
    season_id: seasonId,
    club_id: clubId,
    race_date: date,
    draw_time: computeDrawTime(date, timezone).toISOString(),
    status: 'upcoming' as const,
  }))

  // Use upsert with onConflict to skip duplicates
  const { data: inserted, error } = (await supabase
    .from('race_events')
    .upsert(rows as never[], { onConflict: 'club_id,race_date', ignoreDuplicates: true })
    .select()) as { data: RaceEvent[] | null; error: { message: string } | null }

  if (error) return { error: error.message }

  const events = inserted ?? []
  const skipped = dates.length - events.length

  revalidatePath('/chair')
  revalidatePath('/dashboard')
  return { events, skipped }
}

// ─── updateRaceEvent ──────────────────────────────────────────────────────────

export async function updateRaceEvent(
  eventId: string,
  data: { notes?: string | null; max_boats_override?: number | null }
): Promise<{ error: string } | { event: RaceEvent }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const parsed = RaceEventUpdateSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  // Fetch event to get club_id
  const { data: existing, error: fetchError } = (await supabase
    .from('race_events')
    .select('club_id')
    .eq('id', eventId)
    .single()) as SBResult<Pick<RaceEvent, 'club_id'>>

  if (fetchError || !existing) return { error: 'Race event not found' }

  const chairError = await assertRaceChair(supabase, user.id, existing.club_id)
  if (chairError) return { error: chairError }

  const { data: event, error } = (await supabase
    .from('race_events')
    .update(parsed.data as never)
    .eq('id', eventId)
    .select()
    .single()) as SBResult<RaceEvent>

  if (error) return { error: error.message }
  if (!event) return { error: 'Failed to update race event' }

  revalidatePath('/chair')
  revalidatePath('/dashboard')
  return { event }
}

// ─── cancelRaceEvent ──────────────────────────────────────────────────────────

export async function cancelRaceEvent(
  eventId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: existing, error: fetchError } = (await supabase
    .from('race_events')
    .select('club_id, draw_time, status')
    .eq('id', eventId)
    .single()) as SBResult<Pick<RaceEvent, 'club_id' | 'draw_time' | 'status'>>

  if (fetchError || !existing) return { error: 'Race event not found' }

  const chairError = await assertRaceChair(supabase, user.id, existing.club_id)
  if (chairError) return { error: chairError }

  // Must be before draw_time
  if (new Date() >= new Date(existing.draw_time)) {
    return { error: 'Cannot cancel a race event after the draw time has passed' }
  }

  const { error } = (await supabase
    .from('race_events')
    .update({ status: 'cancelled' } as never)
    .eq('id', eventId)) as SBResult<RaceEvent>

  if (error) return { error: error.message }

  revalidatePath('/chair')
  revalidatePath('/dashboard')
  return { success: true }
}

// ─── getRaceEvents ────────────────────────────────────────────────────────────

export async function getRaceEvents(
  clubId: string
): Promise<{ error: string } | { events: RaceEventWithSeason[] }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data, error } = (await supabase
    .from('race_events')
    .select('*, season:seasons(*)')
    .eq('club_id', clubId)
    .order('race_date', { ascending: false })) as {
    data: RaceEventWithSeason[] | null
    error: { message: string } | null
  }

  if (error) return { error: error.message }
  return { events: data ?? [] }
}

// ─── getUpcomingRaceEvents ────────────────────────────────────────────────────

export async function getUpcomingRaceEvents(
  clubId: string
): Promise<{ error: string } | { events: RaceEventWithSeason[] }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const now = new Date().toISOString()

  const { data, error } = (await supabase
    .from('race_events')
    .select('*, season:seasons(*)')
    .eq('club_id', clubId)
    .eq('status', 'upcoming')
    .gt('draw_time', now)
    .order('race_date', { ascending: true })) as {
    data: RaceEventWithSeason[] | null
    error: { message: string } | null
  }

  if (error) return { error: error.message }
  return { events: data ?? [] }
}

// ─── getRaceEventWithRegistrations ───────────────────────────────────────────

export async function getRaceEventWithRegistrations(eventId: string): Promise<
  | { error: string }
  | {
      event: RaceEvent
      registrations: RegistrationWithProfile[]
    }
> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: event, error: eventError } = (await supabase
    .from('race_events')
    .select('*')
    .eq('id', eventId)
    .single()) as SBResult<RaceEvent>

  if (eventError || !event) return { error: 'Race event not found' }

  const { data: registrations, error: regError } = (await supabase
    .from('race_registrations')
    .select('*, profile:profiles(*)')
    .eq('race_event_id', eventId)
    .order('created_at', { ascending: true })) as {
    data: RegistrationWithProfile[] | null
    error: { message: string } | null
  }

  if (regError) return { error: regError.message }

  return {
    event,
    registrations: registrations ?? [],
  }
}

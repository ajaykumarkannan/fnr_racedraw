'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { RegistrationSchema } from '@/lib/validations'
import type {
  RaceEvent,
  RaceRegistration,
  RegistrationWithProfile,
  RegistrationWithRaceEvent,
} from '@/lib/types/database'

type SBResult<T> = { data: T | null; error: { message: string; code?: string } | null }

// ─── registerForRace ──────────────────────────────────────────────────────────

export async function registerForRace(
  eventId: string,
  primaryRole: 'helm' | 'crew',
  acceptOtherRole: boolean
): Promise<{ error: string } | { registration: RaceRegistration }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const parsed = RegistrationSchema.safeParse({
    primary_role: primaryRole,
    accept_other_role: acceptOtherRole,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  // Fetch event — must be upcoming and draw_time > now
  const { data: event, error: eventError } = (await supabase
    .from('race_events')
    .select('id, club_id, race_date, draw_time, status')
    .eq('id', eventId)
    .single()) as SBResult<Pick<RaceEvent, 'id' | 'club_id' | 'race_date' | 'draw_time' | 'status'>>

  if (eventError || !event) return { error: 'Race event not found' }
  if (event.status !== 'upcoming') return { error: 'This race event is not open for registration' }
  if (new Date() >= new Date(event.draw_time)) {
    return { error: 'Registration is closed — draw time has passed' }
  }

  // Compute overflow_priority via DB function
  const { data: priority, error: priorityError } = (await (supabase.rpc as Function)(
    'compute_overflow_priority',
    {
      p_user_id: user.id,
      p_club_id: event.club_id,
      p_target_race_date: event.race_date,
    }
  )) as { data: number | null; error: { message: string } | null }

  if (priorityError) return { error: priorityError.message }
  const overflowPriority = priority ?? 0

  // Check for existing registration (including cancelled)
  const { data: existing } = (await supabase
    .from('race_registrations')
    .select('id, cancelled_at')
    .eq('user_id', user.id)
    .eq('race_event_id', eventId)
    .maybeSingle()) as SBResult<Pick<RaceRegistration, 'id' | 'cancelled_at'>>

  let registration: RaceRegistration

  if (existing) {
    // Update existing (re-register or update cancelled)
    const { data: updated, error: updateError } = (await supabase
      .from('race_registrations')
      .update({
        primary_role: parsed.data.primary_role,
        accept_other_role: parsed.data.accept_other_role,
        overflow_priority: overflowPriority,
        cancelled_at: null,
      } as never)
      .eq('id', existing.id)
      .select()
      .single()) as SBResult<RaceRegistration>

    if (updateError) return { error: updateError.message }
    if (!updated) return { error: 'Failed to update registration' }
    registration = updated
  } else {
    // Insert new
    const { data: inserted, error: insertError } = (await supabase
      .from('race_registrations')
      .insert({
        user_id: user.id,
        race_event_id: eventId,
        primary_role: parsed.data.primary_role,
        accept_other_role: parsed.data.accept_other_role,
        overflow_priority: overflowPriority,
      } as never)
      .select()
      .single()) as SBResult<RaceRegistration>

    if (insertError) return { error: insertError.message }
    if (!inserted) return { error: 'Failed to create registration' }
    registration = inserted
  }

  revalidatePath('/dashboard')
  return { registration }
}

// ─── cancelRegistration ───────────────────────────────────────────────────────

export async function cancelRegistration(
  eventId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Fetch event to check draw_time
  const { data: event, error: eventError } = (await supabase
    .from('race_events')
    .select('draw_time')
    .eq('id', eventId)
    .single()) as SBResult<Pick<RaceEvent, 'draw_time'>>

  if (eventError || !event) return { error: 'Race event not found' }

  if (new Date() >= new Date(event.draw_time)) {
    return { error: 'Cannot cancel — draw time has already passed' }
  }

  const { error } = (await supabase
    .from('race_registrations')
    .update({ cancelled_at: new Date().toISOString() } as never)
    .eq('user_id', user.id)
    .eq('race_event_id', eventId)
    .is('cancelled_at', null)) as SBResult<RaceRegistration>

  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  return { success: true }
}

// ─── bulkRegisterForSeason ────────────────────────────────────────────────────

export async function bulkRegisterForSeason(
  seasonId: string,
  primaryRole: 'helm' | 'crew',
  acceptOtherRole: boolean
): Promise<{ error: string } | { registered: number; skipped: number }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const parsed = RegistrationSchema.safeParse({
    primary_role: primaryRole,
    accept_other_role: acceptOtherRole,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const now = new Date().toISOString()

  // Get all upcoming events in this season where draw_time > now
  const { data: events, error: eventsError } = (await supabase
    .from('race_events')
    .select('id, club_id, race_date, draw_time')
    .eq('season_id', seasonId)
    .eq('status', 'upcoming')
    .gt('draw_time', now)
    .order('race_date', { ascending: true })) as {
    data: Pick<RaceEvent, 'id' | 'club_id' | 'race_date' | 'draw_time'>[] | null
    error: { message: string } | null
  }

  if (eventsError) return { error: eventsError.message }
  if (!events || events.length === 0) return { registered: 0, skipped: 0 }

  // Get existing non-cancelled registrations for these events
  const eventIds = events.map((e) => e.id)
  const { data: existingRegs } = (await supabase
    .from('race_registrations')
    .select('race_event_id')
    .eq('user_id', user.id)
    .in('race_event_id', eventIds)
    .is('cancelled_at', null)) as {
    data: Pick<RaceRegistration, 'race_event_id'>[] | null
    error: { message: string } | null
  }

  const alreadyRegisteredIds = new Set((existingRegs ?? []).map((r) => r.race_event_id))

  let registered = 0
  let skipped = 0

  for (const event of events) {
    if (alreadyRegisteredIds.has(event.id)) {
      skipped++
      continue
    }

    // Compute overflow priority per event
    const { data: priority } = (await (supabase.rpc as Function)('compute_overflow_priority', {
      p_user_id: user.id,
      p_club_id: event.club_id,
      p_target_race_date: event.race_date,
    })) as { data: number | null; error: { message: string } | null }

    const overflowPriority = priority ?? 0

    // Check if a cancelled registration exists to update
    const { data: cancelledReg } = (await supabase
      .from('race_registrations')
      .select('id')
      .eq('user_id', user.id)
      .eq('race_event_id', event.id)
      .not('cancelled_at', 'is', null)
      .maybeSingle()) as SBResult<Pick<RaceRegistration, 'id'>>

    if (cancelledReg) {
      await supabase
        .from('race_registrations')
        .update({
          primary_role: parsed.data.primary_role,
          accept_other_role: parsed.data.accept_other_role,
          overflow_priority: overflowPriority,
          cancelled_at: null,
        } as never)
        .eq('id', cancelledReg.id)
    } else {
      await supabase.from('race_registrations').insert({
        user_id: user.id,
        race_event_id: event.id,
        primary_role: parsed.data.primary_role,
        accept_other_role: parsed.data.accept_other_role,
        overflow_priority: overflowPriority,
      } as never)
    }

    registered++
  }

  revalidatePath('/dashboard')
  return { registered, skipped }
}

// ─── bulkCancelForSeason ──────────────────────────────────────────────────────

export async function bulkCancelForSeason(
  seasonId: string
): Promise<{ error: string } | { cancelled: number }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const now = new Date().toISOString()

  // Get upcoming events in this season where draw_time > now
  const { data: events, error: eventsError } = (await supabase
    .from('race_events')
    .select('id')
    .eq('season_id', seasonId)
    .eq('status', 'upcoming')
    .gt('draw_time', now)) as {
    data: Pick<RaceEvent, 'id'>[] | null
    error: { message: string } | null
  }

  if (eventsError) return { error: eventsError.message }
  if (!events || events.length === 0) return { cancelled: 0 }

  const eventIds = events.map((e) => e.id)

  const { data: updated, error } = (await supabase
    .from('race_registrations')
    .update({ cancelled_at: new Date().toISOString() } as never)
    .eq('user_id', user.id)
    .in('race_event_id', eventIds)
    .is('cancelled_at', null)
    .select('id')) as { data: { id: string }[] | null; error: { message: string } | null }

  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  return { cancelled: updated?.length ?? 0 }
}

// ─── getMyRegistrations ───────────────────────────────────────────────────────

export async function getMyRegistrations(
  clubId: string
): Promise<{ error: string } | { registrations: RegistrationWithRaceEvent[] }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Join via race_events to filter by club_id
  const { data, error } = (await supabase
    .from('race_registrations')
    .select('*, race_event:race_events!inner(*)')
    .eq('user_id', user.id)
    .eq('race_event.club_id', clubId)
    .order('created_at', { ascending: false })) as {
    data: RegistrationWithRaceEvent[] | null
    error: { message: string } | null
  }

  if (error) return { error: error.message }
  return { registrations: data ?? [] }
}

// ─── getRegistrationsForEvent ─────────────────────────────────────────────────

export async function getRegistrationsForEvent(
  eventId: string
): Promise<{ error: string } | { registrations: RegistrationWithProfile[] }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data, error } = (await supabase
    .from('race_registrations')
    .select('*, profile:profiles(*)')
    .eq('race_event_id', eventId)
    .is('cancelled_at', null)
    .order('overflow_priority', { ascending: false })
    .order('created_at', { ascending: true })) as {
    data: RegistrationWithProfile[] | null
    error: { message: string } | null
  }

  if (error) return { error: error.message }
  return { registrations: data ?? [] }
}

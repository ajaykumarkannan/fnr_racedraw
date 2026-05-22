'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { SeasonSchema } from '@/lib/validations'
import type { Season, ClubMember } from '@/lib/types/database'

type SBResult<T> = { data: T | null; error: { message: string; code?: string } | null }
type SBCountResult = { count: number | null; error: { message: string } | null }

// ─── createSeason ─────────────────────────────────────────────────────────────

export async function createSeason(
  clubId: string,
  data: { name: string; year: number }
): Promise<{ error: string } | { season: Season }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Must be race_chair
  const { data: membership } = (await supabase
    .from('club_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('club_id', clubId)
    .maybeSingle()) as SBResult<Pick<ClubMember, 'role'>>

  if (!membership || membership.role !== 'race_chair') {
    return { error: 'Only race chairs can create seasons' }
  }

  const parsed = SeasonSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { data: season, error } = (await supabase
    .from('seasons')
    .insert({
      club_id: clubId,
      name: parsed.data.name,
      year: parsed.data.year,
      created_by: user.id,
    } as never)
    .select()
    .single()) as SBResult<Season>

  if (error) return { error: error.message }
  if (!season) return { error: 'Failed to create season' }

  revalidatePath('/chair')
  return { season }
}

// ─── activateSeason ───────────────────────────────────────────────────────────

export async function activateSeason(
  seasonId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Get season to find club_id
  const { data: season, error: fetchError } = (await supabase
    .from('seasons')
    .select('club_id')
    .eq('id', seasonId)
    .single()) as SBResult<Pick<Season, 'club_id'>>

  if (fetchError || !season) return { error: 'Season not found' }

  // Must be race_chair
  const { data: membership } = (await supabase
    .from('club_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('club_id', season.club_id)
    .maybeSingle()) as SBResult<Pick<ClubMember, 'role'>>

  if (!membership || membership.role !== 'race_chair') {
    return { error: 'Only race chairs can activate seasons' }
  }

  // Atomically: deactivate all other seasons for this club, then activate target.
  // Step 1: deactivate all others
  const { error: deactivateError } = (await supabase
    .from('seasons')
    .update({ is_active: false } as never)
    .eq('club_id', season.club_id)
    .neq('id', seasonId)) as SBResult<Season>

  if (deactivateError) return { error: deactivateError.message }

  // Step 2: activate target
  const { error: activateError } = (await supabase
    .from('seasons')
    .update({ is_active: true } as never)
    .eq('id', seasonId)) as SBResult<Season>

  if (activateError) return { error: activateError.message }

  revalidatePath('/chair')
  return { success: true }
}

// ─── deactivateSeason ─────────────────────────────────────────────────────────

export async function deactivateSeason(
  seasonId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Get season to find club_id
  const { data: season, error: fetchError } = (await supabase
    .from('seasons')
    .select('club_id')
    .eq('id', seasonId)
    .single()) as SBResult<Pick<Season, 'club_id'>>

  if (fetchError || !season) return { error: 'Season not found' }

  // Must be race_chair
  const { data: membership } = (await supabase
    .from('club_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('club_id', season.club_id)
    .maybeSingle()) as SBResult<Pick<ClubMember, 'role'>>

  if (!membership || membership.role !== 'race_chair') {
    return { error: 'Only race chairs can deactivate seasons' }
  }

  const { error } = (await supabase
    .from('seasons')
    .update({ is_active: false } as never)
    .eq('id', seasonId)) as SBResult<Season>

  if (error) return { error: error.message }

  revalidatePath('/chair')
  return { success: true }
}

// ─── getSeasons ───────────────────────────────────────────────────────────────

export async function getSeasons(
  clubId: string
): Promise<{ error: string } | { seasons: Season[] }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data, error } = (await supabase
    .from('seasons')
    .select('*')
    .eq('club_id', clubId)
    .order('year', { ascending: false })) as {
    data: Season[] | null
    error: { message: string } | null
  }

  if (error) return { error: error.message }
  return { seasons: data ?? [] }
}

// ─── deleteSeason ─────────────────────────────────────────────────────────────

export async function deleteSeason(
  seasonId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Get season to find club_id
  const { data: season, error: fetchError } = (await supabase
    .from('seasons')
    .select('club_id')
    .eq('id', seasonId)
    .single()) as SBResult<Pick<Season, 'club_id'>>

  if (fetchError || !season) return { error: 'Season not found' }

  // Must be race_chair
  const { data: membership } = (await supabase
    .from('club_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('club_id', season.club_id)
    .maybeSingle()) as SBResult<Pick<ClubMember, 'role'>>

  if (!membership || membership.role !== 'race_chair') {
    return { error: 'Only race chairs can delete seasons' }
  }

  // Check no race_events exist for this season
  const { count } = (await supabase
    .from('race_events')
    .select('id', { count: 'exact', head: true })
    .eq('season_id', seasonId)) as SBCountResult

  if ((count ?? 0) > 0) {
    return {
      error:
        'Cannot delete a season that has race events — cancel or delete all events first',
    }
  }

  const { error } = await supabase.from('seasons').delete().eq('id', seasonId)

  if (error) return { error: (error as { message: string }).message }

  revalidatePath('/chair')
  return { success: true }
}

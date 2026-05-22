'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils'
import { ClubSchema, ClubUpdateSchema } from '@/lib/validations'
import type {
  Club,
  ClubMember,
  ClubMemberWithProfile,
  ClubMemberWithClub,
} from '@/lib/types/database'

// ─── Type cast helpers ────────────────────────────────────────────────────────
// Supabase's generic type inference doesn't resolve perfectly with our hand-crafted
// Database type, so we cast query results to their known shapes.

type SBResult<T> = { data: T | null; error: { message: string; code?: string } | null }
type SBCountResult = { count: number | null; error: { message: string } | null }

// ─── createClub ───────────────────────────────────────────────────────────────

export async function createClub(
  formData: FormData
): Promise<{ error: string } | { club: Club }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const parsed = ClubSchema.safeParse({
    name: formData.get('name'),
    timezone: formData.get('timezone'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { name, timezone } = parsed.data
  const slug = slugify(name)

  // Insert club
  const { data: club, error: clubError } = (await supabase
    .from('clubs')
    .insert({ name, slug, timezone, created_by: user.id } as never)
    .select()
    .single()) as SBResult<Club>

  if (clubError) {
    if (clubError.code === '23505') return { error: 'A club with that name already exists' }
    return { error: clubError.message }
  }
  if (!club) return { error: 'Failed to create club' }

  // Add creator as race_chair
  const { error: memberError } = (await supabase
    .from('club_members')
    .insert({ user_id: user.id, club_id: club.id, role: 'race_chair' } as never)) as SBResult<ClubMember>

  if (memberError) return { error: memberError.message }

  revalidatePath('/dashboard')
  revalidatePath('/chair')
  return { club }
}

// ─── searchClubs ──────────────────────────────────────────────────────────────

export async function searchClubs(
  query: string
): Promise<{ error: string } | { clubs: Club[] }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: clubs, error } = (await supabase
    .from('clubs')
    .select('*')
    .ilike('name_lower', `%${query.toLowerCase()}%`)
    .limit(20)) as { data: Club[] | null; error: { message: string } | null }

  if (error) return { error: error.message }
  return { clubs: clubs ?? [] }
}

// ─── joinClub ─────────────────────────────────────────────────────────────────

export async function joinClub(clubId: string): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Check not already a member
  const { data: existing } = (await supabase
    .from('club_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('club_id', clubId)
    .maybeSingle()) as SBResult<{ id: string }>

  if (existing) return { error: 'You are already a member of this club' }

  const { error } = (await supabase
    .from('club_members')
    .insert({ user_id: user.id, club_id: clubId, role: 'member' } as never)) as SBResult<ClubMember>

  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  return { success: true }
}

// ─── leaveClub ────────────────────────────────────────────────────────────────

export async function leaveClub(clubId: string): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Get current membership
  const { data: membership } = (await supabase
    .from('club_members')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('club_id', clubId)
    .maybeSingle()) as SBResult<Pick<ClubMember, 'id' | 'role'>>

  if (!membership) return { error: 'You are not a member of this club' }

  // If race_chair, check they are not the only one
  if (membership.role === 'race_chair') {
    const { count } = (await supabase
      .from('club_members')
      .select('id', { count: 'exact', head: true })
      .eq('club_id', clubId)
      .eq('role', 'race_chair')) as SBCountResult

    if ((count ?? 0) <= 1) {
      return { error: 'You are the only race chair — promote another member before leaving' }
    }
  }

  const { error } = await supabase
    .from('club_members')
    .delete()
    .eq('user_id', user.id)
    .eq('club_id', clubId)

  if (error) return { error: (error as { message: string }).message }

  revalidatePath('/dashboard')
  return { success: true }
}

// ─── updateClub ───────────────────────────────────────────────────────────────

export async function updateClub(
  clubId: string,
  data: { name?: string; timezone?: string; max_boats_per_race?: number | null }
): Promise<{ error: string } | { club: Club }> {
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
    return { error: 'Only race chairs can update club settings' }
  }

  const parsed = ClubUpdateSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const updateData: { name?: string; slug?: string; timezone?: string; max_boats_per_race?: number | null } = {}
  if (parsed.data.name !== undefined) {
    updateData.name = parsed.data.name
    updateData.slug = slugify(parsed.data.name)
  }
  if (parsed.data.timezone !== undefined) updateData.timezone = parsed.data.timezone
  if (parsed.data.max_boats_per_race !== undefined)
    updateData.max_boats_per_race = parsed.data.max_boats_per_race

  const { data: club, error } = (await supabase
    .from('clubs')
    .update(updateData as never)
    .eq('id', clubId)
    .select()
    .single()) as SBResult<Club>

  if (error) {
    if (error.code === '23505') return { error: 'A club with that name already exists' }
    return { error: error.message }
  }
  if (!club) return { error: 'Failed to update club' }

  revalidatePath('/chair')
  revalidatePath(`/clubs/${club.slug}`)
  return { club }
}

// ─── promoteToRaceChair ───────────────────────────────────────────────────────

export async function promoteToRaceChair(
  clubId: string,
  userId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Caller must be race_chair
  const { data: callerMembership } = (await supabase
    .from('club_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('club_id', clubId)
    .maybeSingle()) as SBResult<Pick<ClubMember, 'role'>>

  if (!callerMembership || callerMembership.role !== 'race_chair') {
    return { error: 'Only race chairs can promote members' }
  }

  const { error } = (await supabase
    .from('club_members')
    .update({ role: 'race_chair' } as never)
    .eq('user_id', userId)
    .eq('club_id', clubId)) as SBResult<ClubMember>

  if (error) return { error: error.message }

  revalidatePath('/chair')
  return { success: true }
}

// ─── demoteFromRaceChair ──────────────────────────────────────────────────────

export async function demoteFromRaceChair(
  clubId: string,
  userId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Caller must be race_chair
  const { data: callerMembership } = (await supabase
    .from('club_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('club_id', clubId)
    .maybeSingle()) as SBResult<Pick<ClubMember, 'role'>>

  if (!callerMembership || callerMembership.role !== 'race_chair') {
    return { error: 'Only race chairs can demote members' }
  }

  // Cannot demote self if last chair
  if (userId === user.id) {
    const { count } = (await supabase
      .from('club_members')
      .select('id', { count: 'exact', head: true })
      .eq('club_id', clubId)
      .eq('role', 'race_chair')) as SBCountResult

    if ((count ?? 0) <= 1) {
      return { error: 'You cannot demote yourself — you are the only race chair' }
    }
  }

  const { error } = (await supabase
    .from('club_members')
    .update({ role: 'member' } as never)
    .eq('user_id', userId)
    .eq('club_id', clubId)) as SBResult<ClubMember>

  if (error) return { error: error.message }

  revalidatePath('/chair')
  return { success: true }
}

// ─── getClubMembers ───────────────────────────────────────────────────────────

export async function getClubMembers(
  clubId: string
): Promise<{ error: string } | { members: ClubMemberWithProfile[] }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data, error } = (await supabase
    .from('club_members')
    .select('*, profile:profiles(*)')
    .eq('club_id', clubId)
    .order('joined_at', { ascending: true })) as {
    data: ClubMemberWithProfile[] | null
    error: { message: string } | null
  }

  if (error) return { error: error.message }
  return { members: data ?? [] }
}

// ─── getMyClubs ───────────────────────────────────────────────────────────────

export async function getMyClubs(): Promise<
  { error: string } | { memberships: ClubMemberWithClub[] }
> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data, error } = (await supabase
    .from('club_members')
    .select('*, club:clubs(*)')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true })) as {
    data: ClubMemberWithClub[] | null
    error: { message: string } | null
  }

  if (error) return { error: error.message }
  return { memberships: data ?? [] }
}

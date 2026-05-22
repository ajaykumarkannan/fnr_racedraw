import { shuffle } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DrawParticipant {
  userId: string
  name: string
  email: string
  primaryRole: 'helm' | 'crew'
  acceptOtherRole: boolean
  overflowPriority: number
  registrationId: string
}

export interface DrawPair {
  helmUserId: string
  crewUserId: string
  helmPlayedNonPrimary: boolean
  crewPlayedNonPrimary: boolean
  boatNumber: number
}

export interface DrawOutput {
  pairs: DrawPair[]
  overflow: DrawParticipant[]
  overflowReason: Map<string, 'unmatched' | 'boat_limit' | 'no_pair_available'>
  boatLimitApplied: boolean
  effectiveBoatLimit: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sort participants by overflowPriority DESC, with Fisher-Yates shuffle applied
 * within each priority group. Higher priority users appear first.
 */
function sortByPriority(arr: DrawParticipant[]): DrawParticipant[] {
  if (arr.length === 0) return []

  // Group by priority
  const groups = new Map<number, DrawParticipant[]>()
  for (const p of arr) {
    const group = groups.get(p.overflowPriority) ?? []
    group.push(p)
    groups.set(p.overflowPriority, group)
  }

  // Sort priority keys descending, shuffle within each group
  const sortedKeys = [...groups.keys()].sort((a, b) => b - a)
  const result: DrawParticipant[] = []
  for (const key of sortedKeys) {
    result.push(...shuffle(groups.get(key)!))
  }
  return result
}

// ─── Main draw algorithm ──────────────────────────────────────────────────────

/**
 * Run the draw algorithm for a race event.
 *
 * @param participants - All active registrants for the race event
 * @param maxBoats     - Effective boat limit (null = unlimited). Should already
 *                       reflect max_boats_override ?? club.max_boats_per_race.
 */
export function runDraw(
  participants: DrawParticipant[],
  maxBoats: number | null
): DrawOutput {
  const effectiveBoatLimit = maxBoats !== null && maxBoats > 0 ? maxBoats : null

  // ── Step 1: Partition ────────────────────────────────────────────────────────
  const rigidHelms = participants.filter(
    (p) => p.primaryRole === 'helm' && !p.acceptOtherRole
  )
  const rigidCrews = participants.filter(
    (p) => p.primaryRole === 'crew' && !p.acceptOtherRole
  )
  // Flexible users: have acceptOtherRole = true, may be helm or crew primary
  const flexHelms = participants.filter(
    (p) => p.primaryRole === 'helm' && p.acceptOtherRole
  )
  const flexCrews = participants.filter(
    (p) => p.primaryRole === 'crew' && p.acceptOtherRole
  )

  // ── Step 2: Sort each group by priority DESC, shuffle within same priority ──
  const sortedRigidHelms = sortByPriority(rigidHelms)
  const sortedRigidCrews = sortByPriority(rigidCrews)
  const sortedFlexHelms = sortByPriority(flexHelms)
  const sortedFlexCrews = sortByPriority(flexCrews)

  // ── Step 3: Start with rigid users in their primary pools ───────────────────
  const helmPrimary = sortedRigidHelms
  const crewPrimary = sortedRigidCrews

  // ── Step 4: Distribute flexible users to fill deficits ──────────────────────
  const helmDeficit = Math.max(0, crewPrimary.length - helmPrimary.length)
  const crewDeficit = Math.max(0, helmPrimary.length - crewPrimary.length)

  let toHelm: DrawParticipant[] = []
  let toCrew: DrawParticipant[] = []

  if (helmDeficit > 0) {
    // Fill helm deficit: prefer flex users with primary_role === 'helm' first
    const flexCombined = [...sortedFlexHelms, ...sortedFlexCrews]
    toHelm = flexCombined.slice(0, helmDeficit)
    toCrew = flexCombined.slice(helmDeficit)
  } else if (crewDeficit > 0) {
    // Fill crew deficit: prefer flex users with primary_role === 'crew' first
    const flexCombined = [...sortedFlexCrews, ...sortedFlexHelms]
    toCrew = flexCombined.slice(0, crewDeficit)
    toHelm = flexCombined.slice(crewDeficit)
  } else {
    // Pools are balanced — assign each flexible user to their primary role
    toHelm = sortedFlexHelms
    toCrew = sortedFlexCrews
  }

  // ── Step 5: Build final pools ────────────────────────────────────────────────
  const helmPool: DrawParticipant[] = [...helmPrimary, ...toHelm]
  const crewPool: DrawParticipant[] = [...crewPrimary, ...toCrew]

  // ── Step 6: Determine pair count ─────────────────────────────────────────────
  const pairCount = Math.min(helmPool.length, crewPool.length)

  // ── Step 7: Apply boat limit ──────────────────────────────────────────────────
  const actualPairs =
    effectiveBoatLimit !== null ? Math.min(pairCount, effectiveBoatLimit) : pairCount
  const boatLimitApplied = effectiveBoatLimit !== null && pairCount > effectiveBoatLimit

  // ── Step 8: Create pairs ─────────────────────────────────────────────────────
  const pairs: DrawPair[] = []
  const pairedUserIds = new Set<string>()

  for (let i = 0; i < actualPairs; i++) {
    const helm = helmPool[i]
    const crew = crewPool[i]
    pairs.push({
      helmUserId: helm.userId,
      crewUserId: crew.userId,
      helmPlayedNonPrimary: helm.primaryRole === 'crew', // moved to helm pool from crew primary
      crewPlayedNonPrimary: crew.primaryRole === 'helm', // moved to crew pool from helm primary
      boatNumber: i + 1,
    })
    pairedUserIds.add(helm.userId)
    pairedUserIds.add(crew.userId)
  }

  // ── Step 9: Compute overflow ──────────────────────────────────────────────────
  const overflow = participants.filter((p) => !pairedUserIds.has(p.userId))
  const overflowReason = new Map<string, 'unmatched' | 'boat_limit' | 'no_pair_available'>()

  // Build sets of who was in the pools but cut by boat limit
  const helmPoolCutUserIds = new Set(helmPool.slice(actualPairs).map((p) => p.userId))
  const crewPoolCutUserIds = new Set(crewPool.slice(actualPairs).map((p) => p.userId))

  // Users not in any pool (rigid users that couldn't be placed due to no opposite role)
  const allPooledUserIds = new Set([
    ...helmPool.map((p) => p.userId),
    ...crewPool.map((p) => p.userId),
  ])

  for (const p of overflow) {
    if (helmPoolCutUserIds.has(p.userId) || crewPoolCutUserIds.has(p.userId)) {
      // They were in a pool but got cut by the boat limit
      overflowReason.set(p.userId, 'boat_limit')
    } else if (!allPooledUserIds.has(p.userId)) {
      // They were never placed in a pool — rigid user with no matching role partner
      overflowReason.set(p.userId, 'no_pair_available')
    } else {
      // In a pool, but pool was larger than the opposite pool (surplus role)
      overflowReason.set(p.userId, 'unmatched')
    }
  }

  return {
    pairs,
    overflow,
    overflowReason,
    boatLimitApplied,
    effectiveBoatLimit,
  }
}

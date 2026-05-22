import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Club } from '@/lib/types/database'

/**
 * GET /api/clubs/search?q=query
 * Public endpoint — returns matching clubs with member count.
 * No auth required (clubs are publicly viewable per RLS).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.trim() ?? ''

  if (query.length < 1) {
    return NextResponse.json({ clubs: [] })
  }

  try {
    const supabase = await createClient()

    const { data: clubs, error } = await supabase
      .from('clubs')
      .select('id, name, slug, timezone, max_boats_per_race, created_at')
      .ilike('name_lower', `%${query.toLowerCase()}%`)
      .limit(20)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // For each club, get member count
    const clubsWithCount = await Promise.all(
      ((clubs ?? []) as Club[]).map(async (club) => {
        const { count } = await supabase
          .from('club_members')
          .select('id', { count: 'exact', head: true })
          .eq('club_id', club.id)

        return { ...club, member_count: count ?? 0 }
      })
    )

    return NextResponse.json({ clubs: clubsWithCount })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

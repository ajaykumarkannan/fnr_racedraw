'use server'

import { createClient } from '@/lib/supabase/server'
import type {
  DrawResultWithProfiles,
  OverflowRecordWithProfile,
} from '@/lib/types/database'

export async function getDrawResults(
  eventId: string
): Promise<{ error: string } | { results: DrawResultWithProfiles[]; overflow: OverflowRecordWithProfile[] }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: results, error: resultsError } = (await supabase
    .from('draw_results')
    .select('*, helm:profiles!draw_results_helm_user_id_fkey(*), crew:profiles!draw_results_crew_user_id_fkey(*)')
    .eq('race_event_id', eventId)
    .order('boat_number', { ascending: true })) as {
    data: DrawResultWithProfiles[] | null
    error: { message: string } | null
  }

  if (resultsError) return { error: resultsError.message }

  const { data: overflow, error: overflowError } = (await supabase
    .from('overflow_records')
    .select('*, profile:profiles(*)')
    .eq('race_event_id', eventId)) as {
    data: OverflowRecordWithProfile[] | null
    error: { message: string } | null
  }

  if (overflowError) return { error: overflowError.message }

  return {
    results: results ?? [],
    overflow: overflow ?? [],
  }
}

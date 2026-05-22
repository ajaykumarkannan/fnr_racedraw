import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { DashboardClient } from './client'
import type { ClubMemberWithClub, RaceEvent, RaceRegistration } from '@/lib/types/database'

export const metadata: Metadata = {
  title: 'Dashboard — FNR RaceDraw',
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data: memberships } = await supabase
    .from('club_members')
    .select('*, club:clubs(*)')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true }) as {
    data: ClubMemberWithClub[] | null
    error: unknown
  }

  if (!memberships || memberships.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-md">
          <h1 className="text-3xl font-bold">Welcome to FNR RaceDraw</h1>
          <p className="text-muted-foreground">
            You haven&apos;t joined any clubs yet. Search for your sailing club to get started.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center h-11 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          >
            Find a Club
          </Link>
        </div>
      </main>
    )
  }

  const defaultClubId = memberships[memberships.length - 1].club_id

  const { data: allEvents } = await supabase
    .from('race_events')
    .select('*')
    .eq('club_id', defaultClubId)
    .order('race_date', { ascending: true }) as {
    data: RaceEvent[] | null
    error: unknown
  }

  const { data: allRegistrations } = await supabase
    .from('race_registrations')
    .select('*')
    .eq('user_id', user.id) as {
    data: RaceRegistration[] | null
    error: unknown
  }

  const { data: activeSeasonData } = await supabase
    .from('seasons')
    .select('id')
    .eq('club_id', defaultClubId)
    .eq('is_active', true)
    .maybeSingle() as { data: { id: string } | null; error: unknown }

  return (
    <DashboardClient
      memberships={memberships}
      initialClubId={defaultClubId}
      initialEvents={allEvents ?? []}
      initialRegistrations={allRegistrations ?? []}
      activeSeasonId={activeSeasonData?.id ?? null}
    />
  )
}

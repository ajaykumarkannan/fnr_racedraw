import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatInTz } from '@/lib/utils'
import type { Club, RaceEvent } from '@/lib/types/database'

type SBResult<T> = { data: T | null; error: unknown }

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: club } = await supabase
    .from('clubs')
    .select('name')
    .eq('slug', slug)
    .maybeSingle() as SBResult<Pick<Club, 'name'>>

  return {
    title: club ? `${club.name} — FNR RaceDraw` : 'Club Not Found',
  }
}

export default async function ClubProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: club } = await supabase
    .from('clubs')
    .select('*')
    .eq('slug', slug)
    .maybeSingle() as SBResult<Club>

  if (!club) notFound()

  const now = new Date().toISOString()
  const { data: upcomingEvents } = await supabase
    .from('race_events')
    .select('id, race_date, draw_time')
    .eq('club_id', club.id)
    .eq('status', 'upcoming')
    .gt('draw_time', now)
    .order('race_date', { ascending: true })
    .limit(20) as SBResult<Pick<RaceEvent, 'id' | 'race_date' | 'draw_time'>[]>

  return (
    <main className="min-h-screen px-4 py-12 max-w-2xl mx-auto space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{club.name}</h1>
        <p className="text-muted-foreground">Timezone: {club.timezone}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Upcoming Race Dates</CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingEvents && upcomingEvents.length > 0 ? (
            <ul className="space-y-2">
              {upcomingEvents.map((event) => (
                <li key={event.id} className="text-sm">
                  {formatInTz(event.race_date + 'T12:00:00Z', club.timezone, 'EEEE, d MMMM yyyy')}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No upcoming races scheduled.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href={`/auth/signup?club=${club.slug}`}
          className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
        >
          Join This Club
        </Link>
        <Link
          href="/auth/login"
          className="inline-flex items-center justify-center h-9 px-4 rounded-lg border border-input bg-background text-sm font-medium hover:bg-muted"
        >
          Log In
        </Link>
      </div>
    </main>
  )
}

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import type { ClubMemberWithClub } from '@/lib/types/database'

export default async function ChairHomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: memberships } = await supabase
    .from('club_members')
    .select('*, club:clubs(*)')
    .eq('user_id', user.id)
    .eq('role', 'race_chair') as { data: ClubMemberWithClub[] | null; error: unknown }

  if (!memberships || memberships.length === 0) redirect('/dashboard')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Race Chair Dashboard</h1>
      <p className="text-muted-foreground">
        Manage your clubs, seasons, race events, and members.
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        {memberships.map((m) => (
          <Card key={m.club_id}>
            <CardHeader>
              <CardTitle className="text-base">{m.club.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">{m.club.timezone}</p>
              {m.club.max_boats_per_race && (
                <p className="text-sm text-muted-foreground">
                  Boat limit: {m.club.max_boats_per_race}
                </p>
              )}
              <div className="flex gap-2 pt-2">
                <Link
                  href="/chair/events"
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  Manage Events
                </Link>
                <Link
                  href="/chair/seasons"
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  Seasons
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

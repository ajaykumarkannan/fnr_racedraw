'use client'

import { useState, useMemo } from 'react'
import { ClubSelector } from '@/components/dashboard/club-selector'
import { UpcomingRaces } from '@/components/dashboard/upcoming-races'
import { PastRaces } from '@/components/dashboard/past-races'
import { BulkActions } from '@/components/dashboard/bulk-actions'
import { PriorityCard } from '@/components/dashboard/priority-card'
import type { ClubMemberWithClub, RaceEvent, RaceRegistration } from '@/lib/types/database'

interface DashboardClientProps {
  memberships: ClubMemberWithClub[]
  initialClubId: string
  initialEvents: RaceEvent[]
  initialRegistrations: RaceRegistration[]
  activeSeasonId: string | null
}

export function DashboardClient({
  memberships,
  initialClubId,
  initialEvents,
  initialRegistrations,
  activeSeasonId,
}: DashboardClientProps) {
  const [selectedClubId, setSelectedClubId] = useState(initialClubId)

  const selectedClub = memberships.find((m) => m.club_id === selectedClubId)?.club
  const timezone = selectedClub?.timezone ?? 'UTC'

  const clubEvents = useMemo(
    () => initialEvents.filter((e) => e.club_id === selectedClubId),
    [initialEvents, selectedClubId]
  )

  const registrationMap = useMemo(() => {
    const map = new Map<string, RaceRegistration>()
    for (const reg of initialRegistrations) {
      if (!reg.cancelled_at) {
        map.set(reg.race_event_id, reg)
      }
    }
    return map
  }, [initialRegistrations])

  const upcomingEvents = useMemo(
    () => clubEvents.filter((e) => e.status === 'upcoming'),
    [clubEvents]
  )

  const pastEvents = useMemo(
    () => clubEvents.filter((e) => e.status !== 'upcoming').reverse(),
    [clubEvents]
  )

  const currentPriority = useMemo(() => {
    let maxPriority = 0
    for (const reg of initialRegistrations) {
      if (!reg.cancelled_at && reg.overflow_priority > maxPriority) {
        const event = clubEvents.find((e) => e.id === reg.race_event_id)
        if (event && event.club_id === selectedClubId) {
          maxPriority = reg.overflow_priority
        }
      }
    }
    return maxPriority
  }, [initialRegistrations, clubEvents, selectedClubId])

  const membership = memberships.find((m) => m.club_id === selectedClubId)

  return (
    <main className="min-h-screen px-4 py-8 max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <ClubSelector
            memberships={memberships}
            selectedClubId={selectedClubId}
            onSelect={setSelectedClubId}
          />
          {membership?.role === 'race_chair' && (
            <a
              href="/chair"
              className="inline-flex items-center justify-center h-7 px-2.5 rounded-lg border border-input bg-background text-sm hover:bg-muted"
            >
              Admin
            </a>
          )}
        </div>
      </div>

      {selectedClub && (
        <p className="text-sm text-muted-foreground">{selectedClub.name} · {timezone}</p>
      )}

      <PriorityCard priority={currentPriority} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Upcoming Races</h2>
        <BulkActions seasonId={activeSeasonId} />
        <UpcomingRaces
          events={upcomingEvents}
          registrations={registrationMap}
          timezone={timezone}
        />
      </section>

      <section>
        <PastRaces
          events={pastEvents}
          registrations={registrationMap}
          timezone={timezone}
        />
      </section>
    </main>
  )
}

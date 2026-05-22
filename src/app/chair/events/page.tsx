'use client'

import { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { getMyClubs } from '@/lib/actions/clubs'
import { getSeasons } from '@/lib/actions/seasons'
import {
  getRaceEvents,
  createRaceEvent,
  createBulkRaceEvents,
  cancelRaceEvent,
} from '@/lib/actions/race-events'
import { formatDrawTime } from '@/lib/utils'
import { RACE_STATUS_LABELS, PAGINATION } from '@/lib/constants'
import type { RaceEventWithSeason, Season, ClubMemberWithClub } from '@/lib/types/database'

export default function EventsPage() {
  const [memberships, setMemberships] = useState<ClubMemberWithClub[]>([])
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null)
  const [events, setEvents] = useState<RaceEventWithSeason[]>([])
  const [page, setPage] = useState(0)
  const [showCreate, setShowCreate] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [showTrigger, setShowTrigger] = useState<string | null>(null)
  const [singleDate, setSingleDate] = useState('')
  const [bulkStart, setBulkStart] = useState('')
  const [bulkEnd, setBulkEnd] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    startTransition(async () => {
      const result = await getMyClubs()
      if ('memberships' in result) {
        const chairs = result.memberships.filter((m) => m.role === 'race_chair')
        setMemberships(chairs)
        if (chairs.length > 0) setSelectedClubId(chairs[0].club_id)
      }
    })
  }, [])

  useEffect(() => {
    if (!selectedClubId) return
    startTransition(async () => {
      const seasonResult = await getSeasons(selectedClubId)
      if ('seasons' in seasonResult) {
        setSeasons(seasonResult.seasons)
        const active = seasonResult.seasons.find((s) => s.is_active)
        setSelectedSeasonId(active?.id ?? seasonResult.seasons[0]?.id ?? null)
      }
      const eventResult = await getRaceEvents(selectedClubId)
      if ('events' in eventResult) setEvents(eventResult.events)
    })
  }, [selectedClubId])

  const selectedClub = memberships.find((m) => m.club_id === selectedClubId)?.club
  const timezone = selectedClub?.timezone ?? 'UTC'

  const filteredEvents = selectedSeasonId
    ? events.filter((e) => e.season_id === selectedSeasonId)
    : events

  const pageSize = PAGINATION.RACES_PER_PAGE
  const totalPages = Math.ceil(filteredEvents.length / pageSize)
  const displayedEvents = filteredEvents.slice(page * pageSize, (page + 1) * pageSize)

  function handleCreateSingle() {
    if (!selectedSeasonId || !singleDate) return
    setError(null)
    startTransition(async () => {
      const result = await createRaceEvent(selectedSeasonId, singleDate)
      if ('error' in result) {
        setError(result.error)
      } else {
        setShowCreate(false)
        setSingleDate('')
        if (selectedClubId) {
          const refresh = await getRaceEvents(selectedClubId)
          if ('events' in refresh) setEvents(refresh.events)
        }
      }
    })
  }

  function handleCreateBulk() {
    if (!selectedSeasonId || !bulkStart || !bulkEnd) return
    setError(null)
    const start = new Date(bulkStart)
    const end = new Date(bulkEnd)
    const fridays: string[] = []
    const current = new Date(start)
    while (current.getDay() !== 5) current.setDate(current.getDate() + 1)
    while (current <= end) {
      fridays.push(current.toISOString().split('T')[0])
      current.setDate(current.getDate() + 7)
    }
    if (fridays.length === 0) {
      setError('No Fridays found in that range')
      return
    }
    startTransition(async () => {
      const result = await createBulkRaceEvents(selectedSeasonId, fridays)
      if ('error' in result) {
        setError(result.error)
      } else {
        setMessage(`Created ${result.events.length} events (${result.skipped} duplicates skipped)`)
        setShowBulk(false)
        setBulkStart('')
        setBulkEnd('')
        if (selectedClubId) {
          const refresh = await getRaceEvents(selectedClubId)
          if ('events' in refresh) setEvents(refresh.events)
        }
      }
    })
  }

  function handleCancel(eventId: string) {
    startTransition(async () => {
      const result = await cancelRaceEvent(eventId)
      if ('error' in result) {
        setError(result.error)
      } else {
        if (selectedClubId) {
          const refresh = await getRaceEvents(selectedClubId)
          if ('events' in refresh) setEvents(refresh.events)
        }
      }
    })
  }

  async function handleTriggerDraw(eventId: string) {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/trigger-draw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'Draw trigger failed')
        } else {
          setMessage(`Draw complete: ${data.pairsFormed} pairs, ${data.overflowCount} overflow`)
          if (selectedClubId) {
            const refresh = await getRaceEvents(selectedClubId)
            if ('events' in refresh) setEvents(refresh.events)
          }
        }
      } catch (err) {
        setError('Network error triggering draw')
      }
      setShowTrigger(null)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Race Events</h1>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowCreate(true)} disabled={!selectedSeasonId}>
            Create Event
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowBulk(true)} disabled={!selectedSeasonId}>
            Bulk Create
          </Button>
        </div>
      </div>

      {memberships.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {memberships.map((m) => (
            <Button
              key={m.club_id}
              variant={selectedClubId === m.club_id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedClubId(m.club_id)}
            >
              {m.club.name}
            </Button>
          ))}
        </div>
      )}

      {seasons.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {seasons.map((s) => (
            <Button
              key={s.id}
              variant={selectedSeasonId === s.id ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => { setSelectedSeasonId(s.id); setPage(0) }}
            >
              {s.name} {s.is_active && '(Active)'}
            </Button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <div className="space-y-3">
        {displayedEvents.length === 0 && (
          <p className="text-muted-foreground text-sm">No events found.</p>
        )}
        {displayedEvents.map((event) => (
          <Card key={event.id}>
            <CardContent className="py-4 px-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium">{event.race_date}</p>
                  <p className="text-xs text-muted-foreground">
                    Draw: {formatDrawTime(event.draw_time, timezone)}
                  </p>
                  <div className="flex gap-2 items-center">
                    <Badge variant={event.status === 'upcoming' ? 'default' : 'secondary'}>
                      {RACE_STATUS_LABELS[event.status]}
                    </Badge>
                    {event.max_boats_override && (
                      <span className="text-xs text-muted-foreground">
                        Limit: {event.max_boats_override} (override)
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/chair/events/${event.id}/registrations`}
                    className="inline-flex items-center justify-center h-7 px-2.5 rounded-lg border border-input bg-background text-sm hover:bg-muted"
                  >
                    Registrations
                  </Link>
                  {event.status === 'draw_complete' && (
                    <Link
                      href={`/chair/events/${event.id}/results`}
                      className="inline-flex items-center justify-center h-7 px-2.5 rounded-lg border border-input bg-background text-sm hover:bg-muted"
                    >
                      Results
                    </Link>
                  )}
                  {event.status === 'upcoming' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowTrigger(event.id)}
                        disabled={isPending}
                      >
                        Trigger Draw
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleCancel(event.id)}
                        disabled={isPending}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-sm self-center">{page + 1} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}

      {/* Create Single Event Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Race Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Date (must be a Friday)</Label>
              <Input type="date" value={singleDate} onChange={(e) => setSingleDate(e.target.value)} />
            </div>
            <Button className="w-full" onClick={handleCreateSingle} disabled={isPending || !singleDate}>
              {isPending ? 'Creating…' : 'Create Event'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Create Dialog */}
      <Dialog open={showBulk} onOpenChange={setShowBulk}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Create Events</DialogTitle>
            <DialogDescription>
              All Fridays between the start and end dates will be created as race events.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={bulkStart} onChange={(e) => setBulkStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input type="date" value={bulkEnd} onChange={(e) => setBulkEnd(e.target.value)} />
            </div>
            <Button className="w-full" onClick={handleCreateBulk} disabled={isPending || !bulkStart || !bulkEnd}>
              {isPending ? 'Creating…' : 'Create All Fridays'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Trigger Draw Confirmation */}
      <Dialog open={!!showTrigger} onOpenChange={() => setShowTrigger(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trigger Draw</DialogTitle>
            <DialogDescription>
              This will run the draw now and cannot be undone. Pairing emails will be sent to all club members.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowTrigger(null)} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={() => showTrigger && handleTriggerDraw(showTrigger)}
              disabled={isPending}
              className="flex-1"
            >
              {isPending ? 'Running…' : 'Run Draw Now'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

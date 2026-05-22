'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatInTz } from '@/lib/utils'
import { PAGINATION, RACE_STATUS_LABELS } from '@/lib/constants'
import type { RaceEvent, RaceRegistration } from '@/lib/types/database'

interface PastRacesProps {
  events: RaceEvent[]
  registrations: Map<string, RaceRegistration>
  timezone: string
}

export function PastRaces({ events, registrations, timezone }: PastRacesProps) {
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState(false)

  if (events.length === 0) return null

  const pageSize = PAGINATION.PAST_RACES_PER_PAGE
  const totalPages = Math.ceil(events.length / pageSize)
  const displayed = events.slice(page * pageSize, (page + 1) * pageSize)

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <CardTitle className="text-base flex items-center justify-between">
          Past Races ({events.length})
          <span className="text-sm text-muted-foreground">{expanded ? '▲' : '▼'}</span>
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-2">
          {displayed.map((event) => {
            const reg = registrations.get(event.id)
            const isRegistered = reg && !reg.cancelled_at
            return (
              <div key={event.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">
                    {formatInTz(event.race_date + 'T12:00:00Z', timezone, 'EEE, d MMM yyyy')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {RACE_STATUS_LABELS[event.status]}
                  </p>
                </div>
                <div>
                  {isRegistered ? (
                    <Badge variant="secondary" className="text-xs">
                      {reg.primary_role === 'helm' ? 'Helm' : 'Crew'}
                    </Badge>
                  ) : reg?.cancelled_at ? (
                    <Badge variant="outline" className="text-xs">Cancelled</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not Registered</span>
                  )}
                </div>
              </div>
            )
          })}

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground self-center">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

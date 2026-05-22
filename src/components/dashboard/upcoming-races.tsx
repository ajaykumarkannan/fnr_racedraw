'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { registerForRace, cancelRegistration } from '@/lib/actions/registrations'
import { formatInTz, relativeTime } from '@/lib/utils'
import type { RaceEvent, RaceRegistration } from '@/lib/types/database'

interface UpcomingRacesProps {
  events: RaceEvent[]
  registrations: Map<string, RaceRegistration>
  timezone: string
}

export function UpcomingRaces({ events, registrations, timezone }: UpcomingRacesProps) {
  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No upcoming races. Check back soon!
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <RaceRow
          key={event.id}
          event={event}
          registration={registrations.get(event.id) ?? null}
          timezone={timezone}
        />
      ))}
    </div>
  )
}

function RaceRow({
  event,
  registration,
  timezone,
}: {
  event: RaceEvent
  registration: RaceRegistration | null
  timezone: string
}) {
  const [isPending, startTransition] = useTransition()
  const [role, setRole] = useState<'helm' | 'crew'>(registration?.primary_role ?? 'helm')
  const [acceptOther, setAcceptOther] = useState(registration?.accept_other_role ?? false)
  const [error, setError] = useState<string | null>(null)

  const isRegistered = registration !== null && registration.cancelled_at === null
  const drawPassed = new Date() >= new Date(event.draw_time)
  const drawClosesIn = relativeTime(event.draw_time)

  function handleRegister() {
    setError(null)
    startTransition(async () => {
      const result = await registerForRace(event.id, role, acceptOther)
      if ('error' in result) setError(result.error)
    })
  }

  function handleCancel() {
    setError(null)
    startTransition(async () => {
      const result = await cancelRegistration(event.id)
      if ('error' in result) setError(result.error)
    })
  }

  function handleUpdateRole(newRole: 'helm' | 'crew') {
    setRole(newRole)
    if (isRegistered) {
      startTransition(async () => {
        const result = await registerForRace(event.id, newRole, acceptOther)
        if ('error' in result) setError(result.error)
      })
    }
  }

  function handleUpdateAcceptOther(checked: boolean) {
    setAcceptOther(checked)
    if (isRegistered) {
      startTransition(async () => {
        const result = await registerForRace(event.id, role, checked)
        if ('error' in result) setError(result.error)
      })
    }
  }

  return (
    <Card>
      <CardContent className="py-4 px-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <p className="font-medium">
              {formatInTz(event.race_date + 'T12:00:00Z', timezone, 'EEEE, d MMMM yyyy')}
            </p>
            <p className="text-sm text-muted-foreground">
              Draw closes {drawClosesIn}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isRegistered && (
              <Badge variant="secondary">
                {registration.primary_role === 'helm' ? 'Helm' : 'Crew'}
                {registration.accept_other_role && ' (flexible)'}
              </Badge>
            )}
            {registration && registration.overflow_priority > 0 && (
              <Badge variant="outline">Priority: {registration.overflow_priority}</Badge>
            )}
          </div>
        </div>

        {!drawPassed && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Select value={role} onValueChange={(v) => { if (v) handleUpdateRole(v as 'helm' | 'crew') }} disabled={isPending}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="helm">Helm</SelectItem>
                <SelectItem value="crew">Crew</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Switch
                id={`accept-${event.id}`}
                checked={acceptOther}
                onCheckedChange={handleUpdateAcceptOther}
                disabled={isPending}
              />
              <Label htmlFor={`accept-${event.id}`} className="text-sm">
                Accept other role
              </Label>
            </div>

            {isRegistered ? (
              <Button variant="outline" size="sm" onClick={handleCancel} disabled={isPending}>
                Unregister
              </Button>
            ) : (
              <Button size="sm" onClick={handleRegister} disabled={isPending}>
                Register
              </Button>
            )}
          </div>
        )}

        {drawPassed && !isRegistered && (
          <p className="text-sm text-muted-foreground">Registration closed</p>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

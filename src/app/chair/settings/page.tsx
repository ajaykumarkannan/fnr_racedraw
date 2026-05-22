'use client'

import { useState, useEffect, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getMyClubs, updateClub } from '@/lib/actions/clubs'
import { TIMEZONES, TIMEZONE_REGIONS } from '@/lib/constants'
import type { ClubMemberWithClub } from '@/lib/types/database'

export default function ClubSettingsPage() {
  const [memberships, setMemberships] = useState<ClubMemberWithClub[]>([])
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState('')
  const [maxBoats, setMaxBoats] = useState<string>('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  useEffect(() => {
    startTransition(async () => {
      const result = await getMyClubs()
      if ('memberships' in result) {
        const chairs = result.memberships.filter((m) => m.role === 'race_chair')
        setMemberships(chairs)
        if (chairs.length > 0) {
          setSelectedClubId(chairs[0].club_id)
          setName(chairs[0].club.name)
          setTimezone(chairs[0].club.timezone)
          setMaxBoats(chairs[0].club.max_boats_per_race?.toString() ?? '')
        }
      }
    })
  }, [])

  function handleClubSwitch(clubId: string) {
    setSelectedClubId(clubId)
    const club = memberships.find((m) => m.club_id === clubId)?.club
    if (club) {
      setName(club.name)
      setTimezone(club.timezone)
      setMaxBoats(club.max_boats_per_race?.toString() ?? '')
    }
  }

  function handleSave() {
    if (!selectedClubId) return
    setError(null)
    setSuccess(false)
    const data: { name?: string; timezone?: string; max_boats_per_race?: number | null } = {}
    const current = memberships.find((m) => m.club_id === selectedClubId)?.club
    if (current && name !== current.name) data.name = name
    if (current && timezone !== current.timezone) data.timezone = timezone
    const boatsNum = maxBoats ? parseInt(maxBoats, 10) : null
    if (current && boatsNum !== current.max_boats_per_race) data.max_boats_per_race = boatsNum

    if (Object.keys(data).length === 0) return

    startTransition(async () => {
      const result = await updateClub(selectedClubId!, data)
      if ('error' in result) {
        setError(result.error)
      } else {
        setSuccess(true)
      }
    })
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Club Settings</h1>

      {memberships.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {memberships.map((m) => (
            <Button
              key={m.club_id}
              variant={selectedClubId === m.club_id ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleClubSwitch(m.club_id)}
            >
              {m.club.name}
            </Button>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Club Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-green-600">Settings saved.</p>}

          <div className="space-y-2">
            <Label htmlFor="club-name">Club Name</Label>
            <Input id="club-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Timezone</Label>
            <Select value={timezone} onValueChange={(v) => { if (v) setTimezone(v) }}>
              <SelectTrigger>
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONE_REGIONS.map((region) => (
                  <div key={region}>
                    <p className="text-xs text-muted-foreground px-2 py-1 font-semibold">{region}</p>
                    {TIMEZONES.filter((tz) => tz.region === region).map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-boats">Max Boats Per Race (club default)</Label>
            <Input
              id="max-boats"
              type="number"
              min={1}
              max={100}
              placeholder="No limit"
              value={maxBoats}
              onChange={(e) => setMaxBoats(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty for no limit. Individual events can override this.
            </p>
          </div>

          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? 'Saving…' : 'Save Settings'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

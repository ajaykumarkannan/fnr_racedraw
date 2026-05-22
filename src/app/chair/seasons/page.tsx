'use client'

import { useState, useEffect, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getMyClubs } from '@/lib/actions/clubs'
import { createSeason, activateSeason, deactivateSeason, getSeasons } from '@/lib/actions/seasons'
import type { Season, ClubMemberWithClub } from '@/lib/types/database'

export default function SeasonsPage() {
  const [memberships, setMemberships] = useState<ClubMemberWithClub[]>([])
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)
  const [seasons, setSeasons] = useState<Season[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    startTransition(async () => {
      const result = await getMyClubs()
      if ('memberships' in result) {
        const chairs = result.memberships.filter((m) => m.role === 'race_chair')
        setMemberships(chairs)
        if (chairs.length > 0) {
          setSelectedClubId(chairs[0].club_id)
        }
      }
    })
  }, [])

  useEffect(() => {
    if (!selectedClubId) return
    startTransition(async () => {
      const result = await getSeasons(selectedClubId)
      if ('seasons' in result) setSeasons(result.seasons)
    })
  }, [selectedClubId])

  function handleCreate() {
    if (!selectedClubId || !name.trim()) return
    setError(null)
    startTransition(async () => {
      const result = await createSeason(selectedClubId, { name: name.trim(), year })
      if ('error' in result) {
        setError(result.error)
      } else {
        setShowCreate(false)
        setName('')
        const refreshed = await getSeasons(selectedClubId)
        if ('seasons' in refreshed) setSeasons(refreshed.seasons)
      }
    })
  }

  function handleActivate(seasonId: string) {
    startTransition(async () => {
      await activateSeason(seasonId)
      if (selectedClubId) {
        const refreshed = await getSeasons(selectedClubId)
        if ('seasons' in refreshed) setSeasons(refreshed.seasons)
      }
    })
  }

  function handleDeactivate(seasonId: string) {
    startTransition(async () => {
      await deactivateSeason(seasonId)
      if (selectedClubId) {
        const refreshed = await getSeasons(selectedClubId)
        if ('seasons' in refreshed) setSeasons(refreshed.seasons)
      }
    })
  }

  const selectedClub = memberships.find((m) => m.club_id === selectedClubId)?.club

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Seasons</h1>
        <Button onClick={() => setShowCreate(true)} disabled={!selectedClubId}>
          Create Season
        </Button>
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

      {selectedClub && (
        <p className="text-sm text-muted-foreground">{selectedClub.name}</p>
      )}

      <div className="space-y-3">
        {seasons.length === 0 && (
          <p className="text-muted-foreground text-sm">No seasons created yet.</p>
        )}
        {seasons.map((season) => (
          <Card key={season.id}>
            <CardContent className="py-4 px-4 flex items-center justify-between">
              <div>
                <p className="font-medium">{season.name}</p>
                <p className="text-sm text-muted-foreground">{season.year}</p>
              </div>
              <div className="flex items-center gap-2">
                {season.is_active ? (
                  <>
                    <Badge>Active</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeactivate(season.id)}
                      disabled={isPending}
                    >
                      Deactivate
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleActivate(season.id)}
                    disabled={isPending}
                  >
                    Activate
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Season</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="season-name">Season Name</Label>
              <Input
                id="season-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Summer 2026"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="season-year">Year</Label>
              <Input
                id="season-year"
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                min={2020}
                max={2030}
              />
            </div>
            <Button className="w-full" onClick={handleCreate} disabled={isPending || !name.trim()}>
              {isPending ? 'Creating…' : 'Create Season'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

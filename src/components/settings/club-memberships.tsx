'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { leaveClub } from '@/lib/actions/clubs'
import type { ClubMemberWithClub } from '@/lib/types/database'

interface ClubMembershipsProps {
  memberships: ClubMemberWithClub[]
}

export function ClubMemberships({ memberships }: ClubMembershipsProps) {
  const [isPending, startTransition] = useTransition()
  const [leaving, setLeaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleLeave(clubId: string) {
    setError(null)
    startTransition(async () => {
      const result = await leaveClub(clubId)
      if ('error' in result) setError(result.error)
      setLeaving(null)
    })
  }

  if (memberships.length === 0) {
    return <p className="text-sm text-muted-foreground">You haven&apos;t joined any clubs yet.</p>
  }

  const clubToLeave = memberships.find((m) => m.club_id === leaving)

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {memberships.map((m) => (
        <div key={m.id} className="flex items-center justify-between py-2 border-b last:border-0">
          <div>
            <p className="font-medium text-sm">{m.club.name}</p>
            <p className="text-xs text-muted-foreground">{m.club.timezone}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={m.role === 'race_chair' ? 'default' : 'secondary'}>
              {m.role === 'race_chair' ? 'Race Chair' : 'Member'}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLeaving(m.club_id)}
              disabled={isPending}
            >
              Leave
            </Button>
          </div>
        </div>
      ))}

      <Dialog open={!!leaving} onOpenChange={() => setLeaving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave Club</DialogTitle>
            <DialogDescription>
              Are you sure you want to leave {clubToLeave?.club.name}? Your upcoming registrations
              for this club will be cancelled.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => setLeaving(null)} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => leaving && handleLeave(leaving)}
              disabled={isPending}
              className="flex-1"
            >
              {isPending ? 'Leaving…' : 'Leave Club'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

'use client'

import { useState, useEffect, useTransition } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  getMyClubs,
  getClubMembers,
  promoteToRaceChair,
  demoteFromRaceChair,
} from '@/lib/actions/clubs'
import { PAGINATION } from '@/lib/constants'
import type { ClubMemberWithClub, ClubMemberWithProfile } from '@/lib/types/database'

export default function MembersPage() {
  const [memberships, setMemberships] = useState<ClubMemberWithClub[]>([])
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)
  const [members, setMembers] = useState<ClubMemberWithProfile[]>([])
  const [page, setPage] = useState(0)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{
    type: 'promote' | 'demote'
    userId: string
    name: string
  } | null>(null)

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
    refreshMembers()
  }, [selectedClubId])

  function refreshMembers() {
    if (!selectedClubId) return
    startTransition(async () => {
      const result = await getClubMembers(selectedClubId)
      if ('members' in result) setMembers(result.members)
    })
  }

  function handlePromote(userId: string) {
    if (!selectedClubId) return
    setError(null)
    startTransition(async () => {
      const result = await promoteToRaceChair(selectedClubId, userId)
      if ('error' in result) setError(result.error)
      else refreshMembers()
      setConfirmAction(null)
    })
  }

  function handleDemote(userId: string) {
    if (!selectedClubId) return
    setError(null)
    startTransition(async () => {
      const result = await demoteFromRaceChair(selectedClubId, userId)
      if ('error' in result) setError(result.error)
      else refreshMembers()
      setConfirmAction(null)
    })
  }

  const pageSize = PAGINATION.MEMBERS_PER_PAGE
  const totalPages = Math.ceil(members.length / pageSize)
  const displayed = members.slice(page * pageSize, (page + 1) * pageSize)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Members</h1>

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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayed.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No members.
                  </TableCell>
                </TableRow>
              )}
              {displayed.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.profile.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {member.profile.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.role === 'race_chair' ? 'default' : 'secondary'}>
                      {member.role === 'race_chair' ? 'Race Chair' : 'Member'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {member.role === 'member' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setConfirmAction({
                            type: 'promote',
                            userId: member.user_id,
                            name: member.profile.name,
                          })
                        }
                        disabled={isPending}
                      >
                        Promote
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setConfirmAction({
                            type: 'demote',
                            userId: member.user_id,
                            name: member.profile.name,
                          })
                        }
                        disabled={isPending}
                      >
                        Demote
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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

      <Dialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.type === 'promote' ? 'Promote to Race Chair' : 'Demote to Member'}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.type === 'promote'
                ? `Are you sure you want to promote ${confirmAction.name} to Race Chair?`
                : `Are you sure you want to demote ${confirmAction?.name} to Member?`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => setConfirmAction(null)} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (confirmAction?.type === 'promote') handlePromote(confirmAction.userId)
                else if (confirmAction) handleDemote(confirmAction.userId)
              }}
              disabled={isPending}
              className="flex-1"
            >
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

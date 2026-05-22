'use client'

import { useState, useEffect, useTransition } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getRegistrationsForEvent } from '@/lib/actions/registrations'
import { PAGINATION } from '@/lib/constants'
import type { RegistrationWithProfile } from '@/lib/types/database'

export default function RegistrationsPage() {
  const params = useParams()
  const eventId = params.eventId as string
  const [registrations, setRegistrations] = useState<RegistrationWithProfile[]>([])
  const [page, setPage] = useState(0)
  const [sortByPriority, setSortByPriority] = useState(true)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    startTransition(async () => {
      const result = await getRegistrationsForEvent(eventId)
      if ('registrations' in result) setRegistrations(result.registrations)
    })
  }, [eventId])

  const sorted = [...registrations].sort((a, b) =>
    sortByPriority
      ? b.overflow_priority - a.overflow_priority
      : a.created_at.localeCompare(b.created_at)
  )

  const pageSize = PAGINATION.REGISTRATIONS_PER_PAGE
  const totalPages = Math.ceil(sorted.length / pageSize)
  const displayed = sorted.slice(page * pageSize, (page + 1) * pageSize)

  const helmCount = registrations.filter((r) => r.primary_role === 'helm' && !r.accept_other_role).length
  const crewCount = registrations.filter((r) => r.primary_role === 'crew' && !r.accept_other_role).length
  const flexCount = registrations.filter((r) => r.accept_other_role).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Registrations</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSortByPriority(!sortByPriority)}
        >
          Sort by: {sortByPriority ? 'Priority' : 'Date'}
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Badge variant="outline">Total: {registrations.length}</Badge>
        <Badge variant="outline">Helm: {helmCount}</Badge>
        <Badge variant="outline">Crew: {crewCount}</Badge>
        <Badge variant="outline">Flexible: {flexCount}</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Primary Role</TableHead>
                <TableHead>Accept Other</TableHead>
                <TableHead>Priority</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayed.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No registrations yet.
                  </TableCell>
                </TableRow>
              )}
              {displayed.map((reg) => (
                <TableRow key={reg.id}>
                  <TableCell className="font-medium">{reg.profile.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {reg.primary_role === 'helm' ? 'Helm' : 'Crew'}
                    </Badge>
                  </TableCell>
                  <TableCell>{reg.accept_other_role ? 'Yes' : 'No'}</TableCell>
                  <TableCell>
                    {reg.overflow_priority > 0 ? (
                      <Badge>{reg.overflow_priority}</Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
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
    </div>
  )
}

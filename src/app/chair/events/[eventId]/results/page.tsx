'use client'

import { useState, useEffect, useTransition } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getDrawResults } from '@/lib/actions/draw-results'
import type { DrawResultWithProfiles, OverflowRecordWithProfile } from '@/lib/types/database'

export default function DrawResultsPage() {
  const params = useParams()
  const eventId = params.eventId as string
  const [results, setResults] = useState<DrawResultWithProfiles[]>([])
  const [overflow, setOverflow] = useState<OverflowRecordWithProfile[]>([])
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    startTransition(async () => {
      const data = await getDrawResults(eventId)
      if ('error' in data) {
        setError(data.error)
      } else {
        setResults(data.results)
        setOverflow(data.overflow)
      }
    })
  }, [eventId])

  if (error) {
    return <p className="text-destructive">{error}</p>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Draw Results</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Pairings ({results.length} boats)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>Helm</TableHead>
                <TableHead>Crew</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    No pairings.
                  </TableCell>
                </TableRow>
              )}
              {results.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.boat_number}</TableCell>
                  <TableCell>
                    {r.helm.name}
                    {r.helm_played_non_primary && (
                      <Badge variant="outline" className="ml-2 text-xs">non-primary</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.crew.name}
                    {r.crew_played_non_primary && (
                      <Badge variant="outline" className="ml-2 text-xs">non-primary</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {overflow.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Overflow ({overflow.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Priority at Draw</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overflow.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>{o.profile.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {o.primary_role === 'helm' ? 'Helm' : 'Crew'}
                        {o.accept_other_role && ' (flexible)'}
                      </Badge>
                    </TableCell>
                    <TableCell>{o.priority_at_draw}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

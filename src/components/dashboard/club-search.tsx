'use client'

import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { searchClubs, joinClub } from '@/lib/actions/clubs'
import type { Club } from '@/lib/types/database'

export function ClubSearch({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Club[]>([])
  const [searched, setSearched] = useState(false)
  const [joining, setJoining] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSearch() {
    if (query.trim().length < 2) return
    setError(null)
    startTransition(async () => {
      const result = await searchClubs(query.trim())
      if ('error' in result) {
        setError(result.error)
        setResults([])
      } else {
        setResults(result.clubs)
      }
      setSearched(true)
    })
  }

  function handleJoin(clubId: string) {
    setJoining(clubId)
    startTransition(async () => {
      const result = await joinClub(clubId)
      if ('error' in result) {
        setError(result.error)
      }
      setJoining(null)
    })
  }

  return (
    <div className="w-full max-w-xl mx-auto space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Search clubs by name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <Button onClick={handleSearch} disabled={isPending || query.trim().length < 2}>
          {isPending ? 'Searching…' : 'Search'}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {searched && results.length === 0 && !error && (
        <p className="text-sm text-muted-foreground text-center">No clubs found.</p>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((club) => (
            <Card key={club.id}>
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div>
                  <p className="font-medium">{club.name}</p>
                  <p className="text-sm text-muted-foreground">{club.timezone}</p>
                </div>
                <div className="flex gap-2">
                  <a
                    href={`/clubs/${club.slug}`}
                    className="inline-flex items-center justify-center h-7 px-2.5 rounded-lg border border-input bg-background text-sm hover:bg-muted"
                  >
                    View
                  </a>
                  {isAuthenticated ? (
                    <Button
                      size="sm"
                      onClick={() => handleJoin(club.id)}
                      disabled={joining === club.id}
                    >
                      {joining === club.id ? 'Joining…' : 'Join'}
                    </Button>
                  ) : (
                    <a
                      href={`/auth/signup?club=${club.slug}`}
                      className="inline-flex items-center justify-center h-7 px-2.5 rounded-lg bg-primary text-primary-foreground text-sm"
                    >
                      Join
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

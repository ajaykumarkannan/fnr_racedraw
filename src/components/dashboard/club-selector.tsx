'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ClubMemberWithClub } from '@/lib/types/database'

interface ClubSelectorProps {
  memberships: ClubMemberWithClub[]
  selectedClubId: string
  onSelect: (clubId: string) => void
}

export function ClubSelector({ memberships, selectedClubId, onSelect }: ClubSelectorProps) {
  if (memberships.length <= 1) return null

  return (
    <Select value={selectedClubId} onValueChange={(v) => { if (v) onSelect(v) }}>
      <SelectTrigger className="w-full sm:w-[280px]">
        <SelectValue placeholder="Select a club" />
      </SelectTrigger>
      <SelectContent>
        {memberships.map((m) => (
          <SelectItem key={m.club_id} value={m.club_id}>
            {m.club.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

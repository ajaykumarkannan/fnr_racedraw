import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { ClubMemberWithClub } from '@/lib/types/database'

export default async function ChairLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: memberships } = await supabase
    .from('club_members')
    .select('*, club:clubs(*)')
    .eq('user_id', user.id)
    .eq('role', 'race_chair') as { data: ClubMemberWithClub[] | null; error: unknown }

  if (!memberships || memberships.length === 0) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen">
      <nav className="border-b bg-muted/30 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-6 overflow-x-auto">
          <Link href="/chair" className="font-semibold text-sm whitespace-nowrap">
            Race Chair
          </Link>
          <Link href="/chair/seasons" className="text-sm text-muted-foreground hover:text-foreground whitespace-nowrap">
            Seasons
          </Link>
          <Link href="/chair/events" className="text-sm text-muted-foreground hover:text-foreground whitespace-nowrap">
            Events
          </Link>
          <Link href="/chair/members" className="text-sm text-muted-foreground hover:text-foreground whitespace-nowrap">
            Members
          </Link>
          <Link href="/chair/settings" className="text-sm text-muted-foreground hover:text-foreground whitespace-nowrap">
            Club Settings
          </Link>
          <div className="flex-1" />
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground whitespace-nowrap">
            Back to Dashboard
          </Link>
        </div>
      </nav>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {children}
      </div>
    </div>
  )
}

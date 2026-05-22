import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ProfileForm } from '@/components/settings/profile-form'
import { ClubMemberships } from '@/components/settings/club-memberships'
import { createClient } from '@/lib/supabase/server'
import type { ClubMemberWithClub } from '@/lib/types/database'

export const metadata: Metadata = {
  title: 'Profile Settings',
}

export default async function ProfileSettingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error || !profile) {
    redirect('/auth/login')
  }

  const { data: memberships } = await supabase
    .from('club_members')
    .select('*, club:clubs(*)')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true }) as {
    data: ClubMemberWithClub[] | null
    error: unknown
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profile Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your account information
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your profile</CardTitle>
          <CardDescription>Update your name and phone number</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm profile={profile} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Club Memberships</CardTitle>
          <CardDescription>Clubs you belong to</CardDescription>
        </CardHeader>
        <CardContent>
          <ClubMemberships memberships={memberships ?? []} />
        </CardContent>
      </Card>
    </div>
  )
}

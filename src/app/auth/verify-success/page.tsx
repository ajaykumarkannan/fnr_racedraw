import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Email Verified',
}

export default function VerifySuccessPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Email verified!</CardTitle>
        <CardDescription>Your account is ready to use</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Your email address has been successfully verified. You can now access your dashboard
          and register for races.
        </p>
        <Link
          href="/dashboard"
          className={cn(buttonVariants({ size: 'lg' }), 'w-full')}
        >
          Go to dashboard
        </Link>
      </CardContent>
    </Card>
  )
}

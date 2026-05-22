import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Check Your Email',
}

export default function CheckEmailPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>We&apos;ve sent you a verification link</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          We&apos;ve sent a verification link to your email address. Please click the link in the
          email to verify your account and get started.
        </p>
        <p className="text-sm text-muted-foreground">
          Didn&apos;t receive an email? Check your spam folder or{' '}
          <Link
            href="/auth/signup"
            className="text-primary underline-offset-4 hover:underline"
          >
            try signing up again
          </Link>
          .
        </p>
        <Link
          href="/auth/login"
          className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full')}
        >
          Back to sign in
        </Link>
      </CardContent>
    </Card>
  )
}

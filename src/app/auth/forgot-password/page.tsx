'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button, buttonVariants } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { resetPassword } from '@/lib/actions/auth'

type FormValues = {
  email: string
}

export default function ForgotPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>()

  function onSubmit(values: FormValues) {
    setServerError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('email', values.email)
      const result = await resetPassword(fd)
      if ('error' in result) {
        setServerError(result.error)
      } else {
        setSuccess(true)
      }
    })
  }

  if (success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>Password reset link sent</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            If an account exists for that email, we&apos;ve sent a password reset link. Please
            check your inbox and spam folder.
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgot password?</CardTitle>
        <CardDescription>We&apos;ll send you a reset link</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {serverError && (
            <Alert className="text-sm text-destructive border-destructive/50 bg-destructive/10 px-4 py-3 rounded-lg">
              {serverError}
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              {...register('email', { required: 'Email is required' })}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isPending} size="lg">
            {isPending ? 'Sending…' : 'Send reset link'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            <Link href="/auth/login" className="text-primary underline-offset-4 hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}

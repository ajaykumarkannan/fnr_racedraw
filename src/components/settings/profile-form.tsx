'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { updateProfile, deleteAccount } from '@/lib/actions/auth'
import type { Profile } from '@/lib/types/database'

type FormValues = {
  name: string
  phone: string
}

interface ProfileFormProps {
  profile: Profile
}

export function ProfileForm({ profile }: ProfileFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDeleteTransition] = useTransition()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      name: profile.name,
      phone: profile.phone,
    },
  })

  function onSubmit(values: FormValues) {
    setServerError(null)
    setSuccessMsg(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('name', values.name)
      fd.set('phone', values.phone)
      const result = await updateProfile(fd)
      if ('error' in result) {
        setServerError(result.error)
      } else {
        setSuccessMsg('Profile updated successfully.')
      }
    })
  }

  function handleDeleteAccount() {
    startDeleteTransition(async () => {
      await deleteAccount()
    })
  }

  return (
    <div className="space-y-8">
      {/* Profile edit form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {serverError && (
          <Alert className="text-sm text-destructive border-destructive/50 bg-destructive/10 px-4 py-3 rounded-lg">
            {serverError}
          </Alert>
        )}
        {successMsg && (
          <Alert className="text-sm text-green-700 border-green-300 bg-green-50 px-4 py-3 rounded-lg dark:text-green-400 dark:border-green-800 dark:bg-green-950/30">
            {successMsg}
          </Alert>
        )}

        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="name">Full Name</Label>
          <Input
            id="name"
            type="text"
            autoComplete="name"
            aria-invalid={!!errors.name}
            {...register('name', {
              required: 'Name is required',
              minLength: { value: 2, message: 'Name must be at least 2 characters' },
            })}
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>

        {/* Email (read-only) */}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={profile.email}
            disabled
            className="opacity-60"
          />
          <p className="text-xs text-muted-foreground">Email cannot be changed.</p>
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+44 7700 900000"
            aria-invalid={!!errors.phone}
            {...register('phone', { required: 'Phone is required' })}
          />
          <p className="text-xs text-muted-foreground">
            International format, e.g. +44 7700 900000
          </p>
          {errors.phone && (
            <p className="text-xs text-destructive">{errors.phone.message}</p>
          )}
        </div>

        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </form>

      {/* Delete account section */}
      <div className="border-t pt-6 space-y-3">
        <div>
          <h3 className="text-sm font-medium text-destructive">Danger zone</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Permanently deactivate your account. This action cannot be undone.
          </p>
        </div>

        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
          >
            Delete account
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Are you sure?</DialogTitle>
              <DialogDescription>
                This will permanently deactivate your account. Your name and contact details
                will be anonymised. You will not be able to recover your account.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting…' : 'Yes, delete my account'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

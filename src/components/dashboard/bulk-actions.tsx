'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { bulkRegisterForSeason, bulkCancelForSeason } from '@/lib/actions/registrations'

interface BulkActionsProps {
  seasonId: string | null
}

export function BulkActions({ seasonId }: BulkActionsProps) {
  const [isPending, startTransition] = useTransition()
  const [showRegDialog, setShowRegDialog] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [role, setRole] = useState<'helm' | 'crew'>('helm')
  const [acceptOther, setAcceptOther] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (!seasonId) return null

  function handleBulkRegister() {
    setMessage(null)
    startTransition(async () => {
      const result = await bulkRegisterForSeason(seasonId!, role, acceptOther)
      if ('error' in result) {
        setMessage(result.error)
      } else {
        setMessage(`Registered for ${result.registered} races (${result.skipped} already registered)`)
      }
      setShowRegDialog(false)
    })
  }

  function handleBulkCancel() {
    setMessage(null)
    startTransition(async () => {
      const result = await bulkCancelForSeason(seasonId!)
      if ('error' in result) {
        setMessage(result.error)
      } else {
        setMessage(`Cancelled ${result.cancelled} registrations`)
      }
      setShowCancelDialog(false)
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setShowRegDialog(true)} disabled={isPending}>
          Register for All Remaining Races
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowCancelDialog(true)} disabled={isPending}>
          Unregister from All Remaining Races
        </Button>
      </div>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <Dialog open={showRegDialog} onOpenChange={setShowRegDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register for All Remaining Races</DialogTitle>
            <DialogDescription>
              Choose your default role for all upcoming races in this season.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Primary Role</Label>
              <Select value={role} onValueChange={(v) => { if (v) setRole(v as 'helm' | 'crew') }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="helm">Helm</SelectItem>
                  <SelectItem value="crew">Crew</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="bulk-accept" checked={acceptOther} onCheckedChange={setAcceptOther} />
              <Label htmlFor="bulk-accept">Accept other role if needed</Label>
            </div>
            <Button className="w-full" onClick={handleBulkRegister} disabled={isPending}>
              {isPending ? 'Registering…' : 'Confirm Registration'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unregister from All Remaining Races</DialogTitle>
            <DialogDescription>
              This will cancel all your active registrations for upcoming races in this season.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowCancelDialog(false)} className="flex-1">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkCancel} disabled={isPending} className="flex-1">
              {isPending ? 'Cancelling…' : 'Confirm Unregister'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

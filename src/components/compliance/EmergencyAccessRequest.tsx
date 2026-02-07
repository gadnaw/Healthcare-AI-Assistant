'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { ShieldAlert } from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'
import { requestEmergencyAccess } from '@/server/actions/compliance/request-emergency-access'

interface EmergencyAccessRequestProps {
  onRequestComplete?: (grant: any) => void
}

export function EmergencyAccessRequest({ onRequestComplete }: EmergencyAccessRequestProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { hasPermission } = usePermissions()
  const [reason, setReason] = useState('')
  const [isRequesting, setIsRequesting] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  if (!hasPermission('EMERGENCY_ACCESS')) {
    return null
  }

  const handleRequest = async () => {
    if (reason.length < 20) {
      toast({
        title: 'Reason too short',
        description: 'Please provide a reason of at least 20 characters',
        variant: 'destructive'
      })
      return
    }

    setIsRequesting(true)
    try {
      const grant = await requestEmergencyAccess(reason)
      toast({
        title: 'Emergency access granted',
        description: 'You have been granted emergency access for 4 hours',
        variant: 'default'
      })
      setIsOpen(false)
      setReason('')
      router.refresh()
      if (onRequestComplete) {
        onRequestComplete(grant)
      }
    } catch (error) {
      toast({
        title: 'Request failed',
        description: error instanceof Error ? error.message : 'Failed to request emergency access',
        variant: 'destructive'
      })
    } finally {
      setIsRequesting(false)
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100">
          <ShieldAlert className="mr-2 h-4 w-4" />
          Request Emergency Access
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-600" />
            Break-the-Glass Access
          </AlertDialogTitle>
          <AlertDialogDescription>
            You are about to request emergency access to patient records. This action is logged and requires justification.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-medium">This access will:</p>
            <ul className="mt-1 list-disc pl-4">
              <li>Be limited to 4 hours</li>
              <li>Be fully audited and logged</li>
              <li>Require a justification after use</li>
              <li>Be subject to compliance officer review</li>
            </ul>
          </div>

          <div className="space-y-2">
            <label htmlFor="reason" className="text-sm font-medium">
              Reason for Emergency Access <span className="text-red-500">*</span>
            </label>
            <Textarea
              id="reason"
              placeholder="Enter the reason for emergency access (minimum 20 characters)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={20}
              maxLength={1000}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              {reason.length}/1000 characters (minimum 20)
            </p>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleRequest}
            disabled={reason.length < 20 || isRequesting}
            className="bg-red-600 hover:bg-red-700"
          >
            {isRequesting ? 'Requesting...' : 'Confirm Emergency Access'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

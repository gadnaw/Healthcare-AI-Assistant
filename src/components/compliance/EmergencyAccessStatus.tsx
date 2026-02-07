'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Clock, Calendar, AlertCircle } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { JustificationForm } from './JustificationForm'

interface EmergencyAccessStatusProps {
  grant: {
    id: string
    reason: string
    status: string
    grantedAt: Date
    expiresAt: Date
    endedAt?: Date | null
  }
  onEndAccess?: () => void
  onJustificationComplete?: () => void
}

export function EmergencyAccessStatus({ grant, onEndAccess, onJustificationComplete }: EmergencyAccessStatusProps) {
  const { toast } = useToast()
  const [isEnding, setIsEnding] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)

  const isExpired = grant.expiresAt < new Date()
  const isActive = grant.status === 'ACTIVE' && !isExpired

  // Calculate countdown
  useState(() => {
    if (isActive) {
      const interval = setInterval(() => {
        const remaining = new Date(grant.expiresAt).getTime() - Date.now()
        setCountdown(remaining > 0 ? Math.ceil(remaining / 1000) : null)
      }, 1000)

      // Initial calculation
      const remaining = new Date(grant.expiresAt).getTime() - Date.now()
      setCountdown(remaining > 0 ? Math.ceil(remaining / 1000) : null)

      return () => clearInterval(interval)
    }
  })

  const formatCountdown = (seconds: number | null): string => {
    if (seconds === null) return '--:--:--'

    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleEndAccess = async () => {
    setIsEnding(true)
    try {
      // Call API to end access
      toast({
        title: 'Emergency access ended',
        description: 'Please complete the justification form',
        variant: 'default'
      })
      onEndAccess?.()
    } catch (error) {
      toast({
        title: 'Failed to end access',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      })
    } finally {
      setIsEnding(false)
    }
  }

  const getStatusColor = () => {
    if (isActive) {
      const secondsRemaining = countdown || 0
      if (secondsRemaining < 300) { // Less than 5 minutes
        return 'border-red-500 bg-red-50'
      }
      return 'border-amber-500 bg-amber-50'
    }
    return 'border-gray-200 bg-gray-50'
  }

  if (!isActive && (grant.status === 'ENDED' || isExpired)) {
    // Show justification form if access has ended
    return (
      <JustificationForm
        grant={grant as any}
        onComplete={onJustificationComplete}
      />
    )
  }

  return (
    <Card className={`max-w-xl mx-auto border-2 ${getStatusColor()}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-red-600">
          <AlertTriangle className="h-5 w-5" />
          Emergency Access Active
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Countdown Timer */}
        <div className="text-center p-6 bg-white rounded-lg border border-red-100">
          <p className="text-sm text-muted-foreground mb-2">Access Expires In</p>
          <p className={`text-4xl font-mono font-bold ${countdown && countdown < 300 ? 'text-red-600' : 'text-amber-600'}`}>
            {formatCountdown(countdown)}
          </p>
          {countdown && countdown < 300 && (
            <p className="text-sm text-red-600 mt-2 flex items-center justify-center gap-1">
              <AlertCircle className="h-4 w-4" />
              Less than 5 minutes remaining
            </p>
          )}
        </div>

        {/* Access Details */}
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>Requested: {grant.grantedAt.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Expires: {grant.expiresAt.toLocaleString()}</span>
          </div>
          <div className="pt-2 border-t">
            <p className="font-medium text-foreground">Reason for Access:</p>
            <p className="text-muted-foreground mt-1">{grant.reason}</p>
          </div>
        </div>

        {/* End Access Button */}
        <div className="pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleEndAccess}
            disabled={isEnding}
            className="w-full border-red-200 text-red-700 hover:bg-red-50"
          >
            {isEnding ? 'Ending Access...' : 'End Access Now'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

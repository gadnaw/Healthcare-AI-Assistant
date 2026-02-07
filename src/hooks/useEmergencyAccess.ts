'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  requestEmergencyAccess,
  completeJustification,
  getEmergencyAccessStatus
} from '@/server/actions/compliance/get-emergency-access-status'
import type { EmergencyAccessGrant, Justification } from '@prisma/client'

interface EmergencyAccessStatus {
  hasActiveAccess: boolean
  grant?: {
    id: string
    reason: string
    status: string
    grantedAt: Date
    expiresAt: Date
    endedAt?: Date | null
  }
  needsJustification: boolean
  pendingJustification?: {
    id: string
    status: string
    submittedAt: Date
  }
}

interface UseEmergencyAccessReturn {
  status: EmergencyAccessStatus | null
  loading: boolean
  countdown: number | null
  requestAccess: (reason: string) => Promise<EmergencyAccessGrant | null>
  completeJustification: (justification: string) => Promise<Justification | null>
  refreshStatus: () => Promise<EmergencyAccessStatus>
}

export function useEmergencyAccess(): UseEmergencyAccessReturn {
  const [status, setStatus] = useState<EmergencyAccessStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)

  const refreshStatus = useCallback(async (): Promise<EmergencyAccessStatus> => {
    try {
      const newStatus = await getEmergencyAccessStatus()
      setStatus(newStatus)
      return newStatus
    } catch (error) {
      console.error('Failed to refresh emergency access status:', error)
      throw error
    }
  }, [])

  // Initial status fetch
  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  // Update countdown every second if active
  useEffect(() => {
    if (status?.hasActiveAccess && status.grant?.expiresAt) {
      const interval = setInterval(() => {
        const remaining = new Date(status.grant!.expiresAt).getTime() - Date.now()
        setCountdown(remaining > 0 ? Math.ceil(remaining / 1000) : null)
      }, 1000)

      // Initial countdown calculation
      const remaining = new Date(status.grant.expiresAt).getTime() - Date.now()
      setCountdown(remaining > 0 ? Math.ceil(remaining / 1000) : null)

      return () => clearInterval(interval)
    } else {
      setCountdown(null)
    }
  }, [status])

  const requestAccess = useCallback(async (reason: string): Promise<EmergencyAccessGrant | null> => {
    setLoading(true)
    try {
      const grant = await requestEmergencyAccess(reason)
      await refreshStatus()
      return grant
    } catch (error) {
      console.error('Failed to request emergency access:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [refreshStatus])

  const completeJustificationHook = useCallback(async (justification: string): Promise<Justification | null> => {
    if (!status?.grant?.id) {
      throw new Error('No active grant to complete justification for')
    }

    setLoading(true)
    try {
      const result = await completeJustification(status.grant.id, justification)
      await refreshStatus()
      return result
    } catch (error) {
      console.error('Failed to complete justification:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [status, refreshStatus])

  return {
    status,
    loading,
    countdown,
    requestAccess,
    completeJustification: completeJustificationHook,
    refreshStatus
  }
}

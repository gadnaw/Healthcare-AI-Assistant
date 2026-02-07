'use server'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function getEmergencyAccessStatus(): Promise<{
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
}> {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error('Unauthorized: No active session')
  }

  const userId = session.user.id
  const orgId = session.user.orgId
  if (!orgId) {
    throw new Error('Unauthorized: User not part of an organization')
  }

  // Check for active emergency access grant
  const activeGrant = await prisma.emergencyAccessGrant.findFirst({
    where: {
      userId,
      status: {
        in: ['ACTIVE', 'ENDED']
      },
      expiresAt: {
        gt: new Date()
      }
    },
    orderBy: {
      grantedAt: 'desc'
    }
  })

  // Check for pending justification
  const pendingJustification = await prisma.justification.findFirst({
    where: {
      userId,
      status: 'PENDING'
    },
    orderBy: {
      submittedAt: 'desc'
    }
  })

  // Determine if justification is needed
  const needsJustification = activeGrant
    ? (activeGrant.status === 'ENDED' || activeGrant.expiresAt < new Date())
    : false

  return {
    hasActiveAccess: !!activeGrant && activeGrant.status === 'ACTIVE',
    grant: activeGrant
      ? {
          id: activeGrant.id,
          reason: activeGrant.reason,
          status: activeGrant.status,
          grantedAt: activeGrant.grantedAt,
          expiresAt: activeGrant.expiresAt,
          endedAt: activeGrant.endedAt
        }
      : undefined,
    needsJustification,
    pendingJustification: pendingJustification
      ? {
          id: pendingJustification.id,
          status: pendingJustification.status,
          submittedAt: pendingJustification.submittedAt
        }
      : undefined
  }
}

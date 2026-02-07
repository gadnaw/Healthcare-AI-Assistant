'use server'

import { auth } from '@/lib/auth'
import { AuditService } from '@/lib/compliance/audit'
import { prisma } from '@/lib/prisma'
import type { Justification } from '@prisma/client'

export async function completeJustification(grantId: string, justification: string): Promise<Justification> {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error('Unauthorized: No active session')
  }

  const userId = session.user.id
  const orgId = session.user.orgId
  if (!orgId) {
    throw new Error('Unauthorized: User not part of an organization')
  }

  // Validate justification length
  if (justification.length < 50) {
    throw new Error('Justification must be at least 50 characters')
  }

  // Validate grant exists and belongs to user
  const grant = await prisma.emergencyAccessGrant.findUnique({
    where: { id: grantId }
  })

  if (!grant) {
    throw new Error('Emergency access grant not found')
  }

  if (grant.userId !== userId) {
    throw new Error('Unauthorized: This grant does not belong to you')
  }

  // Check if access has expired or been manually ended
  const isExpired = grant.expiresAt < new Date()
  const isManuallyEnded = grant.status === 'ENDED'

  if (!isExpired && !isManuallyEnded) {
    throw new Error('Cannot submit justification while emergency access is still active')
  }

  // Check if justification already exists
  const existingJustification = await prisma.justification.findUnique({
    where: { grantId }
  })

  if (existingJustification) {
    throw new Error('Justification has already been submitted for this grant')
  }

  // Create justification record
  const justificationRecord = await prisma.justification.create({
    data: {
      grantId,
      userId,
      orgId,
      justification,
      status: 'PENDING',
      submittedAt: new Date()
    }
  })

  // Audit log the justification submission
  await AuditService.log({
    action: 'JUSTIFICATION_SUBMIT',
    entityType: 'justification',
    entityId: justificationRecord.id,
    userId,
    orgId,
    metadata: {
      grantId,
      justificationLength: justification.length,
      accessDuration: grant.grantedAt && grant.expiresAt
        ? Math.round((grant.expiresAt.getTime() - grant.grantedAt.getTime()) / 1000 / 60)
        : null
    }
  })

  return justificationRecord
}

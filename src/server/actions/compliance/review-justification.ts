'use server'

import { auth } from '@/lib/auth'
import { AuditService } from '@/lib/compliance/audit'
import { requirePermission } from '@/lib/rbac/role-utils'
import { prisma } from '@/lib/prisma'
import type { Justification } from '@prisma/client'

export async function reviewJustification(
  justificationId: string,
  decision: 'APPROVE' | 'REJECT' | 'ESCALATE',
  notes?: string
): Promise<Justification> {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error('Unauthorized: No active session')
  }

  const reviewerId = session.user.id
  const orgId = session.user.orgId
  if (!orgId) {
    throw new Error('Unauthorized: User not part of an organization')
  }

  // Require USER_MANAGE permission or COMPLIANCE_OFFICER role
  const hasPermission = await checkReviewPermission(reviewerId)
  if (!hasPermission) {
    throw new Error('Unauthorized: Insufficient permissions to review justifications')
  }

  // Validate justification exists
  const justification = await prisma.justification.findUnique({
    where: { id: justificationId }
  })

  if (!justification) {
    throw new Error('Justification not found')
  }

  // Check if already reviewed
  if (justification.status !== 'PENDING') {
    throw new Error('This justification has already been reviewed')
  }

  // Determine new status based on decision
  let newStatus: 'APPROVED' | 'REJECTED' | 'ESCALATED'
  switch (decision) {
    case 'APPROVE':
      newStatus = 'APPROVED'
      break
    case 'REJECT':
      newStatus = 'REJECTED'
      break
    case 'ESCALATE':
      newStatus = 'ESCALATED'
      break
    default:
      throw new Error('Invalid decision')
  }

  // Update justification record
  const updatedJustification = await prisma.justification.update({
    where: { id: justificationId },
    data: {
      status: newStatus,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      reviewNotes: notes
    }
  })

  // Audit log the review
  await AuditService.log({
    action: 'JUSTIFICATION_REVIEW',
    entityType: 'justification',
    entityId: justificationId,
    userId: reviewerId,
    orgId,
    metadata: {
      decision,
      previousStatus: justification.status,
      newStatus,
      notes: notes?.substring(0, 1000),
      originalGrantId: justification.grantId
    }
  })

  // If rejected, trigger escalation workflow (could be extended with notifications)
  if (decision === 'REJECT') {
    await AuditService.log({
      action: 'JUSTIFICATION_ESCALATED',
      entityType: 'justification',
      entityId: justificationId,
      userId: reviewerId,
      orgId,
      metadata: {
        reason: 'Justification rejected - requires additional review',
        escalatedTo: 'COMPLIANCE_OFFICER'
      }
    })
  }

  return updatedJustification
}

async function checkReviewPermission(userId: string): Promise<boolean> {
  try {
    await requirePermission('USER_MANAGE')
    return true
  } catch {
    // Check for COMPLIANCE_OFFICER role
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    })
    return user?.role === 'COMPLIANCE_OFFICER' || user?.role === 'ADMIN'
  }
}

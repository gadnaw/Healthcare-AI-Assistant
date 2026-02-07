'use server'

import { auth } from '@/lib/auth'
import { AuditService } from '@/lib/compliance/audit'
import { requirePermission } from '@/lib/rbac/role-utils'
import { prisma } from '@/lib/prisma'
import type { EmergencyAccessGrant } from '@prisma/client'

export async function requestEmergencyAccess(reason: string): Promise<EmergencyAccessGrant> {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error('Unauthorized: No active session')
  }

  const userId = session.user.id
  const orgId = session.user.orgId
  if (!orgId) {
    throw new Error('Unauthorized: User not part of an organization')
  }

  // Verify EMERGENCY_ACCESS permission
  await requirePermission('EMERGENCY_ACCESS')

  // Validate reason length
  if (reason.length < 20) {
    throw new Error('Reason must be at least 20 characters')
  }

  // Check if user already has active emergency access
  const existingGrant = await prisma.emergencyAccessGrant.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      expiresAt: {
        gt: new Date()
      }
    }
  })

  if (existingGrant) {
    throw new Error('You already have active emergency access')
  }

  // Create new emergency access grant with 4-hour expiry
  const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000) // 4 hours from now

  const grant = await prisma.emergencyAccessGrant.create({
    data: {
      userId,
      orgId,
      reason,
      status: 'ACTIVE',
      expiresAt,
      grantedAt: new Date()
    }
  })

  // Audit log the emergency access request
  await AuditService.log({
    action: 'EMERGENCY_ACCESS_REQUEST',
    entityType: 'emergency_access_grant',
    entityId: grant.id,
    userId,
    orgId,
    metadata: {
      reason: reason.substring(0, 500), // Truncate for audit
      expiresAt: expiresAt.toISOString()
    }
  })

  return grant
}

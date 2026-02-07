'use server'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac/role-utils'
import { auditService } from '@/lib/compliance/audit'

export async function deactivateUser(userId: string, reason: string): Promise<{
  id: string
  email: string
  name: string | null
  role: string
  status: 'deactivated'
}> {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.orgId) {
    throw new Error('Organization not found in session')
  }

  // Require USER_MANAGE permission
  await requirePermission('USER_MANAGE')

  const { orgId, id: adminId, email: adminEmail } = session.user

  // Validate reason
  if (!reason || reason.trim().length < 10) {
    throw new Error('Deactivation reason must be at least 10 characters')
  }

  // Find the membership
  const membership = await prisma.org_members.findFirst({
    where: {
      orgId: orgId,
      userId: userId,
    },
    include: {
      user: true,
    },
  })

  if (!membership) {
    throw new Error('User not found in your organization')
  }

  // Check if already deactivated
  if (membership.status === 'deactivated') {
    throw new Error('User is already deactivated')
  }

  // Cannot deactivate yourself
  if (userId === adminId) {
    throw new Error('Cannot deactivate your own account')
  }

  // Prevent deactivating the last admin
  if (membership.role === 'ADMIN') {
    const adminCount = await prisma.org_members.count({
      where: {
        orgId: orgId,
        role: 'ADMIN',
        status: 'active',
      },
    })

    if (adminCount <= 1) {
      throw new Error('Cannot deactivate the only admin. Promote another user to admin first.')
    }
  }

  // Update status to deactivated
  const updated = await prisma.org_members.update({
    where: {
      id: membership.id,
    },
    data: {
      status: 'deactivated',
      deactivatedAt: new Date(),
      deactivatedBy: adminId,
      deactivationReason: reason.trim(),
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  })

  // Log the deactivation
  await auditService.log({
    action: 'USER_DEACTIVATE',
    resourceType: 'user',
    resourceId: userId,
    userId: adminId,
    orgId: orgId,
    metadata: {
      targetEmail: updated.user.email,
      reason: reason.trim(),
      deactivatedBy: adminEmail,
      roleAtDeactivation: membership.role,
    },
  })

  // TODO: Invalidate all active sessions for this user
  // This would require a session store that supports token invalidation
  // await sessionStore.invalidateUserSessions(userId)

  return {
    id: updated.user.id,
    email: updated.user.email,
    name: updated.user.name,
    role: updated.role,
    status: 'deactivated',
  }
}

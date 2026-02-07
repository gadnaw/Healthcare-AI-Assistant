'use server'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac/role-utils'
import { auditService } from '@/lib/compliance/audit'

export async function reactivateUser(userId: string): Promise<{
  id: string
  email: string
  name: string | null
  role: string
  status: 'active'
}> {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.orgId) {
    throw new Error('Organization not found in session')
  }

  // Require USER_MANAGE permission
  await requirePermission('USER_MANAGE')

  const { orgId, id: adminId, email: adminEmail } = session.user

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

  // Check if already active
  if (membership.status === 'active') {
    throw new Error('User is already active')
  }

  // Update status back to active
  const updated = await prisma.org_members.update({
    where: {
      id: membership.id,
    },
    data: {
      status: 'active',
      reactivatedAt: new Date(),
      reactivatedBy: adminId,
      deactivatedAt: null,
      deactivatedBy: null,
      deactivationReason: null,
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

  // Log the reactivation
  await auditService.log({
    action: 'USER_REACTIVATE',
    resourceType: 'user',
    resourceId: userId,
    userId: adminId,
    orgId: orgId,
    metadata: {
      targetEmail: updated.user.email,
      reactivatedBy: adminEmail,
      roleAtReactivation: membership.role,
    },
  })

  // TODO: If user has existing sessions, they may need to re-authenticate
  // This depends on the session management strategy

  return {
    id: updated.user.id,
    email: updated.user.email,
    name: updated.user.name,
    role: updated.role,
    status: 'active',
  }
}

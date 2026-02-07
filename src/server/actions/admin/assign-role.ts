'use server'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac/role-utils'
import { Role } from '@/lib/rbac/roles'
import { auditService } from '@/lib/compliance/audit'

export async function assignRole(userId: string, newRole: Role): Promise<{
  id: string
  email: string
  name: string | null
  role: Role
  status: 'active' | 'deactivated'
}> {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.orgId) {
    throw new Error('Organization not found in session')
  }

  // Require USER_MANAGE permission
  await requirePermission('USER_MANAGE')

  const { orgId, id: adminId, email: adminEmail } = session.user

  // Validate role
  const validRoles = ['ADMIN', 'PROVIDER', 'STAFF']
  if (!validRoles.includes(newRole)) {
    throw new Error('Invalid role specified')
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

  // Check if user is already deactivated
  if (membership.status === 'deactivated') {
    throw new Error('Cannot change role of deactivated user. Reactivate first.')
  }

  const oldRole = membership.role as Role

  // Prevent demoting yourself if you're the only admin
  if (userId === adminId && newRole !== 'ADMIN') {
    const adminCount = await prisma.org_members.count({
      where: {
        orgId: orgId,
        role: 'ADMIN',
        status: 'active',
      },
    })

    if (adminCount <= 1) {
      throw new Error('Cannot demote yourself as the only admin. Promote another user to admin first.')
    }
  }

  // Update the role
  const updated = await prisma.org_members.update({
    where: {
      id: membership.id,
    },
    data: {
      role: newRole as any,
      roleUpdatedAt: new Date(),
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

  // Log the role assignment
  await auditService.log({
    action: 'ROLE_ASSIGN',
    resourceType: 'user',
    resourceId: userId,
    userId: adminId,
    orgId: orgId,
    metadata: {
      targetEmail: updated.user.email,
      oldRole: oldRole,
      newRole: newRole,
      changedBy: adminEmail,
    },
  })

  // TODO: If user's session is active, may need to refresh their JWT
  // This would require a session invalidation mechanism

  return {
    id: updated.user.id,
    email: updated.user.email,
    name: updated.user.name,
    role: updated.role as Role,
    status: updated.status as 'active' | 'deactivated',
  }
}

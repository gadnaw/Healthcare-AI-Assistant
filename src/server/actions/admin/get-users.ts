'use server'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac/role-utils'
import { Role } from '@/lib/rbac/roles'
import { Prisma } from '@prisma/client'

export interface UserListItem {
  id: string
  email: string
  name: string | null
  role: Role
  status: 'active' | 'deactivated'
  lastLogin: Date | null
  createdAt: Date
}

export interface UserFilters {
  search?: string
  role?: Role
  status?: 'active' | 'deactivated' | 'all'
}

export async function getUsers(filters?: UserFilters): Promise<UserListItem[]> {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.orgId) {
    throw new Error('Organization not found in session')
  }

  // Require USER_MANAGE permission to view user list
  await requirePermission('USER_MANAGE')

  const { orgId } = session.user

  // Build where clause
  const where: Prisma.org_membersWhereInput = {
    orgId: orgId,
  }

  // Apply search filter
  if (filters?.search) {
    where.OR = [
      { user: { email: { contains: filters.search, mode: 'insensitive' as const } } },
      { user: { name: { contains: filters.search, mode: 'insensitive' as const } } },
    ]
  }

  // Apply role filter
  if (filters?.role) {
    where.role = filters.role
  }

  // Apply status filter
  if (filters?.status && filters.status !== 'all') {
    where.status = filters.status
  }

  const users = await prisma.org_members.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          lastLogin: true,
          createdAt: true,
        },
      },
    },
    orderBy: [
      { status: 'asc' }, // active users first
      { createdAt: 'desc' },
    ],
  })

  return users.map((member) => ({
    id: member.user.id,
    email: member.user.email,
    name: member.user.name,
    role: member.role as Role,
    status: member.status as 'active' | 'deactivated',
    lastLogin: member.user.lastLogin,
    createdAt: member.user.createdAt,
  }))
}

'use server'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac/role-utils'
import { Role } from '@/lib/rbac/roles'
import { auditService } from '@/lib/compliance/audit'
import { v4 as uuidv4 } from 'uuid'

export interface InviteUserInput {
  email: string
  role: Role
  name?: string
  message?: string
}

export interface Invitation {
  id: string
  email: string
  role: Role
  status: 'pending' | 'accepted' | 'expired' | 'cancelled'
  invitedBy: string
  createdAt: Date
  expiresAt: Date
}

export async function inviteUser(input: InviteUserInput): Promise<Invitation> {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.orgId) {
    throw new Error('Organization not found in session')
  }

  // Require USER_INVITE permission
  await requirePermission('USER_INVITE')

  const { orgId, id: adminId, email: adminEmail } = session.user

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(input.email)) {
    throw new Error('Invalid email format')
  }

  // Normalize email
  const normalizedEmail = input.email.toLowerCase().trim()

  // Check if user already exists in this organization
  const existingMember = await prisma.org_members.findFirst({
    where: {
      orgId: orgId,
      user: {
        email: normalizedEmail,
      },
    },
    include: {
      user: true,
    },
  })

  if (existingMember) {
    throw new Error('User with this email already exists in your organization')
  }

  // Check if there's already a pending invitation
  const existingInvitation = await prisma.invitations.findFirst({
    where: {
      orgId: orgId,
      email: normalizedEmail,
      status: 'pending',
      expiresAt: {
        gt: new Date(),
      },
    },
  })

  if (existingInvitation) {
    throw new Error('An invitation has already been sent to this email')
  }

  // Validate role
  const validRoles = ['ADMIN', 'PROVIDER', 'STAFF']
  if (!validRoles.includes(input.role)) {
    throw new Error('Invalid role specified')
  }

  // Create invitation
  const invitationId = uuidv4()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7) // 7-day expiry

  const invitation = await prisma.invitations.create({
    data: {
      id: invitationId,
      orgId: orgId,
      email: normalizedEmail,
      role: input.role as any,
      invitedBy: adminId,
      name: input.name?.trim() || null,
      personalMessage: input.message?.trim() || null,
      expiresAt: expiresAt,
      status: 'pending',
    },
  })

  // Log the invitation action
  await auditService.log({
    action: 'USER_INVITE',
    resourceType: 'user',
    resourceId: invitationId,
    userId: adminId,
    orgId: orgId,
    metadata: {
      invitedEmail: normalizedEmail,
      role: input.role,
      invitedBy: adminEmail,
    },
  })

  // TODO: Send invitation email (implement email service integration)
  // await sendInvitationEmail({
  //   to: normalizedEmail,
  //   inviterName: session.user.name || adminEmail,
  //   organizationName: org.name,
  //   invitationToken: invitationId,
  //   personalMessage: input.message,
  //   expiresAt: expiresAt.toISOString(),
  // })

  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role as Role,
    status: invitation.status as 'pending' | 'accepted' | 'expired' | 'cancelled',
    invitedBy: invitation.invitedBy,
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
  }
}

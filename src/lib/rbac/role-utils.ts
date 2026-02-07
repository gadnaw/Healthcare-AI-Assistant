import { prisma } from '@/lib/prisma';
import { Role } from './roles';
import { Permission, getPermissionsForRole } from './permissions';
import { AuditService } from '@/lib/compliance/audit';

// ============================================
// RBAC Utility Functions
// ============================================

/**
 * Check if a user role has a specific permission
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  if (!Object.values(Role).includes(role)) {
    return false;
  }
  
  const permissions = getPermissionsForRole(role);
  return permissions.includes(permission);
}

/**
 * Check if user has permission, throw 403 if not
 */
export function requirePermission(
  role: Role, 
  permission: Permission
): void {
  if (!hasPermission(role, permission)) {
    throw new Error('Insufficient permissions');
  }
}

/**
 * Get the role for a specific user
 */
export async function getUserRole(userId: string): Promise<Role | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });
  
  return user?.role || null;
}

/**
 * Get the role and organization for a user
 */
export async function getUserRoleAndOrg(userId: string): Promise<{
  role: Role | null;
  orgId: string | null;
} | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, org_id: true }
  });
  
  if (!user) return null;
  
  return {
    role: user.role,
    orgId: user.org_id
  };
}

/**
 * Assign a new role to a user (admin action)
 */
export async function assignRole(
  userId: string,
  newRole: Role,
  adminUserId: string
): Promise<void> {
  // Get admin's role to verify they can assign roles
  const admin = await prisma.user.findUnique({
    where: { id: adminUserId },
    select: { role: true, org_id: true }
  });
  
  if (!admin || admin.role !== Role.ADMIN) {
    throw new Error('Only administrators can assign roles');
  }
  
  // Get target user
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { org_id: true, role: true }
  });
  
  if (!targetUser) {
    throw new Error('User not found');
  }
  
  // Verify same organization
  if (targetUser.org_id !== admin.org_id) {
    throw new Error('Cannot assign roles to users in different organizations');
  }
  
  // Update the user's role
  await prisma.user.update({
    where: { id: userId },
    data: { role: newRole }
  });
  
  // Log the role assignment
  const auditService = new AuditService();
  await auditService.log(
    'ROLE_ASSIGN',
    'user',
    userId,
    adminUserId,
    admin.org_id,
    undefined,
    undefined,
    {
      new_role: newRole,
      previous_role: targetUser.role
    }
  );
}

/**
 * Get all permissions for a role (wrapper for permissions module)
 */
export function getPermissions(role: Role): Permission[] {
  return getPermissionsForRole(role);
}

/**
 * Check multiple permissions at once
 */
export function hasAllPermissions(
  role: Role,
  permissions: Permission[]
): boolean {
  return permissions.every(p => hasPermission(role, p));
}

/**
 * Check if user can perform action on another user
 */
export async function canManageUser(
  actorUserId: string,
  targetUserId: string
): Promise<boolean> {
  const [actor, target] = await Promise.all([
    prisma.user.findUnique({
      where: { id: actorUserId },
      select: { role: true, org_id: true }
    }),
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: { org_id: true }
    })
  ]);
  
  if (!actor || !target) return false;
  
  // Must be in same organization
  if (actor.org_id !== target.org_id) return false;
  
  // Must be admin to manage users
  if (actor.role !== Role.ADMIN) return false;
  
  return true;
}

/**
 * Get users with a specific role in an organization
 */
export async function getUsersByRole(
  role: Role,
  orgId: string
): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      role,
      org_id: orgId,
      is_active: true
    },
    select: { id: true }
  });
  
  return users.map(u => u.id);
}

/**
 * Check if user can access a specific document
 */
export async function canAccessDocument(
  userId: string,
  documentId: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, org_id: true }
  });
  
  if (!user) return false;
  
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { org_id: true }
  });
  
  if (!document) return false;
  
  // Same organization required
  if (document.org_id !== user.org_id) return false;
  
  // Must have DOC_VIEW permission
  return hasPermission(user.role, Permission.DOC_VIEW);
}

/**
 * Middleware helper for API routes
 */
export function createPermissionMiddleware(permission: Permission) {
  return async (userId: string): Promise<boolean> => {
    const role = await getUserRole(userId);
    if (!role) return false;
    return hasPermission(role, permission);
  };
}

// Export Permission enum for convenience
export { Permission } from './permissions';
export { Role, ROLE_HIERARCHY, ROLE_DESCRIPTIONS } from './roles';

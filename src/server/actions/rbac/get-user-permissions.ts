import { auth } from "@/auth"
import { getPermissions, getUserRole } from "@/lib/rbac/role-utils"
import { Role } from "@/lib/rbac/roles"
import { Permission } from "@/lib/rbac/permissions"
import { headers } from "next/headers"
import { AuditService } from "@/lib/compliance/audit"

/**
 * Cached permissions interface for client-side use
 */
export interface UserPermissions {
  role: Role
  permissions: Permission[]
  canAccess: (permission: Permission) => boolean
}

/**
 * Server action to get the current user's role and permissions.
 * Used by client to determine available features.
 * 
 * @returns Promise<UserPermissions> - User's role, permissions, and helper function
 */
export async function getUserPermissionsAction(): Promise<UserPermissions> {
  const session = await auth()
  
  if (!session?.user?.id) {
    // Return empty permissions for unauthenticated users
    return {
      role: "STAFF" as Role,
      permissions: [],
      canAccess: () => false,
    }
  }

  const userId = session.user.id
  const orgId = session.user.org_id
  const jwtRole = session.user.role as Role

  // Get role from database (authoritative) or fall back to JWT
  let role: Role = jwtRole
  try {
    const dbRole = await getUserRole(userId)
    if (dbRole) {
      role = dbRole
    }
  } catch (error) {
    // If database lookup fails, use JWT role
    console.warn("Failed to get role from database, using JWT role:", error)
  }

  // Get all permissions for the role
  const permissions = getPermissions(role)

  // Create the canAccess helper function
  const canAccess = (permission: Permission): boolean => {
    return permissions.includes(permission)
  }

  // Log permission retrieval for audit trail
  try {
    await AuditService.log({
      userId,
      orgId,
      action: "PERMISSIONS_RETRIEVED",
      resourceType: "user",
      resourceId: userId,
      metadata: {
        role,
        permissionsCount: permissions.length,
      },
      ipAddress: headers().get("x-forwarded-for") || "unknown",
      userAgent: headers().get("user-agent") || "unknown",
    })
  } catch (auditError) {
    // Audit failure should not block the permission retrieval
    console.error("Failed to audit permissions retrieval:", auditError)
  }

  return {
    role,
    permissions,
    canAccess,
  }
}

/**
 * Utility function to check role hierarchy.
 * ADMIN > PROVIDER > STAFF
 * 
 * @param userRole - The user's current role
 * @param requiredRole - The role required
 * @returns boolean - true if user has the required role or higher
 */
export function hasRoleOrHigher(userRole: Role | null, requiredRole: Role): boolean {
  if (!userRole) return false
  
  const roleHierarchy: Role[] = ["STAFF", "PROVIDER", "ADMIN"]
  const userRoleIndex = roleHierarchy.indexOf(userRole)
  const requiredRoleIndex = roleHierarchy.indexOf(requiredRole)
  
  return userRoleIndex >= requiredRoleIndex
}

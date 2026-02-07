import { auth } from "@/auth"
import { hasPermission, getPermissions } from "@/lib/rbac/role-utils"
import { AuditService } from "@/lib/compliance/audit"
import { Permission } from "@/lib/rbac/permissions"
import { headers } from "next/headers"

/**
 * Server action to check if the current user has a specific permission.
 * Used by server actions to gate sensitive operations.
 * 
 * @param permission - The permission to check
 * @returns Promise<boolean> - true if user has permission, false otherwise
 */
export async function checkPermission(permission: Permission): Promise<boolean> {
  const session = await auth()
  
  if (!session?.user?.id) {
    return false
  }

  const role = session.user.role as "ADMIN" | "PROVIDER" | "STAFF"
  const userId = session.user.id
  const orgId = session.user.org_id

  // Check if user has the permission using RBAC utility
  const hasAccess = hasPermission(role, permission)

  // Log permission check for audit trail
  try {
    await AuditService.log({
      userId,
      orgId,
      action: "PERMISSION_CHECK",
      resourceType: "permission",
      resourceId: permission,
      metadata: {
        permission,
        result: hasAccess,
        role,
      },
      ipAddress: headers().get("x-forwarded-for") || "unknown",
      userAgent: headers().get("user-agent") || "unknown",
    })
  } catch (auditError) {
    // Audit failure should not block the permission check
    console.error("Failed to audit permission check:", auditError)
  }

  return hasAccess
}

/**
 * Server action to require a specific permission.
 * Throws an error if the user doesn't have the permission.
 * 
 * @param permission - The permission required
 * @throws Error - 403 if user lacks permission
 */
export async function requirePermission(permission: Permission): Promise<void> {
  const hasAccess = await checkPermission(permission)
  
  if (!hasAccess) {
    throw new Error(`Permission denied: ${permission} is required for this action`)
  }
}

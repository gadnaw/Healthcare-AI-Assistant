"use client"

import React, { useMemo } from "react"
import { usePermissions, usePermissionGate } from "@/hooks/usePermissions"
import { Permission } from "@/lib/rbac/permissions"
import { Skeleton } from "@/components/ui/skeleton"

interface PermissionGateProps {
  /**
   * The permission(s) required to render children.
   * Can be a single permission or an array of permissions.
   */
  permission: Permission | Permission[]
  
  /**
   * Children to render if the user has the required permission(s).
   */
  children: React.ReactNode
  
  /**
   * Content to render if the user lacks permission.
   * If not provided, nothing will be rendered.
   */
  fallback?: React.ReactNode
  
  /**
   * If true, user must have ALL specified permissions (AND logic).
   * If false, user needs ANY of the specified permissions (OR logic).
   * Only applies when permission is an array.
   */
  requireAll?: boolean
  
  /**
   * If true, shows a loading skeleton while permissions are being fetched.
   * If false, renders nothing during loading.
   */
  showLoadingSkeleton?: boolean
  
  /**
   * Custom loading skeleton component.
   * If not provided, uses default skeleton.
   */
  loadingSkeleton?: React.ReactNode
  
  /**
   * If true, renders fallback content even during loading.
   * If false, respects showLoadingSkeleton behavior.
   */
  renderFallbackDuringLoading?: boolean
}

/**
 * PermissionGate - A component wrapper for permission-gated content.
 * 
 * Conditionally renders children based on whether the current user
 * has the required permission(s). Provides fallback content for
 * unauthorized users.
 * 
 * @example
 * // Single permission check
 * <PermissionGate permission="DOC_UPLOAD">
 *   <UploadButton />
 * </PermissionGate>
 * 
 * @example
 * // Multiple permissions with fallback
 * <PermissionGate 
 *   permission={["USER_MANAGE", "AUDIT_VIEW"]}
 *   requireAll={true}
 *   fallback={<AccessDeniedMessage />}
 * >
 *   <AdminPanel />
 * </PermissionGate>
 * 
 * @example
 * // With loading skeleton
 * <PermissionGate 
 *   permission="SYSTEM_CONFIG"
 *   showLoadingSkeleton={true}
 *   loadingSkeleton={<Skeleton className="h-32" />}
 * >
 *   <SystemSettings />
 * </PermissionGate>
 */
export function PermissionGate({
  permission,
  children,
  fallback = null,
  requireAll = false,
  showLoadingSkeleton = false,
  loadingSkeleton,
  renderFallbackDuringLoading = false,
}: PermissionGateProps) {
  const { loading, hasAccess, role, permissions } = usePermissionGate({
    permission,
    requireAll,
  })

  // Show loading skeleton during permission fetch
  if (loading) {
    if (showLoadingSkeleton) {
      return loadingSkeleton || <Skeleton className="h-4 w-full" />
    }
    if (renderFallbackDuringLoading) {
      return <>{fallback}</>
    }
    return null
  }

  // Render children if user has permission
  if (hasAccess) {
    return <>{children}</>
  }

  // Render fallback if user lacks permission
  return <>{fallback}</>
}

/**
 * PermissionRequired - A stricter version that requires permission
 * and will not render anything if permission is missing.
 */
interface PermissionRequiredProps {
  permission: Permission | Permission[]
  requireAll?: boolean
  children: React.ReactNode
  fallback?: React.ReactNode
}

/**
 * PermissionRequired - Requires permission to render children.
 * Unlike PermissionGate, this component enforces that the user
 * must have the permission - it will not render fallback.
 */
export function PermissionRequired({
  permission,
  requireAll = false,
  children,
  fallback = null,
}: PermissionRequiredProps) {
  return (
    <PermissionGate
      permission={permission}
      requireAll={requireAll}
      fallback={fallback}
      renderFallbackDuringLoading={false}
    >
      {children}
    </PermissionGate>
  )
}

/**
 * PermissionDenied - A component that renders content when
 * the user lacks the required permission.
 */
interface PermissionDeniedProps {
  permission: Permission | Permission[]
  requireAll?: boolean
  children: React.ReactNode
}

/**
 * PermissionDenied - Renders children only when the user
 * does NOT have the required permission.
 */
export function PermissionDenied({
  permission,
  requireAll = false,
  children,
}: PermissionDeniedProps) {
  const { hasAccess, loading } = usePermissionGate({
    permission,
    requireAll,
  })

  if (loading) {
    return null
  }

  if (!hasAccess) {
    return <>{children}</>
  }

  return null
}

/**
 * RoleGate - A component wrapper for role-gated content.
 * Checks if user has the required role or higher in the hierarchy.
 * Hierarchy: ADMIN > PROVIDER > STAFF
 */
interface RoleGateProps {
  /**
   * The role required. User must have this role or higher.
   * ADMIN > PROVIDER > STAFF
   */
  requiredRole: "ADMIN" | "PROVIDER" | "STAFF"
  
  /**
   * Children to render if the user has the required role.
   */
  children: React.ReactNode
  
  /**
   * Content to render if the user lacks the required role.
   */
  fallback?: React.ReactNode
  
  /**
   * If true, user must have EXACTLY this role (no hierarchy).
   * If false, user can have this role or higher.
   */
  exactRole?: boolean
}

/**
 * RoleGate - Conditionally renders content based on user role.
 * Supports both hierarchical (role or higher) and exact role matching.
 */
export function RoleGate({
  requiredRole,
  children,
  fallback = null,
  exactRole = false,
}: RoleGateProps) {
  const { hasRole, loading } = usePermissions()

  // Loading state handling
  if (loading) {
    return null
  }

  // Check role access
  let hasAccess = false
  
  if (exactRole) {
    // Exact role matching
    const { role } = usePermissions()
    hasAccess = role === requiredRole
  } else {
    // Hierarchical role matching
    hasAccess = hasRole(requiredRole)
  }

  if (hasAccess) {
    return <>{children}</>
  }

  return <>{fallback}</>
}

/**
 * AdminOnly - Convenience component for admin-only content.
 */
interface AdminOnlyProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

/**
 * AdminOnly - Renders children only for admin users.
 */
export function AdminOnly({ children, fallback = null }: AdminOnlyProps) {
  return (
    <RoleGate requiredRole="ADMIN" fallback={fallback}>
      {children}
    </RoleGate>
  )
}

/**
 * ProviderAndAbove - Renders content for providers and admins.
 */
interface ProviderAndAboveProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

/**
 * ProviderAndAbove - Renders children for provider and admin roles.
 */
export function ProviderAndAbove({ children, fallback = null }: ProviderAndAboveProps) {
  return (
    <RoleGate requiredRole="PROVIDER" fallback={fallback}>
      {children}
    </RoleGate>
  )
}

/**
 * StaffAndAbove - Renders content for all authenticated users.
 */
interface StaffAndAboveProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

/**
 * StaffAndAbove - Renders children for staff, provider, and admin roles.
 */
export function StaffAndAbove({ children, fallback = null }: StaffAndAboveProps) {
  return (
    <RoleGate requiredRole="STAFF" fallback={fallback}>
      {children}
    </RoleGate>
  )
}

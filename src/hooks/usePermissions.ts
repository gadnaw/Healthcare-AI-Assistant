"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { getUserPermissionsAction, UserPermissions } from "@/server/actions/rbac/get-user-permissions"
import { Permission } from "@/lib/rbac/permissions"
import { Role } from "@/lib/rbac/roles"

/**
 * Hook to access current user's permissions on the client side.
 * Fetches permissions on mount and provides helper functions for checking access.
 * 
 * @returns Object containing role, permissions, loading state, and helper functions
 */
export function usePermissions() {
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [role, setRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Fetch user permissions on mount
  useEffect(() => {
    let mounted = true

    async function fetchPermissions() {
      try {
        const data = await getUserPermissionsAction()
        
        if (mounted) {
          setRole(data.role)
          setPermissions(data.permissions)
          setLoading(false)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error("Failed to fetch permissions"))
          setLoading(false)
        }
      }
    }

    fetchPermissions()

    return () => {
      mounted = false
    }
  }, [])

  /**
   * Check if user has a specific permission
   * @param permission - The permission to check
   * @returns boolean - true if user has the permission
   */
  const hasPermission = useCallback((permission: Permission): boolean => {
    return permissions.includes(permission)
  }, [permissions])

  /**
   * Check if user has a specific role or higher in the hierarchy
   * ADMIN > PROVIDER > STAFF
   * @param requiredRole - The role required
   * @returns boolean - true if user has the required role or higher
   */
  const hasRole = useCallback((requiredRole: Role): boolean => {
    if (!role) return false

    const roleHierarchy: Role[] = ["STAFF", "PROVIDER", "ADMIN"]
    const userRoleIndex = roleHierarchy.indexOf(role)
    const requiredRoleIndex = roleHierarchy.indexOf(requiredRole)

    return userRoleIndex >= requiredRoleIndex
  }, [role])

  /**
   * Check if user has ALL of the specified permissions
   * @param requiredPermissions - Array of permissions required
   * @returns boolean - true if user has all specified permissions
   */
  const hasAllPermissions = useCallback((requiredPermissions: Permission[]): boolean => {
    return requiredPermissions.every((permission) => permissions.includes(permission))
  }, [permissions])

  /**
   * Check if user has ANY of the specified permissions
   * @param permissionOptions - Array of permissions to check
   * @returns boolean - true if user has at least one of the specified permissions
   */
  const hasAnyPermission = useCallback((permissionOptions: Permission[]): boolean => {
    return permissionOptions.some((permission) => permissions.includes(permission))
  }, [permissions])

  /**
   * Get the user's current role
   * @returns Role | null - The user's role or null if not loaded
   */
  const getRole = useCallback((): Role | null => {
    return role
  }, [role])

  /**
   * Get all permissions for the user
   * @returns Permission[] - Array of permission strings
   */
  const getPermissionsList = useCallback((): Permission[] => {
    return [...permissions]
  }, [permissions])

  /**
   * Check if user is an admin
   * @returns boolean - true if user is an admin
   */
  const isAdmin = useCallback((): boolean => {
    return role === "ADMIN"
  }, [role])

  /**
   * Check if user is a provider or admin
   * @returns boolean - true if user is a provider or admin
   */
  const isProvider = useCallback((): boolean => {
    return role === "PROVIDER" || role === "ADMIN"
  }, [role])

  /**
   * Refresh permissions from the server
   * Useful after role changes or permission updates
   */
  const refreshPermissions = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const data = await getUserPermissionsAction()
      setRole(data.role)
      setPermissions(data.permissions)
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to refresh permissions"))
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    role,
    permissions,
    loading,
    error,
    hasPermission,
    hasRole,
    hasAllPermissions,
    hasAnyPermission,
    getRole,
    getPermissionsList,
    isAdmin,
    isProvider,
    refreshPermissions,
  }
}

/**
 * Hook to use permissions with a specific permission required.
 * Will cause the component to only render when the permission is present.
 * 
 * @param permission - The permission required
 * @returns Object containing hasPermission and the permission data
 */
export function usePermission(permission: Permission) {
  const { hasPermission, loading, error, role, permissions } = usePermissions()

  return {
    hasPermission: hasPermission(permission),
    loading,
    error,
    role,
    permissions,
  }
}

/**
 * Hook to use role-based access control with multiple permissions.
 * Supports requiring all permissions (AND) or any permission (OR).
 * 
 * @param options - Configuration options
 * @returns Object containing access status and permission data
 */
export function usePermissionGate(options: {
  permission: Permission | Permission[]
  requireAll?: boolean
}) {
  const { hasPermission, hasAllPermissions, hasAnyPermission, loading, error, role, permissions } = usePermissions()

  const { permission, requireAll = false } = options

  const hasAccess = Array.isArray(permission)
    ? requireAll
      ? hasAllPermissions(permission)
      : hasAnyPermission(permission)
    : hasPermission(permission)

  return {
    hasAccess,
    loading,
    error,
    role,
    permissions,
  }
}

"use client"

import React from "react"
import { usePermissions } from "@/hooks/usePermissions"
import { Permission } from "@/lib/rbac/permissions"
import { Role } from "@/lib/rbac/roles"

// ============================================================================
// Role-Based Visibility Components
// ============================================================================

interface ShowIfAdminProps {
  children: React.ReactNode
}

/**
 * ShowIfAdmin - Renders children only for admin users.
 * Use for admin-only features like user management, system settings, audit logs.
 */
export function ShowIfAdmin({ children }: ShowIfAdminProps) {
  const { isAdmin, loading } = usePermissions()

  if (loading) {
    return null
  }

  if (isAdmin()) {
    return <>{children}</>
  }

  return null
}

interface ShowIfProviderProps {
  children: React.ReactNode
}

/**
 * ShowIfProvider - Renders children for provider and admin roles.
 * Use for provider-level features like document upload, approval workflows.
 */
export function ShowIfProvider({ children }: ShowIfProviderProps) {
  const { isProvider, loading } = usePermissions()

  if (loading) {
    return null
  }

  if (isProvider()) {
    return <>{children}</>
  }

  return null
}

interface ShowIfStaffProps {
  children: React.ReactNode
}

/**
 * ShowIfStaff - Renders children for all authenticated users (staff, provider, admin).
 * Use for basic features available to all users.
 */
export function ShowIfStaff({ children }: ShowIfStaffProps) {
  const { role, loading } = usePermissions()

  if (loading) {
    return null
  }

  if (role) {
    return <>{children}</>
  }

  return null
}

// ============================================================================
// Permission-Based Visibility Components
// ============================================================================

interface ShowIfHasPermissionProps {
  permission: Permission
  children: React.ReactNode
}

/**
 * ShowIfHasPermission - Renders children if user has the specified permission.
 */
export function ShowIfHasPermission({ permission, children }: ShowIfHasPermissionProps) {
  const { hasPermission, loading } = usePermissions()

  if (loading) {
    return null
  }

  if (hasPermission(permission)) {
    return <>{children}</>
  }

  return null
}

interface ShowIfHasAnyPermissionProps {
  permissions: Permission[]
  children: React.ReactNode
}

/**
 * ShowIfHasAnyPermission - Renders children if user has ANY of the specified permissions.
 */
export function ShowIfHasAnyPermission({ permissions, children }: ShowIfHasAnyPermissionProps) {
  const { hasAnyPermission, loading } = usePermissions()

  if (loading) {
    return null
  }

  if (hasAnyPermission(permissions)) {
    return <>{children}</>
  }

  return null
}

interface ShowIfHasAllPermissionsProps {
  permissions: Permission[]
  children: React.ReactNode
}

/**
 * ShowIfHasAllPermissions - Renders children if user has ALL of the specified permissions.
 */
export function ShowIfHasAllPermissions({ permissions, children }: ShowIfHasAllPermissionsProps) {
  const { hasAllPermissions, loading } = usePermissions()

  if (loading) {
    return null
  }

  if (hasAllPermissions(permissions)) {
    return <>{children}</>
  }

  return null
}

// ============================================================================
// Hide-Based Visibility Components
// ============================================================================

interface HideIfRoleProps {
  role: Role
  children: React.ReactNode
}

/**
 * HideIfRole - Hides children for the specified role.
 * Renders children if user does NOT have the specified role.
 */
export function HideIfRole({ role, children }: HideIfRoleProps) {
  const { hasRole, loading } = usePermissions()

  if (loading) {
    return <>{children}</>
  }

  if (!hasRole(role)) {
    return <>{children}</>
  }

  return null
}

interface HideIfHasPermissionProps {
  permission: Permission
  children: React.ReactNode
}

/**
 * HideIfHasPermission - Hides children if user has the specified permission.
 * Renders children if user does NOT have the permission.
 */
export function HideIfHasPermission({ permission, children }: HideIfHasPermissionProps) {
  const { hasPermission, loading } = usePermissions()

  if (loading) {
    return <>{children}</>
  }

  if (!hasPermission(permission)) {
    return <>{children}</>
  }

  return null
}

// ============================================================================
// Feature Visibility Configuration
// ============================================================================

/**
 * Feature visibility mapping based on role hierarchy.
 * Used to determine which features are available to each role.
 */
export const FEATURE_VISIBILITY = {
  // Basic features (available to all authenticated users)
  chatInterface: {
    staff: true,
    provider: true,
    admin: true,
    permission: "CHAT_ACCESS" as Permission,
  },
  conversationHistory: {
    staff: true,
    provider: true,
    admin: true,
    permission: "HISTORY_VIEW" as Permission,
  },
  viewDocuments: {
    staff: true,
    provider: true,
    admin: true,
    permission: "DOC_VIEW" as Permission,
  },

  // Provider features
  uploadDocuments: {
    staff: false,
    provider: true,
    admin: true,
    permission: "DOC_UPLOAD" as Permission,
  },
  feedbackSubmission: {
    staff: true,
    provider: true,
    admin: true,
    permission: "FEEDBACK_SUBMIT" as Permission,
  },

  // Admin features
  approveDocuments: {
    staff: false,
    provider: false,
    admin: true,
    permission: "DOC_APPROVE" as Permission,
  },
  deprecateDocuments: {
    staff: false,
    provider: false,
    admin: true,
    permission: "DOC_DEPRECATE" as Permission,
  },
  userManagement: {
    staff: false,
    provider: false,
    admin: true,
    permission: "USER_MANAGE" as Permission,
  },
  inviteUsers: {
    staff: false,
    provider: false,
    admin: true,
    permission: "USER_INVITE" as Permission,
  },
  viewAuditLogs: {
    staff: false,
    provider: false,
    admin: true,
    permission: "AUDIT_VIEW" as Permission,
  },
  exportAuditLogs: {
    staff: false,
    provider: false,
    admin: true,
    permission: "AUDIT_EXPORT" as Permission,
  },
  systemConfiguration: {
    staff: false,
    provider: false,
    admin: true,
    permission: "SYSTEM_CONFIG" as Permission,
  },
  emergencyAccess: {
    staff: false,
    provider: false,
    admin: true,
    permission: "EMERGENCY_ACCESS" as Permission,
  },
  feedbackView: {
    staff: false,
    provider: true,
    admin: true,
    permission: "FEEDBACK_VIEW" as Permission,
  },
}

/**
 * Check if a feature is visible for a given role
 */
export function isFeatureVisible(
  feature: keyof typeof FEATURE_VISIBILITY,
  role: Role | null
): boolean {
  if (!role) return false

  const featureConfig = FEATURE_VISIBILITY[feature]
  
  switch (role) {
    case "STAFF":
      return featureConfig.staff
    case "PROVIDER":
      return featureConfig.provider
    case "ADMIN":
      return featureConfig.admin
    default:
      return false
  }
}

/**
 * Get the permission required for a feature
 */
export function getFeaturePermission(
  feature: keyof typeof FEATURE_VISIBILITY
): Permission | null {
  return FEATURE_VISIBILITY[feature]?.permission || null
}

// ============================================================================
// Role Badge Component
// ============================================================================

interface RoleBadgeProps {
  role?: Role | null
  showLabel?: boolean
  size?: "sm" | "md" | "lg"
}

/**
 * RoleBadge - Displays the user's role with color coding.
 */
export function RoleBadge({ role, showLabel = true, size = "md" }: RoleBadgeProps) {
  if (!role) {
    return null
  }

  const roleConfig = {
    ADMIN: {
      color: "bg-purple-100 text-purple-800 border-purple-200",
      label: "Admin",
      icon: "👑",
    },
    PROVIDER: {
      color: "bg-blue-100 text-blue-800 border-blue-200",
      label: "Provider",
      icon: "⚕️",
    },
    STAFF: {
      color: "bg-gray-100 text-gray-800 border-gray-200",
      label: "Staff",
      icon: "👤",
    },
  }

  const config = roleConfig[role]

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-3 py-1",
    lg: "text-base px-4 py-2",
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${config.color} ${sizeClasses[size]}`}
      title={`${config.label} role`}
    >
      <span>{config.icon}</span>
      {showLabel && <span>{config.label}</span>}
    </span>
  )
}

// ============================================================================
// Role Description Component
// ============================================================================

interface RoleDescriptionProps {
  role?: Role | null
}

/**
 * RoleDescription - Shows what capabilities the current role provides.
 */
export function RoleDescription({ role }: RoleDescriptionProps) {
  if (!role) {
    return null
  }

  const descriptions = {
    ADMIN: "Full access to all features including user management, system configuration, and audit logs.",
    PROVIDER: "Access to document management and approval workflows, plus all staff features.",
    STAFF: "Basic access to chat interface, conversation history, and document viewing.",
  }

  return (
    <p className="text-sm text-gray-600 mt-1">
      {descriptions[role]}
    </p>
  )
}

// ============================================================================
// Feature Access Matrix Component
// ============================================================================

interface FeatureAccessMatrixProps {
  currentRole?: Role | null
  showAllFeatures?: boolean
}

/**
 * FeatureAccessMatrix - Displays a table showing which features are
 * available to each role.
 */
export function FeatureAccessMatrix({ 
  currentRole, 
  showAllFeatures = true 
}: FeatureAccessMatrixProps) {
  const { role, loading } = usePermissions()

  if (loading) {
    return null
  }

  const displayRole = currentRole || role

  const features = Object.entries(FEATURE_VISIBILITY).map(([key, config]) => ({
    key,
    name: key.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase()),
    staff: config.staff,
    provider: config.provider,
    admin: config.admin,
    permission: config.permission,
  }))

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 px-3 font-medium text-gray-600">Feature</th>
            <th className="text-center py-2 px-3 font-medium text-gray-600">Staff</th>
            <th className="text-center py-2 px-3 font-medium text-gray-600">Provider</th>
            <th className="text-center py-2 px-3 font-medium text-gray-600">Admin</th>
          </tr>
        </thead>
        <tbody>
          {features.map((feature) => {
            const isCurrentRoleFeature = displayRole && (
              (displayRole === "STAFF" && feature.staff) ||
              (displayRole === "PROVIDER" && feature.provider) ||
              (displayRole === "ADMIN" && feature.admin)
            )

            return (
              <tr 
                key={feature.key} 
                className={`border-b last:border-0 ${
                  isCurrentRoleFeature ? "bg-green-50" : ""
                }`}
              >
                <td className="py-2 px-3">
                  <span className="font-medium">{feature.name}</span>
                </td>
                <td className="text-center py-2 px-3">
                  {feature.staff ? "✅" : "❌"}
                </td>
                <td className="text-center py-2 px-3">
                  {feature.provider ? "✅" : "❌"}
                </td>
                <td className="text-center py-2 px-3">
                  {feature.admin ? "✅" : "❌"}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// Permission List Component
// ============================================================================

interface PermissionListProps {
  permissions?: Permission[]
  role?: Role | null
  showDescriptions?: boolean
}

/**
 * PermissionList - Displays a list of permissions with optional descriptions.
 */
export function PermissionList({ 
  permissions: propPermissions, 
  role: propRole,
  showDescriptions = false 
}: PermissionListProps) {
  const { permissions, role, loading } = usePermissions()

  const displayPermissions = propPermissions || permissions
  const displayRole = propRole || role

  if (loading) {
    return null
  }

  if (!displayPermissions || displayPermissions.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No permissions assigned.
      </p>
    )
  }

  const permissionDescriptions: Record<Permission, string> = {
    DOC_VIEW: "View documents in the system",
    DOC_UPLOAD: "Upload new documents",
    DOC_APPROVE: "Approve or reject pending documents",
    DOC_DEPRECATE: "Mark documents as deprecated",
    CHAT_ACCESS: "Access the chat interface",
    HISTORY_VIEW: "View conversation history",
    FEEDBACK_SUBMIT: "Submit feedback on responses",
    FEEDBACK_VIEW: "View feedback statistics",
    USER_INVITE: "Invite new users to the organization",
    USER_MANAGE: "Manage user accounts and roles",
    AUDIT_VIEW: "View audit logs",
    AUDIT_EXPORT: "Export audit logs to CSV",
    SYSTEM_CONFIG: "Configure system settings",
    EMERGENCY_ACCESS: "Request emergency access to documents",
  }

  return (
    <ul className="space-y-1">
      {displayPermissions.map((permission) => (
        <li 
          key={permission} 
          className="text-sm flex items-start gap-2"
        >
          <span className="text-green-600 mt-0.5">✓</span>
          <div>
            <span className="font-medium">{permission}</span>
            {showDescriptions && permissionDescriptions[permission] && (
              <p className="text-xs text-gray-500 mt-0.5">
                {permissionDescriptions[permission]}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

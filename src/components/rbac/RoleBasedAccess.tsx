"use client"

import React from "react"
import { usePermissions } from "@/hooks/usePermissions"
import {
  RoleBadge,
  RoleDescription,
  PermissionList,
  FeatureAccessMatrix,
  FEATURE_VISIBILITY,
} from "./FeatureVisibility"
import { Role } from "@/lib/rbac/roles"
import { Permission } from "@/lib/rbac/permissions"

// ============================================================================
// RoleBasedAccess - Main Component
// ============================================================================

interface RoleBasedAccessProps {
  /**
   * Optional className for custom styling
   */
  className?: string
}

/**
 * RoleBasedAccess - Displays comprehensive information about the current
 * user's role, permissions, and available features.
 */
export function RoleBasedAccess({ className }: RoleBasedAccessProps) {
  const { role, permissions, loading } = usePermissions()

  if (loading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-32 bg-gray-200 rounded-lg"></div>
      </div>
    )
  }

  return (
    <div className={className}>
      {/* Role Badge Section */}
      <div className="flex items-center gap-3 mb-4">
        <RoleBadge role={role} size="lg" />
        <div>
          <h3 className="font-semibold text-lg">Your Access Level</h3>
          <RoleDescription role={role} />
        </div>
      </div>

      {/* Permissions List */}
      <div className="mb-6">
        <h4 className="font-medium text-gray-700 mb-2">Your Permissions</h4>
        <PermissionList 
          permissions={permissions} 
          showDescriptions={true}
        />
      </div>

      {/* Feature Access Matrix */}
      <div>
        <h4 className="font-medium text-gray-700 mb-2">Feature Access Matrix</h4>
        <FeatureAccessMatrix currentRole={role} />
      </div>
    </div>
  )
}

// ============================================================================
// Role Overview Card Component
// ============================================================================

interface RoleOverviewCardProps {
  role?: Role | null
  permissions?: Permission[]
  showFeatureMatrix?: boolean
}

/**
 * RoleOverviewCard - A compact card showing role information
 * and available permissions.
 */
export function RoleOverviewCard({
  role,
  permissions,
  showFeatureMatrix = false,
}: RoleOverviewCardProps) {
  const { loading } = usePermissions()
  const { role: contextRole, permissions: contextPermissions } = usePermissions()

  const displayRole = role || contextRole
  const displayPermissions = permissions || contextPermissions

  if (loading) {
    return <div className="animate-pulse h-48 bg-gray-200 rounded-lg"></div>
  }

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">Role Overview</h3>
        <RoleBadge role={displayRole} />
      </div>

      {/* Description */}
      <RoleDescription role={displayRole} />

      {/* Permissions Preview */}
      <div className="mt-3">
        <p className="text-sm text-gray-600">
          <span className="font-medium">{displayPermissions.length}</span> permissions
        </p>
      </div>

      {/* Feature Matrix (optional) */}
      {showFeatureMatrix && (
        <div className="mt-4 pt-4 border-t">
          <FeatureAccessMatrix currentRole={displayRole} />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Permission Summary Component
// ============================================================================

interface PermissionSummaryProps {
  compact?: boolean
}

/**
 * PermissionSummary - Shows a summary of the user's permissions
 * with quick access to permission details.
 */
export function PermissionSummary({ compact = false }: PermissionSummaryProps) {
  const { role, permissions, loading } = usePermissions()

  if (loading) {
    return <div className="animate-pulse h-20 bg-gray-200 rounded"></div>
  }

  if (compact) {
    return (
      <div className="text-sm">
        <span className="font-medium">{role}</span>
        <span className="text-gray-500"> • </span>
        <span>{permissions.length} permissions</span>
      </div>
    )
  }

  // Categorize permissions by type
  const permissionCategories = {
    document: permissions.filter((p) => p.startsWith("DOC_")),
    chat: permissions.filter((p) => p.startsWith("CHAT_") || p.startsWith("HISTORY_")),
    feedback: permissions.filter((p) => p.startsWith("FEEDBACK_")),
    user: permissions.filter((p) => p.startsWith("USER_")),
    audit: permissions.filter((p) => p.startsWith("AUDIT_")),
    system: permissions.filter((p) => p.startsWith("SYSTEM_") || p === "EMERGENCY_ACCESS"),
  }

  const categoryLabels = {
    document: "Document Access",
    chat: "Chat & History",
    feedback: "Feedback",
    user: "User Management",
    audit: "Audit & Compliance",
    system: "System & Emergency",
  }

  return (
    <div className="space-y-4">
      {/* Role Badge */}
      <div className="flex items-center gap-2">
        <RoleBadge role={role} size="md" />
        <span className="text-gray-600">
          ({permissions.length} total permissions)
        </span>
      </div>

      {/* Categorized Permissions */}
      {Object.entries(permissionCategories).map(([category, categoryPermissions]) => {
        if (categoryPermissions.length === 0) return null

        return (
          <div key={category}>
            <h4 className="text-sm font-medium text-gray-700 mb-1">
              {categoryLabels[category as keyof typeof categoryLabels]}
            </h4>
            <div className="flex flex-wrap gap-1">
              {categoryPermissions.map((permission) => (
                <span
                  key={permission}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700"
                >
                  {permission.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// Quick Access Panel Component
// ============================================================================

interface QuickAccessPanelProps {
  showLabels?: boolean
  maxItems?: number
}

/**
 * QuickAccessPanel - Shows quick access buttons for commonly used
 * features based on the user's permissions.
 */
export function QuickAccessPanel({
  showLabels = true,
  maxItems = 4,
}: QuickAccessPanelProps) {
  const { role, permissions, loading } = usePermissions()

  if (loading) {
    return <div className="animate-pulse h-32 bg-gray-200 rounded-lg"></div>
  }

  // Define quick access features
  const quickAccessFeatures = [
    {
      key: "chatInterface",
      label: "New Chat",
      icon: "💬",
      permission: "CHAT_ACCESS" as Permission,
    },
    {
      key: "viewDocuments",
      label: "Documents",
      icon: "📄",
      permission: "DOC_VIEW" as Permission,
    },
    {
      key: "uploadDocuments",
      label: "Upload",
      icon: "⬆️",
      permission: "DOC_UPLOAD" as Permission,
    },
    {
      key: "feedbackView",
      label: "Feedback",
      icon: "📊",
      permission: "FEEDBACK_VIEW" as Permission,
    },
    {
      key: "viewAuditLogs",
      label: "Audit Logs",
      icon: "📋",
      permission: "AUDIT_VIEW" as Permission,
    },
    {
      key: "userManagement",
      label: "Users",
      icon: "👥",
      permission: "USER_MANAGE" as Permission,
    },
    {
      key: "systemConfiguration",
      label: "Settings",
      icon: "⚙️",
      permission: "SYSTEM_CONFIG" as Permission,
    },
  ]

  // Filter features based on user's permissions
  const availableFeatures = quickAccessFeatures.filter(
    (feature) => permissions.includes(feature.permission)
  )

  // Limit to max items
  const displayFeatures = availableFeatures.slice(0, maxItems)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {displayFeatures.map((feature) => (
        <button
          key={feature.key}
          className="flex flex-col items-center justify-center p-3 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          title={`Access ${feature.label}`}
        >
          <span className="text-2xl mb-1">{feature.icon}</span>
          {showLabels && (
            <span className="text-sm font-medium text-gray-700">
              {feature.label}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ============================================================================
// Role Comparison Table Component
// ============================================================================

interface RoleComparisonTableProps {
  highlightRole?: Role
}

/**
 * RoleComparisonTable - Displays a comprehensive comparison of all
 * roles and their permissions.
 */
export function RoleComparisonTable({ highlightRole }: RoleComparisonTableProps) {
  const { role: currentRole, loading } = usePermissions()

  const displayHighlight = highlightRole || currentRole

  if (loading) {
    return <div className="animate-pulse h-64 bg-gray-200 rounded-lg"></div>
  }

  const roles: Role[] = ["STAFF", "PROVIDER", "ADMIN"]
  const allPermissions = Object.values(FEATURE_VISIBILITY)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-gray-200">
            <th className="text-left py-3 px-4 font-semibold text-gray-700">
              Feature
            </th>
            {roles.map((role) => (
              <th
                key={role}
                className={`text-center py-3 px-4 font-semibold ${
                  displayHighlight === role
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700"
                }`}
              >
                {role}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allPermissions.map((feature, index) => (
            <tr
              key={feature.permission}
              className={`border-b ${
                index % 2 === 0 ? "bg-white" : "bg-gray-50"
              } hover:bg-gray-100`}
            >
              <td className="py-2 px-4 font-medium text-gray-700">
                {feature.permission.replace(/_/g, " ")}
              </td>
              {roles.map((role) => {
                const hasAccess =
                  role === "ADMIN"
                    ? feature.admin
                    : role === "PROVIDER"
                    ? feature.provider
                    : feature.staff

                return (
                  <td
                    key={role}
                    className={`text-center py-2 px-4 ${
                      displayHighlight === role && hasAccess
                        ? "bg-blue-50"
                        : ""
                    }`}
                  >
                    {hasAccess ? (
                      <span className="text-green-600 font-medium">✓</span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200">
            <td className="py-3 px-4 font-semibold text-gray-700">Total</td>
            {roles.map((role) => {
              const count =
                role === "ADMIN"
                  ? allPermissions.filter((f) => f.admin).length
                  : role === "PROVIDER"
                  ? allPermissions.filter((f) => f.provider).length
                  : allPermissions.filter((f) => f.staff).length

              return (
                <td
                  key={role}
                  className={`text-center py-3 px-4 font-semibold ${
                    displayHighlight === role
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700"
                  }`}
                >
                  {count}
                </td>
              )
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ============================================================================
// Export all components
// ============================================================================

export {
  RoleBasedAccess,
  RoleOverviewCard,
  PermissionSummary,
  QuickAccessPanel,
  RoleComparisonTable,
}

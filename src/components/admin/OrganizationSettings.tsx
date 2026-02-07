"use client"

import React, { useEffect } from "react"
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings"
import { usePermissions } from "@/hooks/usePermissions"
import { Permission } from "@/lib/rbac/permissions"
import { SessionTimeoutSettings } from "./SessionTimeoutSettings"
import { MFAPolicySettings } from "./MFAPolicySettings"
import { cn } from "@/lib/utils"

// ============================================================================
// Basic UI Components (inline to avoid missing dependencies)
// ============================================================================

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "outline" | "ghost" | "default" | "destructive"
  size?: "sm" | "md" | "lg"
}

function Button({
  variant = "default",
  size = "md",
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = "inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
  
  const variants = {
    default: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500",
    outline: "border border-gray-300 bg-white hover:bg-gray-50 focus:ring-gray-500",
    ghost: "hover:bg-gray-100 focus:ring-gray-500",
    destructive: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500"
  }

  const sizes = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 py-2",
    lg: "h-12 px-6 text-lg"
  }

  return (
    <button
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}

interface SkeletonProps {
  className?: string
}

function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("animate-pulse bg-gray-200 rounded", className)} />
  )
}

interface CardProps {
  children: React.ReactNode
  className?: string
}

function Card({ children, className }: CardProps) {
  return (
    <div className={cn("bg-white rounded-lg border border-gray-200 shadow-sm", className)}>
      {children}
    </div>
  )
}

function CardHeader({ children, className }: CardProps) {
  return (
    <div className={cn("px-6 py-4 border-b border-gray-200", className)}>
      {children}
    </div>
  )
}

function CardTitle({ children, className }: CardProps) {
  return (
    <h2 className={cn("text-xl font-semibold text-gray-900", className)}>
      {children}
    </h2>
  )
}

function CardDescription({ children, className }: CardProps) {
  return (
    <p className={cn("text-sm text-gray-500 mt-1", className)}>
      {children}
    </p>
  )
}

function CardContent({ children, className }: CardProps) {
  return (
    <div className={cn("px-6 py-4", className)}>
      {children}
    </div>
  )
}

// ============================================================================
// Types
// ============================================================================

interface OrganizationSettingsProps {
  showSection?: ("timeout" | "mfa" | "password" | "lockout")[]
  className?: string
}

// ============================================================================
// Main Component
// ============================================================================

export function OrganizationSettings({
  showSection = ["timeout", "mfa", "password", "lockout"],
  className
}: OrganizationSettingsProps) {
  const { settings, loading, error, updateSettings, refresh, clearError } = useOrganizationSettings()
  const { hasPermission, loading: permissionsLoading } = usePermissions(Permission.SYSTEM_CONFIG)

  // Clear error when component unmounts or settings load
  useEffect(() => {
    if (settings) {
      clearError()
    }
  }, [settings, clearError])

  // Loading state
  if (loading || permissionsLoading) {
    return (
      <div className={cn("space-y-6", className)}>
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96 mt-2" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Access denied state
  if (!hasPermission) {
    return (
      <Card className={className}>
        <CardContent>
          <div className="flex items-start gap-4 p-4">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Access Denied</h3>
              <p className="mt-1 text-sm text-gray-600">
                You do not have permission to view or modify organization settings.
                You need the <code className="px-1.5 py-0.5 bg-gray-100 rounded text-sm">SYSTEM_CONFIG</code> permission to access this page.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Error state
  if (error) {
    return (
      <Card className={className}>
        <CardContent>
          <div className="flex items-start gap-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-red-800">Error Loading Settings</h3>
              <p className="mt-1 text-sm text-red-600">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={refresh}
                className="mt-3"
              >
                Try Again
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // No settings available
  if (!settings) {
    return (
      <Card className={className}>
        <CardContent>
          <div className="flex items-start gap-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-amber-800">Settings Not Available</h3>
              <p className="mt-1 text-sm text-amber-600">
                Unable to load organization settings. Please try refreshing the page.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={refresh}
                className="mt-3"
              >
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Last updated info
  const lastUpdatedText = settings.updatedAt 
    ? `Last updated by ${settings.updatedBy || 'unknown'} on ${new Date(settings.updatedAt).toLocaleDateString()}`
    : "Settings have not been configured yet"

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Organization Settings</CardTitle>
              <CardDescription>
                Configure security and compliance settings for your organization.
                These settings apply to all users in your organization.
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>HIPAA Compliant</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {lastUpdatedText}
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Session Timeout Settings */}
      {showSection.includes("timeout") && (
        <SessionTimeoutSettings
          settings={settings}
          onUpdate={updateSettings}
        />
      )}

      {/* MFA Policy Settings */}
      {showSection.includes("mfa") && (
        <MFAPolicySettings
          settings={settings}
          onUpdate={updateSettings}
        />
      )}

      {/* Additional Settings Sections (placeholder for future expansion) */}
      {showSection.includes("password") && (
        <Card>
          <CardHeader>
            <CardTitle>Password Requirements</CardTitle>
            <CardDescription>
              Configure password complexity requirements for user accounts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-center text-center">
                <div>
                  <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <h4 className="text-sm font-medium text-gray-600">Password Settings</h4>
                  <p className="text-xs text-gray-400 mt-1">
                    Minimum length: {settings.passwordMinLength} characters<br />
                    Special characters: {settings.passwordRequireSpecial ? "Required" : "Optional"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lockout Settings */}
      {showSection.includes("lockout") && (
        <Card>
          <CardHeader>
            <CardTitle>Account Lockout</CardTitle>
            <CardDescription>
              Configure account lockout behavior after failed login attempts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-center text-center">
                <div>
                  <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <h4 className="text-sm font-medium text-gray-600">Lockout Settings</h4>
                  <p className="text-xs text-gray-400 mt-1">
                    Max failed attempts: {settings.maxLoginAttempts}<br />
                    Lockout duration: {settings.lockoutDurationMinutes} minutes
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audit Trail Info */}
      <Card>
        <CardHeader>
          <CardTitle>Audit Trail</CardTitle>
          <CardDescription>
            All settings changes are logged and can be viewed in the audit log
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-blue-800">Compliance Monitoring</h4>
                <p className="text-xs text-blue-600 mt-1">
                  Settings changes are automatically logged to the audit trail with:
                </p>
                <ul className="text-xs text-blue-600 mt-2 space-y-1 list-disc list-inside">
                  <li>Who made the change (user ID)</li>
                  <li>When the change was made (timestamp)</li>
                  <li>What was changed (previous vs. new values)</li>
                  <li>IP address and user agent for security</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// Export for use in admin pages
// ============================================================================

export default OrganizationSettings

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/server/actions/rbac/check-permission"
import { Permission } from "@/lib/rbac/permissions"
import { headers } from "next/headers"

// ============================================
// Types
// ============================================

export interface OrganizationSettings {
  sessionTimeoutMinutes: number
  sessionWarningMinutes: number
  mfaPolicy: 'required' | 'optional' | 'disabled'
  mfaEnforcementDate?: Date | null
  passwordMinLength: number
  passwordRequireSpecial: boolean
  maxLoginAttempts: number
  lockoutDurationMinutes: number
  updatedAt: Date | null
  updatedBy: string | null
}

// Default settings for new organizations
const DEFAULT_SETTINGS: OrganizationSettings = {
  sessionTimeoutMinutes: 30,
  sessionWarningMinutes: 5,
  mfaPolicy: 'optional',
  mfaEnforcementDate: null,
  passwordMinLength: 12,
  passwordRequireSpecial: true,
  maxLoginAttempts: 5,
  lockoutDurationMinutes: 30,
  updatedAt: null,
  updatedBy: null
}

// ============================================
// Server Actions
// ============================================

/**
 * Get organization settings for the current user's organization.
 * Requires: SYSTEM_CONFIG permission
 * 
 * @returns Promise<OrganizationSettings> - Organization settings or defaults if not configured
 */
export async function getOrganizationSettingsAction(): Promise<OrganizationSettings> {
  const session = await auth()
  
  if (!session?.user?.id) {
    throw new Error("Authentication required")
  }

  const userId = session.user.id
  const orgId = session.user.org_id

  // Require SYSTEM_CONFIG permission to view settings
  await requirePermission(Permission.SYSTEM_CONFIG)

  // Fetch organization settings from database
  const organization = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { settings: true, name: true }
  })

  if (!organization) {
    throw new Error("Organization not found")
  }

  // Parse settings from JSON or return defaults
  const storedSettings = organization.settings as Record<string, any> | null
  
  if (!storedSettings) {
    return DEFAULT_SETTINGS
  }

  // Map stored settings to our interface
  return {
    sessionTimeoutMinutes: storedSettings.sessionTimeoutMinutes ?? DEFAULT_SETTINGS.sessionTimeoutMinutes,
    sessionWarningMinutes: storedSettings.sessionWarningMinutes ?? DEFAULT_SETTINGS.sessionWarningMinutes,
    mfaPolicy: storedSettings.mfaPolicy ?? DEFAULT_SETTINGS.mfaPolicy,
    mfaEnforcementDate: storedSettings.mfaEnforcementDate 
      ? new Date(storedSettings.mfaEnforcementDate) 
      : null,
    passwordMinLength: storedSettings.passwordMinLength ?? DEFAULT_SETTINGS.passwordMinLength,
    passwordRequireSpecial: storedSettings.passwordRequireSpecial ?? DEFAULT_SETTINGS.passwordRequireSpecial,
    maxLoginAttempts: storedSettings.maxLoginAttempts ?? DEFAULT_SETTINGS.maxLoginAttempts,
    lockoutDurationMinutes: storedSettings.lockoutDurationMinutes ?? DEFAULT_SETTINGS.lockoutDurationMinutes,
    updatedAt: storedSettings.updatedAt ? new Date(storedSettings.updatedAt) : null,
    updatedBy: storedSettings.updatedBy ?? null
  }
}

/**
 * Get effective settings for a user (applies organization defaults with user overrides).
 * Used by Phase 1 auth to determine session timeout and MFA requirements.
 * 
 * @param userId - The user ID to get settings for
 * @returns Promise<OrganizationSettings> - Effective organization settings
 */
export async function getEffectiveOrganizationSettings(userId: string): Promise<OrganizationSettings> {
  // Get user's organization ID
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { org_id: true }
  })

  if (!user) {
    throw new Error("User not found")
  }

  // Fetch organization settings
  const organization = await prisma.organization.findUnique({
    where: { id: user.org_id },
    select: { settings: true }
  })

  const storedSettings = organization?.settings as Record<string, any> | null
  
  if (!storedSettings) {
    return DEFAULT_SETTINGS
  }

  // Return mapped settings
  return {
    sessionTimeoutMinutes: storedSettings.sessionTimeoutMinutes ?? DEFAULT_SETTINGS.sessionTimeoutMinutes,
    sessionWarningMinutes: storedSettings.sessionWarningMinutes ?? DEFAULT_SETTINGS.sessionWarningMinutes,
    mfaPolicy: storedSettings.mfaPolicy ?? DEFAULT_SETTINGS.mfaPolicy,
    mfaEnforcementDate: storedSettings.mfaEnforcementDate 
      ? new Date(storedSettings.mfaEnforcementDate) 
      : null,
    passwordMinLength: storedSettings.passwordMinLength ?? DEFAULT_SETTINGS.passwordMinLength,
    passwordRequireSpecial: storedSettings.passwordRequireSpecial ?? DEFAULT_SETTINGS.passwordRequireSpecial,
    maxLoginAttempts: storedSettings.maxLoginAttempts ?? DEFAULT_SETTINGS.maxLoginAttempts,
    lockoutDurationMinutes: storedSettings.lockoutDurationMinutes ?? DEFAULT_SETTINGS.lockoutDurationMinutes,
    updatedAt: storedSettings.updatedAt ? new Date(storedSettings.updatedAt) : null,
    updatedBy: storedSettings.updatedBy ?? null
  }
}

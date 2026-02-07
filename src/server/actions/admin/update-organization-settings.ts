import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/server/actions/rbac/check-permission"
import { Permission } from "@/lib/rbac/permissions"
import { auditService } from "@/lib/compliance/audit"
import { headers } from "next/headers"

// Import types from get-organization-settings for consistency
import type { OrganizationSettings } from "./get-organization-settings"

// ============================================
// Validation Constants
// ============================================

const VALIDATION_RULES = {
  sessionTimeoutMinutes: { min: 5, max: 480, message: "Session timeout must be between 5 minutes and 8 hours" },
  sessionWarningMinutes: { min: 1, max: 30, message: "Warning time must be between 1 and 30 minutes" },
  passwordMinLength: { min: 8, max: 128, message: "Password minimum length must be between 8 and 128 characters" },
  maxLoginAttempts: { min: 3, max: 10, message: "Maximum login attempts must be between 3 and 10" },
  lockoutDurationMinutes: { min: 5, max: 1440, message: "Lockout duration must be between 5 minutes and 24 hours" }
}

// ============================================
// Validation Functions
// ============================================

interface ValidationError {
  field: string
  message: string
}

function validateSettingsUpdate(input: Partial<OrganizationSettings>): ValidationError[] {
  const errors: ValidationError[] = []

  if (input.sessionTimeoutMinutes !== undefined) {
    if (input.sessionTimeoutMinutes < VALIDATION_RULES.sessionTimeoutMinutes.min || 
        input.sessionTimeoutMinutes > VALIDATION_RULES.sessionTimeoutMinutes.max) {
      errors.push({
        field: 'sessionTimeoutMinutes',
        message: VALIDATION_RULES.sessionTimeoutMinutes.message
      })
    }
  }

  if (input.sessionWarningMinutes !== undefined) {
    if (input.sessionWarningMinutes < VALIDATION_RULES.sessionWarningMinutes.min || 
        input.sessionWarningMinutes > VALIDATION_RULES.sessionWarningMinutes.max) {
      errors.push({
        field: 'sessionWarningMinutes',
        message: VALIDATION_RULES.sessionWarningMinutes.message
      })
    }
  }

  if (input.passwordMinLength !== undefined) {
    if (input.passwordMinLength < VALIDATION_RULES.passwordMinLength.min || 
        input.passwordMinLength > VALIDATION_RULES.passwordMinLength.max) {
      errors.push({
        field: 'passwordMinLength',
        message: VALIDATION_RULES.passwordMinLength.message
      })
    }
  }

  if (input.maxLoginAttempts !== undefined) {
    if (input.maxLoginAttempts < VALIDATION_RULES.maxLoginAttempts.min || 
        input.maxLoginAttempts > VALIDATION_RULES.maxLoginAttempts.max) {
      errors.push({
        field: 'maxLoginAttempts',
        message: VALIDATION_RULES.maxLoginAttempts.message
      })
    }
  }

  if (input.lockoutDurationMinutes !== undefined) {
    if (input.lockoutDurationMinutes < VALIDATION_RULES.lockoutDurationMinutes.min || 
        input.lockoutDurationMinutes > VALIDATION_RULES.lockoutDurationMinutes.max) {
      errors.push({
        field: 'lockoutDurationMinutes',
        message: VALIDATION_RULES.lockoutDurationMinutes.message
      })
    }
  }

  // Cross-field validation: warning time must be less than timeout
  if (input.sessionTimeoutMinutes !== undefined && input.sessionWarningMinutes !== undefined) {
    if (input.sessionWarningMinutes >= input.sessionTimeoutMinutes) {
      errors.push({
        field: 'sessionWarningMinutes',
        message: "Warning time must be less than session timeout"
      })
    }
  }

  // MFA enforcement date must be in the future if specified
  if (input.mfaEnforcementDate !== undefined && input.mfaEnforcementDate !== null) {
    const enforcementDate = new Date(input.mfaEnforcementDate)
    const now = new Date()
    if (enforcementDate <= now) {
      errors.push({
        field: 'mfaEnforcementDate',
        message: "MFA enforcement date must be in the future"
      })
    }
  }

  // MFA policy validation
  if (input.mfaPolicy !== undefined) {
    if (!['required', 'optional', 'disabled'].includes(input.mfaPolicy)) {
      errors.push({
        field: 'mfaPolicy',
        message: "MFA policy must be 'required', 'optional', or 'disabled'"
      })
    }
  }

  return errors
}

// ============================================
// Server Actions
// ============================================

/**
 * Update organization settings.
 * Requires: SYSTEM_CONFIG permission
 * Logs: SETTINGS_CHANGE action to audit log
 * 
 * @param input - Partial settings to update
 * @returns Promise<OrganizationSettings> - Updated organization settings
 */
export async function updateOrganizationSettingsAction(
  input: Partial<OrganizationSettings>
): Promise<OrganizationSettings> {
  const session = await auth()
  
  if (!session?.user?.id) {
    throw new Error("Authentication required")
  }

  const userId = session.user.id
  const orgId = session.user.org_id
  const ipAddress = headers().get("x-forwarded-for") || "unknown"
  const userAgent = headers().get("user-agent") || "unknown"

  // Require SYSTEM_CONFIG permission to modify settings
  await requirePermission(Permission.SYSTEM_CONFIG)

  // Validate input
  const validationErrors = validateSettingsUpdate(input)
  if (validationErrors.length > 0) {
    const errorMessages = validationErrors.map(e => `${e.field}: ${e.message}`).join("; ")
    throw new Error(`Validation failed: ${errorMessages}`)
  }

  // Get current settings
  const currentOrganization = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { settings: true }
  })

  const currentSettings = (currentOrganization?.settings as Record<string, any>) || {}

  // Build update object
  const updatedSettings = {
    ...currentSettings,
    ...input,
    // Handle date serialization
    mfaEnforcementDate: input.mfaEnforcementDate 
      ? new Date(input.mfaEnforcementDate).toISOString() 
      : null,
    updatedAt: new Date().toISOString(),
    updatedBy: userId
  }

  // Update organization settings in database
  const updatedOrganization = await prisma.organization.update({
    where: { id: orgId },
    data: {
      settings: updatedSettings
    },
    select: { settings: true }
  })

  // Log the settings change to audit log
  await auditService.log(
    'SETTINGS_CHANGED',
    'organization',
    orgId,
    userId,
    orgId,
    ipAddress,
    userAgent,
    {
      changes: input,
      previousValues: currentSettings,
      newValues: updatedSettings,
      affectedUsers: 'all_users_in_organization'
    }
  )

  // If MFA policy changed to 'required', trigger notifications (placeholder for future implementation)
  if (input.mfaPolicy === 'required' && currentSettings.mfaPolicy !== 'required') {
    // TODO: Implement user notification for MFA requirement
    // This could trigger an email campaign or in-app notifications
    console.log(`MFA policy changed to required for organization ${orgId}. Users will need to set up MFA.`)
  }

  // Return the updated settings
  const storedSettings = updatedOrganization.settings as Record<string, any>
  
  return {
    sessionTimeoutMinutes: storedSettings.sessionTimeoutMinutes,
    sessionWarningMinutes: storedSettings.sessionWarningMinutes,
    mfaPolicy: storedSettings.mfaPolicy,
    mfaEnforcementDate: storedSettings.mfaEnforcementDate 
      ? new Date(storedSettings.mfaEnforcementDate) 
      : null,
    passwordMinLength: storedSettings.passwordMinLength,
    passwordRequireSpecial: storedSettings.passwordRequireSpecial,
    maxLoginAttempts: storedSettings.maxLoginAttempts,
    lockoutDurationMinutes: storedSettings.lockoutDurationMinutes,
    updatedAt: storedSettings.updatedAt ? new Date(storedSettings.updatedAt) : null,
    updatedBy: storedSettings.updatedBy
  }
}

/**
 * Reset organization settings to defaults.
 * Requires: SYSTEM_CONFIG permission
 * 
 * @returns Promise<OrganizationSettings> - Default organization settings
 */
export async function resetOrganizationSettingsAction(): Promise<OrganizationSettings> {
  const session = await auth()
  
  if (!session?.user?.id) {
    throw new Error("Authentication required")
  }

  const userId = session.user.id
  const orgId = session.user.org_id
  const ipAddress = headers().get("x-forwarded-for") || "unknown"
  const userAgent = headers().get("user-agent") || "unknown"

  // Require SYSTEM_CONFIG permission
  await requirePermission(Permission.SYSTEM_CONFIG)

  // Get current settings for audit log
  const currentOrganization = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { settings: true }
  })

  const previousSettings = (currentOrganization?.settings as Record<string, any>) || {}

  // Reset to default settings
  const defaultSettings = {
    sessionTimeoutMinutes: 30,
    sessionWarningMinutes: 5,
    mfaPolicy: 'optional',
    mfaEnforcementDate: null,
    passwordMinLength: 12,
    passwordRequireSpecial: true,
    maxLoginAttempts: 5,
    lockoutDurationMinutes: 30,
    updatedAt: new Date().toISOString(),
    updatedBy: userId
  }

  // Update organization settings
  await prisma.organization.update({
    where: { id: orgId },
    data: { settings: defaultSettings }
  })

  // Log the reset action
  await auditService.log(
    'SETTINGS_CHANGED',
    'organization',
    orgId,
    userId,
    orgId,
    ipAddress,
    userAgent,
    {
      action: 'reset_to_defaults',
      previousValues: previousSettings,
      newValues: defaultSettings
    }
  )

  return {
    sessionTimeoutMinutes: defaultSettings.sessionTimeoutMinutes,
    sessionWarningMinutes: defaultSettings.sessionWarningMinutes,
    mfaPolicy: defaultSettings.mfaPolicy as 'required' | 'optional' | 'disabled',
    mfaEnforcementDate: null,
    passwordMinLength: defaultSettings.passwordMinLength,
    passwordRequireSpecial: defaultSettings.passwordRequireSpecial,
    maxLoginAttempts: defaultSettings.maxLoginAttempts,
    lockoutDurationMinutes: defaultSettings.lockoutDurationMinutes,
    updatedAt: new Date(),
    updatedBy: userId
  }
}

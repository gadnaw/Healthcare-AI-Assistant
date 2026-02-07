"use client"

import React, { useState, useEffect, useCallback } from "react"
import { OrganizationSettings } from "@/server/actions/admin/get-organization-settings"
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

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

function Label({ className, children, ...props }: LabelProps) {
  return (
    <label className={cn("block text-sm font-medium text-gray-700", className)} {...props}>
      {children}
    </label>
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

function CardContent({ children, className }: CardProps) {
  return (
    <div className={cn("px-6 py-4", className)}>
      {children}
    </div>
  )
}

interface RadioGroupProps {
  value: string
  onValueChange: (value: string) => void
  children: React.ReactNode
  className?: string
}

function RadioGroup({ value, onValueChange, children, className }: RadioGroupProps) {
  return (
    <div className={cn("space-y-2", className)} role="radiogroup">
      {children}
    </div>
  )
}

interface RadioGroupItemProps {
  value: string
  id: string
  disabled?: boolean
}

function RadioGroupItem({ value, id, disabled }: RadioGroupItemProps) {
  return (
    <div className="flex items-center space-x-2">
      <input
        type="radio"
        id={id}
        value={value}
        checked={false} // Controlled by parent state
        disabled={disabled}
        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
        onChange={() => {}}
      />
      {/* Note: Actual controlled implementation handled by parent */}
    </div>
  )
}

// ============================================================================
// Types
// ============================================================================

interface MFAPolicySettingsProps {
  settings: OrganizationSettings
  onUpdate: (updates: Partial<OrganizationSettings>) => Promise<void>
  disabled?: boolean
}

// ============================================================================
// Policy Options
// ============================================================================

const MFA_POLICIES = [
  {
    value: "disabled",
    label: "Disabled",
    description: "Users cannot set up MFA. This is not recommended for HIPAA compliance.",
    warning: null,
    color: "gray"
  },
  {
    value: "optional",
    label: "Optional",
    description: "Users may set up MFA for additional security. They can choose to enable it.",
    warning: null,
    color: "blue"
  },
  {
    value: "required",
    label: "Required",
    description: "All users must set up MFA to access the system. Users without MFA will be blocked.",
    warning: "This will require all users to set up MFA. Users without MFA will be blocked from accessing the system.",
    color: "red"
  }
] as const

// ============================================================================
// Main Component
// ============================================================================

export function MFAPolicySettings({
  settings,
  onUpdate,
  disabled = false
}: MFAPolicySettingsProps) {
  const [localPolicy, setLocalPolicy] = useState(settings.mfaPolicy)
  const [localEnforcementDate, setLocalEnforcementDate] = useState(
    settings.mfaEnforcementDate 
      ? new Date(settings.mfaEnforcementDate).toISOString().split('T')[0] 
      : ""
  )
  const [showEnforcementDate, setShowEnforcementDate] = useState(
    settings.mfaPolicy === "required" && !!settings.mfaEnforcementDate
  )
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Update local state when settings change
  useEffect(() => {
    setLocalPolicy(settings.mfaPolicy)
    setLocalEnforcementDate(
      settings.mfaEnforcementDate 
        ? new Date(settings.mfaEnforcementDate).toISOString().split('T')[0] 
        : ""
    )
    setShowEnforcementDate(
      settings.mfaPolicy === "required" && !!settings.mfaEnforcementDate
    )
  }, [settings])

  // Track changes
  useEffect(() => {
    const policyChanged = localPolicy !== settings.mfaPolicy
    const dateChanged = localEnforcementDate !== (
      settings.mfaEnforcementDate 
        ? new Date(settings.mfaEnforcementDate).toISOString().split('T')[0] 
        : ""
    )
    setHasChanges(policyChanged || dateChanged)
  }, [localPolicy, localEnforcementDate, settings])

  // Validation
  useEffect(() => {
    if (localPolicy === "required" && localEnforcementDate) {
      const enforcementDate = new Date(localEnforcementDate)
      const now = new Date()
      if (enforcementDate <= now) {
        setValidationError("Enforcement date must be in the future")
      } else {
        setValidationError(null)
      }
    } else {
      setValidationError(null)
    }
  }, [localPolicy, localEnforcementDate])

  // Handle policy change
  const handlePolicyChange = useCallback((policy: typeof localPolicy) => {
    if (policy === "required" && settings.mfaPolicy !== "required") {
      // Show confirmation dialog for changing to required
      setShowConfirmDialog(true)
    } else {
      setLocalPolicy(policy)
      setShowEnforcementDate(policy === "required")
    }
  }, [settings.mfaPolicy])

  // Confirm policy change to required
  const confirmPolicyChange = useCallback(() => {
    setLocalPolicy("required")
    setShowEnforcementDate(true)
    setShowConfirmDialog(false)
  }, [])

  // Cancel policy change
  const cancelPolicyChange = useCallback(() => {
    setShowConfirmDialog(false)
  }, [])

  // Handle enforcement date change
  const handleEnforcementDateChange = useCallback((value: string) => {
    setLocalEnforcementDate(value)
  }, [])

  // Save changes
  const handleSave = useCallback(async () => {
    if (validationError) return

    setIsSaving(true)
    try {
      await onUpdate({
        mfaPolicy: localPolicy,
        mfaEnforcementDate: localEnforcementDate 
          ? new Date(localEnforcementDate) 
          : null
      })
      setHasChanges(false)
    } catch (error) {
      console.error("Failed to save MFA policy settings:", error)
    } finally {
      setIsSaving(false)
    }
  }, [localPolicy, localEnforcementDate, validationError, onUpdate])

  // Reset to saved values
  const handleReset = useCallback(() => {
    setLocalPolicy(settings.mfaPolicy)
    setLocalEnforcementDate(
      settings.mfaEnforcementDate 
        ? new Date(settings.mfaEnforcementDate).toISOString().split('T')[0] 
        : ""
    )
    setShowEnforcementDate(
      settings.mfaPolicy === "required" && !!settings.mfaEnforcementDate
    )
    setHasChanges(false)
  }, [settings])

  // Get current policy info
  const currentPolicyInfo = MFA_POLICIES.find(p => p.value === localPolicy) || MFA_POLICIES[1]

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">MFA Policy</h3>
              <p className="text-sm text-gray-500 mt-1">
                Configure multi-factor authentication requirements for your organization
              </p>
            </div>
            {hasChanges && (
              <span className="text-sm text-amber-600 font-medium">Unsaved changes</span>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Policy Selection */}
          <div className="space-y-3">
            <Label>MFA Policy</Label>
            
            <RadioGroup value={localPolicy} onValueChange={(value) => handlePolicyChange(value as typeof localPolicy)}>
              {MFA_POLICIES.map((policy) => (
                <div
                  key={policy.value}
                  className={cn(
                    "relative flex items-start p-4 rounded-lg border-2 transition-colors cursor-pointer",
                    localPolicy === policy.value
                      ? `border-${policy.color}-500 bg-${policy.color}-50`
                      : "border-gray-200 hover:border-gray-300",
                    disabled && "opacity-50 cursor-not-allowed"
                  )}
                  onClick={() => !disabled && handlePolicyChange(policy.value as typeof localPolicy)}
                >
                  <div className="flex items-center h-5">
                    <input
                      type="radio"
                      id={policy.value}
                      name="mfa-policy"
                      checked={localPolicy === policy.value}
                      onChange={() => {}}
                      disabled={disabled}
                      className={cn(
                        "w-4 h-4",
                        localPolicy === policy.value ? `text-${policy.color}-600` : "text-gray-400",
                        "border-gray-300 focus:ring-blue-500"
                      )}
                    />
                  </div>
                  <div className="ml-3 flex-1">
                    <label
                      htmlFor={policy.value}
                      className={cn(
                        "font-medium",
                        localPolicy === policy.value ? `text-${policy.color}-700` : "text-gray-900"
                      )}
                    >
                      {policy.label}
                    </label>
                    <p className="text-sm text-gray-500 mt-1">
                      {policy.description}
                    </p>
                    
                    {/* Warning for required policy */}
                    {policy.warning && localPolicy === "required" && (
                      <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
                        <div className="flex items-start gap-2">
                          <svg
                            className="w-5 h-5 text-amber-600 mt-0.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                          </svg>
                          <div>
                            <span className="text-sm font-medium text-amber-700">
                              {policy.warning}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Enforcement Date (only for required policy) */}
          {showEnforcementDate && (
            <div className="space-y-3">
              <Label htmlFor="enforcement-date">
                MFA Enforcement Date
              </Label>
              
              <input
                type="date"
                id="enforcement-date"
                value={localEnforcementDate}
                onChange={(e) => handleEnforcementDateChange(e.target.value)}
                disabled={disabled || isSaving}
                min={new Date().toISOString().split('T')[0]}
                className={cn(
                  "flex h-10 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
                  validationError 
                    ? "border-red-300 bg-red-50" 
                    : "border-gray-300 bg-white"
                )}
              />
              
              <p className="text-xs text-gray-500">
                Users will be required to set up MFA after this date. Leave empty for immediate enforcement.
              </p>
              
              {validationError && (
                <p className="text-sm text-red-600">{validationError}</p>
              )}
            </div>
          )}

          {/* Current Policy Summary */}
          <div className={cn(
            "p-4 rounded-lg border",
            currentPolicyInfo.color === "red" && "bg-red-50 border-red-200",
            currentPolicyInfo.color === "blue" && "bg-blue-50 border-blue-200",
            currentPolicyInfo.color === "gray" && "bg-gray-50 border-gray-200"
          )}>
            <div className="flex items-start gap-3">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center",
                currentPolicyInfo.color === "red" && "bg-red-100 text-red-600",
                currentPolicyInfo.color === "blue" && "bg-blue-100 text-blue-600",
                currentPolicyInfo.color === "gray" && "bg-gray-100 text-gray-600"
              )}>
                {currentPolicyInfo.color === "red" && (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                )}
                {currentPolicyInfo.color === "blue" && (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                )}
                {currentPolicyInfo.color === "gray" && (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                )}
              </div>
              <div>
                <h4 className={cn(
                  "font-medium",
                  currentPolicyInfo.color === "red" && "text-red-800",
                  currentPolicyInfo.color === "blue" && "text-blue-800",
                  currentPolicyInfo.color === "gray" && "text-gray-800"
                )}>
                  Current Policy: {currentPolicyInfo.label}
                </h4>
                <p className={cn(
                  "text-sm mt-1",
                  currentPolicyInfo.color === "red" && "text-red-600",
                  currentPolicyInfo.color === "blue" && "text-blue-600",
                  currentPolicyInfo.color === "gray" && "text-gray-600"
                )}>
                  {currentPolicyInfo.description}
                </p>
                {localEnforcementDate && (
                  <p className={cn(
                    "text-sm mt-2 font-medium",
                    currentPolicyInfo.color === "red" && "text-red-700"
                  )}>
                    Enforcement date: {new Date(localEnforcementDate).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          {hasChanges && (
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={disabled || isSaving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={disabled || isSaving || !!validationError}
              >
                {isSaving ? (
                  <>
                    <svg
                      className="w-4 h-4 mr-2 animate-spin"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog for Required Policy */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Require MFA for All Users?
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  This will require all users in your organization to set up multi-factor authentication. 
                  Users who have not set up MFA will be blocked from accessing the system.
                </p>
                <p className="mt-3 text-sm font-medium text-gray-900">
                  Are you sure you want to continue?
                </p>
              </div>
            </div>
            
            <div className="mt-6 flex items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={cancelPolicyChange}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmPolicyChange}
              >
                Yes, Require MFA
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

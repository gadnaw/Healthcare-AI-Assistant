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

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50",
        className
      )}
      {...props}
    />
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

// ============================================================================
// Types
// ============================================================================

interface SessionTimeoutSettingsProps {
  settings: OrganizationSettings
  onUpdate: (updates: Partial<OrganizationSettings>) => Promise<void>
  disabled?: boolean
}

// ============================================================================
// Preset Options
// ============================================================================

const TIMEOUT_PRESETS = [
  { label: "15 minutes", value: 15 },
  { label: "30 minutes", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "2 hours", value: 120 },
  { label: "4 hours", value: 240 },
  { label: "8 hours", value: 480 }
]

const WARNING_PRESETS = [
  { label: "1 minute", value: 1 },
  { label: "2 minutes", value: 2 },
  { label: "5 minutes", value: 5 },
  { label: "10 minutes", value: 10 },
  { label: "15 minutes", value: 15 }
]

// ============================================================================
// Main Component
// ============================================================================

export function SessionTimeoutSettings({
  settings,
  onUpdate,
  disabled = false
}: SessionTimeoutSettingsProps) {
  const [localTimeout, setLocalTimeout] = useState(settings.sessionTimeoutMinutes)
  const [localWarning, setLocalWarning] = useState(settings.sessionWarningMinutes)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Update local state when settings change
  useEffect(() => {
    setLocalTimeout(settings.sessionTimeoutMinutes)
    setLocalWarning(settings.sessionWarningMinutes)
  }, [settings])

  // Check for validation errors
  useEffect(() => {
    if (localWarning >= localTimeout) {
      setValidationError("Warning time must be less than session timeout")
    } else if (localTimeout < 5) {
      setValidationError("Session timeout must be at least 5 minutes")
    } else if (localTimeout > 480) {
      setValidationError("Session timeout cannot exceed 8 hours (480 minutes)")
    } else {
      setValidationError(null)
    }
  }, [localTimeout, localWarning])

  // Track changes
  useEffect(() => {
    setHasChanges(
      localTimeout !== settings.sessionTimeoutMinutes ||
      localWarning !== settings.sessionWarningMinutes
    )
  }, [localTimeout, localWarning, settings])

  // Handle timeout change
  const handleTimeoutChange = useCallback((value: number) => {
    setLocalTimeout(value)
  }, [])

  // Handle warning change
  const handleWarningChange = useCallback((value: number) => {
    setLocalWarning(value)
  }, [])

  // Save changes
  const handleSave = useCallback(async () => {
    if (validationError) return

    setIsSaving(true)
    try {
      await onUpdate({
        sessionTimeoutMinutes: localTimeout,
        sessionWarningMinutes: localWarning
      })
      setHasChanges(false)
    } catch (error) {
      console.error("Failed to save session timeout settings:", error)
    } finally {
      setIsSaving(false)
    }
  }, [localTimeout, localWarning, validationError, onUpdate])

  // Reset to saved values
  const handleReset = useCallback(() => {
    setLocalTimeout(settings.sessionTimeoutMinutes)
    setLocalWarning(settings.sessionWarningMinutes)
    setHasChanges(false)
  }, [settings])

  // Format time for display
  const formatTime = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes} min`
    }
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (mins === 0) {
      return `${hours} hr`
    }
    return `${hours} hr ${mins} min`
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Session Timeout</h3>
            <p className="text-sm text-gray-500 mt-1">
              Configure automatic logout for inactive users
            </p>
          </div>
          {hasChanges && (
            <span className="text-sm text-amber-600 font-medium">Unsaved changes</span>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Session Timeout Duration */}
        <div className="space-y-3">
          <Label htmlFor="session-timeout">
            Session Timeout Duration
            <span className="text-gray-400 ml-2">
              ({formatTime(localTimeout)})
            </span>
          </Label>
          
          {/* Number Input */}
          <div className="flex items-center gap-3">
            <Input
              id="session-timeout"
              type="number"
              min="5"
              max="480"
              value={localTimeout}
              onChange={(e) => handleTimeoutChange(Number(e.target.value))}
              disabled={disabled || isSaving}
              className="w-24"
            />
            <span className="text-sm text-gray-500">minutes</span>
          </div>
          
          {/* Preset Buttons */}
          <div className="flex flex-wrap gap-2">
            {TIMEOUT_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => handleTimeoutChange(preset.value)}
                disabled={disabled || isSaving}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md border transition-colors",
                  localTimeout === preset.value
                    ? "bg-blue-100 border-blue-300 text-blue-700"
                    : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
          
          <p className="text-xs text-gray-500">
            Users will be logged out after this duration of inactivity
          </p>
        </div>

        {/* Warning Before Timeout */}
        <div className="space-y-3">
          <Label htmlFor="session-warning">
            Show Warning Before Timeout
            <span className="text-gray-400 ml-2">
              ({formatTime(localWarning)})
            </span>
          </Label>
          
          {/* Number Input */}
          <div className="flex items-center gap-3">
            <Input
              id="session-warning"
              type="number"
              min="1"
              max="30"
              value={localWarning}
              onChange={(e) => handleWarningChange(Number(e.target.value))}
              disabled={disabled || isSaving}
              className="w-24"
            />
            <span className="text-sm text-gray-500">minutes before</span>
          </div>
          
          {/* Preset Buttons */}
          <div className="flex flex-wrap gap-2">
            {WARNING_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => handleWarningChange(preset.value)}
                disabled={disabled || isSaving}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md border transition-colors",
                  localWarning === preset.value
                    ? "bg-blue-100 border-blue-300 text-blue-700"
                    : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
          
          <p className="text-xs text-gray-500">
            Show countdown warning this many minutes before session expires
          </p>
        </div>

        {/* Validation Error */}
        {validationError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-center gap-2 text-red-700">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-sm font-medium">{validationError}</span>
            </div>
          </div>
        )}

        {/* Example Display */}
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Session Behavior Example</h4>
          
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>User active: Session continues normally</span>
            </div>
            
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>
                {formatTime(localWarning)} before timeout: Countdown warning appears
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>After {formatTime(localTimeout)} inactive: User automatically logged out</span>
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
  )
}

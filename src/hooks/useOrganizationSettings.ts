"use client"

import { useState, useEffect, useCallback } from "react"
import { 
  getOrganizationSettingsAction, 
  OrganizationSettings 
} from "@/server/actions/admin/get-organization-settings"
import { 
  updateOrganizationSettingsAction 
} from "@/server/actions/admin/update-organization-settings"

/**
 * Hook to manage organization settings on the client side.
 * Provides loading, saving, and error states with automatic initialization.
 * 
 * @returns Object containing settings state and update function
 */
export function useOrganizationSettings() {
  const [settings, setSettings] = useState<OrganizationSettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Load settings from server
   */
  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const data = await getOrganizationSettingsAction()
      setSettings(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load organization settings"
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Load settings on mount
   */
  useEffect(() => {
    let mounted = true

    async function fetchSettings() {
      try {
        const data = await getOrganizationSettingsAction()
        if (mounted) {
          setSettings(data)
        }
      } catch (err) {
        if (mounted) {
          const message = err instanceof Error ? err.message : "Failed to load organization settings"
          setError(message)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    fetchSettings()

    return () => {
      mounted = false
    }
  }, [])

  /**
   * Update settings with server action
   * @param updates - Partial settings to update
   * @returns Promise<OrganizationSettings> - Updated settings
   */
  const updateSettings = useCallback(async (
    updates: Partial<OrganizationSettings>
  ): Promise<OrganizationSettings | null> => {
    setSaving(true)
    setError(null)

    try {
      const updated = await updateOrganizationSettingsAction(updates)
      setSettings(updated)
      return updated
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update organization settings"
      setError(message)
      return null
    } finally {
      setSaving(false)
    }
  }, [])

  /**
   * Reset settings to defaults
   */
  const resetSettings = useCallback(async (): Promise<boolean> => {
    setSaving(true)
    setError(null)

    try {
      // We'll need to add a reset action or implement inline
      // For now, update to known defaults
      const defaults: Partial<OrganizationSettings> = {
        sessionTimeoutMinutes: 30,
        sessionWarningMinutes: 5,
        mfaPolicy: 'optional',
        mfaEnforcementDate: null,
        passwordMinLength: 12,
        passwordRequireSpecial: true,
        maxLoginAttempts: 5,
        lockoutDurationMinutes: 30
      }
      
      const updated = await updateOrganizationSettingsAction(defaults)
      setSettings(updated)
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reset organization settings"
      setError(message)
      return false
    } finally {
      setSaving(false)
    }
  }, [updateSettings])

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  /**
   * Refresh settings from server
   */
  const refresh = useCallback(async () => {
    await loadSettings()
  }, [loadSettings])

  return {
    settings,
    loading,
    saving,
    error,
    updateSettings,
    resetSettings,
    clearError,
    refresh,
    // Computed properties for convenience
    isLoaded: settings !== null,
    hasChanges: false // Could track this with additional state if needed
  }
}

/**
 * Hook to use organization settings with error handling and loading states.
 * Wraps the main hook with additional convenience features.
 * 
 * @param options - Configuration options
 * @returns Object containing settings and helper methods
 */
export function useOrganizationSettingsForm(options?: {
  onSuccess?: (settings: OrganizationSettings) => void
  onError?: (error: string) => void
}) {
  const hook = useOrganizationSettings()

  /**
   * Wrapper around updateSettings with callback support
   */
  const handleUpdate = useCallback(async (
    updates: Partial<OrganizationSettings>
  ): Promise<boolean> => {
    const result = await hook.updateSettings(updates)
    
    if (result) {
      options?.onSuccess?.(result)
      return true
    } else {
      options?.onError?.(hook.error || "Unknown error")
      return false
    }
  }, [hook, options])

  /**
   * Wrapper around resetSettings with callback support
   */
  const handleReset = useCallback(async (): Promise<boolean> => {
    const result = await hook.resetSettings()
    
    if (result) {
      options?.onSuccess?.(hook.settings!)
      return true
    } else {
      options?.onError?.(hook.error || "Unknown error")
      return false
    }
  }, [hook, options])

  return {
    ...hook,
    updateSettings: handleUpdate,
    resetSettings: handleReset
  }
}

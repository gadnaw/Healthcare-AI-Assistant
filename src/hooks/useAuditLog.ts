"use client"

import { useState, useEffect, useCallback } from "react"
import { getAuditLogsAction, exportAuditLogsAction, AuditLogFilters, AuditLogsResult, AuditLogEntry } from "@/server/actions/compliance"

/**
 * Hook to manage audit log data fetching and filtering.
 * Provides clean API for audit log operations with automatic refetching on filter changes.
 *
 * Features:
 * - Manages filter state and pagination
 * - Auto-fetches when filters change
 * - Provides export function that triggers CSV download
 * - Tracks loading and total count
 *
 * @returns Object containing logs, loading state, filters, and helper functions
 */
export function useAuditLog() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [filters, setFiltersState] = useState<AuditLogFilters>({
    page: 1,
    pageSize: 50
  })
  const [total, setTotal] = useState(0)

  /**
   * Fetch audit logs with current filters
   */
  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await getAuditLogsAction(filters)
      setLogs(result.logs)
      setTotal(result.total)
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch audit logs"))
    } finally {
      setLoading(false)
    }
  }, [filters])

  /**
   * Fetch logs on mount and when filters change
   */
  useEffect(() => {
    let mounted = true

    async function loadLogs() {
      if (!mounted) return

      setLoading(true)
      setError(null)

      try {
        const result = await getAuditLogsAction(filters)
        if (mounted) {
          setLogs(result.logs)
          setTotal(result.total)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error("Failed to fetch audit logs"))
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadLogs()

    return () => {
      mounted = false
    }
  }, [filters.page, filters.pageSize])

  /**
   * Update a single filter value
   * Automatically resets to page 1 when filters change
   */
  function setFilter<K extends keyof AuditLogFilters>(
    key: K,
    value: AuditLogFilters[K]
  ) {
    setFiltersState(prev => ({
      ...prev,
      [key]: value,
      page: key !== 'page' && key !== 'pageSize' ? 1 : prev.page
    }))
  }

  /**
   * Clear all filters and reset to defaults
   */
  function clearFilters() {
    setFiltersState({
      page: 1,
      pageSize: 50
    })
  }

  /**
   * Export filtered logs to CSV
   * Triggers browser download
   */
  const exportLogs = useCallback(async () => {
    try {
      const blob = await exportAuditLogsAction(filters)

      // Create download link
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to export audit logs"))
      throw err
    }
  }, [filters])

  /**
   * Refresh logs with current filters
   */
  function refresh() {
    fetchLogs()
  }

  /**
   * Set page number
   */
  function setPage(page: number) {
    setFiltersState(prev => ({
      ...prev,
      page
    }))
  }

  /**
   * Set page size
   */
  function setPageSize(size: number) {
    setFiltersState(prev => ({
      ...prev,
      pageSize: size,
      page: 1
    }))
  }

  return {
    logs,
    loading,
    error,
    filters,
    total,
    setFilter,
    clearFilters,
    exportLogs,
    refresh,
    setPage,
    setPageSize
  }
}

/**
 * Hook to get recent audit actions for the current user.
 * Useful for activity dashboards.
 *
 * @param limit - Maximum number of actions to fetch (default: 20)
 * @returns Object containing recent actions and loading state
 */
export function useRecentActions(limit: number = 20) {
  const [actions, setActions] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let mounted = true

    async function fetchActions() {
      setLoading(true)
      setError(null)

      try {
        const result = await getAuditLogsAction({
          page: 1,
          pageSize: limit
        })

        if (mounted) {
          setActions(result.logs)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error("Failed to fetch recent actions"))
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    fetchActions()

    return () => {
      mounted = false
    }
  }, [limit])

  return {
    actions,
    loading,
    error,
    refresh: fetchActions
  }
}

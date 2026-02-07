'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSystemHealthAction, type SystemHealthData } from '@/server/actions/compliance/get-system-health'
import { getComplianceMetricsAction, type ComplianceMetrics } from '@/server/actions/compliance/get-compliance-metrics'

/**
 * Hook return type for system health monitoring
 */
export interface UseSystemHealthReturn {
  health: SystemHealthData | null
  compliance: ComplianceMetrics | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Custom hook for system health monitoring with auto-refresh
 * 
 * @param refreshInterval - Auto-refresh interval in milliseconds (default: 30000ms = 30 seconds)
 * @returns Object containing health data, compliance metrics, loading state, error, and refresh function
 * 
 * @example
 * const { health, compliance, loading, error, refresh } = useSystemHealth(30000)
 */
export function useSystemHealth(refreshInterval = 30000): UseSystemHealthReturn {
  const [health, setHealth] = useState<SystemHealthData | null>(null)
  const [compliance, setCompliance] = useState<ComplianceMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  
  /**
   * Fetch both health and compliance data
   */
  const fetchData = useCallback(async () => {
    // Don't set loading to true on background refreshes to avoid UI flicker
    // Only show loading on initial load or manual refresh
    if (health === null && compliance === null) {
      setLoading(true)
    }
    
    try {
      const [healthData, complianceData] = await Promise.all([
        getSystemHealthAction(),
        getComplianceMetricsAction()
      ])
      
      setHealth(healthData)
      setCompliance(complianceData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch health data')
      // Don't clear existing data on error - show stale data with error state
    } finally {
      setLoading(false)
    }
  }, [health, compliance])
  
  /**
   * Manual refresh function that can be called by user
   */
  const manualRefresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    await fetchData()
  }, [fetchData])
  
  /**
   * Fetch data on mount and when refreshKey changes
   */
  useEffect(() => {
    fetchData()
  }, [fetchData])
  
  /**
   * Set up auto-refresh interval
   */
  useEffect(() => {
    // Only set up interval if we have valid data and no errors
    if (refreshInterval <= 0) {
      return
    }
    
    const interval = setInterval(() => {
      fetchData()
    }, refreshInterval)
    
    // Cleanup interval on unmount
    return () => clearInterval(interval)
  }, [refreshInterval, fetchData])
  
  return {
    health,
    compliance,
    loading,
    error,
    refresh: manualRefresh
  }
}

/**
 * Hook for just health data (lighter weight)
 */
export function useHealthOnly(refreshInterval = 30000) {
  const [health, setHealth] = useState<SystemHealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const fetchHealth = useCallback(async () => {
    if (health === null) {
      setLoading(true)
    }
    
    try {
      const healthData = await getSystemHealthAction()
      setHealth(healthData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch health data')
    } finally {
      setLoading(false)
    }
  }, [health])
  
  useEffect(() => {
    fetchHealth()
  }, [fetchHealth])
  
  useEffect(() => {
    if (refreshInterval <= 0) return
    
    const interval = setInterval(fetchHealth, refreshInterval)
    return () => clearInterval(interval)
  }, [refreshInterval, fetchHealth])
  
  return { health, loading, error, refresh: fetchHealth }
}

/**
 * Hook for just compliance metrics
 */
export function useComplianceOnly(refreshInterval = 60000) {
  const [compliance, setCompliance] = useState<ComplianceMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const fetchCompliance = useCallback(async () => {
    if (compliance === null) {
      setLoading(true)
    }
    
    try {
      const complianceData = await getComplianceMetricsAction()
      setCompliance(complianceData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch compliance metrics')
    } finally {
      setLoading(false)
    }
  }, [compliance])
  
  useEffect(() => {
    fetchCompliance()
  }, [fetchCompliance])
  
  useEffect(() => {
    if (refreshInterval <= 0) return
    
    const interval = setInterval(fetchCompliance, refreshInterval)
    return () => clearInterval(interval)
  }, [refreshInterval, fetchCompliance])
  
  return { compliance, loading, error, refresh: fetchCompliance }
}

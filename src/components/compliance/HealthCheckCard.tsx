'use client'

import { useState } from 'react'
import { type HealthCheck } from '@/server/actions/compliance/get-system-health'
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, Clock, Activity } from 'lucide-react'

/**
 * Props for HealthCheckCard component
 */
interface HealthCheckCardProps {
  check: HealthCheck
  compact?: boolean
  onRetry?: () => void
}

/**
 * Status badge colors and icons
 */
const statusConfig = {
  healthy: {
    color: 'bg-green-100 text-green-800 border-green-200',
    icon: CheckCircle,
    label: 'Healthy'
  },
  degraded: {
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    icon: AlertTriangle,
    label: 'Degraded'
  },
  unhealthy: {
    color: 'bg-red-100 text-red-800 border-red-200',
    icon: XCircle,
    label: 'Unhealthy'
  }
}

/**
 * Format latency for display
 */
function formatLatency(latencyMs?: number): string {
  if (latencyMs === undefined) return 'N/A'
  if (latencyMs < 1000) return `${latencyMs}ms`
  return `${(latencyMs / 1000).toFixed(2)}s`
}

/**
 * Format relative time ago
 */
function formatTimeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - new Date(date).getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  
  if (diffSeconds < 60) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${Math.floor(diffHours / 24)}d ago`
}

/**
 * Compact version of health check card
 */
function CompactCard({ check, onRetry }: HealthCheckCardProps) {
  const config = statusConfig[check.status]
  const StatusIcon = config.icon
  const [retrying, setRetrying] = useState(false)
  
  const handleRetry = async () => {
    if (onRetry) {
      setRetrying(true)
      try {
        await onRetry()
      } finally {
        setRetrying(false)
      }
    }
  }
  
  return (
    <div className={`
      relative overflow-hidden rounded-lg border p-3 transition-all duration-200
      ${check.status === 'healthy' ? 'border-green-200 bg-green-50/50' : ''}
      ${check.status === 'degraded' ? 'border-yellow-200 bg-yellow-50/50' : ''}
      ${check.status === 'unhealthy' ? 'border-red-200 bg-red-50/50' : ''}
      hover:shadow-md
    `}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <StatusIcon className={`h-5 w-5 ${check.status === 'healthy' ? 'text-green-600' : ''} ${check.status === 'degraded' ? 'text-yellow-600' : ''} ${check.status === 'unhealthy' ? 'text-red-600' : ''}`} />
          <div>
            <p className="text-sm font-medium text-gray-900">{check.name}</p>
            <p className="text-xs text-gray-500">{config.label}</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {check.latencyMs !== undefined && (
            <div className="flex items-center text-xs text-gray-500">
              <Clock className="mr-1 h-3 w-3" />
              {formatLatency(check.latencyMs)}
            </div>
          )}
          
          {onRetry && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
              title="Retry check"
            >
              <RefreshCw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>
      
      {/* Compact details on hover */}
      <div className="mt-2 text-xs text-gray-500">
        {check.message && <p className="truncate">{check.message}</p>}
        <p>Last checked: {formatTimeAgo(check.lastChecked)}</p>
      </div>
    </div>
  )
}

/**
 * Full version of health check card with all details
 */
function FullCard({ check, onRetry }: HealthCheckCardProps) {
  const config = statusConfig[check.status]
  const StatusIcon = config.icon
  const [retrying, setRetrying] = useState(false)
  
  const handleRetry = async () => {
    if (onRetry) {
      setRetrying(true)
      try {
        await onRetry()
      } finally {
        setRetrying(false)
      }
    }
  }
  
  return (
    <div className={`
      rounded-lg border p-4 transition-all duration-200
      ${check.status === 'healthy' ? 'border-green-200 bg-green-50/30' : ''}
      ${check.status === 'degraded' ? 'border-yellow-200 bg-yellow-50/30' : ''}
      ${check.status === 'unhealthy' ? 'border-red-200 bg-red-50/30' : ''}
      hover:shadow-lg
    `}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className={`
            rounded-full p-2
            ${check.status === 'healthy' ? 'bg-green-100' : ''}
            ${check.status === 'degraded' ? 'bg-yellow-100' : ''}
            ${check.status === 'unhealthy' ? 'bg-red-100' : ''}
          `}>
            <StatusIcon className={`h-6 w-6 ${check.status === 'healthy' ? 'text-green-600' : ''} ${check.status === 'degraded' ? 'text-yellow-600' : ''} ${check.status === 'unhealthy' ? 'text-red-600' : ''}`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{check.name}</h3>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${config.color}`}>
              {config.label}
            </span>
          </div>
        </div>
        
        {onRetry && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            <RefreshCw className={`mr-1.5 h-4 w-4 ${retrying ? 'animate-spin' : ''}`} />
            Retry
          </button>
        )}
      </div>
      
      {/* Details */}
      <div className="mt-4 space-y-3">
        {/* Status message */}
        {check.message && (
          <div className="flex items-start space-x-2">
            <Activity className="mt-0.5 h-4 w-4 text-gray-400 flex-shrink-0" />
            <p className="text-sm text-gray-600">{check.message}</p>
          </div>
        )}
        
        {/* Metrics row */}
        <div className="flex flex-wrap gap-4">
          {/* Latency */}
          {check.latencyMs !== undefined && (
            <div className="flex items-center space-x-1.5">
              <Clock className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500">Latency:</span>
              <span className={`text-sm font-medium ${check.latencyMs > 500 ? 'text-red-600' : check.latencyMs > 200 ? 'text-yellow-600' : 'text-green-600'}`}>
                {formatLatency(check.latencyMs)}
              </span>
            </div>
          )}
          
          {/* Last checked */}
          <div className="flex items-center space-x-1.5">
            <Clock className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-500">Last checked:</span>
            <span className="text-sm font-medium text-gray-700">
              {formatTimeAgo(check.lastChecked)}
            </span>
          </div>
        </div>
        
        {/* Additional details */}
        {check.details && Object.keys(check.details).length > 0 && (
          <div className="mt-3 rounded-md bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Details</p>
            <div className="mt-1 space-y-1">
              {Object.entries(check.details).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{key}:</span>
                  <span className="font-mono text-gray-800">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * HealthCheckCard component displays the status of an individual service health check
 * 
 * @param check - Health check data from getSystemHealthAction
 * @param compact - If true, shows compact version for dashboard grids (default: false)
 * @param onRetry - Optional callback to retry the health check
 * 
 * @example
 * // Full mode with all details
 * <HealthCheckCard 
 *   check={healthData.checks.database} 
 *   onRetry={() => refreshHealth()}
 * />
 * 
 * @example
 * // Compact mode for dashboard grids
 * <HealthCheckCard 
 *   check={healthData.checks.api} 
 *   compact={true}
 * />
 */
export function HealthCheckCard({ check, compact = false, onRetry }: HealthCheckCardProps) {
  if (compact) {
    return <CompactCard check={check} onRetry={onRetry} />
  }
  
  return <FullCard check={check} onRetry={onRetry} />
}

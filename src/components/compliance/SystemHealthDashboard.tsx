'use client'

import { useSystemHealth, type UseSystemHealthReturn } from '@/hooks/useSystemHealth'
import { HealthCheckCard } from './HealthCheckCard'
import { ComplianceMetrics } from './ComplianceMetrics'
import { PermissionGate } from '@/components/rbac/PermissionGate'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  RefreshCw, 
  Activity, 
  Users, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  AlertCircle,
  TrendingUp,
  BarChart3,
  Shield
} from 'lucide-react'

/**
 * Props for SystemHealthDashboard component
 */
interface SystemHealthDashboardProps {
  showCompliance?: boolean
  refreshInterval?: number
}

/**
 * Overall status banner component
 */
function StatusBanner({ status }: { status: 'healthy' | 'degraded' | 'unhealthy' }) {
  const config = {
    healthy: {
      icon: CheckCircle,
      color: 'bg-green-50 border-green-200 text-green-800',
      iconColor: 'text-green-600',
      label: 'All Systems Operational',
      description: 'Everything is running smoothly'
    },
    degraded: {
      icon: AlertTriangle,
      color: 'bg-yellow-50 border-yellow-200 text-yellow-800',
      iconColor: 'text-yellow-600',
      label: 'Some Systems Degraded',
      description: 'One or more services are experiencing issues'
    },
    unhealthy: {
      icon: AlertCircle,
      color: 'bg-red-50 border-red-200 text-red-800',
      iconColor: 'text-red-600',
      label: 'System-Wide Issues Detected',
      description: 'Critical services are unavailable'
    }
  }
  
  const { icon: Icon, color, iconColor, label, description } = config[status]
  
  return (
    <div className={`flex items-center space-x-4 rounded-lg border p-4 ${color}`}>
      <Icon className={`h-8 w-8 ${iconColor}`} />
      <div className="flex-1">
        <h2 className="text-lg font-semibold">{label}</h2>
        <p className="text-sm opacity-80">{description}</p>
      </div>
      <Badge variant={status === 'healthy' ? 'default' : status === 'degraded' ? 'warning' : 'destructive'}>
        {status.toUpperCase()}
      </Badge>
    </div>
  )
}

/**
 * Metric card component for dashboard metrics
 */
function MetricCard({ 
  label, 
  value, 
  icon: Icon, 
  warning = false,
  suffix = ''
}: { 
  label: string
  value: string | number
  icon: React.ElementType
  warning?: boolean
  suffix?: string
}) {
  return (
    <Card className={`transition-all hover:shadow-md ${warning ? 'border-yellow-300 bg-yellow-50/30' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-center space-x-3">
          <div className={`rounded-lg p-2 ${warning ? 'bg-yellow-100' : 'bg-gray-100'}`}>
            <Icon className={`h-5 w-5 ${warning ? 'text-yellow-600' : 'text-gray-600'}`} />
          </div>
          <div>
            <p className="text-sm text-gray-500">{label}</p>
            <p className={`text-2xl font-bold ${warning ? 'text-yellow-700' : 'text-gray-900'}`}>
              {typeof value === 'number' ? value.toLocaleString() : value}
              {suffix && <span className="text-sm font-normal text-gray-500 ml-1">{suffix}</span>}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Alert item component
 */
function AlertItem({ alert }: { alert: { type: string; message: string; timestamp: Date; service?: string } }) {
  const typeConfig = {
    error: { color: 'bg-red-100 text-red-800 border-red-200', icon: AlertCircle },
    warning: { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: AlertTriangle },
    info: { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Activity }
  }
  
  const config = typeConfig[alert.type as keyof typeof typeConfig] || typeConfig.info
  const Icon = config.icon
  const timeStr = new Date(alert.timestamp).toLocaleTimeString()
  
  return (
    <div className={`flex items-start space-x-3 rounded-md border p-3 ${config.color}`}>
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{alert.message}</p>
        <div className="flex items-center space-x-2 mt-1">
          <span className="text-xs opacity-75">{timeStr}</span>
          {alert.service && (
            <>
              <span className="text-xs opacity-50">•</span>
              <span className="text-xs opacity-75">{alert.service}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Recent alerts list component
 */
function RecentAlerts({ alerts }: { alerts: { type: string; message: string; timestamp: Date; service?: string }[] }) {
  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <CheckCircle className="h-12 w-12 text-green-500 mb-3" />
        <p className="text-gray-500">No recent alerts</p>
        <p className="text-sm text-gray-400">All systems operating normally</p>
      </div>
    )
  }
  
  return (
    <div className="space-y-3">
      {alerts.map((alert, index) => (
        <AlertItem key={index} alert={alert} />
      ))}
    </div>
  )
}

/**
 * Dashboard skeleton loader
 */
function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <div className="h-7 bg-gray-200 rounded w-48"></div>
          <div className="h-4 bg-gray-200 rounded w-32"></div>
        </div>
        <div className="h-10 bg-gray-200 rounded w-24"></div>
      </div>
      
      {/* Status banner skeleton */}
      <div className="h-24 bg-gray-200 rounded-lg"></div>
      
      {/* Health checks skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
        ))}
      </div>
      
      {/* Metrics skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
        ))}
      </div>
      
      {/* Alerts skeleton */}
      <div className="h-48 bg-gray-200 rounded-lg"></div>
    </div>
  )
}

/**
 * Error state component
 */
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to Load Dashboard</h3>
      <p className="text-gray-500 mb-4 max-w-md">{message}</p>
      <Button onClick={onRetry} className="inline-flex items-center">
        <RefreshCw className="mr-2 h-4 w-4" />
        Try Again
      </Button>
    </div>
  )
}

/**
 * Access denied component
 */
function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Shield className="h-16 w-16 text-gray-400 mb-4" />
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Access Denied</h3>
      <p className="text-gray-500 max-w-md">
        You don't have permission to view the system health dashboard. 
        Administrative access (SYSTEM_CONFIG) is required.
      </p>
    </div>
  )
}

/**
 * Permission-protected dashboard wrapper
 */
function ProtectedDashboard({ 
  showCompliance, 
  refreshInterval 
}: SystemHealthDashboardProps) {
  const { health, compliance, loading, error, refresh }: UseSystemHealthReturn = useSystemHealth(refreshInterval)
  
  if (loading) {
    return <DashboardSkeleton />
  }
  
  if (error) {
    return <ErrorState message={error} onRetry={refresh} />
  }
  
  if (!health) {
    return <ErrorState message="No health data received" onRetry={refresh} />
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Health</h1>
          <p className="text-muted-foreground flex items-center mt-1">
            <Clock className="mr-1.5 h-4 w-4" />
            Last updated: {new Date(health.timestamp).toLocaleString()}
          </p>
        </div>
        <Button variant="outline" onClick={refresh} className="w-full sm:w-auto">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>
      
      {/* Overall Status */}
      <StatusBanner status={health.status} />
      
      {/* Health Checks */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <Activity className="mr-2 h-5 w-5" />
          Service Health
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {health.checks.database && (
            <HealthCheckCard check={health.checks.database} compact />
          )}
          {health.checks.api && (
            <HealthCheckCard check={health.checks.api} compact />
          )}
          {health.checks.auth && (
            <HealthCheckCard check={health.checks.auth} compact />
          )}
          {health.checks.vectorStore && (
            <HealthCheckCard check={health.checks.vectorStore} compact />
          )}
        </div>
        
        {/* External Services */}
        {health.checks.externalServices.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-md font-medium text-gray-700">External Services</h3>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {health.checks.externalServices.map((check, index) => (
                <HealthCheckCard key={index} check={check} compact />
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* System Metrics */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <BarChart3 className="mr-2 h-5 w-5" />
          System Metrics
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Active Users"
            value={health.metrics.activeUsers}
            icon={Users}
          />
          <MetricCard
            label="Requests/min"
            value={health.metrics.requestsPerMinute}
            icon={Activity}
          />
          <MetricCard
            label="Avg Response"
            value={health.metrics.avgResponseTime}
            icon={Clock}
            suffix="ms"
          />
          <MetricCard
            label="Error Rate"
            value={health.metrics.errorRate.toFixed(2)}
            icon={AlertTriangle}
            warning={health.metrics.errorRate > 1}
            suffix="%"
          />
        </div>
      </div>
      
      {/* Recent Alerts */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <AlertTriangle className="mr-2 h-5 w-5" />
          Recent Alerts
        </h2>
        <Card>
          <CardContent className="pt-4">
            <RecentAlerts alerts={health.recentAlerts} />
          </CardContent>
        </Card>
      </div>
      
      {/* Compliance Section */}
      {showCompliance && compliance && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <Shield className="mr-2 h-5 w-5" />
            Compliance & Security
          </h2>
          <ComplianceMetrics metrics={compliance} />
        </div>
      )}
    </div>
  )
}

/**
 * SystemHealthDashboard - Main system health and compliance monitoring dashboard
 * 
 * Provides real-time visibility into system status, external service health,
 * and compliance metrics for operational monitoring and HIPAA compliance verification.
 * 
 * @param showCompliance - Whether to show compliance metrics section (default: true)
 * @param refreshInterval - Auto-refresh interval in milliseconds (default: 30000 = 30 seconds)
 * 
 * @example
 * // Default dashboard with compliance metrics
 * <SystemHealthDashboard />
 * 
 * @example
 * // Dashboard without compliance section
 * <SystemHealthDashboard showCompliance={false} refreshInterval={60000} />
 * 
 * @example
 * // Compact dashboard for sidebars
 * <SystemHealthDashboard showCompliance={false} refreshInterval={60000} />
 */
export function SystemHealthDashboard({ 
  showCompliance = true, 
  refreshInterval = 30000 
}: SystemHealthDashboardProps) {
  return (
    <PermissionGate 
      permission="SYSTEM_CONFIG"
      fallback={<AccessDenied />}
    >
      <ProtectedDashboard 
        showCompliance={showCompliance}
        refreshInterval={refreshInterval}
      />
    </PermissionGate>
  )
}

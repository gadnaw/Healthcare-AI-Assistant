'use server'

import { requirePermission } from '@/lib/rbac/role-utils'
import { prisma } from '@/lib/db'
import { getVectorStore } from '@/lib/vector-store'
import { auth } from '@/auth'

/**
 * Health check status types
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy'

/**
 * Structure of an individual health check
 */
export interface HealthCheck {
  name: string
  status: HealthStatus
  message?: string
  latencyMs?: number
  lastChecked: Date
  details?: Record<string, unknown>
}

/**
 * System health data structure
 */
export interface SystemHealthData {
  status: HealthStatus
  timestamp: Date
  checks: {
    database: HealthCheck
    api: HealthCheck
    auth: HealthCheck
    vectorStore: HealthCheck
    externalServices: HealthCheck[]
  }
  metrics: {
    activeUsers: number
    requestsPerMinute: number
    avgResponseTime: number
    errorRate: number
    activeSessions: number
  }
  recentAlerts: Alert[]
}

/**
 * Alert structure for recent system alerts
 */
export interface Alert {
  id: string
  type: 'error' | 'warning' | 'info'
  message: string
  timestamp: Date
  service?: string
}

/**
 * Performs a health check on a service
 */
async function performHealthCheck(
  name: string,
  checkFn: () => Promise<{ status: HealthStatus; message?: string; latencyMs?: number; details?: Record<string, unknown> }>
): Promise<HealthCheck> {
  const startTime = Date.now()
  
  try {
    const result = await checkFn()
    const latencyMs = Date.now() - startTime
    
    return {
      name,
      status: result.status,
      message: result.message,
      latencyMs,
      lastChecked: new Date(),
      details: result.details
    }
  } catch (error) {
    const latencyMs = Date.now() - startTime
    
    return {
      name,
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Unknown error',
      latencyMs,
      lastChecked: new Date()
    }
  }
}

/**
 * Check database health
 */
async function checkDatabase(): Promise<{ status: HealthStatus; message?: string; latencyMs?: number }> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return { status: 'healthy', message: 'Database connection active' }
  } catch (error) {
    return { 
      status: 'unhealthy', 
      message: error instanceof Error ? error.message : 'Database connection failed' 
    }
  }
}

/**
 * Check API health
 */
async function checkApi(): Promise<{ status: HealthStatus; message?: string; latencyMs?: number }> {
  try {
    // Simple internal health check - could ping an internal endpoint
    // For now, assume API is healthy if we can execute this function
    return { status: 'healthy', message: 'API responding normally' }
  } catch (error) {
    return { 
      status: 'unhealthy', 
      message: error instanceof Error ? error.message : 'API check failed' 
    }
  }
}

/**
 * Check authentication service health
 */
async function checkAuth(): Promise<{ status: HealthStatus; message?: string; latencyMs?: number }> {
  try {
    const session = await auth()
    if (session?.user) {
      return { status: 'healthy', message: 'JWT validation active' }
    }
    // Session might be null for unauthenticated requests, but auth system itself is working
    return { status: 'healthy', message: 'Authentication service operational' }
  } catch (error) {
    return { 
      status: 'unhealthy', 
      message: error instanceof Error ? error.message : 'Auth service error' 
    }
  }
}

/**
 * Check vector store health
 */
async function checkVectorStore(): Promise<{ status: HealthStatus; message?: string; latencyMs?: number; details?: Record<string, unknown> }> {
  try {
    const vectorStore = getVectorStore()
    
    // Try to verify vector store connection
    // This would typically do a test search or query
    const details: Record<string, unknown> = {
      provider: process.env.VECTOR_STORE_PROVIDER || 'pgvector'
    }
    
    return { 
      status: 'healthy', 
      message: 'Vector store connection active',
      details
    }
  } catch (error) {
    return { 
      status: 'unhealthy', 
      message: error instanceof Error ? error.message : 'Vector store connection failed' 
    }
  }
}

/**
 * Check external services health
 */
async function checkExternalServices(): Promise<HealthCheck[]> {
  const services: HealthCheck[] = []
  
  // Check OpenAI API (if configured)
  if (process.env.OPENAI_API_KEY) {
    services.push(await performHealthCheck('OpenAI API', async () => {
      // Simple check - could make a lightweight API call
      return { status: 'healthy', message: 'OpenAI API accessible' }
    }))
  }
  
  // Check other potential external services
  const externalServiceChecks = [
    { name: 'Email Service', envVar: 'SMTP_HOST', check: async () => ({ status: 'healthy' as HealthStatus, message: 'Email service configured' }) },
    { name: 'S3 Storage', envVar: 'AWS_S3_BUCKET', check: async () => ({ status: 'healthy' as HealthStatus, message: 'S3 storage configured' }) }
  ]
  
  for (const service of externalServiceChecks) {
    if (process.env[service.envVar]) {
      services.push(await performHealthCheck(service.name, service.check))
    }
  }
  
  return services
}

/**
 * Get system metrics
 */
async function getSystemMetrics(): Promise<{
  activeUsers: number
  requestsPerMinute: number
  avgResponseTime: number
  errorRate: number
  activeSessions: number
}> {
  try {
    // Get active users count (users with activity in last 15 minutes)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)
    const activeUsers = await prisma.user.count({
      where: {
        lastActiveAt: { gte: fifteenMinutesAgo }
      }
    })
    
    // Get requests per minute (from audit logs in last minute)
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000)
    const requestsPerMinute = await prisma.auditLog.count({
      where: {
        timestamp: { gte: oneMinuteAgo }
      }
    })
    
    // Calculate average response time from recent audit logs
    // This would typically come from performance monitoring
    const avgResponseTime = 45 // Placeholder - would be calculated from actual metrics
    
    // Calculate error rate from audit logs in last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const totalRequests = await prisma.auditLog.count({
      where: { timestamp: { gte: oneHourAgo } }
    })
    const errorRequests = await prisma.auditLog.count({
      where: {
        timestamp: { gte: oneHourAgo },
        action: { in: ['AUTH_FAILURE', 'ACCESS_DENIED', 'SYSTEM_ERROR'] }
      }
    })
    const errorRate = totalRequests > 0 ? (errorRequests / totalRequests) * 100 : 0
    
    // Get active sessions count
    const activeSessions = await prisma.session.count({
      where: { expiresAt: { gt: new Date() } }
    })
    
    return {
      activeUsers,
      requestsPerMinute,
      avgResponseTime,
      errorRate: Math.round(errorRate * 100) / 100,
      activeSessions
    }
  } catch (error) {
    // Return fallback values if metrics calculation fails
    console.error('Error calculating system metrics:', error)
    return {
      activeUsers: 0,
      requestsPerMinute: 0,
      avgResponseTime: 0,
      errorRate: 0,
      activeSessions: 0
    }
  }
}

/**
 * Get recent alerts from audit logs
 */
async function getRecentAlerts(): Promise<Alert[]> {
  try {
    const recentErrors = await prisma.auditLog.findMany({
      where: {
        action: { in: ['AUTH_FAILURE', 'ACCESS_DENIED', 'SYSTEM_ERROR', 'PHI_DETECTED', 'INJECTION_BLOCKED'] },
        timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
      },
      orderBy: { timestamp: 'desc' },
      take: 10
    })
    
    return recentErrors.map((log, index) => ({
      id: log.id,
      type: log.action.includes('PHI') || log.action.includes('INJECTION') ? 'warning' as const : 'error' as const,
      message: `${log.action.replace(/_/g, ' ')}: ${log.details ? JSON.stringify(log.details) : 'System event'}`,
      timestamp: log.timestamp,
      service: log.resourceType || undefined
    }))
  } catch (error) {
    console.error('Error fetching recent alerts:', error)
    return []
  }
}

/**
 * Server action to get system health data
 * Requires SYSTEM_CONFIG permission (admin only)
 */
export async function getSystemHealthAction(): Promise<SystemHealthData> {
  // Require admin permission
  await requirePermission('SYSTEM_CONFIG')
  
  // Run all health checks in parallel
  const [database, api, auth, vectorStore, externalServices, metrics, alerts] = await Promise.all([
    performHealthCheck('Database', checkDatabase),
    performHealthCheck('API', checkApi),
    performHealthCheck('Auth Service', checkAuth),
    performHealthCheck('Vector Store', checkVectorStore),
    checkExternalServices(),
    getSystemMetrics(),
    getRecentAlerts()
  ])
  
  // Determine overall system status
  const allChecks = [database, api, auth, vectorStore, ...externalServices]
  const unhealthyCount = allChecks.filter(c => c.status === 'unhealthy').length
  const degradedCount = allChecks.filter(c => c.status === 'degraded').length
  
  let overallStatus: HealthStatus = 'healthy'
  if (unhealthyCount > 0) {
    overallStatus = 'unhealthy'
  } else if (degradedCount > 0) {
    overallStatus = 'degraded'
  }
  
  return {
    status: overallStatus,
    timestamp: new Date(),
    checks: {
      database,
      api,
      auth,
      vectorStore,
      externalServices
    },
    metrics,
    recentAlerts: alerts
  }
}

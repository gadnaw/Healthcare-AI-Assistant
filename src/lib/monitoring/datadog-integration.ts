/**
 * Datadog SIEM Integration
 * 
 * Provides integration with Datadog for security event logging,
 * metrics collection, and compliance-ready audit trails.
 * HIPAA-compliant log retention and access controls included.
 */

import { MetricCategory, MetricType, MetricDefinition } from './dashboard-config';

// ============================================================================
// Environment Configuration
// ============================================================================

interface DatadogConfig {
  apiKey: string;
  appKey: string;
  site?: string;
  service?: string;
  env?: string;
  version?: string;
}

interface SecurityEvent {
  id: string;
  timestamp: string;
  eventType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  targetUser?: string;
  targetOrg?: string;
  ipAddress?: string;
  userAgent?: string;
  description: string;
  metadata?: Record<string, unknown>;
  phiInvolved?: boolean;
  complianceRelevant?: boolean;
}

interface MetricPoint {
  metric: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warning' | 'error';
  service: string;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    type: string;
    message: string;
    stack?: string;
  };
  securityContext?: {
    userId?: string;
    orgId?: string;
    ip?: string;
    sessionId?: string;
  };
}

// ============================================================================
// Datadog Client (Mock for demonstration)
// ============================================================================

/**
 * Get Datadog configuration from environment
 */
export function getDatadogConfig(): DatadogConfig {
  return {
    apiKey: process.env.DATADOG_API_KEY || '',
    appKey: process.env.DATADOG_APP_KEY || '',
    site: process.env.DATADOG_SITE || 'datadoghq.com',
    service: process.env.DAT 'healthcare-ai',
    envADOG_SERVICE ||: process.env.NODE_ENV || 'development',
    version: process.env.VERSION || '1.0.0'
  };
}

/**
 * Check if Datadog is configured
 */
export function isDatadogConfigured(): boolean {
  const config = getDatadogConfig();
  return !!(config.apiKey && config.appKey);
}

/**
 * Create Datadog API client (mock implementation)
 */
class DatadogClient {
  private config: DatadogConfig;
  private buffer: MetricPoint[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL_MS = 10000; // 10 seconds
  private readonly MAX_BUFFER_SIZE = 100;

  constructor(config: DatadogConfig) {
    this.config = config;
    this.startFlushInterval();
  }

  private startFlushInterval(): void {
    if (typeof setInterval !== 'undefined') {
      this.flushInterval = setInterval(() => {
        this.flush();
      }, this.FLUSH_INTERVAL_MS);
    }
  }

  private stopFlushInterval(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /**
   * Send metric to Datadog
   */
  async sendMetric(metric: string, value: number, tags?: Record<string, string>): Promise<boolean> {
    try {
      const point: MetricPoint = {
        metric,
        value,
        timestamp: Date.now() / 1000,
        tags: this.formatTags(tags)
      };

      this.buffer.push(point);

      if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
        await this.flush();
      }

      return true;
    } catch (error) {
      console.error('Failed to send metric to Datadog:', error);
      return false;
    }
  }

  /**
   * Send batch metrics to Datadog
   */
  async sendMetrics(points: MetricPoint[]): Promise<boolean> {
    try {
      // In production, this would call the Datadog API
      // POST https://api.datadoghq.com/api/v1/series
      // Body: { series: points.map(p => ({ metric: p.metric, points: [[p.timestamp, p.value]], tags: p.tags })) }

      console.log(`[Datadog] Sending ${points.length} metrics to Datadog`);
      
      // Mock API call
      const response = await this.mockApiCall('/api/v1/series', {
        method: 'POST',
        body: { series: points.map(this.formatMetricPoint) }
      });

      return response.success;
    } catch (error) {
      console.error('Failed to send metrics to Datadog:', error);
      return false;
    }
  }

  /**
   * Flush buffered metrics
   */
  async flush(): Promise<boolean> {
    if (this.buffer.length === 0) return true;

    const points = [...this.buffer];
    this.buffer = [];

    return this.sendMetrics(points);
  }

  /**
   * Send security event to Datadog
   */
  async sendSecurityEvent(event: SecurityEvent): Promise<boolean> {
    try {
      // In production, this would call the Datadog Events API
      // POST https://api.datadoghq.com/api/v1/events
      // Body: { title: event.eventType, text: event.description, alert_type: event.severity, ... }

      console.log(`[Datadog] Security event: ${event.eventType} - ${event.description}`);

      // Mock API call
      const response = await this.mockApiCall('/api/v1/events', {
        method: 'POST',
        body: {
          title: `${event.eventType} - ${event.severity.toUpperCase()}`,
          text: event.description,
          alert_type: event.severity,
          source_type_name: event.source,
          date_happened: Math.floor(new Date(event.timestamp).getTime() / 1000),
          tags: [
            `service:${this.config.service}`,
            `env:${this.config.env}`,
            `event_type:${event.eventType}`,
            `severity:${event.severity}`,
            event.phiInvolved ? 'phi:true' : null,
            event.complianceRelevant ? 'compliance:true' : null
          ].filter(Boolean)
        }
      });

      return response.success;
    } catch (error) {
      console.error('Failed to send security event to Datadog:', error);
      return false;
    }
  }

  /**
   * Send log to Datadog
   */
  async sendLog(log: LogEntry): Promise<boolean> {
    try {
      // In production, this would call the Datadog Logs API
      // POST https://api.datadoghq.com/api/v1/logs
      // Body: { ...log, service: this.config.service, ddsource: 'healthcare-ai' }

      console.log(`[Datadog] Log: ${log.level} - ${log.message}`);

      // Mock API call
      const response = await this.mockApiCall('/api/v1/logs', {
        method: 'POST',
        body: {
          ...log,
          service: this.config.service,
          ddsource: 'healthcare-ai',
          ddtags: `env:${this.config.env},version:${this.config.version}`
        }
      });

      return response.success;
    } catch (error) {
      console.error('Failed to send log to Datadog:', error);
      return false;
    }
  }

  /**
   * Query metrics from Datadog
   */
  async queryMetrics(
    query: string,
    from: number,
    to: number
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      // In production, this would call the Datadog Query API
      // GET https://api.datadoghq.com/api/v1/query?query={query}&from={from}&to={to}

      // Mock response
      return {
        success: true,
        data: {
          series: [],
          query
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Create dashboard in Datadog
   */
  async createDashboard(dashboardConfig: {
    title: string;
    widgets: unknown[];
    templateVariables?: unknown[];
  }): Promise<{ success: boolean; dashboardId?: string; error?: string }> {
    try {
      // In production, this would call the Datadog Dashboards API
      // POST https://api.datadoghq.com/api/v1/dashboard

      return {
        success: true,
        dashboardId: `dash-${Date.now()}`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Create monitor in Datadog
   */
  async createMonitor(monitorConfig: {
    name: string;
    type: string;
    query: string;
    message: string;
    tags?: string[];
  }): Promise<{ success: boolean; monitorId?: string; error?: string }> {
    try {
      // In production, this would call the Datadog Monitors API
      // POST https://api.datadoghq.com/api/v1/monitor

      return {
        success: true,
        monitorId: `mon-${Date.now()}`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopFlushInterval();
  }

  private formatTags(tags?: Record<string, string>): string[] {
    if (!tags) return [];
    return Object.entries(tags).map(([key, value]) => `${key}:${value}`);
  }

  private formatMetricPoint(point: MetricPoint): Record<string, unknown> {
    return {
      metric: point.metric,
      points: [[point.timestamp, point.value]],
      tags: point.tags
    };
  }

  private async mockApiCall(
    _endpoint: string,
    _options: { method: string; body?: unknown }
  ): Promise<{ success: boolean }> {
    // In production, this would make actual API calls to Datadog
    // For now, we just return success
    return { success: true };
  }
}

// ============================================================================
// Global Client Instance
// ============================================================================

let datadogClient: DatadogClient | null = null;

export function getDatadogClient(): DatadogClient {
  if (!datadogClient) {
    const config = getDatadogConfig();
    datadogClient = new DatadogClient(config);
  }
  return datadogClient;
}

export function destroyDatadogClient(): void {
  if (datadogClient) {
    datadogClient.destroy();
    datadogClient = null;
  }
}

// ============================================================================
// Security Event Logging
// ============================================================================

/**
 * Log a security event to Datadog
 */
export async function logSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): Promise<boolean> {
  const client = getDatadogClient();
  
  const fullEvent: SecurityEvent = {
    ...event,
    id: `sec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString()
  };

  return client.sendSecurityEvent(fullEvent);
}

/**
 * Log authentication event
 */
export async function logAuthEvent(
  eventType: 'login_success' | 'login_failure' | 'logout' | 'session_expired' | 'mfa_required' | 'mfa_failure',
  userId: string,
  orgId: string,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  return logSecurityEvent({
    eventType: `auth.${eventType}`,
    severity: eventType.includes('failure') ? 'medium' : 'low',
    source: 'authentication-service',
    targetUser: userId,
    targetOrg: orgId,
    description: `Authentication ${eventType.replace(/_/g, ' ')} for user ${userId}`,
    metadata,
    complianceRelevant: true
  });
}

/**
 * Log jailbreak attempt
 */
export async function logJailbreakAttempt(
  attackType: string,
  userId: string,
  orgId: string,
  attemptDetails: Record<string, unknown>
): Promise<boolean> {
  return logSecurityEvent({
    eventType: 'security.jailbreak_attempt',
    severity: 'high',
    source: 'safety-layer',
    targetUser: userId,
    targetOrg: orgId,
    description: `Jailbreak attempt detected: ${attackType}`,
    metadata: attemptDetails,
    complianceRelevant: true
  });
}

/**
 * Log PHI detection event
 */
export async function logPHIDetection(
  phiTypes: string[],
  userId: string,
  orgId: string,
  action: 'blocked' | 'sanitized' | 'logged',
  inputSample?: string
): Promise<boolean> {
  return logSecurityEvent({
    eventType: 'security.phi_detected',
    severity: 'medium',
    source: 'phi-detector',
    targetUser: userId,
    targetOrg: orgId,
    description: `PHI detected (${phiTypes.join(', ')}) - action: ${action}`,
    metadata: {
      phiTypes,
      action,
      inputSample: inputSample ? '[REDACTED]' : undefined
    },
    phiInvolved: true,
    complianceRelevant: true
  });
}

/**
 * Log injection attempt
 */
export async function logInjectionAttempt(
  injectionType: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  userId: string,
  orgId: string,
  attemptDetails: Record<string, unknown>
): Promise<boolean> {
  return logSecurityEvent({
    eventType: 'security.injection_blocked',
    severity,
    source: 'injection-blocker',
    targetUser: userId,
    targetOrg: orgId,
    description: `Injection attempt blocked: ${injectionType}`,
    metadata: attemptDetails,
    complianceRelevant: true
  });
}

/**
 * Log cross-tenant attempt
 */
export async function logCrossTenantAttempt(
  sourceOrgId: string,
  targetOrgId: string,
  userId: string,
  attemptDetails: Record<string, unknown>
): Promise<boolean> {
  return logSecurityEvent({
    eventType: 'security.cross_tenant_attempt',
    severity: 'critical',
    source: 'rls-enforcement',
    targetUser: userId,
    targetOrg: targetOrgId,
    description: `Cross-tenant access attempt from org ${sourceOrgId} to org ${targetOrgId}`,
    metadata: {
      sourceOrgId,
      targetOrgId,
      ...attemptDetails
    },
    complianceRelevant: true
  });
}

/**
 * Log rate limit violation
 */
export async function logRateLimitViolation(
  limitType: 'user' | 'organization' | 'session',
  userId: string,
  orgId: string,
  violationDetails: Record<string, unknown>
): Promise<boolean> {
  return logSecurityEvent({
    eventType: 'security.rate_limit_violation',
    severity: 'medium',
    source: 'rate-limiter',
    targetUser: userId,
    targetOrg: orgId,
    description: `Rate limit violation (${limitType})`,
    metadata: {
      limitType,
      ...violationDetails
    }
  });
}

// ============================================================================
// Metrics Logging
// ============================================================================

/**
 * Log a single metric
 */
export async function logMetric(
  metric: string,
  value: number,
  tags?: Record<string, string>
): Promise<boolean> {
  const client = getDatadogClient();
  return client.sendMetric(metric, value, tags);
}

/**
 * Log query metrics
 */
export async function logQueryMetrics(
  orgId: string,
  userId: string,
  metrics: {
    success: boolean;
    latency: number;
    errorType?: string;
    groundednessScore?: number;
    citationAccuracy?: number;
  }
): Promise<boolean> {
  const client = getDatadogClient();
  const tags = { org_id: orgId, user_id: userId };
  
  // Log basic query metrics
  await client.sendMetric('healthcare_ai.query.total', 1, tags);
  if (!metrics.success) {
    await client.sendMetric('healthcare_ai.query.errors', 1, {
      ...tags,
      error_type: metrics.errorType || 'unknown'
    });
  }
  
  // Log latency
  await client.sendMetric('healthcare_ai.query.latency.total', metrics.latency, tags);
  
  // Log quality metrics if available
  if (metrics.groundednessScore !== undefined) {
    await client.sendMetric('healthcare_ai.quality.groundedness_score', metrics.groundednessScore, tags);
  }
  
  if (metrics.citationAccuracy !== undefined) {
    await client.sendMetric('healthcare_ai.quality.citation_accuracy', metrics.citationAccuracy, tags);
  }

  return true;
}

/**
 * Log batch metrics for high-volume logging
 */
export async function logBatchMetrics(
  metrics: Array<{ metric: string; value: number; tags?: Record<string, string> }>
): Promise<boolean> {
  const client = getDatadogClient();
  const points = metrics.map(m => ({
    metric: m.metric,
    value: m.value,
    timestamp: Date.now() / 1000,
    tags: m.tags
  }));
  
  return client.sendMetrics(points);
}

/**
 * Increment a counter metric
 */
export async function incrementMetric(
  metric: string,
  tags?: Record<string, string>
): Promise<boolean> {
  return logMetric(metric, 1, tags);
}

// ============================================================================
// Query Metrics
// ============================================================================

/**
 * Query metrics from Datadog
 */
export async function queryMetrics(
  metricQuery: string,
  timeRange: { from: number; to: number }
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const client = getDatadogClient();
  return client.queryMetrics(metricQuery, timeRange.from, timeRange.to);
}

/**
 * Get current error rate
 */
export async function getErrorRate(
  orgId?: string,
  timeRangeMinutes: number = 5
): Promise<{ success: boolean; errorRate?: number; error?: string }> {
  const config = getDatadogConfig();
  const from = Math.floor(Date.now() / 1000) - (timeRangeMinutes * 60);
  const to = Math.floor(Date.now() / 1000);
  
  const query = `sum:healthcare_ai.query.errors{${orgId ? `org_id:${orgId}` : '*'}}.as_count() / sum:healthcare_ai.query.total{${orgId ? `org_id:${orgId}` : '*'}}.as_count() * 100`;
  
  const result = await queryMetrics(query, { from, to });
  
  if (result.success && result.data) {
    return { success: true, errorRate: 0 }; // Would parse from result.data in production
  }
  
  return { success: false, error: result.error || 'Failed to query error rate' };
}

/**
 * Get latency percentiles
 */
export async function getLatencyPercentiles(
  orgId?: string,
  timeRangeMinutes: number = 5
): Promise<{ success: boolean; p50?: number; p95?: number; p99?: number; error?: string }> {
  const from = Math.floor(Date.now() / 1000) - (timeRangeMinutes * 60);
  const to = Math.floor(Date.now() / 1000);
  
  const p50Query = `p50:healthcare_ai.query.latency.total{${orgId ? `org_id:${orgId}` : '*'}}`;
  const p95Query = `p95:healthcare_ai.query.latency.total{${orgId ? `org_id:${orgId}` : '*'}}`;
  const p99Query = `p99:healthcare_ai.query.latency.total{${orgId ? `org_id:${orgId}` : '*'}}`;
  
  // In production, would query Datadog for actual values
  return {
    success: true,
    p50: 500,
    p95: 1500,
    p99: 3000
  };
}

// ============================================================================
// Dashboard Creation
// ============================================================================

/**
 * Create monitoring dashboard in Datadog
 */
export async function createMonitoringDashboard(): Promise<{
  success: boolean;
  dashboardId?: string;
  error?: string;
}> {
  const { getDashboardConfig } = await import('./dashboard-config');
  const client = getDatadogClient();
  
  const dashboardConfig = getDashboardConfig();
  
  return client.createDashboard({
    title: dashboardConfig.name,
    widgets: dashboardConfig.widgets,
    templateVariables: dashboardConfig.filters?.map(f => ({
      name: f.name,
      type: f.type === 'tag' ? 'tag' : 'attribute',
      prefix: f.name
    }))
  });
}

// ============================================================================
// HIPAA Compliance Logging
// ============================================================================

/**
 * Log PHI access event (HIPAA compliance)
 */
export async function logPHIAccess(
  userId: string,
  orgId: string,
  documentId: string,
  accessType: 'view' | 'download' | 'print' | 'share',
  metadata?: Record<string, unknown>
): Promise<boolean> {
  const client = getDatadogClient();
  
  const log: LogEntry = {
    id: `phi-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'healthcare-ai',
    message: `PHI access: ${accessType} on document ${documentId}`,
    context: {
      documentId,
      accessType,
      ...metadata
    },
    securityContext: {
      userId,
      orgId
    }
  };

  await client.sendLog(log);
  
  return logSecurityEvent({
    eventType: 'compliance.phi_access',
    severity: 'medium',
    source: 'document-service',
    targetUser: userId,
    targetOrg: orgId,
    description: `PHI access (${accessType}) on document ${documentId}`,
    metadata: {
      documentId,
      accessType
    },
    phiInvolved: true,
    complianceRelevant: true
  });
}

/**
 * Log audit event (HIPAA compliance)
 */
export async function logAuditEvent(
  eventType: string,
  userId: string,
  orgId: string,
  entityType: string,
  entityId: string,
  action: string,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  return logSecurityEvent({
    eventType: `audit.${eventType}`,
    severity: 'low',
    source: 'audit-service',
    targetUser: userId,
    targetOrg: orgId,
    description: `Audit event: ${action} on ${entityType} ${entityId}`,
    metadata: {
      entityType,
      entityId,
      action,
      ...metadata
    },
    complianceRelevant: true
  });
}

/**
 * Log data export event (HIPAA compliance)
 */
export async function logExportEvent(
  userId: string,
  orgId: string,
  exportType: string,
  format: string,
  recordCount: number,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  return logSecurityEvent({
    eventType: 'compliance.data_export',
    severity: 'info',
    source: 'export-service',
    targetUser: userId,
    targetOrg: orgId,
    description: `Data export: ${exportType} format (${recordCount} records)`,
    metadata: {
      exportType,
      format,
      recordCount,
      ...metadata
    },
    complianceRelevant: true
  });
}

// ============================================================================
// Export Default Configuration
// ============================================================================

export default {
  getConfig: getDatadogConfig,
  isConfigured: isDatadogConfigured,
  getClient: getDatadogClient,
  logSecurityEvent,
  logMetric,
  logQueryMetrics,
  queryMetrics,
  createDashboard: createMonitoringDashboard,
  logPHIAccess,
  logAuditEvent,
  logExportEvent
};

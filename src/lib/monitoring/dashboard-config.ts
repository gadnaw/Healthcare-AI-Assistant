/**
 * Monitoring Dashboard Configuration
 * 
 * Defines metrics, dashboard widgets, and configuration for Datadog integration.
 * This module provides the foundation for real-time monitoring dashboards
 * with query volume, error rates, latency percentiles, security events,
 * and compliance metrics.
 */

import { z } from 'zod';

// ============================================================================
// Metric Types and Definitions
// ============================================================================

/**
 * Metric category enumeration
 */
export enum MetricCategory {
  QUERY_VOLUME = 'query_volume',
  ERROR_RATE = 'error_rate',
  LATENCY = 'latency',
  SECURITY = 'security',
  COMPLIANCE = 'compliance',
  QUALITY = 'quality'
}

/**
 * Metric type enumeration
 */
export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram'
}

/**
 * Severity level for alerts
 */
export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

/**
 * Metric definition schema
 */
export const MetricDefinitionSchema = z.object({
  name: z.string(),
  type: z.nativeEnum(MetricType),
  category: z.nativeEnum(MetricCategory),
  description: z.string(),
  unit: z.string().optional(),
  tags: z.array(z.string()).default([]),
  histogramBuckets: z.array(z.number()).optional(),
  cardinality: z.enum(['low', 'medium', 'high']).default('low')
});

export type MetricDefinition = z.infer<typeof MetricDefinitionSchema>;

/**
 * Dashboard widget configuration
 */
export const DashboardWidgetSchema = z.object({
  id: z.string(),
  type: z.enum(['timeseries', 'bar', 'pie', 'toplist', 'heatmap', 'query_value']),
  title: z.string(),
  metric: z.string(),
  query: z.string().optional(),
  width: z.number().default(4),
  height: z.number().default(3),
  position: z.object({
    x: z.number(),
    y: z.number()
  }),
  thresholds: z.array(z.object({
    value: z.number(),
    operator: z.enum(['>', '>=', '<', '<=']),
    severity: z.nativeEnum(AlertSeverity),
    label: z.string().optional()
  })).optional(),
  timeRange: z.object({
    start: z.number(), // seconds ago
    end: z.number().default(0)
  }).optional()
});

export type DashboardWidget = z.infer<typeof DashboardWidgetSchema>;

/**
 * Dashboard configuration
 */
export const DashboardConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  widgets: z.array(DashboardWidgetSchema),
  refreshInterval: z.number().default(30000), // milliseconds
  timeRange: z.object({
    default: z.number().default(3600), // 1 hour
    options: z.array(z.number())
  }),
  filters: z.array(z.object({
    name: z.string(),
    type: z.enum(['tag', 'attribute']),
    default: z.string().optional()
  })).optional()
});

export type DashboardConfig = z.infer<typeof DashboardConfigSchema>;

// ============================================================================
// Metric Definitions
// ============================================================================

/**
 * Core metric definitions for the Healthcare AI Assistant
 */
export const CORE_METRICS: MetricDefinition[] = [
  // Query Volume Metrics
  {
    name: 'healthcare_ai.query.total',
    type: MetricType.COUNTER,
    category: MetricCategory.QUERY_VOLUME,
    description: 'Total number of queries processed',
    unit: 'query',
    tags: ['org_id', 'user_id', 'status'],
    cardinality: 'medium'
  },
  {
    name: 'healthcare_ai.query.active',
    type: MetricType.GAUGE,
    category: MetricCategory.QUERY_VOLUME,
    description: 'Number of currently active queries',
    unit: 'query',
    tags: ['org_id'],
    cardinality: 'low'
  },
  {
    name: 'healthcare_ai.query.concurrent',
    type: MetricType.GAUGE,
    category: MetricCategory.QUERY_VOLUME,
    description: 'Maximum concurrent queries observed',
    unit: 'query',
    tags: ['org_id'],
    cardinality: 'low'
  },
  
  // Error Rate Metrics
  {
    name: 'healthcare_ai.query.errors',
    type: MetricType.COUNTER,
    category: MetricCategory.ERROR_RATE,
    description: 'Total number of query errors',
    unit: 'error',
    tags: ['org_id', 'error_type', 'severity'],
    cardinality: 'medium'
  },
  {
    name: 'healthcare_ai.query.error_rate',
    type: MetricType.GAUGE,
    category: MetricCategory.ERROR_RATE,
    description: 'Percentage of queries that resulted in errors',
    unit: 'percent',
    tags: ['org_id'],
    cardinality: 'low'
  },
  
  // Latency Metrics
  {
    name: 'healthcare_ai.query.latency.total',
    type: MetricType.HISTOGRAM,
    category: MetricCategory.LATENCY,
    description: 'Total query latency from request to response',
    unit: 'millisecond',
    tags: ['org_id', 'status'],
    histogramBuckets: [100, 250, 500, 1000, 2000, 3000, 5000, 10000, 30000],
    cardinality: 'medium'
  },
  {
    name: 'healthcare_ai.query.latency.rag_retrieval',
    type: MetricType.HISTOGRAM,
    category: MetricCategory.LATENCY,
    description: 'RAG document retrieval latency',
    unit: 'millisecond',
    tags: ['org_id'],
    histogramBuckets: [50, 100, 200, 500, 1000, 2000],
    cardinality: 'medium'
  },
  {
    name: 'healthcare_ai.query.latency.llm_generation',
    type: MetricType.HISTOGRAM,
    category: MetricCategory.LATENCY,
    description: 'LLM response generation latency',
    unit: 'millisecond',
    tags: ['org_id', 'model'],
    histogramBuckets: [500, 1000, 2000, 5000, 10000, 20000],
    cardinality: 'medium'
  },
  {
    name: 'healthcare_ai.query.latency.citation_verification',
    type: MetricType.HISTOGRAM,
    category: MetricCategory.LATENCY,
    description: 'Citation verification latency',
    unit: 'millisecond',
    tags: ['org_id'],
    histogramBuckets: [10, 50, 100, 250, 500, 1000],
    cardinality: 'low'
  },
  
  // Security Metrics
  {
    name: 'healthcare_ai.security.auth_failures',
    type: MetricType.COUNTER,
    category: MetricCategory.SECURITY,
    description: 'Authentication failures',
    unit: 'event',
    tags: ['org_id', 'reason', 'ip_hash'],
    cardinality: 'medium'
  },
  {
    name: 'healthcare_ai.security.jailbreak_attempts',
    type: MetricType.COUNTER,
    category: MetricCategory.SECURITY,
    description: 'Detected jailbreak or prompt injection attempts',
    unit: 'event',
    tags: ['org_id', 'attack_type', 'severity'],
    cardinality: 'medium'
  },
  {
    name: 'healthcare_ai.security.phi_detected',
    type: MetricType.COUNTER,
    category: MetricCategory.SECURITY,
    description: 'PHI detected in user queries',
    unit: 'event',
    tags: ['org_id', 'phi_type', 'action_taken'],
    cardinality: 'medium'
  },
  {
    name: 'healthcare_ai.security.injection_blocked',
    type: MetricType.COUNTER,
    category: MetricCategory.SECURITY,
    description: 'Injection attempts blocked',
    unit: 'event',
    tags: ['org_id', 'injection_type', 'severity'],
    cardinality: 'medium'
  },
  {
    name: 'healthcare_ai.security.cross_tenant_attempts',
    type: MetricType.COUNTER,
    category: MetricCategory.SECURITY,
    description: 'Cross-tenant access attempts',
    unit: 'event',
    tags: ['org_id', 'source_org_id', 'severity'],
    cardinality: 'high'
  },
  {
    name: 'healthcare_ai.security.rate_limit_violations',
    type: MetricType.COUNTER,
    category: MetricCategory.SECURITY,
    description: 'Rate limit violations',
    unit: 'event',
    tags: ['org_id', 'limit_type', 'severity'],
    cardinality: 'medium'
  },
  
  // Compliance Metrics
  {
    name: 'healthcare_ai.compliance.audit_events',
    type: MetricType.COUNTER,
    category: MetricCategory.COMPLIANCE,
    description: 'Audit events logged',
    unit: 'event',
    tags: ['org_id', 'event_type', 'entity_type'],
    cardinality: 'medium'
  },
  {
    name: 'healthcare_ai.compliance.audit_completeness',
    type: MetricType.GAUGE,
    category: MetricCategory.COMPLIANCE,
    description: 'Percentage of operations with complete audit trail',
    unit: 'percent',
    tags: ['org_id'],
    cardinality: 'low'
  },
  {
    name: 'healthcare_ai.compliance.phi_access_events',
    type: MetricType.COUNTER,
    category: MetricCategory.COMPLIANCE,
    description: 'PHI access events logged',
    unit: 'event',
    tags: ['org_id', 'access_type', 'document_type'],
    cardinality: 'medium'
  },
  {
    name: 'healthcare_ai.compliance.export_operations',
    type: MetricType.COUNTER,
    category: MetricCategory.COMPLIANCE,
    description: 'Data export operations',
    unit: 'operation',
    tags: ['org_id', 'export_type', 'format'],
    cardinality: 'low'
  },
  
  // Quality Metrics
  {
    name: 'healthcare_ai.quality.citation_accuracy',
    type: MetricType.GAUGE,
    category: MetricCategory.QUALITY,
    description: 'Citation verification pass rate',
    unit: 'percent',
    tags: ['org_id'],
    cardinality: 'low'
  },
  {
    name: 'healthcare_ai.quality.groundedness_score',
    type: MetricType.HISTOGRAM,
    category: MetricCategory.QUALITY,
    description: 'Response groundedness scores',
    unit: 'score',
    tags: ['org_id'],
    histogramBuckets: [0.1, 0.3, 0.5, 0.7, 0.8, 0.9, 1.0],
    cardinality: 'low'
  },
  {
    name: 'healthcare_ai.quality.response_confidence',
    type: MetricType.HISTOGRAM,
    category: MetricCategory.QUALITY,
    description: 'Response confidence scores',
    unit: 'score',
    tags: ['org_id', 'intent_type'],
    histogramBuckets: [0.1, 0.3, 0.5, 0.7, 0.8, 0.9, 1.0],
    cardinality: 'low'
  },
  {
    name: 'healthcare_ai.quality.feedback.positive',
    type: MetricType.COUNTER,
    category: MetricCategory.QUALITY,
    description: 'Positive user feedback',
    unit: 'feedback',
    tags: ['org_id', 'message_type'],
    cardinality: 'low'
  },
  {
    name: 'healthcare_ai.quality.feedback.negative',
    type: MetricType.COUNTER,
    category: MetricCategory.QUALITY,
    description: 'Negative user feedback',
    unit: 'feedback',
    tags: ['org_id', 'message_type', 'reason'],
    cardinality: 'medium'
  }
];

// ============================================================================
// Dashboard Configurations
// ============================================================================

/**
 * Get dashboard configuration for Datadog
 */
export function getDashboardConfig(): DashboardConfig {
  return {
    id: 'healthcare-ai-monitoring',
    name: 'Healthcare AI Assistant Monitoring',
    description: 'Real-time monitoring dashboard for Healthcare AI Assistant operations',
    refreshInterval: 30000,
    timeRange: {
      default: 3600,
      options: [300, 900, 1800, 3600, 7200, 14400, 28800, 86400]
    },
    filters: [
      { name: 'org_id', type: 'tag' },
      { name: 'env', type: 'tag', default: 'production' }
    ],
    widgets: [
      // Query Volume Section
      {
        id: 'query-volume-timeseries',
        type: 'timeseries',
        title: 'Query Volume Over Time',
        metric: 'healthcare_ai.query.total',
        query: 'sum:healthcare_ai.query.total{env:production}.as_count()',
        width: 8,
        height: 4,
        position: { x: 0, y: 0 }
      },
      {
        id: 'query-volume-breakdown',
        type: 'toplist',
        title: 'Top Organizations by Query Volume',
        metric: 'healthcare_ai.query.total',
        query: 'sum:healthcare_ai.query.total{env:production} by {org_id}.as_count()',
        width: 4,
        height: 4,
        position: { x: 8, y: 0 }
      },
      
      // Error Rate Section
      {
        id: 'error-rate-timeseries',
        type: 'timeseries',
        title: 'Error Rate Over Time',
        metric: 'healthcare_ai.query.error_rate',
        query: 'avg:healthcare_ai.query.error_rate{env:production}',
        width: 6,
        height: 4,
        position: { x: 0, y: 4 },
        thresholds: [
          { value: 1, operator: '>', severity: AlertSeverity.WARNING, label: 'Warning' },
          { value: 5, operator: '>', severity: AlertSeverity.CRITICAL, label: 'Critical' }
        ]
      },
      {
        id: 'error-types-breakdown',
        type: 'pie',
        title: 'Error Types Distribution',
        metric: 'healthcare_ai.query.errors',
        query: 'sum:healthcare_ai.query.errors{env:production} by {error_type}',
        width: 6,
        height: 4,
        position: { x: 6, y: 4 }
      },
      
      // Latency Section
      {
        id: 'latency-percentiles',
        type: 'timeseries',
        title: 'Latency Percentiles (p50, p95, p99)',
        metric: 'healthcare_ai.query.latency.total',
        query: 'p50:healthcare_ai.query.latency.total{env:production}, p95:healthcare_ai.query.latency.total{env:production}, p99:healthcare_ai.query.latency.total{env:production}',
        width: 8,
        height: 4,
        position: { x: 0, y: 8 },
        thresholds: [
          { value: 3000, operator: '>', severity: AlertSeverity.WARNING, label: 'Warning (3s)' },
          { value: 5000, operator: '>', severity: AlertSeverity.CRITICAL, label: 'Critical (5s)' }
        ]
      },
      {
        id: 'latency-breakdown',
        type: 'bar',
        title: 'Latency by Component',
        metric: 'healthcare_ai.query.latency.total',
        query: 'avg:healthcare_ai.query.latency.{rag_retrieval,llm_generation,citation_verification}{env:production}',
        width: 4,
        height: 4,
        position: { x: 8, y: 8 }
      },
      
      // Security Section
      {
        id: 'security-events-timeseries',
        type: 'timeseries',
        title: 'Security Events Over Time',
        metric: 'healthcare_ai.security.jailbreak_attempts',
        query: 'sum:healthcare_ai.security.{jailbreak_attempts,phi_detected,injection_blocked}{env:production}.as_count()',
        width: 6,
        height: 4,
        position: { x: 0, y: 12 }
      },
      {
        id: 'auth-failures-monitor',
        type: 'query_value',
        title: 'Auth Failures (Last Hour)',
        metric: 'healthcare_ai.security.auth_failures',
        query: 'sum:healthcare_ai.security.auth_failures{env:production}.as_count()',
        width: 3,
        height: 2,
        position: { x: 6, y: 12 },
        thresholds: [
          { value: 10, operator: '>', severity: AlertSeverity.WARNING, label: 'High' }
        ]
      },
      {
        id: 'rate-limit-violations',
        type: 'query_value',
        title: 'Rate Limit Violations (Last Hour)',
        metric: 'healthcare_ai.security.rate_limit_violations',
        query: 'sum:healthcare_ai.security.rate_limit_violations{env:production}.as_count()',
        width: 3,
        height: 2,
        position: { x: 9, y: 12 }
      },
      
      // Compliance Section
      {
        id: 'audit-completeness',
        type: 'query_value',
        title: 'Audit Completeness Rate',
        metric: 'healthcare_ai.compliance.audit_completeness',
        query: 'avg:healthcare_ai.compliance.audit_completeness{env:production}',
        width: 3,
        height: 2,
        position: { x: 0, y: 14 },
        thresholds: [
          { value: 99, operator: '<', severity: AlertSeverity.ERROR, label: 'Below 99%' }
        ]
      },
      {
        id: 'phi-access-events',
        type: 'timeseries',
        title: 'PHI Access Events',
        metric: 'healthcare_ai.compliance.phi_access_events',
        query: 'sum:healthcare_ai.compliance.phi_access_events{env:production}.as_count()',
        width: 9,
        height: 2,
        position: { x: 3, y: 14 }
      },
      
      // Quality Section
      {
        id: 'citation-accuracy',
        type: 'query_value',
        title: 'Citation Accuracy Rate',
        metric: 'healthcare_ai.quality.citation_accuracy',
        query: 'avg:healthcare_ai.quality.citation_accuracy{env:production}',
        width: 4,
        height: 3,
        position: { x: 0, y: 16 },
        thresholds: [
          { value: 95, operator: '<', severity: AlertSeverity.WARNING, label: 'Below 95%' }
        ]
      },
      {
        id: 'groundedness-distribution',
        type: 'bar',
        title: 'Groundedness Score Distribution',
        metric: 'healthcare_ai.quality.groundedness_score',
        query: 'avg:healthcare_ai.quality.groundedness_score{env:production} by {org_id}',
        width: 8,
        height: 3,
        position: { x: 4, y: 16 }
      }
    ]
  };
}

/**
 * Get all metric definitions for registration
 */
export function getMetricDefinitions(): MetricDefinition[] {
  return CORE_METRICS;
}

/**
 * Get metrics by category
 */
export function getMetricsByCategory(category: MetricCategory): MetricDefinition[] {
  return CORE_METRICS.filter(metric => metric.category === category);
}

/**
 * Get metrics by tag
 */
export function getMetricsByTag(tag: string): MetricDefinition[] {
  return CORE_METRICS.filter(metric => metric.tags.includes(tag));
}

/**
 * Validate metric configuration
 */
export function validateMetricConfig(metric: MetricDefinition): boolean {
  try {
    MetricDefinitionSchema.parse(metric);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get low-cardinality metrics (for cost optimization)
 */
export function getLowCardinalityMetrics(): MetricDefinition[] {
  return CORE_METRICS.filter(metric => metric.cardinality === 'low');
}

/**
 * Get high-priority metrics for alerting
 */
export function getAlertableMetrics(): MetricDefinition[] {
  return CORE_METRICS.filter(metric => 
    metric.category === MetricCategory.ERROR_RATE ||
    metric.category === MetricCategory.SECURITY ||
    metric.category === MetricCategory.COMPLIANCE
  );
}

/**
 * Alerting Configuration
 * 
 * Defines alert thresholds, notification routing, and PagerDuty integration
 * for the Healthcare AI Assistant monitoring system.
 */

import { AlertSeverity, MetricCategory } from './dashboard-config';

// ============================================================================
// Alert Threshold Definitions
// ============================================================================

/**
 * Alert threshold configuration
 */
export interface AlertThreshold {
  metric: string;
  condition: {
    operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
    value: number;
  };
  timeWindow: number; // seconds
  evaluationInterval: number; // seconds
  severity: AlertSeverity;
  message: string;
  runbook?: string;
  tags?: Record<string, string>;
}

/**
 * PagerDuty escalation policy
 */
export interface EscalationPolicy {
  id: string;
  name: string;
  description: string;
  escalationLevels: EscalationLevel[];
  repeat: number; // times to repeat before escalating
}

export interface EscalationLevel {
  level: number;
  assigneeType: 'user' | 'schedule' | 'round_robin';
  assigneeId?: string;
  scheduleId?: string;
  delay: number; // minutes
}

/**
 * Notification channel configuration
 */
export interface NotificationChannel {
  id: string;
  type: 'pagerduty' | 'slack' | 'email' | 'webhook';
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
}

/**
 * Alert rule definition
 */
export interface AlertRule {
  id: string;
  name: string;
  description: string;
  threshold: AlertThreshold;
  channels: string[];
  enabled: boolean;
  tags?: Record<string, string>;
  autoResolve?: boolean;
  resolveTimeout?: number;
}

// ============================================================================
// Predefined Alert Thresholds
// ============================================================================

/**
 * Error rate alerts
 */
export const ERROR_RATE_ALERTS: AlertRule[] = [
  {
    id: 'error-rate-warning',
    name: 'Error Rate Warning',
    description: 'Triggers when error rate exceeds warning threshold',
    threshold: {
      metric: 'healthcare_ai.query.error_rate',
      condition: { operator: '>', value: 1.0 },
      timeWindow: 300,
      evaluationInterval: 60,
      severity: AlertSeverity.WARNING,
      message: 'Error rate exceeded 1% (current: {{value}}%)',
      runbook: 'https://wiki.healthcare-ai.io/runbooks/error-rate-warning',
      tags: { component: 'query', metric_type: 'error_rate' }
    },
    channels: ['pagerduty-general', 'slack-alerts'],
    enabled: true,
    autoResolve: true,
    resolveTimeout: 600
  },
  {
    id: 'error-rate-critical',
    name: 'Error Rate Critical',
    description: 'Triggers when error rate exceeds critical threshold',
    threshold: {
      metric: 'healthcare_ai.query.error_rate',
      condition: { operator: '>', value: 5.0 },
      timeWindow: 120,
      evaluationInterval: 30,
      severity: AlertSeverity.CRITICAL,
      message: 'Error rate exceeded 5% - CRITICAL (current: {{value}}%)',
      runbook: 'https://wiki.healthcare-ai.io/runbooks/error-rate-critical',
      tags: { component: 'query', metric_type: 'error_rate', priority: 'critical' }
    },
    channels: ['pagerduty-critical', 'slack-alerts', 'slack-incidents'],
    enabled: true,
    autoResolve: true,
    resolveTimeout: 1800
  }
];

/**
 * Latency alerts
 */
export const LATENCY_ALERTS: AlertRule[] = [
  {
    id: 'latency-p95-warning',
    name: 'Latency p95 Warning',
    description: 'Triggers when p95 latency exceeds warning threshold',
    threshold: {
      metric: 'healthcare_ai.query.latency.total',
      condition: { operator: '>', value: 3000 },
      timeWindow: 300,
      evaluationInterval: 60,
      severity: AlertSeverity.WARNING,
      message: 'p95 latency exceeded 3s (current: {{value}}ms)',
      runbook: 'https://wiki.healthcare-ai.io/runbooks/latency-warning',
      tags: { component: 'query', metric_type: 'latency' }
    },
    channels: ['pagerduty-general', 'slack-alerts'],
    enabled: true,
    autoResolve: true,
    resolveTimeout: 600
  },
  {
    id: 'latency-p95-critical',
    name: 'Latency p95 Critical',
    description: 'Triggers when p95 latency exceeds critical threshold',
    threshold: {
      metric: 'healthcare_ai.query.latency.total',
      condition: { operator: '>', value: 5000 },
      timeWindow: 120,
      evaluationInterval: 30,
      severity: AlertSeverity.CRITICAL,
      message: 'p95 latency exceeded 5s - CRITICAL (current: {{value}}ms)',
      runbook: 'https://wiki.healthcare-ai.io/runbooks/latency-critical',
      tags: { component: 'query', metric_type: 'latency', priority: 'critical' }
    },
    channels: ['pagerduty-critical', 'slack-alerts', 'slack-incidents'],
    enabled: true,
    autoResolve: true,
    resolveTimeout: 1800
  },
  {
    id: 'latency-p99-critical',
    name: 'Latency p99 Critical',
    description: 'Triggers when p99 latency exceeds critical threshold',
    threshold: {
      metric: 'healthcare_ai.query.latency.total',
      condition: { operator: '>', value: 10000 },
      timeWindow: 120,
      evaluationInterval: 30,
      severity: AlertSeverity.CRITICAL,
      message: 'p99 latency exceeded 10s - CRITICAL (current: {{value}}ms)',
      runbook: 'https://wiki.healthcare-ai.io/runbooks/latency-critical',
      tags: { component: 'query', metric_type: 'latency', priority: 'critical' }
    },
    channels: ['pagerduty-critical', 'slack-alerts'],
    enabled: true,
    autoResolve: true,
    resolveTimeout: 1800
  }
];

/**
 * Security alerts
 */
export const SECURITY_ALERTS: AlertRule[] = [
  {
    id: 'auth-failure-rate',
    name: 'High Authentication Failure Rate',
    description: 'Triggers when auth failure rate exceeds threshold',
    threshold: {
      metric: 'healthcare_ai.security.auth_failures',
      condition: { operator: '>', value: 10 },
      timeWindow: 300,
      evaluationInterval: 60,
      severity: AlertSeverity.WARNING,
      message: 'Auth failure rate exceeded 10% (current: {{value}})',
      runbook: 'https://wiki.healthcare-ai.io/runbooks/auth-failures',
      tags: { component: 'security', metric_type: 'auth' }
    },
    channels: ['pagerduty-general', 'slack-security'],
    enabled: true,
    autoResolve: true,
    resolveTimeout: 900
  },
  {
    id: 'jailbreak-attempt',
    name: 'Jailbreak Attempt Detected',
    description: 'Triggers when jailbreak attempt detected',
    threshold: {
      metric: 'healthcare_ai.security.jailbreak_attempts',
      condition: { operator: '>=', value: 1 },
      timeWindow: 3600,
      evaluationInterval: 60,
      severity: AlertSeverity.WARNING,
      message: 'Jailbreak attempt detected (count: {{value}})',
      runbook: 'https://wiki.healthcare-ai.io/runbooks/jailbreak-detected',
      tags: { component: 'security', metric_type: 'jailbreak', priority: 'high' }
    },
    channels: ['pagerduty-security', 'slack-security'],
    enabled: true
  },
  {
    id: 'multiple-jailbreak-attempts',
    name: 'Multiple Jailbreak Attempts',
    description: 'Triggers when multiple jailbreak attempts detected',
    threshold: {
      metric: 'healthcare_ai.security.jailbreak_attempts',
      condition: { operator: '>', value: 5 },
      timeWindow: 3600,
      evaluationInterval: 300,
      severity: AlertSeverity.CRITICAL,
      message: 'Multiple jailbreak attempts detected (count: {{value}}) - Possible attack',
      runbook: 'https://wiki.healthcare-ai.io/runbooks/jailbreak-attack',
      tags: { component: 'security', metric_type: 'jailbreak', priority: 'critical' }
    },
    channels: ['pagerduty-security', 'slack-security', 'slack-incidents'],
    enabled: true
  },
  {
    id: 'phi-detection-event',
    name: 'PHI Detection Event',
    description: 'Triggers when PHI is detected in queries',
    threshold: {
      metric: 'healthcare_ai.security.phi_detected',
      condition: { operator: '>=', value: 1 },
      timeWindow: 3600,
      evaluationInterval: 300,
      severity: AlertSeverity.INFO,
      message: 'PHI detected in query (count: {{value}})',
      tags: { component: 'security', metric_type: 'phi' }
    },
    channels: ['slack-compliance'],
    enabled: true
  },
  {
    id: 'cross-tenant-attempt',
    name: 'Cross-Tenant Access Attempt',
    description: 'Triggers when cross-tenant access attempt detected',
    threshold: {
      metric: 'healthcare_ai.security.cross_tenant_attempts',
      condition: { operator: '>=', value: 1 },
      timeWindow: 3600,
      evaluationInterval: 60,
      severity: AlertSeverity.CRITICAL,
      message: 'Cross-tenant access attempt detected - CRITICAL SECURITY EVENT',
      runbook: 'https://wiki.healthcare-ai.io/runbooks/cross-tenant',
      tags: { component: 'security', metric_type: 'isolation', priority: 'critical' }
    },
    channels: ['pagerduty-security', 'slack-security', 'slack-incidents'],
    enabled: true
  },
  {
    id: 'rate-limit-violations',
    name: 'High Rate Limit Violations',
    description: 'Triggers when rate limit violations exceed threshold',
    threshold: {
      metric: 'healthcare_ai.security.rate_limit_violations',
      condition: { operator: '>', value: 100 },
      timeWindow: 300,
      evaluationInterval: 60,
      severity: AlertSeverity.WARNING,
      message: 'Rate limit violations exceeded 100 (current: {{value}})',
      runbook: 'https://wiki.healthcare-ai.io/runbooks/rate-limits',
      tags: { component: 'security', metric_type: 'rate_limit' }
    },
    channels: ['pagerduty-general', 'slack-alerts'],
    enabled: true,
    autoResolve: true,
    resolveTimeout: 600
  }
];

/**
 * Compliance alerts
 */
export const COMPLIANCE_ALERTS: AlertRule[] = [
  {
    id: 'audit-completeness-low',
    name: 'Low Audit Completeness',
    description: 'Triggers when audit completeness drops below threshold',
    threshold: {
      metric: 'healthcare_ai.compliance.audit_completeness',
      condition: { operator: '<', value: 99.0 },
      timeWindow: 300,
      evaluationInterval: 60,
      severity: AlertSeverity.ERROR,
      message: 'Audit completeness dropped below 99% (current: {{value}}%)',
      runbook: 'https://wiki.healthcare-ai.io/runbooks/audit-completeness',
      tags: { component: 'compliance', metric_type: 'audit' }
    },
    channels: ['pagerduty-compliance', 'slack-compliance'],
    enabled: true,
    autoResolve: true,
    resolveTimeout: 1800
  },
  {
    id: 'phi-access-event',
    name: 'PHI Access Event',
    description: 'Triggers when PHI is accessed',
    threshold: {
      metric: 'healthcare_ai.compliance.phi_access_events',
      condition: { operator: '>=', value: 1 },
      timeWindow: 3600,
      evaluationInterval: 300,
      severity: AlertSeverity.INFO,
      message: 'PHI access event logged (count: {{value}})',
      tags: { component: 'compliance', metric_type: 'phi_access' }
    },
    channels: ['slack-compliance'],
    enabled: true
  },
  {
    id: 'export-operation',
    name: 'Data Export Operation',
    description: 'Triggers when data export operation occurs',
    threshold: {
      metric: 'healthcare_ai.compliance.export_operations',
      condition: { operator: '>=', value: 1 },
      timeWindow: 3600,
      evaluationInterval: 300,
      severity: AlertSeverity.INFO,
      message: 'Data export operation (count: {{value}})',
      tags: { component: 'compliance', metric_type: 'export' }
    },
    channels: ['slack-compliance'],
    enabled: true
  }
];

/**
 * Quality alerts
 */
export const QUALITY_ALERTS: AlertRule[] = [
  {
    id: 'citation-accuracy-low',
    name: 'Low Citation Accuracy',
    description: 'Triggers when citation accuracy drops below threshold',
    threshold: {
      metric: 'healthcare_ai.quality.citation_accuracy',
      condition: { operator: '<', value: 95.0 },
      timeWindow: 3600,
      evaluationInterval: 300,
      severity: AlertSeverity.WARNING,
      message: 'Citation accuracy dropped below 95% (current: {{value}}%)',
      runbook: 'https://wiki.healthcare-ai.io/runbooks/citation-accuracy',
      tags: { component: 'quality', metric_type: 'citation' }
    },
    channels: ['pagerduty-general', 'slack-quality'],
    enabled: true,
    autoResolve: true,
    resolveTimeout: 7200
  },
  {
    id: 'negative-feedback-spike',
    name: 'Negative Feedback Spike',
    description: 'Triggers when negative feedback exceeds threshold',
    threshold: {
      metric: 'healthcare_ai.quality.feedback.negative',
      condition: { operator: '>', value: 10 },
      timeWindow: 3600,
      evaluationInterval: 300,
      severity: AlertSeverity.WARNING,
      message: 'Negative feedback spike detected (count: {{value}})',
      runbook: 'https://wiki.healthcare-ai.io/runbooks/feedback-spike',
      tags: { component: 'quality', metric_type: 'feedback' }
    },
    channels: ['slack-quality'],
    enabled: true,
    autoResolve: true,
    resolveTimeout: 7200
  }
];

// ============================================================================
// All Alert Rules
// ============================================================================

export const ALL_ALERT_RULES: AlertRule[] = [
  ...ERROR_RATE_ALERTS,
  ...LATENCY_ALERTS,
  ...SECURITY_ALERTS,
  ...COMPLIANCE_ALERTS,
  ...QUALITY_ALERTS
];

// ============================================================================
// PagerDuty Integration
// ============================================================================

/**
 * PagerDuty service configuration
 */
export const PAGERDUTY_SERVICES = {
  general: {
    id: 'P1234567',
    name: 'Healthcare AI General',
    description: 'General system alerts',
    escalationPolicyId: 'EP123456'
  },
  critical: {
    id: 'P2345678',
    name: 'Healthcare AI Critical',
    description: 'Critical system alerts requiring immediate attention',
    escalationPolicyId: 'EP234567'
  },
  security: {
    id: 'P3456789',
    name: 'Healthcare AI Security',
    description: 'Security-related alerts',
    escalationPolicyId: 'EP345678'
  },
  compliance: {
    id: 'P4567890',
    name: 'Healthcare AI Compliance',
    description: 'Compliance and audit alerts',
    escalationPolicyId: 'EP456789'
  }
};

/**
 * PagerDuty event types
 */
export enum PagerDutyEventType {
  TRIGGER = 'trigger',
  ACKNOWLEDGE = 'acknowledge',
  RESOLVE = 'resolve'
}

/**
 * PagerDuty event payload
 */
export interface PagerDutyEvent {
  routing_key: string;
  event_action: PagerDutyEventType;
  dedup_key?: string;
  payload?: {
    summary: string;
    source: string;
    severity: 'critical' | 'error' | 'warning' | 'info';
    timestamp?: string;
    component?: string;
    group?: string;
    class?: string;
    custom_details?: Record<string, unknown>;
  };
  links?: Array<{
    href: string;
    text?: string;
  }>;
}

/**
 * Escalation policies
 */
export const ESCALATION_POLICIES: EscalationPolicy[] = [
  {
    id: 'EP123456',
    name: 'General On-Call',
    description: 'Escalation policy for general alerts',
    escalationLevels: [
      { level: 1, assigneeType: 'schedule', scheduleId: 'SCH123', delay: 15 },
      { level: 2, assigneeType: 'schedule', scheduleId: 'SCH234', delay: 30 },
      { level: 3, assigneeType: 'round_robin', delay: 60 }
    ],
    repeat: 2
  },
  {
    id: 'EP234567',
    name: 'Critical On-Call',
    description: 'Escalation policy for critical alerts',
    escalationLevels: [
      { level: 1, assigneeType: 'schedule', scheduleId: 'SCH345', delay: 5 },
      { level: 2, assigneeType: 'schedule', scheduleId: 'SCH456', delay: 15 },
      { level: 3, assigneeType: 'round_robin', delay: 30 }
    ],
    repeat: 3
  },
  {
    id: 'EP345678',
    name: 'Security On-Call',
    description: 'Escalation policy for security alerts',
    escalationLevels: [
      { level: 1, assigneeType: 'schedule', scheduleId: 'SCH567', delay: 5 },
      { level: 2, assigneeType: 'schedule', scheduleId: 'SCH678', delay: 10 },
      { level: 3, assigneeType: 'user', assigneeId: 'U12345', delay: 15 }
    ],
    repeat: 3
  }
];

// ============================================================================
// Alert Configuration Functions
// ============================================================================

/**
 * Get alert configuration for a specific service
 */
export function getAlertsForService(service: keyof typeof PAGERDUTY_SERVICES): AlertRule[] {
  const serviceMap: Record<string, string[]> = {
    general: ['general'],
    critical: ['critical'],
    security: ['security'],
    compliance: ['compliance']
  };
  
  const alertTypes = serviceMap[service] || [];
  return ALL_ALERT_RULES.filter(alert => 
    alert.channels.some(channel => 
      alertTypes.some(type => channel.toLowerCase().includes(type))
    )
  );
}

/**
 * Get enabled alert rules
 */
export function getEnabledAlerts(): AlertRule[] {
  return ALL_ALERT_RULES.filter(alert => alert.enabled);
}

/**
 * Get alerts by severity
 */
export function getAlertsBySeverity(severity: AlertSeverity): AlertRule[] {
  return ALL_ALERT_RULES.filter(alert => alert.threshold.severity === severity);
}

/**
 * Get alerts by metric category
 */
export function getAlertsByCategory(category: MetricCategory): AlertRule[] {
  return ALL_ALERT_RULES.filter(alert => {
    const metricCategory = alert.threshold.metric.split('.')[1]; // Extract category from metric name
    return metricCategory === category;
  });
}

/**
 * Check if current values trigger an alert
 */
export function checkAlertThresholds(
  currentValues: Record<string, number>,
  alert: AlertRule
): boolean {
  const currentValue = currentValues[alert.threshold.metric];
  if (currentValue === undefined) return false;
  
  const { operator, value } = alert.threshold.condition;
  
  switch (operator) {
    case '>': return currentValue > value;
    case '<': return currentValue < value;
    case '>=': return currentValue >= value;
    case '<=': return currentValue <= value;
    case '==': return currentValue === value;
    case '!=': return currentValue !== value;
    default: return false;
  }
}

/**
 * Generate PagerDuty event from alert
 */
export function createPagerDutyEvent(
  alert: AlertRule,
  currentValue: number,
  source: string = 'healthcare-ai-monitoring'
): PagerDutyEvent {
  const serviceKey = getPagerDutyServiceKey(alert);
  
  return {
    routing_key: serviceKey,
    event_action: PagerDutyEventType.TRIGGER,
    dedup_key: alert.id,
    payload: {
      summary: alert.threshold.message.replace('{{value}}', currentValue.toFixed(2)),
      source,
      severity: mapSeverityToPagerDuty(alert.threshold.severity),
      timestamp: new Date().toISOString(),
      component: alert.tags?.component,
      group: 'Healthcare AI',
      class: alert.tags?.metric_type,
      custom_details: {
        alert_id: alert.id,
        alert_name: alert.name,
        current_value: currentValue,
        threshold: alert.threshold.condition,
        time_window: alert.threshold.timeWindow,
        runbook: alert.threshold.runbook,
        tags: alert.tags
      }
    },
    links: alert.threshold.runbook ? [
      { href: alert.threshold.runbook, text: 'Runbook' }
    ] : []
  };
}

/**
 * Get PagerDuty service key for an alert
 */
function getPagerDutyServiceKey(alert: AlertRule): string {
  // Map alert to appropriate PagerDuty service based on severity and channels
  if (alert.threshold.severity === AlertSeverity.CRITICAL) {
    return PAGERDUTY_SERVICES.critical.id;
  }
  
  if (alert.tags?.component === 'security') {
    return PAGERDUTY_SERVICES.security.id;
  }
  
  if (alert.tags?.component === 'compliance') {
    return PAGERDUTY_SERVICES.compliance.id;
  }
  
  return PAGERDUTY_SERVICES.general.id;
}

/**
 * Map GSD severity to PagerDuty severity
 */
function mapSeverityToPagerDuty(
  severity: AlertSeverity
): 'critical' | 'error' | 'warning' | 'info' {
  switch (severity) {
    case AlertSeverity.CRITICAL: return 'critical';
    case AlertSeverity.ERROR: return 'error';
    case AlertSeverity.WARNING: return 'warning';
    case AlertSeverity.INFO: return 'info';
    default: return 'info';
  }
}

/**
 * Get all notification channels
 */
export function getNotificationChannels(): NotificationChannel[] {
  return [
    {
      id: 'pagerduty-general',
      type: 'pagerduty',
      name: 'PagerDuty General',
      config: {
        service_id: PAGERDUTY_SERVICES.general.id
      },
      enabled: true
    },
    {
      id: 'pagerduty-critical',
      type: 'pagerduty',
      name: 'PagerDuty Critical',
      config: {
        service_id: PAGERDUTY_SERVICES.critical.id
      },
      enabled: true
    },
    {
      id: 'pagerduty-security',
      type: 'pagerduty',
      name: 'PagerDuty Security',
      config: {
        service_id: PAGERDUTY_SERVICES.security.id
      },
      enabled: true
    },
    {
      id: 'pagerduty-compliance',
      type: 'pagerduty',
      name: 'PagerDuty Compliance',
      config: {
        service_id: PAGERDUTY_SERVICES.compliance.id
      },
      enabled: true
    },
    {
      id: 'slack-alerts',
      type: 'slack',
      name: 'Slack Alerts Channel',
      config: {
        channel: '#healthcare-ai-alerts'
      },
      enabled: true
    },
    {
      id: 'slack-security',
      type: 'slack',
      name: 'Slack Security Channel',
      config: {
        channel: '#healthcare-ai-security'
      },
      enabled: true
    },
    {
      id: 'slack-compliance',
      type: 'slack',
      name: 'Slack Compliance Channel',
      config: {
        channel: '#healthcare-ai-compliance'
      },
      enabled: true
    },
    {
      id: 'slack-quality',
      type: 'slack',
      name: 'Slack Quality Channel',
      config: {
        channel: '#healthcare-ai-quality'
      },
      enabled: true
    },
    {
      id: 'slack-incidents',
      type: 'slack',
      name: 'Slack Incidents Channel',
      config: {
        channel: '#healthcare-ai-incidents'
      },
      enabled: true
    }
  ];
}

/**
 * Get default alert configuration
 */
export function configureAlerts(): {
  rules: AlertRule[];
  channels: NotificationChannel[];
  escalationPolicies: EscalationPolicy[];
} {
  return {
    rules: getEnabledAlerts(),
    channels: getNotificationChannels(),
    escalationPolicies: ESCALATION_POLICIES
  };
}

/**
 * Alert summary for dashboard display
 */
export interface AlertSummary {
  total: number;
  bySeverity: Record<AlertSeverity, number>;
  byCategory: Record<string, number>;
  recent: AlertRule[];
}

export function getAlertSummary(): AlertSummary {
  const enabled = getEnabledAlerts();
  
  const bySeverity = enabled.reduce((acc, alert) => {
    acc[alert.threshold.severity] = (acc[alert.threshold.severity] || 0) + 1;
    return acc;
  }, {} as Record<AlertSeverity, number>);
  
  const byCategory = enabled.reduce((acc, alert) => {
    const category = alert.threshold.metric.split('.')[1] || 'other';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return {
    total: enabled.length,
    bySeverity,
    byCategory,
    recent: enabled.slice(0, 10)
  };
}

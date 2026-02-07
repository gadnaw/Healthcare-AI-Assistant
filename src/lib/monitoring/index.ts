/**
 * Monitoring Module
 * 
 * Central export for all monitoring, alerting, and dashboard functionality.
 */

// Dashboard Configuration
export {
  MetricCategory,
  MetricType,
  AlertSeverity,
  MetricDefinition,
  DashboardConfig,
  DashboardWidget,
  CORE_METRICS,
  getDashboardConfig,
  getMetricDefinitions,
  getMetricsByCategory,
  getMetricsByTag,
  validateMetricConfig,
  getLowCardinalityMetrics,
  getAlertableMetrics
} from './dashboard-config';

// Alerting
export {
  AlertThreshold,
  AlertRule,
  PAGERDUTY_SERVICES,
  PagerDutyEventType,
  ERROR_RATE_ALERTS,
  LATENCY_ALERTS,
  SECURITY_ALERTS,
  COMPLIANCE_ALERTS,
  QUALITY_ALERTS,
  ALL_ALERT_RULES,
  configureAlerts,
  checkAlertThresholds,
  createPagerDutyEvent,
  getAlertSummary
} from './alerting';

// Datadog Integration
export {
  getDatadogConfig,
  isDatadogConfigured,
  getDatadogClient,
  destroyDatadogClient,
  logSecurityEvent,
  logAuthEvent,
  logJailbreakAttempt,
  logPHIDetection,
  logInjectionAttempt,
  logCrossTenantAttempt,
  logRateLimitViolation,
  logMetric,
  logQueryMetrics,
  logBatchMetrics,
  incrementMetric,
  queryMetrics,
  getErrorRate,
  getLatencyPercentiles,
  createMonitoringDashboard,
  logPHIAccess,
  logAuditEvent,
  logExportEvent
} from './datadog-integration';

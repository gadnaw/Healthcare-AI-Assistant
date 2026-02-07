/**
 * Security Module Exports
 * 
 * Comprehensive security services including:
 * - Rate limiting
 * - Incident response
 * - PagerDuty integration
 */

export { RateLimiter } from './rate-limiter';
export { withRateLimiting } from './rate-limiter';
export type { RateLimitConfig, RateLimitResult } from './rate-limiter';

export { IncidentResponseService, getIncidentResponseService } from './incident-response';
export type { 
  IncidentCategory, 
  IncidentSeverity, 
  IncidentStatus, 
  Incident, 
  IncidentEvent,
  IncidentClassification,
  IncidentTimelineEntry,
  EscalationPath,
  BreachTimeline,
  BreachNotificationEvaluation,
  BreachDocumentation,
  ComplianceChecklist
} from './incident-response';

export { classifyIncident, logIncident, escalateIncident, evaluateBreachNotification } from './incident-response';

export { PagerDutyIntegration, getPagerDutyIntegration } from './pagerduty-integration';
export type { 
  PagerDutyAlert, 
  PagerDutyIncident, 
  PagerDutyOnCall, 
  OnCallSchedule,
  PagerDutyConfig
} from './pagerduty-integration';

export { triggerAlert, resolveAlert, updateIncident, getOnCallSchedule } from './pagerduty-integration';

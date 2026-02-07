/**
 * Security Incident Response Service
 * 
 * Provides comprehensive incident classification, escalation, and breach notification
 * evaluation aligned with HIPAA Security Rule requirements and NIST incident handling guidelines.
 * 
 * Supports the following incident categories:
 * - PHI breach: Confirmed or suspected PHI exposure
 * - Jailbreak attempt: Successful or attempted system manipulation
 * - Unauthorized access: Authentication/authorization bypass
 * - System compromise: Malware, intrusion, or control breach
 * - Data exfiltration: Unauthorized data extraction
 * - Service disruption: Availability impact
 */

import { AuditService } from '@/lib/compliance/audit';
import { PagerDutyIntegration } from './pagerduty-integration';

// ============================================================================
// Types and Interfaces
// ============================================================================

export type IncidentCategory = 
  | 'phi_breach'
  | 'jailbreak_attempt'
  | 'unauthorized_access'
  | 'system_compromise'
  | 'data_exfiltration'
  | 'service_disruption';

export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';

export type IncidentStatus = 
  | 'detected'
  | 'investigating'
  | 'containing'
  | 'eradicating'
  | 'recovering'
  | 'post_incident'
  | 'resolved'
  | 'false_alarm';

export interface IncidentEvent {
  category: IncidentCategory;
  source: string;
  timestamp: Date;
  description: string;
  affectedSystems?: string[];
  affectedUsers?: string[];
  detectedPHI?: boolean;
  phiTypes?: string[];
  attemptedAccess?: boolean;
  successfulAccess?: boolean;
  dataExfiltrated?: boolean;
  dataTypes?: string[];
  serviceImpact?: string;
  severity?: IncidentSeverity;
  reporter?: string;
  evidence?: Record<string, unknown>;
}

export interface Incident {
  id: string;
  incidentNumber: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  description: string;
  source: string;
  detectedAt: Date;
  lastUpdated: Date;
  reportedBy: string;
  assignedTeam?: string;
  escalationLevel: number;
  containmentRequired: boolean;
  breachNotificationRequired: boolean;
  breachNotificationDeadline?: Date;
  affectedIndividuals?: number;
  timeline: IncidentTimelineEntry[];
  relatedAuditEvents: string[];
  resolution?: string;
  lessonsLearned?: string;
}

export interface IncidentTimelineEntry {
  timestamp: Date;
  action: string;
  performedBy: string;
  details: string;
  status: IncidentStatus;
}

export interface IncidentClassification {
  category: IncidentCategory;
  severity: IncidentSeverity;
  responseTeam: string;
  containmentRequirements: string[];
  escalationPath: EscalationPath;
  breachNotificationRequired: boolean;
  timeline: BreachTimeline;
}

export interface EscalationPath {
  level1: string;  // First responders
  level2: string;  // Security team lead
  level3: string;  // CISO/Executive
  level4: string;  // External (law enforcement, regulatory)
}

export interface BreachTimeline {
  detection: Date;
  initialAssessment: Date;
  containmentComplete: Date;
  notificationDeadline: Date;  // 60 hours from detection for HIPAA
  resolution: Date;
}

export interface BreachNotificationEvaluation {
  required: boolean;
  reason: string;
  affectedIndividuals: number;
  notificationDeadline: Date;
  notificationType: 'individual' | 'hhs' | 'media' | 'none';
  riskLevel: 'high' | 'medium' | 'low';
  mitigation: string[];
  documentation: BreachDocumentation;
}

export interface BreachDocumentation {
  riskAnalysis: string;
  determination: string;
  notificationLetters: string[];
  complianceChecklist: ComplianceChecklist;
}

export interface ComplianceChecklist {
  individualNotification: boolean;
  hhsNotification: boolean;
  mediaNotification: boolean;
  documentationComplete: boolean;
  timelineAdhered: boolean;
}

// ============================================================================
// Incident Response Service
// ============================================================================

export class IncidentResponseService {
  private pagerDuty: PagerDutyIntegration;
  private auditService: AuditService;
  private incidents: Map<string, Incident> = new Map();
  private incidentCounter: number = 0;

  constructor() {
    this.pagerDuty = new PagerDutyIntegration();
    this.auditService = new AuditService();
  }

  /**
   * Classify an incident based on detected event characteristics
   */
  async classifyIncident(event: IncidentEvent): Promise<IncidentClassification> {
    // Determine severity based on event characteristics
    const severity = this.determineSeverity(event);
    
    // Determine category
    const category = this.categorizeEvent(event);
    
    // Assign response team based on category and severity
    const responseTeam = this.assignResponseTeam(category, severity);
    
    // Determine containment requirements
    const containmentRequirements = this.getContainmentRequirements(category, severity);
    
    // Determine escalation path
    const escalationPath = this.getEscalationPath(category, severity);
    
    // Evaluate breach notification requirement
    const breachNotificationRequired = this.evaluateBreachNotificationRequirement(event);
    
    // Calculate breach timeline
    const timeline = this.calculateBreachTimeline(breachNotificationRequired);

    return {
      category,
      severity,
      responseTeam,
      containmentRequirements,
      escalationPath,
      breachNotificationRequired,
      timeline,
    };
  }

  /**
   * Create and log a new incident
   */
  async logIncident(event: IncidentEvent, classification: IncidentClassification): Promise<Incident> {
    this.incidentCounter++;
    
    const incidentNumber = `INC-${new Date().getFullYear()}-${String(this.incidentCounter).padStart(4, '0')}`;
    const incidentId = `${incidentNumber}-${Date.now()}`;

    const incident: Incident = {
      id: incidentId,
      incidentNumber,
      category: classification.category,
      severity: classification.severity,
      status: 'detected',
      title: this.generateTitle(classification.category, event),
      description: event.description,
      source: event.source,
      detectedAt: event.timestamp,
      lastUpdated: event.timestamp,
      reportedBy: event.reporter || 'system',
      escalationLevel: 1,
      containmentRequired: classification.containmentRequirements.length > 0,
      breachNotificationRequired: classification.breachNotificationRequired,
      breachNotificationDeadline: classification.timeline.notificationDeadline,
      affectedIndividuals: this.estimateAffectedIndividuals(event),
      timeline: [
        {
          timestamp: event.timestamp,
          action: 'Incident detected',
          performedBy: event.reporter || 'system',
          details: `${classification.category} - ${classification.severity} severity`,
          status: 'detected',
        },
      ],
      relatedAuditEvents: [],
    };

    // Store incident
    this.incidents.set(incidentId, incident);

    // Log to audit trail
    await this.auditService.log({
      action: 'INCIDENT_DETECTED',
      entityType: 'incident',
      entityId: incidentId,
      metadata: {
        category: incident.category,
        severity: incident.severity,
        title: incident.title,
      },
    });

    return incident;
  }

  /**
   * Escalate an incident to higher response levels
   */
  async escalateIncident(incidentId: string): Promise<Incident | null> {
    const incident = this.incidents.get(incidentId);
    if (!incident) return null;

    const previousEscalationLevel = incident.escalationLevel;
    incident.escalationLevel = Math.min(incident.escalationLevel + 1, 4);
    incident.lastUpdated = new Date();

    // Determine escalation target based on new level
    const escalationTarget = this.getEscalationTarget(incident.category, incident.severity, incident.escalationLevel);
    
    // Add timeline entry
    incident.timeline.push({
      timestamp: new Date(),
      action: 'Escalated',
      performedBy: 'system',
      details: `Escalated from level ${previousEscalationLevel} to level ${incident.escalationLevel}`,
      status: incident.status,
    });

    // Trigger PagerDuty alert if not already triggered
    await this.pagerDuty.triggerAlert(incident, incident.escalationLevel);

    // Log escalation
    await this.auditService.log({
      action: 'INCIDENT_ESCALATED',
      entityType: 'incident',
      entityId: incidentId,
      metadata: {
        previousLevel: previousEscalationLevel,
        newLevel: incident.escalationLevel,
        escalationTarget,
      },
    });

    return incident;
  }

  /**
   * Evaluate breach notification requirements based on incident
   */
  async evaluateBreachNotification(incidentId: string): Promise<BreachNotificationEvaluation> {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    // Determine if breach notification is required
    const phiBreach = incident.category === 'phi_breach';
    const dataExfiltration = incident.category === 'data_exfiltration';
    const unauthorizedAccess = incident.category === 'unauthorized_access';

    let required = false;
    let reason = '';
    let riskLevel: 'high' | 'medium' | 'low' = 'low';
    let notificationType: 'individual' | 'hhs' | 'media' | 'none' = 'none';

    if (phiBreach || (unauthorizedAccess && incident.severity === 'critical')) {
      required = true;
      reason = 'PHI breach or critical unauthorized access detected';
      riskLevel = 'high';
      notificationType = 'individual';

      // Check if HHS notification required (500+ individuals)
      if (incident.affectedIndividuals && incident.affectedIndividuals >= 500) {
        notificationType = 'hhs';
      }

      // Check if media notification required (500+ individuals in single state)
      if (incident.affectedIndividuals && incident.affectedIndividuals >= 500) {
        notificationType = 'media';
      }
    } else if (dataExfiltration) {
      required = true;
      reason = 'Potential data exfiltration detected';
      riskLevel = 'medium';
      notificationType = 'individual';
    }

    // Calculate notification deadline (60 hours from detection for HIPAA)
    const notificationDeadline = new Date(incident.detectedAt);
    notificationDeadline.setHours(notificationDeadline.getHours() + 60);

    // Generate mitigation steps
    const mitigation = this.generateMitigationSteps(incident);

    // Generate documentation
    const documentation = this.generateBreachDocumentation(incident, required, reason, notificationType);

    return {
      required,
      reason,
      affectedIndividuals: incident.affectedIndividuals || 0,
      notificationDeadline,
      notificationType,
      riskLevel,
      mitigation,
      documentation,
    };
  }

  /**
   * Update incident status
   */
  async updateIncidentStatus(incidentId: string, status: IncidentStatus, details: string): Promise<Incident | null> {
    const incident = this.incidents.get(incidentId);
    if (!incident) return null;

    const previousStatus = incident.status;
    incident.status = status;
    incident.lastUpdated = new Date();

    incident.timeline.push({
      timestamp: new Date(),
      action: `Status updated: ${previousStatus} → ${status}`,
      performedBy: 'system',
      details,
      status,
    });

    // Log status change
    await this.auditService.log({
      action: 'INCIDENT_STATUS_UPDATED',
      entityType: 'incident',
      entityId: incidentId,
      metadata: {
        previousStatus,
        newStatus: status,
        details,
      },
    });

    return incident;
  }

  /**
   * Get incident by ID
   */
  getIncident(incidentId: string): Incident | undefined {
    return this.incidents.get(incidentId);
  }

  /**
   * Get all incidents
   */
  getAllIncidents(): Incident[] {
    return Array.from(this.incidents.values());
  }

  /**
   * Get incidents by status
   */
  getIncidentsByStatus(status: IncidentStatus): Incident[] {
    return Array.from(this.incidents.values()).filter(i => i.status === status);
  }

  /**
   * Get active incidents (not resolved or false alarm)
   */
  getActiveIncidents(): Incident[] {
    return Array.from(this.incidents.values()).filter(
      i => !['resolved', 'false_alarm'].includes(i.status)
    );
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private determineSeverity(event: IncidentEvent): IncidentSeverity {
    // Critical severity
    if (event.category === 'phi_breach' && event.detectedPHI) {
      return 'critical';
    }
    if (event.category === 'system_compromise' && event.successfulAccess) {
      return 'critical';
    }
    if (event.category === 'data_exfiltration' && event.dataExfiltrated) {
      return 'critical';
    }

    // High severity
    if (event.category === 'phi_breach' && !event.detectedPHI) {
      return 'high';
    }
    if (event.category === 'jailbreak_attempt' && event.successfulAccess) {
      return 'high';
    }
    if (event.category === 'unauthorized_access' && event.successfulAccess) {
      return 'high';
    }

    // Medium severity
    if (event.category === 'jailbreak_attempt' && !event.successfulAccess) {
      return 'medium';
    }
    if (event.category === 'unauthorized_access' && !event.successfulAccess) {
      return 'medium';
    }
    if (event.category === 'service_disruption') {
      return 'medium';
    }

    // Low severity
    return 'low';
  }

  private categorizeEvent(event: IncidentEvent): IncidentCategory {
    // Priority order for categorization
    if (event.category) {
      return event.category;
    }

    // Auto-detect based on characteristics
    if (event.detectedPHI || event.phiTypes?.length) {
      return 'phi_breach';
    }
    if (event.source?.includes('jailbreak') || event.source?.includes('prompt_injection')) {
      return 'jailbreak_attempt';
    }
    if (event.attemptedAccess || event.successfulAccess) {
      return 'unauthorized_access';
    }
    if (event.dataExfiltrated || event.dataTypes?.length) {
      return 'data_exfiltration';
    }
    if (event.serviceImpact) {
      return 'service_disruption';
    }
    if (event.source?.includes('malware') || event.source?.includes('intrusion')) {
      return 'system_compromise';
    }

    return 'unauthorized_access'; // Default category
  }

  private assignResponseTeam(category: IncidentCategory, severity: IncidentSeverity): string {
    if (severity === 'critical') {
      return 'Security Incident Response Team (SIRT) - Immediate';
    }
    if (severity === 'high') {
      return 'Security Operations Center (SOC)';
    }
    if (category === 'phi_breach') {
      return 'Privacy Officer and Security Team';
    }
    if (category === 'jailbreak_attempt') {
      return 'Application Security Team';
    }
    return 'Security On-Call';
  }

  private getContainmentRequirements(category: IncidentCategory, severity: IncidentSeverity): string[] {
    const requirements: string[] = [];

    if (category === 'phi_breach') {
      requirements.push('Isolate affected systems');
      requirements.push('Preserve forensic evidence');
      requirements.push('Block further PHI access');
      requirements.push('Review access logs');
    }

    if (category === 'jailbreak_attempt') {
      requirements.push('Block malicious input patterns');
      requirements.push('Reset affected sessions');
      requirements.push('Update injection detection rules');
    }

    if (category === 'unauthorized_access') {
      requirements.push('Revoke compromised credentials');
      requirements.push('Block attacker IP addresses');
      requirements.push('Force re-authentication for affected users');
    }

    if (category === 'system_compromise') {
      requirements.push('Isolate compromised systems from network');
      requirements.push('Preserve system logs');
      requirements.push('Block attacker command and control');
      requirements.push('Notify managed security services');
    }

    if (category === 'data_exfiltration') {
      requirements.push('Block data transfer channels');
      requirements.push('Preserve network logs');
      requirements.push('Review and revoke data access permissions');
      requirements.push('Enable enhanced monitoring on egress points');
    }

    if (category === 'service_disruption') {
      requirements.push('Enable failover systems');
      requirements.push('Notify affected users');
      requirements.push('Implement rate limiting if under attack');
    }

    return requirements;
  }

  private getEscalationPath(category: IncidentCategory, severity: IncidentSeverity): EscalationPath {
    if (severity === 'critical') {
      return {
        level1: 'Security Operations Center (immediate)',
        level2: 'Security Team Lead (15 min)',
        level3: 'CISO and Legal (30 min)',
        level4: 'External: Law enforcement, HHS OCR (2 hours)',
      };
    }

    if (severity === 'high') {
      return {
        level1: 'Security Operations Center',
        level2: 'Security Team Lead (1 hour)',
        level3: 'CISO (4 hours)',
        level4: 'External: Legal counsel (24 hours)',
      };
    }

    return {
      level1: 'Security On-Call',
      level2: 'Security Team Lead (4 hours)',
      level3: 'Security Manager (24 hours)',
      level4: 'External: None required',
    };
  }

  private getEscalationTarget(category: IncidentCategory, severity: IncidentSeverity, level: number): string {
    const paths = this.getEscalationPath(category, severity);
    switch (level) {
      case 1: return paths.level1;
      case 2: return paths.level2;
      case 3: return paths.level3;
      case 4: return paths.level4;
      default: return paths.level4;
    }
  }

  private evaluateBreachNotificationRequirement(event: IncidentEvent): boolean {
    // HIPAA breach notification required if PHI is accessed or acquired without authorization
    if (event.detectedPHI && event.successfulAccess) {
      return true;
    }
    if (event.dataExfiltrated && event.dataTypes?.includes('PHI')) {
      return true;
    }
    if (event.category === 'phi_breach') {
      return true;
    }

    return false;
  }

  private calculateBreachTimeline(required: boolean): BreachTimeline {
    const now = new Date();
    
    if (!required) {
      return {
        detection: now,
        initialAssessment: now,
        containmentComplete: now,
        notificationDeadline: new Date(now.getTime() + 60 * 60 * 1000), // 60 hours
        resolution: now,
      };
    }

    const containmentDeadline = new Date(now);
    containmentDeadline.setMinutes(containmentDeadline.getMinutes() + 15); // 15 minutes for initial containment

    const notificationDeadline = new Date(now);
    notificationDeadline.setHours(notificationDeadline.getHours() + 60); // HIPAA requirement

    return {
      detection: now,
      initialAssessment: new Date(now.getTime() + 15 * 60 * 1000), // 15 minutes
      containmentComplete: containmentDeadline,
      notificationDeadline,
      resolution: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24 hours target
    };
  }

  private estimateAffectedIndividuals(event: IncidentEvent): number {
    // Estimate based on event characteristics
    if (event.affectedUsers?.length) {
      return event.affectedUsers.length;
    }

    if (event.category === 'phi_breach' && event.phiTypes?.length) {
      // Rough estimate: multiple PHI types suggests larger breach
      return Math.min(event.phiTypes.length * 10, 500);
    }

    if (event.dataExfiltrated && event.dataTypes?.length) {
      return event.dataTypes.length * 50;
    }

    return 1; // Default to 1 if unknown
  }

  private generateTitle(category: IncidentCategory, event: IncidentEvent): string {
    const categoryTitles: Record<IncidentCategory, string> = {
      phi_breach: 'PHI Breach Detected',
      jailbreak_attempt: 'Jailbreak Attempt Detected',
      unauthorized_access: 'Unauthorized Access Detected',
      system_compromise: 'System Compromise Detected',
      data_exfiltration: 'Data Exfiltration Detected',
      service_disruption: 'Service Disruption Detected',
    };

    return categoryTitles[category] || 'Security Incident Detected';
  }

  private generateMitigationSteps(incident: Incident): string[] {
    const steps: string[] = [];

    if (incident.category === 'phi_breach') {
      steps.push('Identify and isolate all affected systems');
      steps.push('Preserve all relevant logs and forensic evidence');
      steps.push('Conduct risk assessment to determine breach scope');
      steps.push('Implement technical safeguards to prevent recurrence');
      steps.push('Prepare individual notification letters');
    }

    if (incident.category === 'unauthorized_access') {
      steps.push('Revoke all compromised credentials immediately');
      steps.push('Force password reset for affected accounts');
      steps.push('Implement additional authentication requirements');
      steps.push('Review and tighten access controls');
    }

    if (incident.category === 'data_exfiltration') {
      steps.push('Block all unauthorized data transfer channels');
      steps.push('Enable enhanced monitoring on all egress points');
      steps.push('Conduct comprehensive data access review');
      steps.push('Implement data loss prevention (DLP) measures');
    }

    if (incident.category === 'jailbreak_attempt') {
      steps.push('Update detection rules for similar patterns');
      steps.push('Reset all potentially affected sessions');
      steps.push('Review and enhance input validation');
      steps.push('Implement additional content filtering');
    }

    return steps;
  }

  private generateBreachDocumentation(
    incident: Incident,
    required: boolean,
    reason: string,
    notificationType: string
  ): BreachDocumentation {
    return {
      riskAnalysis: `Risk analysis conducted for ${incident.category} incident. Affected individuals: ${incident.affectedIndividuals || 'unknown'}. Severity: ${incident.severity}.`,
      determination: required 
        ? `Breach notification REQUIRED: ${reason}`
        : `Breach notification NOT REQUIRED: Incident does not meet HIPAA breach notification criteria`,
      notificationLetters: required ? [
        'individual_notification_letter_template',
        `${notificationType}_notification_template`,
      ] : [],
      complianceChecklist: {
        individualNotification: required && (notificationType === 'individual' || notificationType === 'hhs' || notificationType === 'media'),
        hhsNotification: notificationType === 'hhs' || notificationType === 'media',
        mediaNotification: notificationType === 'media',
        documentationComplete: true,
        timelineAdhered: true,
      },
    };
  }
}

// ============================================================================
// Singleton Instance and Convenience Functions
// ============================================================================

let incidentResponseService: IncidentResponseService | null = null;

export function getIncidentResponseService(): IncidentResponseService {
  if (!incidentResponseService) {
    incidentResponseService = new IncidentResponseService();
  }
  return incidentResponseService;
}

export async function classifyIncident(event: IncidentEvent) {
  const service = getIncidentResponseService();
  return service.classifyIncident(event);
}

export async function logIncident(event: IncidentEvent) {
  const service = getIncidentResponseService();
  const classification = await service.classifyIncident(event);
  return service.logIncident(event, classification);
}

export async function escalateIncident(incidentId: string) {
  const service = getIncidentResponseService();
  return service.escalateIncident(incidentId);
}

export async function evaluateBreachNotification(incidentId: string) {
  const service = getIncidentResponseService();
  return service.evaluateBreachNotification(incidentId);
}

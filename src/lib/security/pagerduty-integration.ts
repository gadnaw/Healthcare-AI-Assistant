/**
 * PagerDuty Integration Service
 * 
 * Provides alert triggering, incident management, and on-call schedule integration
 * for security incident response procedures.
 * 
 * Requires environment configuration:
 * - PAGERDUTY_API_KEY: API access token from PagerDuty Dashboard
 * - PAGERDUTY_SERVICE_ID: Healthcare AI service ID from PagerDuty Services
 */

import type { Incident, IncidentSeverity } from './incident-response';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface PagerDutyAlert {
  id?: string;
  incidentKey: string;
  title: string;
  description: string;
  urgency: 'high' | 'low';
  priority?: string;
  escalationLevel: number;
  status: 'triggered' | 'acknowledged' | 'resolved';
  createdAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
}

export interface PagerDutyIncident {
  id: string;
  incident_number: number;
  title: string;
  description: string;
  status: string;
  urgency: string;
  priority: {
    name: string;
    color: string;
  };
  created_at: string;
  service: {
    id: string;
    name: string;
  };
  assignments: {
    assignee: {
      id: string;
      name: string;
      email: string;
    };
  }[];
}

export interface PagerDutyOnCall {
  escalation_level: number;
  schedule: {
    id: string;
    name: string;
  };
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  };
}

export interface OnCallSchedule {
  currentOnCall: PagerDutyOnCall[];
  nextOnCall: PagerDutyOnCall[];
}

export interface PagerDutyConfig {
  apiKey: string;
  serviceId: string;
  serviceName: string;
  escalationPolicyId?: string;
}

// ============================================================================
// Priority Mapping
// ============================================================================

const SEVERITY_TO_URGENCY: Record<IncidentSeverity, 'high' | 'low'> = {
  critical: 'high',
  high: 'high',
  medium: 'low',
  low: 'low',
};

const SEVERITY_TO_PRIORITY: Record<IncidentSeverity, string> = {
  critical: 'P1',
  high: 'P2',
  medium: 'P3',
  low: 'P4',
};

const PRIORITY_COLORS: Record<string, string> = {
  P1: 'red',
  P2: 'orange',
  P3: 'yellow',
  P4: 'green',
};

// ============================================================================
// PagerDuty Integration Service
// ============================================================================

export class PagerDutyIntegration {
  private config: PagerDutyConfig;
  private baseUrl = 'https://api.pagerduty.com';
  private alerts: Map<string, PagerDutyAlert> = new Map();

  constructor() {
    this.config = {
      apiKey: process.env.PAGERDUTY_API_KEY || '',
      serviceId: process.env.PAGERDUTY_SERVICE_ID || '',
      serviceName: 'Healthcare AI Assistant',
      escalationPolicyId: process.env.PAGERDUTY_ESCALATION_POLICY_ID,
    };

    // Validate configuration
    if (!this.config.apiKey) {
      console.warn('PagerDuty API key not configured. Alert integration will operate in simulation mode.');
    }
    if (!this.config.serviceId) {
      console.warn('PagerDuty service ID not configured. Alert integration will operate in simulation mode.');
    }
  }

  /**
   * Check if PagerDuty is properly configured
   */
  isConfigured(): boolean {
    return !!(this.config.apiKey && this.config.serviceId);
  }

  /**
   * Trigger an alert for an incident
   */
  async triggerAlert(incident: Incident, escalationLevel: number = 1): Promise<PagerDutyAlert | null> {
    const urgency = SEVERITY_TO_URGENCY[incident.severity];
    const priority = SEVERITY_TO_PRIORITY[incident.severity];

    const alert: PagerDutyAlert = {
      incidentKey: incident.id,
      title: `[${incident.incidentNumber}] ${incident.title}`,
      description: this.formatAlertDescription(incident),
      urgency,
      priority,
      escalationLevel,
      status: 'triggered',
      createdAt: new Date(),
    };

    // Store alert locally for tracking
    this.alerts.set(incident.id, alert);

    // If PagerDuty is configured, make API call
    if (this.isConfigured()) {
      try {
        const pdIncident = await this.createPagerDutyIncident(incident, urgency, priority);
        alert.id = pdIncident.id;
        return alert;
      } catch (error) {
        console.error('Failed to create PagerDuty incident:', error);
        // Continue with simulated alert
      }
    }

    // Log alert for simulation mode
    console.log(`[PagerDuty Simulation] Alert triggered: ${alert.title}`);
    console.log(`  Severity: ${incident.severity}`);
    console.log(`  Urgency: ${urgency}`);
    console.log(`  Priority: ${priority}`);
    console.log(`  Escalation Level: ${escalationLevel}`);

    return alert;
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(incidentId: string): Promise<boolean> {
    const alert = this.alerts.get(incidentId);
    if (!alert) return false;

    alert.status = 'resolved';
    alert.resolvedAt = new Date();

    if (this.isConfigured()) {
      try {
        await this.resolvePagerDutyIncident(incidentId);
      } catch (error) {
        console.error('Failed to resolve PagerDuty incident:', error);
      }
    }

    console.log(`[PagerDuty Simulation] Alert resolved: ${alert.title}`);
    return true;
  }

  /**
   * Update incident status in PagerDuty
   */
  async updateIncident(incidentId: string, status: string): Promise<boolean> {
    const alert = this.alerts.get(incidentId);
    if (!alert) return false;

    switch (status) {
      case 'acknowledged':
        alert.status = 'acknowledged';
        alert.acknowledgedAt = new Date();
        break;
      case 'resolved':
        alert.status = 'resolved';
        alert.resolvedAt = new Date();
        break;
      default:
        alert.status = status as 'triggered' | 'acknowledged' | 'resolved';
    }

    if (this.isConfigured()) {
      try {
        await this.updatePagerDutyIncidentStatus(incidentId, status);
      } catch (error) {
        console.error('Failed to update PagerDuty incident:', error);
      }
    }

    console.log(`[PagerDuty Simulation] Incident updated: ${alert.title} -> ${status}`);
    return true;
  }

  /**
   * Get on-call schedule
   */
  async getOnCallSchedule(): Promise<OnCallSchedule> {
    if (this.isConfigured()) {
      try {
        const response = await this.fetchPagerDutyOnCall();
        return response;
      } catch (error) {
        console.error('Failed to fetch on-call schedule:', error);
      }
    }

    // Return mock on-call for simulation
    return this.getMockOnCallSchedule();
  }

  /**
   * Escalate an incident to the next level
   */
  async escalate(incidentId: string, newEscalationLevel: number): Promise<boolean> {
    const alert = this.alerts.get(incidentId);
    if (!alert) return false;

    alert.escalationLevel = newEscalationLevel;

    if (this.isConfigured()) {
      try {
        await this.escalatePagerDutyIncident(incidentId, newEscalationLevel);
      } catch (error) {
        console.error('Failed to escalate PagerDuty incident:', error);
      }
    }

    console.log(`[PagerDuty Simulation] Incident escalated to level ${newEscalationLevel}: ${alert.title}`);
    return true;
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(): PagerDutyAlert[] {
    return Array.from(this.alerts.values()).filter(
      alert => alert.status !== 'resolved'
    );
  }

  /**
   * Get alert by incident ID
   */
  getAlert(incidentId: string): PagerDutyAlert | undefined {
    return this.alerts.get(incidentId);
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private formatAlertDescription(incident: Incident): string {
    return `
Security Incident Alert - ${incident.incidentNumber}

Category: ${incident.category}
Severity: ${incident.severity.toUpperCase()}
Status: ${incident.status}
Detected: ${incident.detectedAt.toISOString()}

Description:
${incident.description}

Response Required:
- Initial assessment within ${this.getAssessmentTimeframe(incident.severity)}
- Containment actions: ${incident.containmentRequired ? 'Required' : 'Not required'}
- Breach notification: ${incident.breachNotificationRequired ? 'Required' : 'Not required'}
${incident.breachNotificationRequired ? `- Notification deadline: ${incident.breachNotificationDeadline?.toISOString()}` : ''}

View full incident details in the Security Incident Management dashboard.
    `.trim();
  }

  private getAssessmentTimeframe(severity: IncidentSeverity): string {
    switch (severity) {
      case 'critical': return '15 minutes';
      case 'high': return '1 hour';
      case 'medium': return '4 hours';
      case 'low': return '24 hours';
      default: return '24 hours';
    }
  }

  // ============================================================================
  // PagerDuty API Calls (simulated if not configured)
  // ============================================================================

  private async createPagerDutyIncident(
    incident: Incident,
    urgency: 'high' | 'low',
    priority: string
  ): Promise<PagerDutyIncident> {
    const response = await fetch(`${this.baseUrl}/incidents`, {
      method: 'POST',
      headers: {
        'Authorization': `Token token=${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        incident: {
          type: 'incident',
          title: `[${incident.incidentNumber}] ${incident.title}`,
          service: {
            id: this.config.serviceId,
            type: 'service_reference',
          },
          urgency,
          priority: {
            id: priority,
            type: 'priority_reference',
          },
          body: {
            type: 'incident_body',
            details: this.formatAlertDescription(incident),
          },
          escalation_policy: this.config.escalationPolicyId ? {
            id: this.config.escalationPolicyId,
            type: 'escalation_policy_reference',
          } : undefined,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`PagerDuty API error: ${response.statusText}`);
    }

    return response.json();
  }

  private async resolvePagerDutyIncident(incidentId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/incidents/${incidentId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Token token=${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        incident: {
          type: 'incident_reference',
          status: 'resolved',
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`PagerDuty API error: ${response.statusText}`);
    }
  }

  private async updatePagerDutyIncidentStatus(incidentId: string, status: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/incidents/${incidentId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Token token=${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        incident: {
          type: 'incident_reference',
          status,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`PagerDuty API error: ${response.statusText}`);
    }
  }

  private async escalatePagerDutyIncident(incidentId: string, escalationLevel: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/incidents/${incidentId}/escalate`, {
      method: 'POST',
      headers: {
        'Authorization': `Token token=${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        escalation_level: escalationLevel,
      }),
    });

    if (!response.ok) {
      throw new Error(`PagerDuty API error: ${response.statusText}`);
    }
  }

  private async fetchPagerDutyOnCall(): Promise<OnCallSchedule> {
    const response = await fetch(`${this.baseUrl}/oncalls`, {
      headers: {
        'Authorization': `Token token=${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`PagerDuty API error: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      currentOnCall: data.oncalls || [],
      nextOnCall: [],
    };
  }

  private getMockOnCallSchedule(): OnCallSchedule {
    return {
      currentOnCall: [
        {
          escalation_level: 1,
          schedule: {
            id: 'security-primary',
            name: 'Security Primary On-Call',
          },
          user: {
            id: 'user-001',
            name: 'Security On-Call',
            email: 'security-oncall@healthcare-ai.local',
          },
        },
        {
          escalation_level: 2,
          schedule: {
            id: 'security-secondary',
            name: 'Security Secondary On-Call',
          },
          user: {
            id: 'user-002',
            name: 'Security Lead',
            email: 'security-lead@healthcare-ai.local',
          },
        },
      ],
      nextOnCall: [
        {
          escalation_level: 1,
          schedule: {
            id: 'security-primary',
            name: 'Security Primary On-Call',
          },
          user: {
            id: 'user-003',
            name: 'Security Analyst',
            email: 'security-analyst@healthcare-ai.local',
          },
        },
      ],
    };
  }
}

// ============================================================================
// Singleton Instance and Convenience Functions
// ============================================================================

let pagerDutyIntegration: PagerDutyIntegration | null = null;

export function getPagerDutyIntegration(): PagerDutyIntegration {
  if (!pagerDutyIntegration) {
    pagerDutyIntegration = new PagerDutyIntegration();
  }
  return pagerDutyIntegration;
}

export async function triggerAlert(incident: Incident, escalationLevel?: number) {
  const integration = getPagerDutyIntegration();
  return integration.triggerAlert(incident, escalationLevel);
}

export async function resolveAlert(incidentId: string) {
  const integration = getPagerDutyIntegration();
  return integration.resolveAlert(incidentId);
}

export async function updateIncident(incidentId: string, status: string) {
  const integration = getPagerDutyIntegration();
  return integration.updateIncident(incidentId, status);
}

export async function getOnCallSchedule() {
  const integration = getPagerDutyIntegration();
  return integration.getOnCallSchedule();
}

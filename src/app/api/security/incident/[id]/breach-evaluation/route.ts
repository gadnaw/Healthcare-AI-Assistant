/**
 * Security Incident API - Breach Evaluation Endpoint
 * 
 * Provides endpoint for:
 * - GET /api/security/incident/:id/breach-evaluation - Get breach notification evaluation
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  IncidentResponseService, 
  getIncidentResponseService 
} from '@/lib/security/incident-response';
import { requirePermission } from '@/lib/rbac/role-utils';
import { AuditService } from '@/lib/compliance/audit';

// ============================================================================
// GET /api/security/incident/:id/breach-evaluation
// Retrieve breach notification evaluation for an incident
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const incidentId = resolvedParams.id;

    // Verify authentication and authorization
    const authResult = await requirePermission('AUDIT_VIEW');
    if (!authResult.allowed) {
      return NextResponse.json(
        { error: 'Unauthorized: Requires AUDIT_VIEW permission' },
        { status: 403 }
      );
    }

    const service = getIncidentResponseService();
    
    // Check if incident exists
    const incident = service.getIncident(incidentId);
    if (!incident) {
      return NextResponse.json(
        { error: 'Incident not found' },
        { status: 404 }
      );
    }

    // Evaluate breach notification requirements
    const evaluation = await service.evaluateBreachNotification(incidentId);

    // Calculate time remaining until notification deadline
    const now = new Date();
    const deadline = evaluation.notificationDeadline;
    const hoursRemaining = Math.max(0, (deadline.getTime() - now.getTime()) / (1000 * 60 * 60));

    return NextResponse.json({
      success: true,
      evaluation: {
        incidentId,
        incidentCategory: incident.category,
        breachNotificationRequired: evaluation.required,
        reason: evaluation.reason,
        affectedIndividuals: evaluation.affectedIndividuals,
        notificationDeadline: evaluation.notificationDeadline,
        hoursRemainingUntilDeadline: Math.round(hoursRemaining * 10) / 10,
        notificationType: evaluation.notificationType,
        riskLevel: evaluation.riskLevel,
        mitigation: evaluation.mitigation,
        documentation: {
          riskAnalysis: evaluation.documentation.riskAnalysis,
          determination: evaluation.documentation.determination,
          complianceChecklist: evaluation.documentation.complianceChecklist,
        },
      },
      timeline: {
        detectedAt: incident.detectedAt,
        currentTime: now,
        notificationDeadline: deadline,
        phase: hoursRemaining > 48 ? 'Early' : hoursRemaining > 24 ? 'Mid' : hoursRemaining > 12 ? 'Late' : 'Critical',
        urgency: hoursRemaining < 12 ? 'CRITICAL' : hoursRemaining < 24 ? 'HIGH' : hoursRemaining < 48 ? 'MEDIUM' : 'LOW',
      },
      hipaaCompliance: {
        notificationRequired: evaluation.required,
        timeline: '60 hours from detection',
        individualNotification: evaluation.documentation.complianceChecklist.individualNotification,
        hhsNotification: evaluation.documentation.complianceChecklist.hhsNotification,
        mediaNotification: evaluation.documentation.complianceChecklist.mediaNotification,
        thresholdHHS: evaluation.affectedIndividuals >= 500,
        thresholdMedia: evaluation.affectedIndividuals >= 500,
      },
    });

  } catch (error) {
    console.error('Error evaluating breach notification:', error);
    return NextResponse.json(
      { error: 'Failed to evaluate breach notification' },
      { status: 500 }
    );
  }
}

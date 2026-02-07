/**
 * Security Incident API - Individual Incident Endpoint
 * 
 * Provides endpoints for:
 * - GET /api/security/incident/:id - Retrieve incident details
 * - PUT /api/security/incident/:id/status - Update incident status
 * - POST /api/security/incident/:id/escalate - Escalate incident
 * - GET /api/security/incident/:id/breach-evaluation - Get breach notification evaluation
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  IncidentResponseService, 
  IncidentStatus,
  getIncidentResponseService 
} from '@/lib/security/incident-response';
import { requirePermission } from '@/lib/rbac/role-utils';
import { AuditService } from '@/lib/compliance/audit';

// ============================================================================
// GET /api/security/incident/:id
// Retrieve incident details
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
    const incident = service.getIncident(incidentId);

    if (!incident) {
      return NextResponse.json(
        { error: 'Incident not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      incident: {
        id: incident.id,
        incidentNumber: incident.incidentNumber,
        category: incident.category,
        severity: incident.severity,
        status: incident.status,
        title: incident.title,
        description: incident.description,
        source: incident.source,
        detectedAt: incident.detectedAt,
        lastUpdated: incident.lastUpdated,
        reportedBy: incident.reportedBy,
        assignedTeam: incident.assignedTeam,
        escalationLevel: incident.escalationLevel,
        containmentRequired: incident.containmentRequired,
        breachNotificationRequired: incident.breachNotificationRequired,
        breachNotificationDeadline: incident.breachNotificationDeadline,
        affectedIndividuals: incident.affectedIndividuals,
        timeline: incident.timeline,
        relatedAuditEvents: incident.relatedAuditEvents,
        resolution: incident.resolution,
        lessonsLearned: incident.lessonsLearned,
      },
    });

  } catch (error) {
    console.error('Error fetching incident:', error);
    return NextResponse.json(
      { error: 'Failed to fetch incident' },
      { status: 500 }
    );
  }
}

// ============================================================================
// PUT /api/security/incident/:id/status
// Update incident status
// ============================================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const incidentId = resolvedParams.id;

    // Verify authentication and authorization
    const authResult = await requirePermission('SYSTEM_CONFIG');
    if (!authResult.allowed) {
      return NextResponse.json(
        { error: 'Unauthorized: Requires SYSTEM_CONFIG permission' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();

    // Validate required fields
    if (!body.status) {
      return NextResponse.json(
        { error: 'Missing required field: status' },
        { status: 400 }
      );
    }

    const validStatuses: IncidentStatus[] = [
      'detected',
      'investigating',
      'containing',
      'eradicating',
      'recovering',
      'post_incident',
      'resolved',
      'false_alarm',
    ];

    if (!validStatuses.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    const service = getIncidentResponseService();
    const incident = await service.updateIncidentStatus(
      incidentId,
      body.status,
      body.details || `Status updated by ${authResult.user?.email || 'system'}`
    );

    if (!incident) {
      return NextResponse.json(
        { error: 'Incident not found' },
        { status: 404 }
      );
    }

    // Create audit log entry
    const auditService = new AuditService();
    await auditService.log({
      action: 'INCIDENT_STATUS_UPDATED',
      entityType: 'incident',
      entityId: incidentId,
      userId: authResult.user?.id,
      metadata: {
        newStatus: incident.status,
        details: body.details,
      },
    });

    return NextResponse.json({
      success: true,
      incident: {
        id: incident.id,
        incidentNumber: incident.incidentNumber,
        status: incident.status,
        lastUpdated: incident.lastUpdated,
      },
    });

  } catch (error) {
    console.error('Error updating incident status:', error);
    return NextResponse.json(
      { error: 'Failed to update incident status' },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST /api/security/incident/:id/escalate
// Escalate incident
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const incidentId = resolvedParams.id;

    // Verify authentication and authorization
    const authResult = await requirePermission('SYSTEM_CONFIG');
    if (!authResult.allowed) {
      return NextResponse.json(
        { error: 'Unauthorized: Requires SYSTEM_CONFIG permission' },
        { status: 403 }
      );
    }

    const service = getIncidentResponseService();
    const incident = await service.escalateIncident(incidentId);

    if (!incident) {
      return NextResponse.json(
        { error: 'Incident not found' },
        { status: 404 }
      );
    }

    // Create audit log entry
    const auditService = new AuditService();
    await auditService.log({
      action: 'INCIDENT_ESCALATED',
      entityType: 'incident',
      entityId: incidentId,
      userId: authResult.user?.id,
      metadata: {
        escalationLevel: incident.escalationLevel,
        reportedBy: authResult.user?.email || 'system',
      },
    });

    return NextResponse.json({
      success: true,
      incident: {
        id: incident.id,
        incidentNumber: incident.incidentNumber,
        escalationLevel: incident.escalationLevel,
        status: incident.status,
        lastUpdated: incident.lastUpdated,
      },
      message: `Incident escalated to level ${incident.escalationLevel}`,
    });

  } catch (error) {
    console.error('Error escalating incident:', error);
    return NextResponse.json(
      { error: 'Failed to escalate incident' },
      { status: 500 }
    );
  }
}

/**
 * Security Incident Management API
 * 
 * Provides endpoints for incident reporting, retrieval, and management.
 * 
 * Endpoints:
 * - POST /api/security/incident/report - Report a new security incident
 * - GET /api/security/incident/:id - Retrieve incident details
 * - GET /api/security/incident - List all incidents
 * - PUT /api/security/incident/:id/status - Update incident status
 * - POST /api/security/incident/:id/escalate - Escalate incident
 * - GET /api/security/incident/:id/breach-evaluation - Get breach notification evaluation
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  IncidentResponseService, 
  IncidentEvent, 
  IncidentStatus,
  getIncidentResponseService 
} from '@/lib/security/incident-response';
import { requirePermission } from '@/lib/rbac/role-utils';
import { AuditService } from '@/lib/compliance/audit';

// ============================================================================
// POST /api/security/incident/report
// Report a new security incident
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Verify authentication and authorization
    const authResult = await requirePermission('AUDIT_VIEW');
    if (!authResult.allowed) {
      return NextResponse.json(
        { error: 'Unauthorized: Requires AUDIT_VIEW permission' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();

    // Validate required fields
    if (!body.category || !body.source || !body.description) {
      return NextResponse.json(
        { error: 'Missing required fields: category, source, and description are required' },
        { status: 400 }
      );
    }

    // Create incident event from request
    const event: IncidentEvent = {
      category: body.category,
      source: body.source,
      timestamp: new Date(),
      description: body.description,
      affectedSystems: body.affectedSystems || [],
      affectedUsers: body.affectedUsers || [],
      detectedPHI: body.detectedPHI || false,
      phiTypes: body.phiTypes || [],
      attemptedAccess: body.attemptedAccess || false,
      successfulAccess: body.successfulAccess || false,
      dataExfiltrated: body.dataExfiltrated || false,
      dataTypes: body.dataTypes || [],
      serviceImpact: body.serviceImpact,
      reporter: body.reporter || authResult.user?.email || 'unknown',
      evidence: body.evidence || {},
    };

    // Classify the incident
    const service = getIncidentResponseService();
    const classification = await service.classifyIncident(event);

    // Log the incident
    const incident = await service.logIncident(event, classification);

    // Auto-escalate if critical severity
    if (incident.severity === 'critical' || incident.severity === 'high') {
      await service.escalateIncident(incident.id);
    }

    // Create audit log entry
    const auditService = new AuditService();
    await auditService.log({
      action: 'INCIDENT_REPORTED',
      entityType: 'incident',
      entityId: incident.id,
      userId: authResult.user?.id,
      metadata: {
        incidentNumber: incident.incidentNumber,
        category: incident.category,
        severity: incident.severity,
        classification,
      },
    });

    return NextResponse.json({
      success: true,
      incident: {
        id: incident.id,
        incidentNumber: incident.incidentNumber,
        category: incident.category,
        severity: incident.severity,
        status: incident.status,
        detectedAt: incident.detectedAt,
        breachNotificationRequired: incident.breachNotificationRequired,
        breachNotificationDeadline: incident.breachNotificationDeadline,
      },
      classification: {
        severity: classification.severity,
        responseTeam: classification.responseTeam,
        containmentRequirements: classification.containmentRequirements,
        escalationPath: classification.escalationPath,
        breachNotificationRequired: classification.breachNotificationRequired,
      },
    }, { status: 201 });

  } catch (error) {
    console.error('Error reporting incident:', error);
    return NextResponse.json(
      { error: 'Failed to report incident' },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET /api/security/incident
// List all incidents with optional filtering
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // Verify authentication and authorization
    const authResult = await requirePermission('AUDIT_VIEW');
    if (!authResult.allowed) {
      return NextResponse.json(
        { error: 'Unauthorized: Requires AUDIT_VIEW permission' },
        { status: 403 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as IncidentStatus | null;
    const severity = searchParams.get('severity');
    const activeOnly = searchParams.get('active') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const service = getIncidentResponseService();
    let incidents = service.getAllIncidents();

    // Apply filters
    if (status) {
      incidents = incidents.filter(i => i.status === status);
    }

    if (severity) {
      incidents = incidents.filter(i => i.severity === severity);
    }

    if (activeOnly) {
      incidents = incidents.filter(i => !['resolved', 'false_alarm'].includes(i.status));
    }

    // Sort by detection date (newest first)
    incidents.sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());

    // Paginate
    const total = incidents.length;
    incidents = incidents.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      incidents: incidents.map(incident => ({
        id: incident.id,
        incidentNumber: incident.incidentNumber,
        category: incident.category,
        severity: incident.severity,
        status: incident.status,
        title: incident.title,
        detectedAt: incident.detectedAt,
        lastUpdated: incident.lastUpdated,
        breachNotificationRequired: incident.breachNotificationRequired,
        breachNotificationDeadline: incident.breachNotificationDeadline,
        affectedIndividuals: incident.affectedIndividuals,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });

  } catch (error) {
    console.error('Error fetching incidents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch incidents' },
      { status: 500 }
    );
  }
}

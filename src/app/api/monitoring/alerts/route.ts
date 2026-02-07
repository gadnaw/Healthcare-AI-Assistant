import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac/permissions';
import { getAlertSummary, AlertSeverity } from '@/lib/monitoring';

/**
 * GET /api/monitoring/alerts
 * 
 * Returns current alert status for monitoring dashboard.
 * Requires ADMIN role or AUDIT_VIEW permission.
 */
export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Authorization check - require admin role or audit view permission
    const hasPermission = await requirePermission('AUDIT_VIEW');
    
    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions' },
        { status: 403 }
      );
    }

    // Get alert summary from monitoring module
    const alertSummary = getAlertSummary();

    // Format response
    const response = {
      total: alertSummary.total,
      bySeverity: {
        critical: alertSummary.bySeverity[AlertSeverity.CRITICAL] || 0,
        error: alertSummary.bySeverity[AlertSeverity.ERROR] || 0,
        warning: alertSummary.bySeverity[AlertSeverity.WARNING] || 0,
        info: alertSummary.bySeverity[AlertSeverity.INFO] || 0
      },
      byCategory: alertSummary.byCategory,
      recent: alertSummary.recent.map(alert => ({
        id: alert.id,
        name: alert.name,
        severity: alert.threshold.severity,
        message: alert.threshold.message,
        timestamp: new Date().toISOString()
      }))
    };

    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Error fetching alert status:', error);
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

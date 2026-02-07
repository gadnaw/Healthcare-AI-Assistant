import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac/permissions';
import {
  getErrorRate,
  getLatencyPercentiles,
  queryMetrics
} from '@/lib/monitoring';
import { logAuditEvent } from '@/lib/monitoring';

/**
 * GET /api/monitoring/metrics
 * 
 * Returns current metrics snapshot for monitoring dashboard.
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
      // Log unauthorized access attempt
      await logAuditEvent(
        'unauthorized_metrics_access',
        session.user.id,
        session.user.orgId || 'unknown',
        'api',
        'metrics',
        'attempted_access'
      );
      
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions' },
        { status: 403 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const timeRange = parseInt(searchParams.get('timeRange') || '3600', 10); // Default 1 hour
    const orgId = searchParams.get('orgId') || session.user.orgId;
    const includeSecurity = searchParams.get('includeSecurity') === 'true';
    const includeCompliance = searchParams.get('includeCompliance') === 'true';

    // Calculate time range
    const timeRangeMinutes = Math.floor(timeRange / 60);
    const now = Date.now();
    const from = Math.floor(now / 1000) - timeRange;
    const to = Math.floor(now / 1000);

    // Collect metrics in parallel
    const [
      errorRateResult,
      latencyResult
    ] = await Promise.all([
      getErrorRate(orgId, timeRangeMinutes),
      getLatencyPercentiles(orgId, timeRangeMinutes)
    ]);

    // Build response
    const metrics: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      timeRange: {
        start: new Date(from * 1000).toISOString(),
        end: new Date(to * 1000).toISOString(),
        minutes: timeRangeMinutes
      },
      organization: {
        id: orgId
      },
      queryMetrics: {
        errorRate: {
          value: errorRateResult.success ? errorRateResult.errorRate : null,
          status: errorRateResult.success ? 'healthy' : 'unavailable'
        },
        latency: {
          p50: latencyResult.success ? latencyResult.p50 : null,
          p95: latencyResult.success ? latencyResult.p95 : null,
          p99: latencyResult.success ? latencyResult.p99 : null,
          status: latencyResult.success ? 'healthy' : 'unavailable'
        }
      }
    };

    // Include security metrics if requested
    if (includeSecurity) {
      const securityQuery = `sum:healthcare_ai.security.{jailbreak_attempts,phi_detected,injection_blocked}{org_id:${orgId || '*'}}.as_count()`;
      const securityResult = await queryMetrics(securityQuery, { from, to });
      
      metrics.securityMetrics = {
        jailbreakAttempts: 0, // Would parse from securityResult
        phiDetected: 0,
        injectionBlocked: 0,
        status: securityResult.success ? 'healthy' : 'unavailable'
      };
    }

    // Include compliance metrics if requested
    if (includeCompliance) {
      const complianceQuery = `avg:healthcare_ai.compliance.audit_completeness{org_id:${orgId || '*'}}`;
      const complianceResult = await queryMetrics(complianceQuery, { from, to });
      
      metrics.complianceMetrics = {
        auditCompleteness: 100, // Would parse from complianceResult
        phiAccessEvents: 0,
        exportOperations: 0,
        status: complianceResult.success ? 'healthy' : 'unavailable'
      };
    }

    return NextResponse.json(metrics);
    
  } catch (error) {
    console.error('Error fetching metrics:', error);
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

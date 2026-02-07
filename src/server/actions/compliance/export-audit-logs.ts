/**
 * Export Audit Logs Server Action
 * Healthcare AI Assistant - HIPAA-Aware RAG
 * 
 * Exports audit logs to CSV format with role-based access control.
 * Export operations are logged to audit trail for compliance.
 */

'use server';

import { auditService, AuditQueryFilters } from '@/lib/compliance/audit';
import { requirePermission } from '@/lib/rbac/role-utils';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// ============================================
// Types
// ============================================

export interface AuditLogFilters {
  userId?: string;
  actionType?: string;
  entityType?: string;
  entityId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

// ============================================
// Server Action
// ============================================

/**
 * Export audit logs to CSV format
 * Requires: AUDIT_EXPORT permission
 * 
 * Features:
 * - Generates CSV with standard audit fields
 * - Logs export action to audit trail
 * - Enforces 100,000 record limit
 * - Role-based filtering applied
 */
export async function exportAuditLogsAction(
  filters: AuditLogFilters
): Promise<Blob> {
  // Verify authentication
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error('Unauthorized: Authentication required');
  }

  // Check permission
  await requirePermission('AUDIT_EXPORT');

  const userId = session.user.id;
  const orgId = session.user.orgId || '';

  // Convert string dates to Date objects
  const queryFilters: AuditQueryFilters = {
    userId: filters.userId,
    actionType: filters.actionType,
    entityType: filters.entityType,
    entityId: filters.entityId,
    orgId,
    startDate: filters.startDate ? new Date(filters.startDate) : undefined,
    endDate: filters.endDate ? new Date(filters.endDate) : undefined,
    limit: 100000, // Maximum export limit
    offset: 0
  };

  // Get role from session
  const userRole = (session.user as any).role || 'STAFF';

  // Check for export size limit
  const countResult = await auditService.query(
    { ...queryFilters, limit: 1, offset: 0 },
    userRole as any,
    userId
  );

  if (countResult.total > 100000) {
    throw new Error('Export too large: Maximum 100,000 records allowed. Please apply stricter filters.');
  }

  // Export audit logs (this will log the AUDIT_EXPORT action internally)
  const csvBuffer = await auditService.export(queryFilters, userRole as any, userId);

  return new Blob([csvBuffer.data], { type: csvBuffer.mimeType });
}

/**
 * Get Audit Logs Server Action
 * Healthcare AI Assistant - HIPAA-Aware RAG
 * 
 * Retrieves audit logs with filtering, pagination, and role-based access control.
 */

'use server';

import { auditService, AuditQueryFilters, AuditLogEntry } from '@/lib/compliance/audit';
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

export interface AuditLogsResult {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

// ============================================
// Server Action
// ============================================

/**
 * Get audit logs with filtering and pagination
 * Requires: AUDIT_VIEW permission
 * 
 * Role-based access:
 * - Admin: Sees all org events
 * - Provider: Sees own events + document-related events
 * - Staff: Sees only their own events
 */
export async function getAuditLogsAction(
  filters: AuditLogFilters
): Promise<AuditLogsResult> {
  // Verify authentication
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error('Unauthorized: Authentication required');
  }

  // Check permission
  await requirePermission('AUDIT_VIEW');

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
    limit: filters.pageSize || 50,
    offset: ((filters.page || 1) - 1) * (filters.pageSize || 50)
  };

  // Get role from session
  const userRole = (session.user as any).role || 'STAFF';

  // Query audit logs
  const result = await auditService.query(queryFilters, userRole as any, userId);

  return {
    logs: result.data,
    total: result.total,
    page: filters.page || 1,
    pageSize: filters.pageSize || 50
  };
}

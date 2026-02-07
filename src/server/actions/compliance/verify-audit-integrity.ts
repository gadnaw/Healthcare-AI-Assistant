/**
 * Verify Audit Integrity Server Action
 * Healthcare AI Assistant - HIPAA-Aware RAG
 * 
 * Verifies audit log integrity for compliance audits.
 * Requires admin-level permissions.
 */

'use server';

import { auditService } from '@/lib/compliance/audit';
import { requirePermission } from '@/lib/rbac/role-utils';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// ============================================
// Types
// ============================================

export interface IntegrityVerificationResult {
  recordCount: number;
  hashMatches: boolean;
  anomalies: AuditAnomaly[];
  verifiedRange: {
    startDate: Date;
    endDate: Date;
  };
}

export interface AuditAnomaly {
  type: string;
  description: string;
  recordId?: string;
  timestamp?: Date;
}

// ============================================
// Server Action
// ============================================

/**
 * Verify audit log integrity for a date range
 * Requires: SYSTEM_CONFIG permission (admin only)
 * 
 * Used for compliance audits to verify:
 * - Record continuity
 * - No timestamp regression
 * - No duplicate entries
 * - Hash verification
 */
export async function verifyAuditIntegrityAction(
  startDate: string,
  endDate: string
): Promise<IntegrityVerificationResult> {
  // Verify authentication
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error('Unauthorized: Authentication required');
  }

  // Check permission - only admins can verify integrity
  await requirePermission('SYSTEM_CONFIG');

  const orgId = session.user.orgId || '';
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Validate date range
  if (start >= end) {
    throw new Error('Invalid date range: start date must be before end date');
  }

  // Verify integrity
  const result = await auditService.verifyIntegrity(start, end, orgId);

  return {
    recordCount: result.recordCount,
    hashMatches: result.hashMatches,
    anomalies: result.anomalies,
    verifiedRange: result.verifiedRange
  };
}

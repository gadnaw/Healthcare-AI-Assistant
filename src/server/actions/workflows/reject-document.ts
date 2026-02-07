'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac/role-utils';
import { Permission } from '@/lib/rbac/permissions';
import { AuditService } from '@/lib/compliance/audit';
import { DocumentStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

// ============================================
// Constants
// ============================================

const MIN_REJECTION_REASON_LENGTH = 10;
const MAX_REJECTION_REASON_LENGTH = 1000;

// ============================================
// Reject Document Server Action
// ============================================

/**
 * Reject a pending document with required reason
 * Requires DOC_APPROVE permission
 * 
 * @param documentId - The ID of the document to reject
 * @param reason - The reason for rejection (10-1000 characters required)
 * @param adminUserId - The ID of the admin rejecting the document
 * @param orgId - The organization ID
 * @returns Promise<void>
 * @throws Error if document not found, not pending, unauthorized, or reason invalid
 */
export async function rejectDocument(
  documentId: string,
  reason: string,
  adminUserId: string,
  orgId: string
): Promise<void> {
  // Validate rejection reason
  validateRejectionReason(reason);

  // Verify permission - throws 403 if not authorized
  requirePermission(adminUserId, Permission.DOC_APPROVE);

  // Validate document exists and is in pending status
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      title: true,
      status: true,
      org_id: true,
      uploaded_by: true
    }
  });

  if (!document) {
    throw new Error('Document not found');
  }

  // Verify document belongs to the organization
  if (document.org_id !== orgId) {
    throw new Error('Document not found in this organization');
  }

  // Verify document is in PENDING_APPROVAL status
  if (document.status !== DocumentStatus.PENDING_APPROVAL) {
    throw new Error(`Cannot reject document in ${document.status} status. Only PENDING_APPROVAL documents can be rejected.`);
  }

  // Update document status to REJECTED with rejection reason
  await prisma.document.update({
    where: { id: documentId },
    data: {
      status: DocumentStatus.REJECTED,
      metadata: {
        rejectionReason: reason,
        rejectedBy: adminUserId,
        rejectedAt: new Date().toISOString()
      }
    }
  });

  // Create DocumentApproval record with rejection details
  await prisma.documentApproval.upsert({
    where: {
      document_id: documentId
    },
    create: {
      document_id: documentId,
      requested_by: document.uploaded_by,
      reviewed_by: adminUserId,
      status: 'REJECTED',
      comments: reason,
      reviewed_at: new Date()
    },
    update: {
      reviewed_by: adminUserId,
      status: 'REJECTED',
      comments: reason,
      reviewed_at: new Date()
    }
  });

  // Log the rejection action to audit trail
  const auditService = new AuditService();
  await auditService.log(
    'DOCUMENT_REJECT',
    'document',
    documentId,
    adminUserId,
    orgId,
    undefined,
    undefined,
    {
      document_title: document.title,
      previous_status: DocumentStatus.PENDING_APPROVAL,
      new_status: DocumentStatus.REJECTED,
      rejection_reason: reason
    }
  );

  // Send rejection notification to document owner
  await sendRejectionNotification(documentId, document.uploaded_by, orgId, reason);

  // Revalidate relevant paths
  revalidatePath(`/documents/${documentId}`);
  revalidatePath('/documents');
  revalidatePath('/admin/documents');
}

// ============================================
// Validation Functions
// ============================================

/**
 * Validate rejection reason meets requirements
 */
function validateRejectionReason(reason: string): void {
  // Check if reason is provided
  if (!reason || reason.trim().length === 0) {
    throw new Error('Rejection reason is required');
  }

  // Check minimum length
  if (reason.length < MIN_REJECTION_REASON_LENGTH) {
    throw new Error(`Rejection reason must be at least ${MIN_REJECTION_REASON_LENGTH} characters`);
  }

  // Check maximum length
  if (reason.length > MAX_REJECTION_REASON_LENGTH) {
    throw new Error(`Rejection reason cannot exceed ${MAX_REJECTION_REASON_LENGTH} characters`);
  }

  // Check for empty/whitespace only reason
  if (reason.trim().length < MIN_REJECTION_REASON_LENGTH) {
    throw new Error('Rejection reason must contain meaningful content');
  }
}

// ============================================
// Send Rejection Notification
// ============================================

/**
 * Send notification to document owner about rejection
 */
async function sendRejectionNotification(
  documentId: string,
  ownerUserId: string,
  orgId: string,
  reason: string
): Promise<void> {
  try {
    // Import notification service
    const { NotificationService } = await import('@/lib/notifications/notification-service');
    
    const notificationService = new NotificationService();
    await notificationService.sendRejectionNotice(documentId, orgId, reason);
  } catch (error) {
    // Notifications are best-effort - don't fail rejection
    console.error(`Failed to send rejection notification for document ${documentId}:`, error);
  }
}

// ============================================
// Export Validation Constants
// ============================================

export {
  MIN_REJECTION_REASON_LENGTH,
  MAX_REJECTION_REASON_LENGTH
};

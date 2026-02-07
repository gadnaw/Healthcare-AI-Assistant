'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac/role-utils';
import { Permission } from '@/lib/rbac/permissions';
import { AuditService } from '@/lib/compliance/audit';
import { DocumentStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

// ============================================
// Approve Document Server Action
// ============================================

/**
 * Approve a pending document for indexing and availability
 * Requires DOC_APPROVE permission
 * 
 * @param documentId - The ID of the document to approve
 * @param adminUserId - The ID of the admin approving the document
 * @param orgId - The organization ID
 * @returns Promise<void>
 * @throws Error if document not found, not pending, or unauthorized
 */
export async function approveDocument(
  documentId: string,
  adminUserId: string,
  orgId: string
): Promise<void> {
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
    throw new Error(`Cannot approve document in ${document.status} status. Only PENDING_APPROVAL documents can be approved.`);
  }

  // Update document status to APPROVED
  await prisma.document.update({
    where: { id: documentId },
    data: {
      status: DocumentStatus.APPROVED
    }
  });

  // Create or update DocumentApproval record
  await prisma.documentApproval.upsert({
    where: {
      document_id: documentId
    },
    create: {
      document_id: documentId,
      requested_by: document.uploaded_by,
      reviewed_by: adminUserId,
      status: 'APPROVED',
      comments: null,
      reviewed_at: new Date()
    },
    update: {
      reviewed_by: adminUserId,
      status: 'APPROVED',
      comments: null,
      reviewed_at: new Date()
    }
  });

  // Log the approval action to audit trail
  const auditService = new AuditService();
  await auditService.log(
    'DOCUMENT_APPROVE',
    'document',
    documentId,
    adminUserId,
    orgId,
    undefined,
    undefined,
    {
      document_title: document.title,
      previous_status: DocumentStatus.PENDING_APPROVAL,
      new_status: DocumentStatus.APPROVED
    }
  );

  // Trigger indexing process (Phase 2 integration)
  await triggerDocumentIndexing(documentId);

  // Send approval notification to document owner
  await sendApprovalNotification(documentId, document.uploaded_by, orgId);

  // Revalidate relevant paths
  revalidatePath(`/documents/${documentId}`);
  revalidatePath('/documents');
  revalidatePath('/admin/documents');
}

// ============================================
// Trigger Document Indexing
// ============================================

/**
 * Trigger the Phase 2 indexing process for the approved document
 * This function integrates with the document chunking and embedding pipeline
 */
async function triggerDocumentIndexing(documentId: string): Promise<void> {
  try {
    // Import the indexing service from Phase 2
    const { triggerDocumentIndexing } = await import('@/lib/indexing/indexer');
    
    // Trigger async indexing process
    await triggerDocumentIndexing(documentId);
    
    console.log(`Document ${documentId} sent for indexing`);
  } catch (error) {
    // Indexing is a background process - don't fail the approval if indexing fails
    console.error(`Failed to trigger indexing for document ${documentId}:`, error);
    
    // Log the indexing failure but don't throw - approval still succeeds
    const auditService = new AuditService();
    await auditService.log(
      'INDEXING_TRIGGER_FAILED',
      'document',
      documentId,
      'system',
      'system',
      undefined,
      undefined,
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        document_id: documentId
      }
    );
  }
}

// ============================================
// Send Approval Notification
// ============================================

/**
 * Send notification to document owner about approval
 */
async function sendApprovalNotification(
  documentId: string,
  ownerUserId: string,
  orgId: string
): Promise<void> {
  try {
    // Import notification service
    const { NotificationService } = await import('@/lib/notifications/notification-service');
    
    const notificationService = new NotificationService();
    await notificationService.sendApprovalNotice(documentId, orgId);
  } catch (error) {
    // Notifications are best-effort - don't fail approval
    console.error(`Failed to send approval notification for document ${documentId}:`, error);
  }
}

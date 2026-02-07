import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac/role-utils';
import { Permission } from '@/lib/rbac/permissions';
import { AuditService } from '@/lib/compliance/audit';
import { DocumentStatus } from '@prisma/client';

// ============================================
// Types
// ============================================

export interface DocumentApprovalItem {
  id: string;
  title: string;
  uploadedBy: string;
  uploadedAt: Date;
  fileType: string;
  fileSize: number;
  previewText: string | null;
  status: DocumentStatus;
  rejectionReason?: string | null;
}

// ============================================
// Get Pending Documents Server Action
// ============================================

/**
 * Get all documents pending approval for an organization
 * Requires DOC_APPROVE permission
 */
export async function getPendingDocuments(
  orgId: string,
  userId: string
): Promise<DocumentApprovalItem[]> {
  // Verify permission - throws 403 if not authorized
  requirePermission(userId, Permission.DOC_APPROVE);

  // Query documents with PENDING_APPROVAL status
  const documents = await prisma.document.findMany({
    where: {
      org_id: orgId,
      status: DocumentStatus.PENDING_APPROVAL,
      deleted_at: null
    },
    orderBy: {
      created_at: 'desc'
    },
    select: {
      id: true,
      title: true,
      uploaded_by: true,
      created_at: true,
      file_type: true,
      file_size: true,
      metadata: true,
      status: true
    }
  });

  // Transform to DocumentApprovalItem format
  const approvalItems: DocumentApprovalItem[] = documents.map(doc => ({
    id: doc.id,
    title: doc.title,
    uploadedBy: doc.uploaded_by,
    uploadedAt: doc.created_at,
    fileType: doc.file_type,
    fileSize: doc.file_size,
    previewText: extractPreviewText(doc.metadata),
    status: doc.status,
    rejectionReason: null
  }));

  return approvalItems;
}

/**
 * Get all documents (all statuses) for admin review
 */
export async function getAllDocumentsForApproval(
  orgId: string,
  userId: string,
  options?: {
    filter?: DocumentStatus | 'ALL';
    search?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ documents: DocumentApprovalItem[]; total: number }> {
  // Verify permission
  requirePermission(userId, Permission.DOC_APPROVE);

  const { 
    filter = 'ALL', 
    search = '', 
    limit = 20, 
    offset = 0 
  } = options || {};

  // Build where clause
  const where: any = {
    org_id: orgId,
    deleted_at: null,
    status: {
      in: filter === 'ALL' 
        ? [DocumentStatus.PENDING_APPROVAL, DocumentStatus.APPROVED, DocumentStatus.REJECTED, DocumentStatus.DEPRECATED]
        : filter
    }
  };

  // Add search filter if provided
  if (search) {
    where.title = {
      contains: search,
      mode: 'insensitive'
    };
  }

  // Execute query with pagination
  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: {
        created_at: 'desc'
      },
      take: limit,
      skip: offset,
      select: {
        id: true,
        title: true,
        uploaded_by: true,
        created_at: true,
        file_type: true,
        file_size: true,
        metadata: true,
        status: true
      }
    }),
    prisma.document.count({ where })
  ]);

  // Get rejection reasons from DocumentApproval table
  const rejectedDocIds = documents
    .filter(d => d.status === DocumentStatus.REJECTED)
    .map(d => d.id);

  const rejectionReasons = await prisma.documentApproval.findMany({
    where: {
      document_id: { in: rejectedDocIds },
      status: 'REJECTED'
    },
    select: {
      document_id: true,
      comments: true
    }
  });

  const rejectionMap = new Map(
    rejectionReasons.map(r => [r.document_id, r.comments])
  );

  // Transform to DocumentApprovalItem format
  const approvalItems: DocumentApprovalItem[] = documents.map(doc => ({
    id: doc.id,
    title: doc.title,
    uploadedBy: doc.uploaded_by,
    uploadedAt: doc.created_at,
    fileType: doc.file_type,
    fileSize: doc.file_size,
    previewText: extractPreviewText(doc.metadata),
    status: doc.status,
    rejectionReason: rejectionMap.get(doc.id) || null
  }));

  return { documents: approvalItems, total };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Extract preview text from document metadata
 */
function extractPreviewText(metadata: any): string | null {
  if (!metadata || !metadata.previewText) {
    return null;
  }
  
  // Return first 200 characters
  const text = metadata.previewText;
  if (text.length <= 200) {
    return text;
  }
  
  return text.substring(0, 197) + '...';
}

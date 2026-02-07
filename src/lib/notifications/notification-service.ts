import { prisma } from '@/lib/prisma';
import { AuditService } from '@/lib/compliance/audit';

// ============================================
// Types
// ============================================

export interface NotificationInput {
  userId: string;
  orgId: string;
  type: NotificationType;
  title: string;
  message: string;
  documentId?: string;
  metadata?: Record<string, any>;
}

export enum NotificationType {
  DOCUMENT_APPROVED = 'DOCUMENT_APPROVED',
  DOCUMENT_REJECTED = 'DOCUMENT_REJECTED',
  DOCUMENT_DEPRECATED = 'DOCUMENT_DEPRECATED',
  SYSTEM = 'SYSTEM'
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  document_id?: string;
  metadata?: any;
  read: boolean;
  created_at: Date;
}

// ============================================
// NotificationService
// ============================================

export class NotificationService {
  private readonly auditService: AuditService;

  constructor() {
    this.auditService = new AuditService();
  }

  // ============================================
  // Create Notification
  // ============================================

  /**
   * Create a new notification for a user
   */
  async createNotification(input: NotificationInput): Promise<Notification> {
    const notification = await prisma.notification.create({
      data: {
        user_id: input.userId,
        org_id: input.orgId,
        type: input.type as any,
        title: input.title,
        message: input.message,
        document_id: input.documentId,
        metadata: input.metadata || {},
        read: false
      }
    });

    return notification as Notification;
  }

  // ============================================
  // Document Notifications
  // ============================================

  /**
   * Send deprecation notice to all users with access to a document
   */
  async sendDeprecationNotice(
    documentId: string,
    orgId: string,
    reason: string,
    deprecatingUserId: string
  ): Promise<void> {
    // Get document details
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        title: true,
        org_id: true
      }
    });

    if (!document) {
      throw new Error('Document not found');
    }

    // Get all users in the organization who have access to documents
    // This could be customized based on specific document access rules
    const users = await prisma.user.findMany({
      where: {
        org_id: orgId,
        is_active: true
      },
      select: {
        id: true
      }
    });

    // Create notifications for all users
    const notificationPromises = users.map(user =>
      this.createNotification({
        userId: user.id,
        orgId,
        type: NotificationType.DOCUMENT_DEPRECATED,
        title: 'Document Deprecated',
        message: `The document "${document.title}" has been marked as deprecated.`,
        documentId,
        metadata: {
          reason,
          deprecatingUserId,
          documentTitle: document.title
        }
      })
    );

    await Promise.all(notificationPromises);

    // Log the notification batch
    await this.auditService.log(
      'DEPRECATION_NOTIFICATIONS_SENT',
      'document',
      documentId,
      deprecatingUserId,
      orgId,
      undefined,
      undefined,
      {
        document_title: document.title,
        reason,
        recipient_count: users.length
      }
    );

    console.log(`Sent deprecation notices for document ${documentId} to ${users.length} users`);
  }

  /**
   * Send approval notice to document owner
   */
  async sendApprovalNotice(
    documentId: string,
    orgId: string
  ): Promise<void> {
    // Get document details
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        title: true,
        uploaded_by: true,
        org_id: true
      }
    });

    if (!document) {
      throw new Error('Document not found');
    }

    // Create notification for document owner
    await this.createNotification({
      userId: document.uploaded_by,
      orgId,
      type: NotificationType.DOCUMENT_APPROVED,
      title: 'Document Approved',
      message: `Your document "${document.title}" has been approved and is now available in the knowledge base.`,
      documentId,
      metadata: {
        documentTitle: document.title,
        approvedAt: new Date().toISOString()
      }
    });

    console.log(`Sent approval notice for document ${documentId} to user ${document.uploaded_by}`);
  }

  /**
   * Send rejection notice to document owner
   */
  async sendRejectionNotice(
    documentId: string,
    orgId: string,
    reason: string
  ): Promise<void> {
    // Get document details
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        title: true,
        uploaded_by: true,
        org_id: true
      }
    });

    if (!document) {
      throw new Error('Document not found');
    }

    // Create notification for document owner
    await this.createNotification({
      userId: document.uploaded_by,
      orgId,
      type: NotificationType.DOCUMENT_REJECTED,
      title: 'Document Rejected',
      message: `Your document "${document.title}" was not approved.`,
      documentId,
      metadata: {
        documentTitle: document.title,
        rejectionReason: reason,
        rejectedAt: new Date().toISOString()
      }
    });

    console.log(`Sent rejection notice for document ${documentId} to user ${document.uploaded_by}`);
  }

  // ============================================
  // Notification Retrieval
  // ============================================

  /**
   * Get unread notifications for a user
   */
  async getUnreadNotifications(
    userId: string,
    limit: number = 20
  ): Promise<Notification[]> {
    const notifications = await prisma.notification.findMany({
      where: {
        user_id: userId,
        read: false
      },
      orderBy: {
        created_at: 'desc'
      },
      take: limit
    });

    return notifications as Notification[];
  }

  /**
   * Get all notifications for a user with pagination
   */
  async getNotifications(
    userId: string,
    options?: {
      unreadOnly?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ notifications: Notification[]; total: number }> {
    const { unreadOnly = false, limit = 20, offset = 0 } = options || {};

    const where: any = {
      user_id: userId
    };

    if (unreadOnly) {
      where.read = false;
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: {
          created_at: 'desc'
        },
        take: limit,
        skip: offset
      }),
      prisma.notification.count({ where })
    ]);

    return {
      notifications: notifications as Notification[],
      total
    };
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(
    notificationId: string,
    userId: string
  ): Promise<void> {
    await prisma.notification.update({
      where: {
        id: notificationId,
        user_id: userId // Ensure user owns the notification
      },
      data: {
        read: true
      }
    });
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: {
        user_id: userId,
        read: false
      },
      data: {
        read: true
      }
    });
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return await prisma.notification.count({
      where: {
        user_id: userId,
        read: false
      }
    });
  }

  // ============================================
  // Cleanup
  // ============================================

  /**
   * Delete old archived notifications (for cleanup jobs)
   */
  async deleteOldNotifications(
    orgId: string,
    olderThan: Date
  ): Promise<number> {
    const result = await prisma.notification.deleteMany({
      where: {
        org_id: orgId,
        created_at: {
          lt: olderThan
        },
        read: true // Only delete read notifications
      }
    });

    return result.count;
  }
}

// Export singleton instance
export const notificationService = new NotificationService();

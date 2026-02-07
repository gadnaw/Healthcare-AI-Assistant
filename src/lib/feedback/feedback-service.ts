import { prisma } from '@/lib/prisma';
import { AuditService } from '@/lib/compliance/audit';
import { JWT } from '@tsndr/cloudflare-worker-jwt';

// ============================================
// Types
// ============================================

export interface FeedbackInput {
  messageId: string;
  helpful: boolean;
  comment?: string;
}

export interface FeedbackFilters {
  startDate?: Date;
  endDate?: Date;
  helpful?: boolean;
}

export interface FeedbackStats {
  total: number;
  helpfulCount: number;
  unhelpfulCount: number;
  averageHelpfulness: number;
}

export interface FeedbackDashboardData {
  overallStats: FeedbackStats;
  dailyTrends: Array<{
    date: string;
    total: number;
    helpful: number;
    unhelpful: number;
  }>;
  recentFeedback: Array<{
    id: string;
    messageId: string;
    helpful: boolean;
    comment?: string;
    createdAt: Date;
  }>;
}

// ============================================
// FeedbackService
// ============================================

export class FeedbackService {
  private auditService: AuditService;

  constructor() {
    this.auditService = new AuditService();
  }

  /**
   * Submit feedback for a message
   */
  async submitFeedback(
    input: FeedbackInput,
    userId: string,
    orgId: string,
    token: string
  ): Promise<any> {
    const { messageId, helpful, comment } = input;

    // Validate required fields
    if (!messageId || typeof helpful !== 'boolean') {
      throw new Error('Missing required fields: messageId and helpful are required');
    }

    // Validate message exists and belongs to user's organization
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, org_id: true }
    });

    if (!message) {
      throw new Error('Message not found');
    }

    if (message.org_id !== orgId) {
      throw new Error('Message does not belong to your organization');
    }

    // Check for existing feedback
    const existingFeedback = await prisma.feedback.findUnique({
      where: {
        message_id_user_id: {
          message_id: messageId,
          user_id: userId
        }
      }
    });

    let feedback;

    if (existingFeedback) {
      // Update existing feedback
      feedback = await prisma.feedback.update({
        where: { id: existingFeedback.id },
        data: {
          helpful,
          comment: comment || null,
          created_at: new Date()
        }
      });
    } else {
      // Create new feedback
      feedback = await prisma.feedback.create({
        data: {
          message_id: messageId,
          user_id: userId,
          org_id: orgId,
          helpful,
          comment: comment || null
        }
      });
    }

    // Log the feedback submission
    await this.auditService.log(
      'FEEDBACK_SUBMIT',
      'feedback',
      feedback.id,
      userId,
      orgId,
      undefined,
      undefined,
      {
        message_id: messageId,
        helpful,
        is_update: !!existingFeedback
      }
    );

    return feedback;
  }

  /**
   * Get all feedback for a specific message
   */
  async getFeedbackByMessage(
    messageId: string,
    orgId: string
  ): Promise<any[]> {
    // Verify message belongs to organization
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, org_id: true }
    });

    if (!message || message.org_id !== orgId) {
      throw new Error('Message not found or does not belong to your organization');
    }

    const feedback = await prisma.feedback.findMany({
      where: {
        message_id: messageId,
        org_id: orgId
      },
      include: {
        user: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    return feedback;
  }

  /**
   * Get feedback statistics for the organization
   */
  async getFeedbackStats(
    filters: FeedbackFilters,
    orgId: string
  ): Promise<FeedbackStats> {
    const { startDate, endDate, helpful } = filters;

    // Build where clause
    const where: any = {
      org_id: orgId
    };

    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at.gte = startDate;
      if (endDate) where.created_at.lte = endDate;
    }

    if (typeof helpful === 'boolean') {
      where.helpful = helpful;
    }

    const [total, helpfulCount, unhelpfulCount] = await Promise.all([
      prisma.feedback.count({ where }),
      prisma.feedback.count({ where: { ...where, helpful: true } }),
      prisma.feedback.count({ where: { ...where, helpful: false } })
    ]);

    const averageHelpfulness = total > 0 ? helpfulCount / total : 0;

    return {
      total,
      helpfulCount,
      unhelpfulCount,
      averageHelpfulness: Math.round(averageHelpfulness * 100) / 100
    };
  }

  /**
   * Get feedback dashboard data for admins
   */
  async getFeedbackDashboard(
    dateRange: { startDate: Date; endDate: Date },
    orgId: string
  ): Promise<FeedbackDashboardData> {
    const { startDate, endDate } = dateRange;

    // Get overall stats
    const overallStats = await this.getFeedbackStats(
      { startDate, endDate },
      orgId
    );

    // Get daily trends
    const dailyFeedback = await prisma.$queryRaw`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total,
        COUNT(CASE WHEN helpful = true THEN 1 END) as helpful,
        COUNT(CASE WHEN helpful = false THEN 1 END) as unhelpful
      FROM feedback
      WHERE org_id = ${orgId}
        AND created_at >= ${startDate}
        AND created_at <= ${endDate}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    ` as any[];

    // Get recent feedback
    const recentFeedback = await prisma.feedback.findMany({
      where: {
        org_id: orgId,
        created_at: {
          gte: startDate,
          lte: endDate
        }
      },
      select: {
        id: true,
        message_id: true,
        helpful: true,
        comment: true,
        created_at: true
      },
      orderBy: {
        created_at: 'desc'
      },
      take: 10
    });

    return {
      overallStats,
      dailyTrends: dailyFeedback.map(row => ({
        date: row.date.toISOString().split('T')[0],
        total: Number(row.total),
        helpful: Number(row.helpful),
        unhelpful: Number(row.unhelpful)
      })),
      recentFeedback
    };
  }
}

// Export singleton instance
export const feedbackService = new FeedbackService();

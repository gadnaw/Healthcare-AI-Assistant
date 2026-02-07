'use server';

import { auth } from '@/auth';
import { feedbackService } from '@/lib/feedback/feedback-service';
import { requirePermission } from '@/lib/rbac/role-utils';
import { Permission } from '@/lib/rbac/permissions';
import { Role } from '@/lib/rbac/roles';
import { headers } from 'next/headers';
import { AuditService } from '@/lib/compliance/audit';

/**
 * Dashboard data types
 */
export interface FeedbackStats {
  total: number;
  helpfulCount: number;
  unhelpfulCount: number;
  averageHelpfulness: number;
}

export interface DailyTrend {
  date: string;
  total: number;
  helpful: number;
  unhelpful: number;
}

export interface RecentFeedback {
  id: string;
  messageId: string;
  helpful: boolean;
  comment?: string;
  createdAt: Date;
}

export interface FeedbackDashboardData {
  stats: FeedbackStats;
  trends: DailyTrend[];
  recentComments: RecentFeedback[];
}

export interface GetFeedbackDashboardInput {
  startDate?: string;
  endDate?: string;
  helpful?: boolean;
  limit?: number;
}

/**
 * Get feedback dashboard data for admins
 * 
 * @param filters - Optional filters for date range, helpful rating, and limit
 * @returns Dashboard data including stats, trends, and recent comments
 * @throws Error if user lacks permission or data retrieval fails
 */
export async function getFeedbackDashboardAction(
  filters: GetFeedbackDashboardInput = {}
): Promise<FeedbackDashboardData> {
  // Get current session for user context
  const session = await auth();
  
  if (!session?.user?.id) {
    throw new Error('Authentication required to view feedback dashboard');
  }

  const userId = session.user.id;
  const orgId = session.user.org_id;
  const userRole = session.user.role as Role;

  // Check if user has permission to view feedback dashboard
  await requirePermission(userId, Permission.FEEDBACK_VIEW);

  // Get IP address and user agent for audit logging
  const ipAddress = headers().get('x-forwarded-for') || undefined;
  const userAgent = headers().get('user-agent') || undefined;

  // Parse date filters
  let startDate: Date | undefined;
  let endDate: Date | undefined;

  if (filters.startDate) {
    startDate = new Date(filters.startDate);
    if (isNaN(startDate.getTime())) {
      throw new Error('Invalid start date format');
    }
  }

  if (filters.endDate) {
    endDate = new Date(filters.endDate);
    // Set end date to end of day
    endDate.setHours(23, 59, 59, 999);
    if (isNaN(endDate.getTime())) {
      throw new Error('Invalid end date format');
    }
  }

  // Default to last 30 days if no date range specified
  if (!startDate && !endDate) {
    endDate = new Date();
    startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
  }

  try {
    // Get dashboard data from FeedbackService
    const dashboardData = await feedbackService.getFeedbackDashboard(
      { startDate: startDate!, endDate: endDate! },
      orgId
    );

    // Get overall stats with filters
    const stats = await feedbackService.getFeedbackStats(
      {
        startDate: startDate,
        endDate: endDate,
        helpful: filters.helpful,
      },
      orgId
    );

    // Filter recent comments if specified
    let recentComments = dashboardData.recentFeedback;
    if (filters.helpful !== undefined) {
      recentComments = recentComments.filter(f => f.helpful === filters.helpful);
    }

    // Apply limit if specified
    if (filters.limit && filters.limit > 0) {
      recentComments = recentComments.slice(0, filters.limit);
    }

    // Log dashboard access for audit trail
    await AuditService.log({
      userId,
      orgId,
      action: 'FEEDBACK_DASHBOARD_ACCESSED',
      resourceType: 'feedback_dashboard',
      resourceId: 'dashboard',
      metadata: {
        start_date: startDate?.toISOString(),
        end_date: endDate?.toISOString(),
        filters_applied: {
          helpful: filters.helpful,
          limit: filters.limit,
        },
        stats_returned: {
          total_feedback: stats.total,
          helpful_count: stats.helpfulCount,
          unhelpful_count: stats.unhelpfulCount,
        },
      },
      ipAddress,
      userAgent,
    });

    return {
      stats,
      trends: dashboardData.dailyTrends,
      recentComments,
    };
  } catch (error) {
    // Log failed dashboard access
    await AuditService.log({
      userId,
      orgId,
      action: 'FEEDBACK_DASHBOARD_ACCESS_FAILED',
      resourceType: 'feedback_dashboard',
      resourceId: 'dashboard',
      metadata: {
        start_date: startDate?.toISOString(),
        end_date: endDate?.toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      ipAddress,
      userAgent,
    });

    throw error;
  }
}

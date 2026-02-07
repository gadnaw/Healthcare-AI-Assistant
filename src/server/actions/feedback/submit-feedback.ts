'use server';

import { auth } from '@/auth';
import { feedbackService } from '@/lib/feedback/feedback-service';
import { requirePermission } from '@/lib/rbac/role-utils';
import { Permission } from '@/lib/rbac/permissions';
import { headers } from 'next/headers';
import { AuditService } from '@/lib/compliance/audit';

/**
 * Feedback submission input type
 */
export interface SubmitFeedbackInput {
  messageId: string;
  helpful: boolean;
  comment?: string;
}

/**
 * Submit feedback for an AI response
 * 
 * @param input - Feedback input containing messageId, helpful rating, and optional comment
 * @returns The created or updated feedback record
 * @throws Error if validation fails or feedback submission fails
 */
export async function submitFeedbackAction(input: SubmitFeedbackInput) {
  // Get current session for user context
  const session = await auth();
  
  if (!session?.user?.id) {
    throw new Error('Authentication required to submit feedback');
  }

  const userId = session.user.id;
  const orgId = session.user.org_id;
  const { messageId, helpful, comment } = input;

  // Validate required fields
  if (!messageId || typeof helpful !== 'boolean') {
    throw new Error('Missing required fields: messageId and helpful are required');
  }

  // Validate comment length if provided
  if (comment && comment.length > 500) {
    throw new Error('Comment must be 500 characters or less');
  }

  // Check if user has permission to submit feedback
  await requirePermission(userId, Permission.FEEDBACK_SUBMIT);

  // Get IP address and user agent for audit logging
  const ipAddress = headers().get('x-forwarded-for') || undefined;
  const userAgent = headers().get('user-agent') || undefined;

  try {
    // Submit feedback using FeedbackService
    const feedback = await feedbackService.submitFeedback(
      { messageId, helpful, comment },
      userId,
      orgId,
      session.accessToken || ''
    );

    // Log the feedback submission to audit trail
    await AuditService.log({
      userId,
      orgId,
      action: 'FEEDBACK_SUBMIT',
      resourceType: 'feedback',
      resourceId: feedback.id,
      metadata: {
        message_id: messageId,
        helpful,
        has_comment: !!comment,
        comment_length: comment?.length || 0,
      },
      ipAddress,
      userAgent,
    });

    return {
      success: true,
      feedback: {
        id: feedback.id,
        messageId: feedback.message_id,
        helpful: feedback.helpful,
        comment: feedback.comment,
        createdAt: feedback.created_at,
      },
    };
  } catch (error) {
    // Log failed feedback attempt
    await AuditService.log({
      userId,
      orgId,
      action: 'FEEDBACK_SUBMIT_FAILED',
      resourceType: 'feedback',
      resourceId: messageId,
      metadata: {
        message_id: messageId,
        helpful,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      ipAddress,
      userAgent,
    });

    throw error;
  }
}

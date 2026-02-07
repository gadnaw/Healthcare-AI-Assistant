/**
 * Review Workflow Service for High-Stakes AI Recommendations
 * 
 * Implements multi-step review process for AI-assisted clinical decisions
 * requiring enhanced oversight based on confidence thresholds, recommendation
 * types, and clinical significance.
 * 
 * This service implements the adverse event reporting and review procedures
 * defined in docs/governance/adverse-event-reporting.md
 */

import { z } from 'zod';
import { governanceCommitteeService, type CommitteeMember } from './committee';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Review status enumeration
 */
export const ReviewStatusSchema = z.enum([
  'PENDING',
  'IN_REVIEW',
  'REVIEWED',
  'APPROVED',
  'REJECTED',
  'ESCALATED',
  'TIMED_OUT',
  'CANCELLED'
]);

export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

/**
 * Review priority based on risk assessment
 */
export const ReviewPrioritySchema = z.enum([
  'ROUTINE',
  'EXPEDITED',
  'URGENT',
  'CRITICAL'
]);

export type ReviewPriority = z.infer<typeof ReviewPrioritySchema>;

/**
 * Review trigger types
 */
export const ReviewTriggerSchema = z.enum([
  'LOW_CONFIDENCE',
  'HIGH_STAKES_RECOMMENDATION',
  'MEDICATION_RELATED',
  'PROCEDURE_RELATED',
  'LIFESAVING_TREATMENT',
  'CONTROVERSIAL_RECOMMENDATION',
  'PATIENT_SAFETY_FLAG',
  'COMPLIANCE_FLAG',
  'MANUAL_REVIEW_REQUESTED'
]);

export type ReviewTrigger = z.infer<typeof ReviewTriggerSchema>;

/**
 * Review task for workflow steps
 */
export const ReviewTaskSchema = z.object({
  id: z.string().uuid(),
  reviewId: z.string().uuid(),
  step: z.string(),
  assignee: z.string().uuid(), // committee member ID
  assignedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  status: ReviewStatusSchema,
  findings: z.string().optional(),
  recommendation: z.enum(['APPROVE', 'REJECT', 'MODIFY', 'ESCALATE', 'NO_ACTION']).optional(),
  notes: z.string().optional(),
});

export type ReviewTask = z.infer<typeof ReviewTaskSchema>;

/**
 * Complete review record
 */
export const AIRecommendationReviewSchema = z.object({
  id: z.string().uuid(),
  recommendationId: z.string(),
  trigger: ReviewTriggerSchema,
  priority: ReviewPrioritySchema,
  status: ReviewStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deadline: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  
  // Clinical context
  patientContext: z.object({
    patientId: z.string(),
    ageRange: z.string(),
    clinicalDomain: z.string(),
    comorbidities: z.array(z.string()),
  }),
  
  // AI recommendation details
  aiRecommendation: z.object({
    type: z.string(),
    confidence: z.number(), // 0-1 scale
    summary: z.string(),
    supportingEvidence: z.array(z.object({
      source: z.string(),
      relevance: z.number(),
      summary: z.string(),
    })),
    alternatives: z.array(z.string()).optional(),
  }),
  
  // Review workflow
  tasks: z.array(ReviewTaskSchema),
  escalationHistory: z.array(z.object({
    fromRole: z.string(),
    toRole: z.string(),
    reason: z.string(),
    timestamp: z.string().datetime(),
  })),
  
  // Outcome
  outcome: z.object({
    decision: z.enum(['APPROVED', 'REJECTED', 'MODIFIED', 'ESCALATED_EXTERNAL', 'NO_ACTION']),
    approvedWithModifications: z.array(z.string()).optional(),
    finalRecommendation: z.string().optional(),
    clinicianNotification: z.boolean(),
    patientCommunicationRequired: z.boolean(),
  }).optional(),
  
  // Documentation
  documentation: z.array(z.object({
    type: z.enum(['CLINICAL_NOTE', 'CONSULTATION', 'CONSENT', 'DISCHARGE_SUMMARY']),
    content: z.string(),
    timestamp: z.string().datetime(),
  })),
  
  // Audit trail
  auditLog: z.array(z.object({
    action: z.string(),
    actor: z.string(),
    timestamp: z.string().datetime(),
    details: z.string().optional(),
  })),
});

export type AIRecommendationReview = z.infer<typeof AIRecommendationReviewSchema>;

// ============================================================================
// Configuration Constants
// ============================================================================

/**
 * Confidence thresholds triggering review
 */
export const CONFIDENCE_THRESHOLDS = {
  CRITICAL: 0.5,    // Below 50% confidence always triggers critical review
  HIGH: 0.7,        // Below 70% confidence triggers expedited review
  ROUTINE: 0.85,    // Below 85% may trigger routine review depending on type
};

/**
 * High-stakes recommendation types requiring mandatory review
 */
export const HIGH_STAKES_RECOMMENDATION_TYPES = [
  'LIFESAVING_TREATMENT',
  'HIGH_RISK_PROCEDURE',
  'CONTROVERSIAL_TREATMENT',
  'OFF_LABEL_USE',
  'EXPENSIVE_TREATMENT',
  'PALLIATIVE_CARE_DECISION',
  'END_OF_LIFE_DECISION',
  'MAJOR_SURGERY_RECOMMENDATION',
  'CHEMOTHERAPY_RECOMMENDATION',
  'IMMUNOSUPPRESSIVE_TREATMENT',
];

/**
 * Review deadline by priority
 */
export const REVIEW_DEADLINES = {
  CRITICAL: 4,      // 4 hours
  URGENT: 24,       // 24 hours
  EXPEDITED: 72,    // 72 hours (3 days)
  ROUTINE: 168,     // 168 hours (7 days)
};

// ============================================================================
// Review Workflow Service
// ============================================================================

/**
 * ReviewWorkflowService manages the lifecycle of high-stakes AI recommendation
 * reviews, including trigger detection, task assignment, deadline monitoring,
 * and escalation handling.
 */
export class ReviewWorkflowService {
  private reviews: Map<string, AIRecommendationReview> = new Map();
  private notificationQueue: Map<string, { type: string; recipient: string; message: string; scheduledFor: string }[]> = new Map();

  /**
   * Determine if an AI recommendation requires review based on trigger criteria
   */
  async requiresReview(recommendation: {
    id: string;
    confidence: number;
    type: string;
    patientContext: AIRecommendationReview['patientContext'];
  }): Promise<{
    requiresReview: boolean;
    triggers: ReviewTrigger[];
    priority: ReviewPriority;
  }> {
    const triggers: ReviewTrigger[] = [];
    let priority: ReviewPriority = 'ROUTINE';

    // Low confidence trigger
    if (recommendation.confidence < CONFIDENCE_THRESHOLDS.CRITICAL) {
      triggers.push('LOW_CONFIDENCE');
      priority = 'CRITICAL';
    } else if (recommendation.confidence < CONFIDENCE_THRESHOLDS.HIGH) {
      triggers.push('LOW_CONFIDENCE');
      if (priority === 'ROUTINE') priority = 'URGENT';
    } else if (recommendation.confidence < CONFIDENCE_THRESHOLDS.ROUTINE) {
      triggers.push('LOW_CONFIDENCE');
      if (priority === 'ROUTINE') priority = 'EXPEDITED';
    }

    // High-stakes recommendation type trigger
    if (HIGH_STAKES_RECOMMENDATION_TYPES.some(
      type => recommendation.type.toUpperCase().includes(type) ||
             type.includes(recommendation.type.toUpperCase())
    )) {
      triggers.push('HIGH_STAKES_RECOMMENDATION');
      if (priority === 'ROUTINE') priority = 'EXPEDITED';
    }

    // Medication-related trigger
    if (recommendation.type.toLowerCase().includes('medication') ||
        recommendation.type.toLowerCase().includes('drug') ||
        recommendation.type.toLowerCase().includes('pharmaceutical')) {
      triggers.push('MEDICATION_RELATED');
      if (priority === 'ROUTINE') priority = 'EXPEDITED';
    }

    // Procedure-related trigger
    if (recommendation.type.toLowerCase().includes('procedure') ||
        recommendation.type.toLowerCase().includes('surgery') ||
        recommendation.type.toLowerCase().includes('intervention')) {
      triggers.push('PROCEDURE_RELATED');
      if (priority === 'ROUTINE') priority = 'EXPEDITED';
    }

    // Lifesaving treatment trigger
    if (recommendation.type.toLowerCase().includes('lifesaving') ||
        recommendation.type.toLowerCase().includes('critical_care') ||
        recommendation.type.toLowerCase().includes('emergency')) {
      triggers.push('LIFESAVING_TREATMENT');
      if (priority !== 'CRITICAL') priority = 'URGENT';
    }

    return {
      requiresReview: triggers.length > 0,
      triggers,
      priority,
    };
  }

  /**
   * Create a new review workflow for a recommendation
   */
  async createReview(params: {
    recommendationId: string;
    aiRecommendation: AIRecommendationReview['aiRecommendation'];
    patientContext: AIRecommendationReview['patientContext'];
    triggers: ReviewTrigger[];
    priority: ReviewPriority;
    requestedBy?: string;
  }): Promise<AIRecommendationReview> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const deadline = new Date(Date.now() + REVIEW_DEADLINES[params.priority] * 60 * 60 * 1000).toISOString();

    // Get appropriate committee members for review
    const committeeMembers = await this.assignReviewers(params.priority, params.aiRecommendation.type);

    // Create review workflow tasks
    const tasks = this.createWorkflowTasks(id, committeeMembers, params.priority);

    const review: AIRecommendationReview = {
      id,
      recommendationId: params.recommendationId,
      trigger: params.triggers[0], // Primary trigger
      priority: params.priority,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
      deadline,
      patientContext: params.patientContext,
      aiRecommendation: params.aiRecommendation,
      tasks,
      escalationHistory: [],
      documentation: [],
      auditLog: [{
        action: 'REVIEW_CREATED',
        actor: params.requestedBy || 'SYSTEM',
        timestamp: now,
        details: `Review created with priority ${params.priority}, triggers: ${params.triggers.join(', ')}`,
      }],
    };

    this.reviews.set(id, review);

    // Schedule notifications
    await this.scheduleNotifications(review, committeeMembers);

    return review;
  }

  /**
   * Assign appropriate committee members based on priority and recommendation type
   */
  private async assignReviewers(
    priority: ReviewPriority,
    recommendationType: string
  ): Promise<CommitteeMember[]> {
    const members = await governanceCommitteeService.getCommitteeMembers({ activeOnly: true });
    
    // Select reviewers based on recommendation type and availability
    const selectedMembers: CommitteeMember[] = [];
    
    // Always include Clinical Lead for clinical recommendations
    const clinicalLead = members.find(m => m.role === 'CLINICAL_LEAD');
    if (clinicalLead) selectedMembers.push(clinicalLead);

    // Include Compliance Officer for high-priority reviews
    if (priority === 'CRITICAL' || priority === 'URGENT') {
      const complianceOfficer = members.find(m => m.role === 'COMPLIANCE_OFFICER');
      if (complianceOfficer) selectedMembers.push(complianceOfficer);
    }

    // Include Ethicist for ethically-sensitive recommendations
    if (recommendationType.toLowerCase().includes('end_of_life') ||
        recommendationType.toLowerCase().includes('palliative') ||
        recommendationType.toLowerCase().includes('experimental')) {
      const ethicist = members.find(m => m.role === 'ETHICIST');
      if (ethicist) selectedMembers.push(ethicist);
    }

    // Include Chair for critical reviews
    if (priority === 'CRITICAL') {
      const chair = members.find(m => m.role === 'CHAIR');
      if (chair) selectedMembers.push(chair);
    }

    // Include Patient Representative for patient-impacting decisions
    const patientRep = members.find(m => m.role === 'PATIENT_REPRESENTATIVE');
    if (patientRep && (priority === 'URGENT' || priority === 'CRITICAL')) {
      selectedMembers.push(patientRep);
    }

    return selectedMembers.length > 0 ? selectedMembers : members.slice(0, 2);
  }

  /**
   * Create workflow tasks for the review
   */
  private createWorkflowTasks(
    reviewId: string,
    assignees: CommitteeMember[],
    priority: ReviewPriority
  ): ReviewTask[] {
    const tasks: ReviewTask[] = [];
    const now = new Date().toISOString();

    // Task 1: Initial Clinical Assessment (Clinical Lead)
    tasks.push({
      id: crypto.randomUUID(),
      reviewId,
      step: 'INITIAL_CLINICAL_ASSESSMENT',
      assignee: assignees.find(m => m.role === 'CLINICAL_LEAD')?.id || assignees[0].id,
      assignedAt: now,
      status: 'PENDING',
    });

    // Task 2: Safety and Risk Assessment (if high priority)
    if (priority === 'CRITICAL' || priority === 'URGENT') {
      tasks.push({
        id: crypto.randomUUID(),
        reviewId,
        step: 'SAFETY_RISK_ASSESSMENT',
        assignee: assignees.find(m => m.role === 'COMPLIANCE_OFFICER')?.id || assignees[1]?.id || assignees[0].id,
        assignedAt: now,
        status: 'PENDING',
      });
    }

    // Task 3: Ethical Review (if applicable)
    if (assignees.some(m => m.role === 'ETHICIST')) {
      tasks.push({
        id: crypto.randomUUID(),
        reviewId,
        step: 'ETHICAL_REVIEW',
        assignee: assignees.find(m => m.role === 'ETHICIST')!.id,
        assignedAt: now,
        status: 'PENDING',
      });
    }

    // Task 4: Final Decision (Chair or most senior member)
    const finalAssignee = assignees.find(m => m.role === 'CHAIR') || 
                          assignees.find(m => m.role === 'CLINICAL_LEAD') ||
                          assignees[0];
    
    tasks.push({
      id: crypto.randomUUID(),
      reviewId,
      step: 'FINAL_DECISION',
      assignee: finalAssignee.id,
      assignedAt: now,
      status: 'PENDING',
    });

    return tasks;
  }

  /**
   * Schedule notifications for review participants
   */
  private async scheduleNotifications(
    review: AIRecommendationReview,
    assignees: CommitteeMember[]
  ): Promise<void> {
    for (const member of assignees) {
      const tasks = review.tasks.filter(t => t.assignee === member.id);
      for (const task of tasks) {
        // Immediate notification for critical/urgent
        if (review.priority === 'CRITICAL' || review.priority === 'URGENT') {
          await this.sendNotification(member.email, 'IMMEDIATE', {
            reviewId: review.id,
            taskId: task.id,
            taskStep: task.step,
            priority: review.priority,
            deadline: review.deadline,
          });
        } else {
          // Standard notification for routine/expedited
          await this.sendNotification(member.email, 'STANDARD', {
            reviewId: review.id,
            taskId: task.id,
            taskStep: task.step,
            deadline: review.deadline,
          });
        }
      }
    }
  }

  /**
   * Send notification (placeholder - integrate with actual notification system)
   */
  private async sendNotification(
    recipient: string,
    urgency: 'IMMEDIATE' | 'STANDARD',
    data: Record<string, unknown>
  ): Promise<void> {
    const message = urgency === 'IMMEDIATE'
      ? `[CRITICAL] AI Recommendation Review Required - Review ID: ${data.reviewId}`
      : `AI Recommendation Review Requested - Review ID: ${data.reviewId}`;

    // In production, integrate with email/SMS/notification systems
    console.log(`Notification to ${recipient}: ${message}`, data);
    
    // Queue for actual notification
    if (!this.notificationQueue.has(recipient)) {
      this.notificationQueue.set(recipient, []);
    }
    this.notificationQueue.get(recipient)!.push({
      type: urgency === 'IMMEDIATE' ? 'CRITICAL_REVIEW' : 'REVIEW_TASK',
      recipient,
      message,
      scheduledFor: new Date().toISOString(),
    });
  }

  /**
   * Start a review by moving to IN_REVIEW status
   */
  async startReview(reviewId: string, reviewerId: string): Promise<AIRecommendationReview | null> {
    const review = this.reviews.get(reviewId);
    if (!review) return null;

    // Find and update the appropriate task
    const currentTask = review.tasks.find(
      t => t.assignee === reviewerId && t.status === 'PENDING'
    );

    if (currentTask) {
      currentTask.status = 'IN_REVIEW';
      currentTask.assignedAt = new Date().toISOString();
    }

    review.status = 'IN_REVIEW';
    review.updatedAt = new Date().toISOString();
    review.auditLog.push({
      action: 'REVIEW_STARTED',
      actor: reviewerId,
      timestamp: new Date().toISOString(),
      details: `Review started by committee member ${reviewerId}`,
    });

    return review;
  }

  /**
   * Complete a review task
   */
  async completeTask(params: {
    reviewId: string;
    taskId: string;
    reviewerId: string;
    findings: string;
    recommendation: ReviewTask['recommendation'];
    notes?: string;
  }): Promise<AIRecommendationReview | null> {
    const review = this.reviews.get(params.reviewId);
    if (!review) return null;

    const task = review.tasks.find(t => t.id === params.taskId);
    if (!task || task.assignee !== params.reviewerId) {
      throw new Error('Task not found or not assigned to reviewer');
    }

    task.completedAt = new Date().toISOString();
    task.findings = params.findings;
    task.recommendation = params.recommendation;
    task.notes = params.notes;
    task.status = params.recommendation === 'ESCALATE' ? 'ESCALATED' : 'REVIEWED';

    review.updatedAt = new Date().toISOString();
    review.auditLog.push({
      action: 'TASK_COMPLETED',
      actor: params.reviewerId,
      timestamp: new Date().toISOString(),
      details: `Task ${task.step} completed with recommendation: ${params.recommendation}`,
    });

    // Check if all tasks are complete
    const allComplete = review.tasks.every(t => t.status === 'REVIEWED' || t.status === 'ESCALATED');
    if (allComplete) {
      await this.finalizeReview(review.id);
    }

    return review;
  }

  /**
   * Finalize review with overall decision
   */
  private async finalizeReview(reviewId: string): Promise<AIRecommendationReview | null> {
    const review = this.reviews.get(reviewId);
    if (!review) return null;

    // Count recommendations
    const approveCount = review.tasks.filter(t => t.recommendation === 'APPROVE').length;
    const rejectCount = review.tasks.filter(t => t.recommendation === 'REJECT').length;
    const escalateCount = review.tasks.filter(t => t.recommendation === 'ESCALATE').length;
    const modifyCount = review.tasks.filter(t => t.recommendation === 'MODIFY').length;

    // Determine outcome
    let decision: AIRecommendationReview['outcome']['decision'] = 'NO_ACTION';
    let approvedWithModifications: string[] | undefined;

    if (escalateCount > 0) {
      decision = 'ESCALATED_EXTERNAL';
      await this.escalateReview(review);
    } else if (rejectCount > approveCount) {
      decision = 'REJECTED';
    } else if (modifyCount > 0) {
      decision = 'APPROVED';
      approvedWithModifications = review.tasks
        .filter(t => t.recommendation === 'MODIFY')
        .map(t => t.findings || ''),
    } else if (approveCount >= rejectCount) {
      decision = 'APPROVED';
    }

    review.outcome = {
      decision,
      approvedWithModifications,
      clinicianNotification: true,
      patientCommunicationRequired: decision !== 'APPROVED' || modifyCount > 0,
    };

    review.status = decision === 'ESCALATED_EXTERNAL' ? 'ESCALATED' : 'REVIEWED';
    review.completedAt = new Date().toISOString();
    review.updatedAt = new Date().toISOString();
    review.auditLog.push({
      action: 'REVIEW_COMPLETED',
      actor: 'SYSTEM',
      timestamp: new Date().toISOString(),
      details: `Review finalized with decision: ${decision}`,
    });

    return review;
  }

  /**
   * Escalate review to higher authority
   */
  private async escalateReview(review: AIRecommendationReview): Promise<void> {
    // Add escalation to history
    review.escalationHistory.push({
      fromRole: 'COMMITTEE',
      toRole: 'EXECUTIVE_LEADERSHIP',
      reason: 'Task escalation requested during review',
      timestamp: new Date().toISOString(),
    });

    // Notify executive leadership
    await this.sendNotification('cmo@organization.com', 'IMMEDIATE', {
      reviewId: review.id,
      priority: review.priority,
      escalationReason: 'Review task escalation',
    });

    review.auditLog.push({
      action: 'REVIEW_ESCALATED',
      actor: 'SYSTEM',
      timestamp: new Date().toISOString(),
      details: 'Review escalated to executive leadership',
    });
  }

  /**
   * Check for overdue reviews and trigger notifications
   */
  async checkOverdueReviews(): Promise<AIRecommendationReview[]> {
    const now = new Date().toISOString();
    const overdueReviews: AIRecommendationReview[] = [];

    for (const review of this.reviews.values()) {
      if (review.status === 'PENDING' || review.status === 'IN_REVIEW') {
        const deadline = new Date(review.deadline);
        const nowDate = new Date(now);

        if (nowDate > deadline) {
          review.status = 'TIMED_OUT';
          review.updatedAt = now;
          
          // Trigger escalation for overdue reviews
          await this.sendNotification('compliance@organization.com', 'IMMEDIATE', {
            reviewId: review.id,
            type: 'REVIEW_TIMEOUT',
            deadline: review.deadline,
            currentTime: now,
          });

          overdueReviews.push(review);
        }
      }
    }

    return overdueReviews;
  }

  /**
   * Get review by ID
   */
  async getReview(reviewId: string): Promise<AIRecommendationReview | null> {
    return this.reviews.get(reviewId) || null;
  }

  /**
   * Get reviews by status
   */
  async getReviewsByStatus(status: ReviewStatus): Promise<AIRecommendationReview[]> {
    return Array.from(this.reviews.values()).filter(r => r.status === status);
  }

  /**
   * Get reviews by priority
   */
  async getReviewsByPriority(priority: ReviewPriority): Promise<AIRecommendationReview[]> {
    return Array.from(this.reviews.values()).filter(r => r.priority === priority);
  }

  /**
   * Get all active reviews
   */
  async getActiveReviews(): Promise<AIRecommendationReview[]> {
    return Array.from(this.reviews.values()).filter(
      r => r.status === 'PENDING' || r.status === 'IN_REVIEW'
    );
  }

  /**
   * Get review statistics
   */
  async getReviewStatistics(): Promise<{
    totalActive: number;
    byPriority: Record<ReviewPriority, number>;
    byStatus: Record<ReviewStatus, number>;
    overdueCount: number;
    averageCompletionTime: number;
  }> {
    const active = await this.getActiveReviews();
    const overdue = await this.checkOverdueReviews();

    const byPriority = active.reduce((acc, r) => {
      acc[r.priority] = (acc[r.priority] || 0) + 1;
      return acc;
    }, {} as Record<ReviewPriority, number>);

    const byStatus = active.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {} as Record<ReviewStatus, number>);

    // Calculate average completion time for completed reviews
    const completed = Array.from(this.reviews.values()).filter(r => r.completedAt);
    const avgTime = completed.length > 0
      ? completed.reduce((sum, r) => {
          const start = new Date(r.createdAt).getTime();
          const end = new Date(r.completedAt!).getTime();
          return sum + (end - start);
        }, 0) / completed.length / (1000 * 60 * 60) // Convert to hours
      : 0;

    return {
      totalActive: active.length,
      byPriority,
      byStatus,
      overdueCount: overdue.length,
      averageCompletionTime: avgTime,
    };
  }

  /**
   * Cancel a review
   */
  async cancelReview(reviewId: string, reason: string): Promise<boolean> {
    const review = this.reviews.get(reviewId);
    if (!review) return false;

    review.status = 'CANCELLED';
    review.updatedAt = new Date().toISOString();
    review.auditLog.push({
      action: 'REVIEW_CANCELLED',
      actor: 'SYSTEM',
      timestamp: new Date().toISOString(),
      details: `Review cancelled: ${reason}`,
    });

    return true;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const reviewWorkflowService = new ReviewWorkflowService();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Check if a recommendation requires review and create one if needed
 */
export async function checkAndCreateReview(params: {
  recommendationId: string;
  confidence: number;
  type: string;
  summary: string;
  supportingEvidence: AIRecommendationReview['aiRecommendation']['supportingEvidence'];
  patientContext: AIRecommendationReview['patientContext'];
  requestedBy?: string;
}): Promise<{ requiresReview: boolean; review?: AIRecommendationReview }> {
  const requiresReview = await reviewWorkflowService.requiresReview({
    id: params.recommendationId,
    confidence: params.confidence,
    type: params.type,
    patientContext: params.patientContext,
  });

  if (requiresReview.requiresReview) {
    const review = await reviewWorkflowService.createReview({
      recommendationId: params.recommendationId,
      aiRecommendation: {
        type: params.type,
        confidence: params.confidence,
        summary: params.summary,
        supportingEvidence: params.supportingEvidence,
      },
      patientContext: params.patientContext,
      triggers: requiresReview.triggers,
      priority: requiresReview.priority,
      requestedBy: params.requestedBy,
    });

    return { requiresReview: true, review };
  }

  return { requiresReview: false };
}

/**
 * Get all active reviews
 */
export async function getActiveReviews(): Promise<ReturnType<ReviewWorkflowService['getActiveReviews']>> {
  return reviewWorkflowService.getActiveReviews();
}

/**
 * Get review by ID
 */
export async function getReview(reviewId: string): Promise<ReturnType<ReviewWorkflowService['getReview']>> {
  return reviewWorkflowService.getReview(reviewId);
}

/**
 * Start a review task
 */
export async function startReview(
  reviewId: string,
  reviewerId: string
): Promise<ReturnType<ReviewWorkflowService['startReview']>> {
  return reviewWorkflowService.startReview(reviewId, reviewerId);
}

/**
 * Complete a review task
 */
export async function completeTask(params: {
  reviewId: string;
  taskId: string;
  reviewerId: string;
  findings: string;
  recommendation: ReviewTask['recommendation'];
  notes?: string;
}): Promise<ReturnType<ReviewWorkflowService['completeTask']>> {
  return reviewWorkflowService.completeTask(params);
}

/**
 * Get review statistics
 */
export async function getReviewStatistics(): Promise<ReturnType<ReviewWorkflowService['getReviewStatistics']>> {
  return reviewWorkflowService.getReviewStatistics();
}

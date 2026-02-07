# Phase 4: Compliance & Features - Research

**Researched:** February 7, 2026
**Domain:** HIPAA Compliance, Role-Based Access, Document Workflows, Audit Systems
**Confidence:** HIGH
**Readiness:** yes

## Summary

Phase 4 focuses on implementing critical HIPAA compliance features and user-facing functionality that builds upon the authentication (Phase 1), RAG pipeline (Phase 2), and safety layer (Phase 3) foundations. The primary objectives include document approval workflows for clinical content governance, role-based access control with admin/provider/staff roles, comprehensive audit logging with CSV export capabilities, user feedback mechanisms for quality improvement, and emergency access procedures with post-access justification requirements.

The prior research establishes strong foundations for several Phase 4 requirements. ARCHITECTURE.md provides detailed RBAC patterns with org-level isolation at the database layer. FEATURES.md outlines document approval workflows with multi-state transitions. STACK.md confirms the Supabase + Next.js stack provides necessary infrastructure for compliance features. However, several gaps require targeted research, including system health dashboard patterns, emergency access justification workflows, and document deprecation notification systems.

The compliance requirements align with HIPAA Technical Safeguards (164.312) including Access Controls, Audit Controls, Integrity Controls, and Transmission Security. The implementation strategy leverages existing Row Level Security (RLS) policies while adding application-layer logic for workflow management, feature visibility, and audit trail generation.

**Primary recommendation:** Implement document approval workflow as the highest priority compliance feature, followed by RBAC enforcement, then audit log export functionality. User feedback and system health dashboard can be implemented in parallel with lower priority.

## Standard Stack

### Core Infrastructure

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @supabase/supabase-js | 2.x+ | Database client, RLS integration | Native PostgreSQL RLS support, healthcare-grade security |
| @supabase/auth-helpers-nextjs | 3.x+ | Next.js auth integration | Server-side auth validation, session management |
| @tanstack/react-query | 5.x+ | Data fetching, caching | Suspense integration, audit log pagination |
| zod | 3.x+ | Schema validation | Compliance data validation, audit event schemas |

### Workflow & State Management

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| xstate | 5.x+ | Document workflow state machines | Type-safe state transitions, visual debugging |
| @hookform/resolvers | 3.x+ | Form validation | Zod integration, user invitation workflows |

### UI Components (shadcn/ui)

| Component | Purpose | Implementation Note |
|-----------|---------|---------------------|
| DataTable | Audit log display | Server-side pagination, filtering |
| Dialog | Document approval modal | Form validation, role-based actions |
| DropdownMenu | Role assignment | User management interface |
| Toast | Feedback notifications | User feedback collection |
| Card | System health metrics | Dashboard cards |

### Export & Reporting

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| papaparse | 5.x+ | CSV parsing/generation | HIPAA-compliant export, no PHI in exports |
| date-fns | 3.x+ | Date formatting | Audit timestamp formatting |

## Architecture Patterns

### Recommended Project Structure

```
src/
├── components/
│   ├── compliance/
│   │   ├── AuditLogViewer.tsx
│   │   ├── AuditLogExport.tsx
│   │   ├── SystemHealthDashboard.tsx
│   │   └── ComplianceMetrics.tsx
│   ├── workflows/
│   │   ├── DocumentApprovalWorkflow.tsx
│   │   ├── DocumentApprovalCard.tsx
│   │   └── WorkflowStateBadge.tsx
│   ├── rbac/
│   │   ├── RoleBasedAccess.tsx
│   │   ├── FeatureVisibility.tsx
│   │   └── PermissionGate.tsx
│   └── feedback/
│       ├── UserFeedback.tsx
│       └── FeedbackDashboard.tsx
├── lib/
│   ├── compliance/
│   │   ├── audit.ts
│   │   ├── workflow-engine.ts
│   │   └── emergency-access.ts
│   ├── rbac/
│   │   ├── permissions.ts
│   │   ├── roles.ts
│   │   └── role-utils.ts
│   └── feedback/
│       └── feedback-service.ts
├── hooks/
│   ├── useAuditLog.ts
│   ├── useDocumentApproval.ts
│   ├── useUserFeedback.ts
│   └── useSystemHealth.ts
├── server/
│   ├── actions/
│   │   ├── compliance/
│   │   │   ├── export-audit-logs.ts
│   │   │   ├── get-system-health.ts
│   │   │   └── verify-audit-integrity.ts
│   │   ├── workflows/
│   │   │   ├── approve-document.ts
│   │   │   ├── reject-document.ts
│   │   │   └── submit-for-review.ts
│   │   ├── rbac/
│   │   │   ├── assign-role.ts
│   │   │   ├── invite-user.ts
│   │   │   └── deactivate-user.ts
│   │   └── emergency/
│   │       ├── request-emergency-access.ts
│   │       └── submit-justification.ts
│   └── middleware/
│       └── compliance-middleware.ts
└── types/
    ├── compliance.ts
    ├── workflow.ts
    ├── rbac.ts
    └── emergency.ts
```

### Pattern 1: Document Approval State Machine

The document approval workflow implements a finite state machine with clear transitions and role-based permissions. This pattern ensures clinical content governance through controlled review processes before documents enter the knowledge base.

```typescript
// Document workflow states
type DocumentWorkflowState =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'deprecated'
  | 'archived'
  | 'published';

// State transitions define allowed moves
const workflowTransitions: Record<DocumentWorkflowState, DocumentWorkflowState[]> = {
  draft: ['pending_review', 'archived'],
  pending_review: ['approved', 'rejected', 'draft'],
  approved: ['published', 'deprecated', 'archived'],
  rejected: ['draft', 'archived'],
  deprecated: ['approved', 'archived'],
  published: ['deprecated', 'archived'],
  archived: [], // Terminal state
};

// Workflow engine with transition validation
class DocumentWorkflowEngine {
  async transition(
    documentId: string,
    fromState: DocumentWorkflowState,
    toState: DocumentWorkflowState,
    userId: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    // Validate transition is allowed
    const allowedTransitions = workflowTransitions[fromState];
    if (!allowedTransitions.includes(toState)) {
      return {
        success: false,
        error: `Invalid transition from ${fromState} to ${toState}`,
      };
    }

    // Validate user has permission for this transition
    const permission = this.getTransitionPermission(fromState, toState);
    if (!await this.checkUserPermission(userId, permission)) {
      return {
        success: false,
        error: `User lacks permission for ${fromState} → ${toState} transition`,
      };
    }

    // Execute transition with audit logging
    const result = await this.db.transaction(async (tx) => {
      // Update document state
      await tx.documents.update({
        where: { id: documentId },
        data: {
          status: toState,
          updated_at: new Date(),
        },
      });

      // Create workflow transition record
      await tx.document_workflow_history.insert({
        document_id: documentId,
        from_state: fromState,
        to_state: toState,
        transitioned_by: userId,
        reason: reason,
        transitioned_at: new Date(),
      });

      // If approved, trigger indexing
      if (toState === 'approved') {
        await this.triggerIndexing(documentId);
      }

      // If deprecated, trigger notifications
      if (toState === 'deprecated') {
        await this.triggerDeprecationNotifications(documentId);
      }

      return { success: true };
    });

    // Audit log the transition
    await this.auditService.log({
      action: 'DOCUMENT_WORKFLOW_TRANSITION',
      resource_type: 'document',
      resource_id: documentId,
      details: {
        from_state: fromState,
        to_state: toState,
        reason: reason,
      },
    });

    return result;
  }

  private getTransitionPermission(
    fromState: DocumentWorkflowState,
    toState: DocumentWorkflowState
  ): string {
    const transitionPermissions: Record<string, string> = {
      'draft→pending_review': 'document.submit_review',
      'draft→archived': 'document.archive',
      'pending_review→approved': 'document.approve',
      'pending_review→rejected': 'document.reject',
      'pending_review→draft': 'document.return_draft',
      'approved→published': 'document.publish',
      'approved→deprecated': 'document.deprecate',
      'approved→archived': 'document.archive',
      'rejected→draft': 'document.edit',
      'rejected→archived': 'document.archive',
      'deprecated→approved': 'document.approve',
      'deprecated→archived': 'document.archive',
      'published→deprecated': 'document.deprecate',
      'published→archived': 'document.archive',
    };

    const key = `${fromState}→${toState}`;
    return transitionPermissions[key] || 'document.view';
  }
}
```

**When to use:** Implement this pattern for any clinical content that requires governance before entering the knowledge base. The state machine approach prevents invalid states and provides audit trail for all transitions.

### Pattern 2: Role-Based Access Control with RLS Integration

RBAC implementation integrates with database-level RLS policies to provide defense-in-depth access control. The pattern separates permission definitions from role assignments, enabling flexible role composition and future extensibility.

```typescript
// Permission definitions
const permissions = {
  // Document permissions
  'document.upload': 'Upload new documents to the knowledge base',
  'document.view': 'View documents in the knowledge base',
  'document.edit': 'Edit own documents before approval',
  'document.delete': 'Delete documents (typically restricted to admins)',
  'document.submit_review': 'Submit documents for approval review',
  'document.approve': 'Approve documents for use',
  'document.reject': 'Reject documents with feedback',
  'document.return_draft': 'Return documents to draft state',
  'document.publish': 'Publish approved documents',
  'document.deprecate': 'Mark documents as deprecated',
  'document.archive': 'Archive documents',

  // User management permissions
  'user.invite': 'Invite new users to the organization',
  'user.assign_role': 'Assign roles to users',
  'user.deactivate': 'Deactivate user accounts',
  'user.view': 'View user information',

  // Audit permissions
  'audit.view_own': 'View own audit logs',
  'audit.view_org': 'View organizational audit logs',
  'audit.export': 'Export audit logs to CSV',

  // Admin permissions
  'admin.settings': 'Modify organization settings',
  'admin.emergency_access': 'Request and grant emergency access',
  'admin.view_health': 'View system health dashboard',
} as const;

type Permission = keyof typeof permissions;

// Role definitions with permission sets
const roles: Record<string, Permission[]> = {
  admin: [
    'document.upload',
    'document.view',
    'document.edit',
    'document.delete',
    'document.submit_review',
    'document.approve',
    'document.reject',
    'document.return_draft',
    'document.publish',
    'document.deprecate',
    'document.archive',
    'user.invite',
    'user.assign_role',
    'user.deactivate',
    'user.view',
    'audit.view_own',
    'audit.view_org',
    'audit.export',
    'admin.settings',
    'admin.emergency_access',
    'admin.view_health',
  ],
  provider: [
    'document.upload',
    'document.view',
    'document.edit',
    'document.submit_review',
    'audit.view_own',
    'user.view',
  ],
  staff: [
    'document.view',
    'audit.view_own',
    'user.view',
  ],
};

// RBAC service with permission checking
class RBACService {
  async hasPermission(
    userId: string,
    permission: Permission
  ): Promise<boolean> {
    // Get user's role
    const userRole = await this.getUserRole(userId);
    if (!userRole) return false;

    // Check if role includes permission
    const rolePermissions = roles[userRole] || [];
    return rolePermissions.includes(permission);
  }

  async hasAnyPermission(
    userId: string,
    requiredPermissions: Permission[]
  ): Promise<boolean> {
    return Promise.all(
      requiredPermissions.map((p) => this.hasPermission(userId, p))
    ).then((results) => results.some((r) => r));
  }

  async hasAllPermissions(
    userId: string,
    requiredPermissions: Permission[]
  ): Promise<boolean> {
    return Promise.all(
      requiredPermissions.map((p) => this.hasPermission(userId, p))
    ).then((results) => results.every((r) => r));
  }

  async assignRole(
    userId: string,
    role: keyof typeof roles,
    assignedBy: string
  ): Promise<void> {
    // Audit the role assignment
    await this.auditService.log({
      action: 'ROLE_ASSIGNED',
      resource_type: 'user',
      resource_id: userId,
      details: {
        new_role: role,
        assigned_by: assignedBy,
      },
    });

    // Update user role
    await this.db.users.update({
      where: { id: userId },
      data: { role },
    });
  }
}

// React hook for permission-based UI
function usePermission(permission: Permission) {
  const { data: hasPermission } = useQuery({
    queryKey: ['permissions', permission],
    queryFn: () => rbacService.hasPermission(userId, permission),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  return hasPermission ?? false;
}

// Permission gate component
function PermissionGate({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const hasPermission = usePermission(permission);

  if (!hasPermission) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
```

**When to use:** Implement this RBAC pattern for all access control decisions. The permission-based approach allows granular control while role-based defaults simplify common use cases. Always combine with RLS at the database layer for defense-in-depth.

### Pattern 3: Feature Visibility Based on Roles

Role-specific feature visibility controls which UI elements and functionality different user roles can access. This pattern implements UI-level access control that mirrors the backend permission system.

```typescript
// Feature visibility configuration
const featureVisibility: Record<string, FeatureVisibilityConfig[]> = {
  // Navigation visibility
  navigation: [
    {
      feature: 'document_management',
      roles: ['admin', 'provider'],
      visibility: 'visible',
    },
    {
      feature: 'user_management',
      roles: ['admin'],
      visibility: 'visible',
    },
    {
      feature: 'audit_logs',
      roles: ['admin'],
      visibility: 'visible',
    },
    {
      feature: 'system_health',
      roles: ['admin'],
      visibility: 'visible',
    },
    {
      feature: 'organization_settings',
      roles: ['admin'],
      visibility: 'visible',
    },
  ],

  // Button/Action visibility
  actions: [
    {
      feature: 'upload_document',
      roles: ['admin', 'provider'],
      visibility: 'visible',
    },
    {
      feature: 'approve_document',
      roles: ['admin'],
      visibility: 'visible',
    },
    {
      feature: 'reject_document',
      roles: ['admin'],
      visibility: 'visible',
    },
    {
      feature: 'invite_user',
      roles: ['admin'],
      visibility: 'visible',
    },
    {
      feature: 'export_audit_logs',
      roles: ['admin'],
      visibility: 'visible',
    },
    {
      feature: 'request_emergency_access',
      roles: ['admin', 'provider'],
      visibility: 'visible',
    },
  ],

  // Dashboard widget visibility
  widgets: [
    {
      feature: 'approval_queue',
      roles: ['admin'],
      visibility: 'visible',
    },
    {
      feature: 'user_activity',
      roles: ['admin'],
      visibility: 'visible',
    },
    {
      feature: 'system_metrics',
      roles: ['admin'],
      visibility: 'visible',
    },
    {
      feature: 'feedback_summary',
      roles: ['admin'],
      visibility: 'visible',
    },
    {
      feature: 'my_recent_documents',
      roles: ['admin', 'provider', 'staff'],
      visibility: 'visible',
    },
  ],
};

// Feature visibility hook
function useFeatureVisibility(feature: string): boolean {
  const { user } = useAuth();
  const [config] = useState(() =>
    featureVisibility.navigation.find((f) => f.feature === feature) ||
    featureVisibility.actions.find((f) => f.feature === feature) ||
    featureVisibility.widgets.find((f) => f.feature === feature)
  );

  if (!config) return false;

  return config.roles.includes(user?.role || '');
}

// Navigation component with role-based visibility
function Navigation() {
  const features = [
    { id: 'dashboard', label: 'Dashboard', icon: DashboardIcon },
    { id: 'documents', label: 'Documents', icon: DocumentIcon },
    { id: 'search', label: 'Search', icon: SearchIcon },
    { id: 'document_management', label: 'Document Management', icon: ManagementIcon },
    { id: 'user_management', label: 'User Management', icon: UsersIcon },
    { id: 'audit_logs', label: 'Audit Logs', icon: AuditIcon },
    { id: 'system_health', label: 'System Health', icon: HealthIcon },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <nav className="navigation">
      {features.map((feature) => (
        <FeatureGate key={feature.id} feature={feature.id}>
          <NavItem
            label={feature.label}
            icon={<feature.icon />}
            href={`/${feature.id}`}
          />
        </FeatureGate>
      ))}
    </nav>
  );
}

// Feature gate component
function FeatureGate({
  feature,
  children,
  fallback = null,
}: {
  feature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const isVisible = useFeatureVisibility(feature);

  if (!isVisible) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
```

**When to use:** Implement feature visibility gates for all role-restricted UI elements. This pattern prevents confusion by hiding inaccessible features while the backend permission system provides the actual security enforcement.

### Pattern 4: Audit Log with CSV Export

The audit logging system captures comprehensive events for HIPAA compliance and provides export capabilities for compliance reporting and security analysis.

```typescript
// Audit event types
type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'MFA_ENABLED'
  | 'MFA_DISABLED'
  | 'PASSWORD_CHANGED'
  | 'SESSION_TIMEOUT'
  | 'DOCUMENT_UPLOADED'
  | 'DOCUMENT_VIEWED'
  | 'DOCUMENT_WORKFLOW_TRANSITION'
  | 'DOCUMENT_EXPORTED'
  | 'DOCUMENT_DEPRECATED'
  | 'QUERY_EXECUTED'
  | 'FEEDBACK_SUBMITTED'
  | 'USER_INVITED'
  | 'ROLE_ASSIGNED'
  | 'USER_DEACTIVATED'
  | 'EMERGENCY_ACCESS_REQUESTED'
  | 'EMERGENCY_ACCESS_GRANTED'
  | 'EMERGENCY_ACCESS_JUSTIFICATION_SUBMITTED'
  | 'AUDIT_LOG_EXPORTED'
  | 'SETTINGS_CHANGED';

// Audit log schema
interface AuditLogEntry {
  id: string;
  timestamp: Date;
  organization_id: string;
  user_id: string | null;
  action: AuditAction;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string;
  user_agent: string;
  request_id: string;
  session_id: string;
}

// Audit service with filtering and export
class AuditService {
  async log(event: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
    // Insert into audit_log table
    await this.db.audit_log.insert({
      ...event,
      timestamp: new Date(),
    });

    // Real-time notification for critical events
    if (this.isCriticalEvent(event.action)) {
      await this.notifyComplianceOfficer(event);
    }
  }

  async getAuditLogs(params: {
    organizationId: string;
    userId?: string;
    action?: AuditAction;
    resourceType?: string;
    resourceId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditLogEntry[]; total: number }> {
    const query = this.db.audit_log
      .select()
      .eq('organization_id', params.organizationId);

    if (params.userId) {
      query.eq('user_id', params.userId);
    }
    if (params.action) {
      query.eq('action', params.action);
    }
    if (params.resourceType) {
      query.eq('resource_type', params.resourceType);
    }
    if (params.resourceId) {
      query.eq('resource_id', params.resourceId);
    }
    if (params.startDate) {
      query.gte('timestamp', params.startDate);
    }
    if (params.endDate) {
      query.lte('timestamp', params.endDate);
    }

    const { data, error } = await query
      .order('timestamp', { ascending: false })
      .range(
        params.offset || 0,
        (params.offset || 0) + (params.limit || 50) - 1
      );

    if (error) {
      throw new Error(`Failed to fetch audit logs: ${error.message}`);
    }

    const { count } = await this.db.audit_log
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', params.organizationId);

    return { logs: data as AuditLogEntry[], total: count || 0 };
  }

  async exportToCSV(params: {
    organizationId: string;
    startDate: Date;
    endDate: Date;
    filters?: {
      userId?: string;
      action?: AuditAction;
      resourceType?: string;
    };
  }): Promise<string> {
    // Verify user has export permission
    if (!await this.rbacService.hasPermission(params.organizationId, 'audit.export')) {
      throw new Error('User lacks audit export permission');
    }

    // Fetch all matching records (consider pagination for large exports)
    const { logs } = await this.getAuditLogs({
      organizationId: params.organizationId,
      startDate: params.startDate,
      endDate: params.endDate,
      userId: params.filters?.userId,
      action: params.filters?.action,
      resourceType: params.filters?.resourceType,
      limit: 10000, // Maximum export limit
    });

    // Generate CSV
    const headers = [
      'Timestamp',
      'User ID',
      'Action',
      'Resource Type',
      'Resource ID',
      'IP Address',
      'User Agent',
      'Details',
    ];

    const rows = logs.map((log) => [
      log.timestamp.toISOString(),
      log.user_id || '',
      log.action,
      log.resource_type,
      log.resource_id || '',
      log.ip_address,
      log.user_agent,
      JSON.stringify(log.details),
    ]);

    const csv = [headers.join(','), ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');

    // Log the export action
    await this.log({
      organization_id: params.organizationId,
      user_id: params.organizationId, // Use system user for export logging
      action: 'AUDIT_LOG_EXPORTED',
      resource_type: 'audit_log',
      resource_id: null,
      details: {
        start_date: params.startDate.toISOString(),
        end_date: params.endDate.toISOString(),
        record_count: logs.length,
        filters: params.filters,
      },
      ip_address: '',
      user_agent: '',
      request_id: '',
      session_id: '',
    });

    return csv;
  }

  private isCriticalEvent(action: AuditAction): boolean {
    const criticalActions: AuditAction[] = [
      'EMERGENCY_ACCESS_REQUESTED',
      'EMERGENCY_ACCESS_GRANTED',
      'USER_DEACTIVATED',
      'MFA_DISABLED',
      'SETTINGS_CHANGED',
    ];
    return criticalActions.includes(action);
  }
}
```

**When to use:** Implement comprehensive audit logging for all HIPAA-relevant events. The CSV export pattern supports compliance reporting while maintaining audit trail integrity. Always log export actions themselves for accountability.

### Pattern 5: User Feedback Collection and Storage

User feedback mechanisms provide quality signals for continuous improvement while maintaining compliance with data retention requirements.

```typescript
// Feedback types
type FeedbackType = 'helpful' | 'not_helpful';
type FeedbackCategory =
  | 'accuracy'
  | 'relevance'
  | 'completeness'
  | 'clarity'
  | 'citation_quality'
  | 'response_time'
  | 'other';

interface UserFeedback {
  id: string;
  organization_id: string;
  user_id: string;
  conversation_id: string;
  message_id: string;
  feedback_type: FeedbackType;
  category: FeedbackCategory | null;
  comment: string | null;
  created_at: Date;
}

// Feedback service
class FeedbackService {
  async submitFeedback(params: {
    organizationId: string;
    userId: string;
    conversationId: string;
    messageId: string;
    feedbackType: FeedbackType;
    category?: FeedbackCategory;
    comment?: string;
  }): Promise<UserFeedback> {
    // Validate user can provide feedback for this conversation
    const hasAccess = await this.checkConversationAccess(
      params.userId,
      params.conversationId
    );

    if (!hasAccess) {
      throw new Error('User cannot provide feedback for this conversation');
    }

    // Insert feedback
    const feedback = await this.db.user_feedback.insert({
      organization_id: params.organizationId,
      user_id: params.userId,
      conversation_id: params.conversationId,
      message_id: params.messageId,
      feedback_type: params.feedbackType,
      category: params.category || null,
      comment: params.comment || null,
      created_at: new Date(),
    });

    // Audit log
    await this.auditService.log({
      organization_id: params.organizationId,
      user_id: params.userId,
      action: 'FEEDBACK_SUBMITTED',
      resource_type: 'conversation',
      resource_id: params.conversationId,
      details: {
        feedback_type: params.feedbackType,
        category: params.category,
        has_comment: !!params.comment,
      },
      ip_address: '',
      user_agent: '',
      request_id: '',
      session_id: '',
    });

    return feedback;
  }

  async getFeedbackSummary(params: {
    organizationId: string;
    startDate?: Date;
    endDate?: Date;
    conversationId?: string;
  }): Promise<FeedbackSummary> {
    const query = this.db.user_feedback
      .select()
      .eq('organization_id', params.organizationId);

    if (params.startDate) {
      query.gte('created_at', params.startDate);
    }
    if (params.endDate) {
      query.lte('created_at', params.endDate);
    }
    if (params.conversationId) {
      query.eq('conversation_id', params.conversationId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch feedback: ${error.message}`);
    }

    // Calculate summary statistics
    const totalFeedback = data.length;
    const helpfulCount = data.filter((f) => f.feedback_type === 'helpful').length;
    const notHelpfulCount = data.filter((f) => f.feedback_type === 'not_helpful').length;
    const helpfulRate = totalFeedback > 0 ? helpfulCount / totalFeedback : 0;

    // Category breakdown
    const categoryBreakdown = data
      .filter((f) => f.category)
      .reduce((acc, f) => {
        const category = f.category as FeedbackCategory;
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {} as Record<FeedbackCategory, number>);

    // Comment analysis for not helpful feedback
    const negativeComments = data
      .filter((f) => f.feedback_type === 'not_helpful' && f.comment)
      .map((f) => f.comment);

    return {
      totalFeedback,
      helpfulCount,
      notHelpfulCount,
      helpfulRate,
      categoryBreakdown,
      negativeComments,
    };
  }
}

// User feedback component
function UserFeedback({
  conversationId,
  messageId,
}: {
  conversationId: string;
  messageId: string;
}) {
  const [feedbackType, setFeedbackType] = useState<FeedbackType | null>(null);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const submitFeedback = async () => {
    try {
      await feedbackService.submitFeedback({
        organizationId: currentOrgId,
        userId: currentUserId,
        conversationId,
        messageId,
        feedbackType: feedbackType!,
        comment: comment || undefined,
      });
      setSubmitted(true);
      toast({
        title: 'Feedback submitted',
        description: 'Thank you for helping us improve.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to submit feedback. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (submitted) {
    return (
      <div className="text-sm text-muted-foreground">
        Thanks for your feedback!
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-4">
      <span className="text-sm text-muted-foreground">Was this helpful?</span>
      <div className="flex gap-1">
        <Button
          variant={feedbackType === 'helpful' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFeedbackType('helpful')}
        >
          <ThumbsUpIcon className="h-4 w-4" />
        </Button>
        <Button
          variant={feedbackType === 'not_helpful' ? 'destructive' : 'outline'}
          size="sm"
          onClick={() => setFeedbackType('not_helpful')}
        >
          <ThumbsDownIcon className="h-4 w-4" />
        </Button>
      </div>
      {feedbackType === 'not_helpful' && (
        <div className="flex items-center gap-2">
          <Input
            placeholder="Tell us more (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="h-8 w-48"
          />
          <Button size="sm" onClick={submitFeedback}>
            Submit
          </Button>
        </div>
      )}
      {feedbackType === 'helpful' && feedbackType !== null && (
        <Button size="sm" onClick={submitFeedback}>
          Submit
        </Button>
      )}
    </div>
  );
}
```

**When to use:** Implement user feedback collection after every AI response. Feedback provides quality signals for continuous improvement and helps identify documents or response patterns needing attention. Keep feedback optional to avoid workflow friction.

### Pattern 6: Emergency Access with Post-Access Justification

HIPAA requires documented emergency access procedures with mandatory post-access justification. This pattern implements break-glass access with enhanced logging and review workflows.

```typescript
// Emergency access request types
type EmergencyAccessReason =
  | 'patient_safety'
  | 'urgent_treatment'
  | 'system_unavailable'
  | 'provider_unavailable'
  | 'other';

interface EmergencyAccessRequest {
  id: string;
  organization_id: string;
  requester_id: string;
  approver_id: string | null;
  document_id: string;
  access_type: 'read' | 'write' | 'admin';
  reason: EmergencyAccessReason;
  justification: string;
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'completed';
  requested_at: Date;
  approved_at: Date | null;
  expires_at: Date | null;
  completed_at: Date | null;
  approver_notes: string | null;
}

interface EmergencyAccessJustification {
  id: string;
  access_request_id: string;
  user_id: string;
  justification_text: string;
  patient_context: string | null;
  submitted_at: Date;
}

// Emergency access service
class EmergencyAccessService {
  async requestEmergencyAccess(params: {
    organizationId: string;
    requesterId: string;
    documentId: string;
    accessType: 'read' | 'write' | 'admin';
    reason: EmergencyAccessReason;
    justification: string;
  }): Promise<EmergencyAccessRequest> {
    // Verify user has emergency access permission
    const hasPermission = await this.rbacService.hasPermission(
      params.requesterId,
      'admin.emergency_access'
    );

    if (!hasPermission) {
      throw new Error('User lacks emergency access permission');
    }

    // Create access request
    const request = await this.db.emergency_access_requests.insert({
      organization_id: params.organizationId,
      requester_id: params.requesterId,
      approver_id: null,
      document_id: params.documentId,
      access_type: params.accessType,
      reason: params.reason,
      justification: params.justification,
      status: 'pending',
      requested_at: new Date(),
      approved_at: null,
      expires_at: null,
      completed_at: null,
      approver_notes: null,
    });

    // Enhanced audit logging for emergency access
    await this.auditService.log({
      organization_id: params.organizationId,
      user_id: params.requesterId,
      action: 'EMERGENCY_ACCESS_REQUESTED',
      resource_type: 'document',
      resource_id: params.documentId,
      details: {
        access_type: params.accessType,
        reason: params.reason,
        request_id: request.id,
      },
      ip_address: '',
      user_agent: '',
      request_id: '',
      session_id: '',
    });

    // Notify compliance officer
    await this.notifyComplianceOfficer({
      type: 'emergency_access_request',
      requestId: request.id,
      requesterId: params.requesterId,
      documentId: params.documentId,
    });

    return request;
  }

  async approveEmergencyAccess(
    requestId: string,
    approverId: string,
    expiresInMinutes: number = 60
  ): Promise<void> {
    const request = await this.db.emergency_access_requests.find({
      where: { id: requestId },
    });

    if (!request) {
      throw new Error('Emergency access request not found');
    }

    if (request.status !== 'pending') {
      throw new Error('Request has already been processed');
    }

    // Approve the request
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
    await this.db.emergency_access_requests.update({
      where: { id: requestId },
      data: {
        approver_id: approverId,
        status: 'approved',
        approved_at: new Date(),
        expires_at: expiresAt,
      },
    });

    // Audit log approval
    await this.auditService.log({
      organization_id: request.organization_id,
      user_id: approverId,
      action: 'EMERGENCY_ACCESS_GRANTED',
      resource_type: 'document',
      resource_id: request.document_id,
      details: {
        request_id: requestId,
        requester_id: request.requester_id,
        expires_at: expiresAt.toISOString(),
        duration_minutes: expiresInMinutes,
      },
      ip_address: '',
      user_agent: '',
      request_id: '',
      session_id: '',
    });
  }

  async submitJustification(params: {
    accessRequestId: string;
    userId: string;
    justificationText: string;
    patientContext?: string;
  }): Promise<EmergencyAccessJustification> {
    const request = await this.db.emergency_access_requests.find({
      where: { id: params.accessRequestId },
    });

    if (!request) {
      throw new Error('Emergency access request not found');
    }

    if (request.requester_id !== params.userId) {
      throw new Error('Only the requester can submit justification');
    }

    if (request.status !== 'completed') {
      throw new Error('Access request must be completed before submitting justification');
    }

    const justification = await this.db.emergency_access_justifications.insert({
      access_request_id: params.accessRequestId,
      user_id: params.userId,
      justification_text: params.justificationText,
      patient_context: params.patientContext || null,
      submitted_at: new Date(),
    });

    // Audit log justification submission
    await this.auditService.log({
      organization_id: request.organization_id,
      user_id: params.userId,
      action: 'EMERGENCY_ACCESS_JUSTIFICATION_SUBMITTED',
      resource_type: 'document',
      resource_id: request.document_id,
      details: {
        request_id: params.accessRequestId,
        justification_length: params.justificationText.length,
        has_patient_context: !!params.patientContext,
      },
      ip_address: '',
      user_agent: '',
      request_id: '',
      session_id: '',
    });

    return justification;
  }

  async reviewPendingJustifications(organizationId: string): Promise<{
    pendingCount: number;
    overdueCount: number;
    requests: EmergencyAccessRequest[];
  }> {
    const { data } = await this.db.emergency_access_requests
      .select()
      .eq('organization_id', organizationId)
      .in('status', ['approved', 'completed'])
      .lt('expires_at', new Date());

    const pendingWithoutJustification = data.filter(
      (r) => r.status === 'completed' &&
        !r.justification_submitted
    );

    return {
      pendingCount: pendingWithoutJustification.length,
      overdueCount: pendingWithoutJustification.filter(
        (r) => r.completed_at &&
          r.completed_at < new Date(Date.now() - 24 * 60 * 60 * 1000)
      ).length,
      requests: data,
    };
  }
}
```

**When to use:** Implement emergency access procedures for HIPAA compliance. All emergency access requires documented justification and review workflows. Never allow emergency access without audit trail and post-access verification.

### Pattern 7: Organization Settings Management

Organization settings control system-wide policies including session timeouts, MFA requirements, and feature flags. Settings are scoped to the organization and editable only by admins.

```typescript
// Organization settings schema
interface OrganizationSettings {
  // Session settings
  sessionTimeoutMinutes: number; // HIPAA: max 15 for PHI access
  absoluteSessionLimitMinutes: number; // Max 8 hours
  inactivityWarningMinutes: number;

  // MFA settings
  mfaRequired: boolean;
  mfaGracePeriodMinutes: number;
  allowRememberDevice: boolean;
  rememberDeviceDays: number;

  // Document settings
  requireApprovalForPublish: boolean;
  autoDeprecateAfterMonths: number;
  notificationOnDeprecation: boolean;

  // Audit settings
  auditLogRetentionDays: number;
  requireJustificationForEmergency: boolean;
  emergencyAccessExpiryMinutes: number;

  // Feature flags
  enableFeedback: boolean;
  enableExperimentalFeatures: boolean;
  maxDocumentsPerUpload: number;
}

const defaultSettings: OrganizationSettings = {
  sessionTimeoutMinutes: 15,
  absoluteSessionLimitMinutes: 480,
  inactivityWarningMinutes: 2,
  mfaRequired: true,
  mfaGracePeriodMinutes: 1440,
  allowRememberDevice: true,
  rememberDeviceDays: 7,
  requireApprovalForPublish: true,
  autoDeprecateAfterMonths: 24,
  notificationOnDeprecation: true,
  auditLogRetentionDays: 2190, // 6 years for HIPAA
  requireJustificationForEmergency: true,
  emergencyAccessExpiryMinutes: 60,
  enableFeedback: true,
  enableExperimentalFeatures: false,
  maxDocumentsPerUpload: 10,
};

// Organization settings service
class OrganizationSettingsService {
  async getSettings(organizationId: string): Promise<OrganizationSettings> {
    const { data, error } = await this.db.organizations
      .select('settings')
      .eq('id', organizationId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch settings: ${error.message}`);
    }

    return { ...defaultSettings, ...data.settings };
  }

  async updateSettings(
    organizationId: string,
    userId: string,
    updates: Partial<OrganizationSettings>
  ): Promise<void> {
    // Verify admin permission
    const hasPermission = await this.rbacService.hasPermission(
      userId,
      'admin.settings'
    );

    if (!hasPermission) {
      throw new Error('User lacks settings modification permission');
    }

    // Validate settings
    const currentSettings = await this.getSettings(organizationId);
    const validatedUpdates = this.validateSettings(
      currentSettings,
      updates
    );

    // Update settings
    await this.db.organizations.update({
      where: { id: organizationId },
      data: {
        settings: { ...currentSettings, ...validatedUpdates },
        updated_at: new Date(),
      },
    });

    // Audit log settings change
    await this.auditService.log({
      organization_id: organizationId,
      user_id: userId,
      action: 'SETTINGS_CHANGED',
      resource_type: 'organization',
      resource_id: organizationId,
      details: {
        changed_settings: Object.keys(validatedUpdates),
      },
      ip_address: '',
      user_agent: '',
      request_id: '',
      session_id: '',
    });
  }

  private validateSettings(
    current: OrganizationSettings,
    updates: Partial<OrganizationSettings>
  ): Partial<OrganizationSettings> {
    const validated: Partial<OrganizationSettings> = {};

    if (updates.sessionTimeoutMinutes !== undefined) {
      // HIPAA requirement: max 15 minutes for PHI access
      if (updates.sessionTimeoutMinutes > 15) {
        throw new Error('Session timeout cannot exceed 15 minutes for HIPAA compliance');
      }
      validated.sessionTimeoutMinutes = updates.sessionTimeoutMinutes;
    }

    if (updates.mfaRequired !== undefined) {
      validated.mfaRequired = updates.mfaRequired;
    }

    if (updates.auditLogRetentionDays !== undefined) {
      // HIPAA requirement: minimum 6 years
      if (updates.auditLogRetentionDays < 2190) {
        throw new Error('Audit log retention must be at least 6 years for HIPAA compliance');
      }
      validated.auditLogRetentionDays = updates.auditLogRetentionDays;
    }

    // Apply other updates without validation
    Object.assign(validated, updates);

    return validated;
  }
}
```

**When to use:** Implement organization settings for all configurable system policies. Settings should always validate against compliance requirements (HIPAA minimums) and audit all changes. Provide sensible defaults that meet compliance requirements.

### Pattern 8: System Health Dashboard

The system health dashboard provides administrators with visibility into system performance, usage metrics, and potential issues requiring attention.

```typescript
// System health metrics
interface SystemHealthMetrics {
  // Performance metrics
  averageResponseTimeMs: number;
  p95ResponseTimeMs: number;
  p99ResponseTimeMs: number;
  requestsPerMinute: number;
  errorRate: number;

  // Resource metrics
  databaseConnectionsUsed: number;
  databaseConnectionsMax: number;
  vectorIndexSize: number;
  storageUsedBytes: number;

  // Usage metrics
  activeUsersToday: number;
  activeUsersThisWeek: number;
  totalQueriesToday: number;
  feedbackHelpfulRate: number;

  // Compliance metrics
  pendingEmergencyAccessCount: number;
  pendingJustificationsCount: number;
  documentsNeedingReview: number;
  recentSecurityEvents: number;

  // Health status
  overallStatus: 'healthy' | 'warning' | 'critical';
  componentStatuses: {
    database: 'healthy' | 'warning' | 'critical';
    vectorStore: 'healthy' | 'warning' | 'critical';
    aiService: 'healthy' | 'warning' | 'critical';
    auditSystem: 'healthy' | 'warning' | 'critical';
  };
}

// System health service
class SystemHealthService {
  async getHealthMetrics(organizationId: string): Promise<SystemHealthMetrics> {
    // Fetch metrics from various sources
    const [performance, resources, usage, compliance] = await Promise.all([
      this.getPerformanceMetrics(),
      this.getResourceMetrics(),
      this.getUsageMetrics(organizationId),
      this.getComplianceMetrics(organizationId),
    ]);

    // Determine overall status
    const componentStatuses = {
      database: this.evaluateDatabaseHealth(resources),
      vectorStore: this.evaluateVectorStoreHealth(resources),
      aiService: this.evaluateAIServiceHealth(performance),
      auditSystem: compliance.auditSystemStatus,
    };

    const hasCritical = Object.values(componentStatuses).includes('critical');
    const hasWarning = Object.values(componentStatuses).includes('warning');
    const overallStatus = hasCritical ? 'critical' : hasWarning ? 'warning' : 'healthy';

    return {
      ...performance,
      ...resources,
      ...usage,
      ...compliance,
      overallStatus,
      componentStatuses,
    };
  }

  private async getPerformanceMetrics(): Promise<{
    averageResponseTimeMs: number;
    p95ResponseTimeMs: number;
    p99ResponseTimeMs: number;
    requestsPerMinute: number;
    errorRate: number;
  }> {
    // Query from metrics store (could be Prometheus, CloudWatch, etc.)
    const { data } = await this.metricsStore.query(
      'SELECT AVG(response_time) as avg, PERCENTILE(95) as p95, PERCENTILE(99) as p99, COUNT(*) as count FROM requests WHERE time > now() - 1h'
    );

    return {
      averageResponseTimeMs: data.avg || 0,
      p95ResponseTimeMs: data.p95 || 0,
      p99ResponseTimeMs: data.p99 || 0,
      requestsPerMinute: (data.count || 0) / 60,
      errorRate: 0.01, // Calculate from error count / total
    };
  }

  private async getComplianceMetrics(organizationId: string): Promise<{
    pendingEmergencyAccessCount: number;
    pendingJustificationsCount: number;
    documentsNeedingReview: number;
    recentSecurityEvents: number;
    auditSystemStatus: 'healthy' | 'warning' | 'critical';
  }> {
    const [emergency, documents, security] = await Promise.all([
      this.emergencyAccessService.reviewPendingJustifications(organizationId),
      this.getPendingDocumentReviews(organizationId),
      this.getRecentSecurityEvents(organizationId),
    ]);

    return {
      pendingEmergencyAccessCount: emergency.pendingCount,
      pendingJustificationsCount: emergency.overdueCount,
      documentsNeedingReview: documents,
      recentSecurityEvents: security.count,
      auditSystemStatus: this.evaluateAuditSystemHealth(security),
    };
  }
}

// System health dashboard component
function SystemHealthDashboard() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['systemHealth'],
    queryFn: () => systemHealthService.getHealthMetrics(currentOrgId),
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return <Skeleton className="h-96" />;
  }

  return (
    <div className="space-y-6">
      {/* Overall Status */}
      <Card>
        <CardHeader>
          <CardTitle>System Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <HealthStatusIcon status={metrics.overallStatus} />
            <div>
              <div className="text-2xl font-bold capitalize">
                {metrics.overallStatus}
              </div>
              <div className="text-muted-foreground">
                Last updated: {new Date().toLocaleTimeString()}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Component Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <ComponentStatusCard
          title="Database"
          status={metrics.componentStatuses.database}
        />
        <ComponentStatusCard
          title="Vector Store"
          status={metrics.componentStatuses.vectorStore}
        />
        <ComponentStatusCard
          title="AI Service"
          status={metrics.componentStatuses.aiService}
        />
        <ComponentStatusCard
          title="Audit System"
          status={metrics.componentStatuses.auditSystem}
        />
      </div>

      {/* Performance Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <MetricCard
              label="Avg Response"
              value={`${metrics.averageResponseTimeMs}ms`}
            />
            <MetricCard
              label="P95 Response"
              value={`${metrics.p95ResponseTimeMs}ms`}
            />
            <MetricCard
              label="P99 Response"
              value={`${metrics.p99ResponseTimeMs}ms`}
            />
            <MetricCard
              label="Requests/min"
              value={metrics.requestsPerMinute.toFixed(0)}
            />
            <MetricCard
              label="Error Rate"
              value={`${(metrics.errorRate * 100).toFixed(2)}%`}
              alert={metrics.errorRate > 0.05}
            />
          </div>
        </CardContent>
      </Card>

      {/* Compliance Alerts */}
      <Card>
        <CardHeader>
          <CardTitle>Compliance Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {metrics.pendingEmergencyAccessCount > 0 && (
              <Alert variant="warning">
                <AlertTitle>Pending Emergency Access</AlertTitle>
                <AlertDescription>
                  {metrics.pendingEmergencyAccessCount} emergency access requests pending justification.
                </AlertDescription>
              </Alert>
            )}
            {metrics.pendingJustificationsCount > 0 && (
              <Alert variant="destructive">
                <AlertTitle>Overdue Justifications</AlertTitle>
                <AlertDescription>
                  {metrics.pendingJustificationsCount} emergency access justifications are overdue (24+ hours).
                </AlertDescription>
              </Alert>
            )}
            {metrics.documentsNeedingReview > 0 && (
              <Alert>
                <AlertTitle>Documents Awaiting Review</AlertTitle>
                <AlertDescription>
                  {metrics.documentsNeedingReview} documents pending approval.
                </AlertDescription>
              </Alert>
            )}
            {metrics.recentSecurityEvents > 0 && (
              <Alert variant="destructive">
                <AlertTitle>Security Events</AlertTitle>
                <AlertDescription>
                  {metrics.recentSecurityEvents} security events in the last 24 hours.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

**When to use:** Implement system health dashboard for administrative visibility. The dashboard should highlight compliance issues requiring attention alongside performance metrics. Integrate with alerting systems for critical issues.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV Export | Hand-rolled CSV generation | papaparse | Handles special characters, encoding, large datasets safely |
| Role Permission Logic | Custom permission checks | RBAC service pattern | Prevents permission bypasses, provides audit trail |
| Document Workflow States | Simple status field | XState state machine | Prevents invalid transitions, provides visual debugging |
| Audit Log Filtering | Database queries with multiple OR conditions | Audit service with parameterized filters | Prevents SQL injection, optimizes queries |
| User Invitation Flow | Email + database insert | Supabase invite system | Handles email delivery, expiration, acceptance flow |
| Session Timeout | setTimeout in browser | Server-side session validation + client idle detection | Server authoritative, works across devices |
| Feedback Submission | Simple form + insert | Feedback service with audit | Tracks quality signals, enables analysis |

**Key insight:** Compliance features require audit trails and security guarantees that are easy to get wrong in custom implementations. Use established patterns with proven security properties.

## Common Pitfalls

### Pitfall 1: Incomplete Audit Trail for Compliance Events

**What goes wrong:** Audit logs capture some events but miss others, creating compliance gaps that auditors will flag.

**Why it happens:** Developers add new features without considering audit requirements, or audit logging is added retroactively and misses edge cases.

**How to avoid:** Implement audit logging at the infrastructure level using database triggers and middleware patterns rather than ad-hoc logging in application code. Define an explicit audit event catalog that maps to HIPAA requirements.

**Warning signs:**
- `grep` finds fewer than 50 audit log entries per user session
- New features ship without corresponding audit entries
- Compliance officers request additional audit events

### Pitfall 2: Role-Based Access Bypass Through API Calls

**What goes wrong:** Frontend hides features based on roles, but API endpoints don't validate permissions, allowing unauthorized access.

**Why it happens:** Developers rely on UI gating without server-side validation, or RLS policies are missing for sensitive endpoints.

**How to avoid:** Implement defense-in-depth with UI hiding, API validation, and RLS policies. Audit all permission denials.

**Warning signs:**
- Frontend and backend permission logic diverges
- API routes don't check session or permissions
- RLS policies missing for sensitive tables

### Pitfall 3: Emergency Access Without Justification Enforcement

**What goes wrong:** Emergency access is granted but post-access justification is optional or not enforced, violating HIPAA requirements.

**Why it happens:** User experience concerns override compliance requirements, or justification collection is added as an afterthought.

**How to avoid:** Implement mandatory justification workflows that block system access until justification is submitted. Use timeouts to expire un-justified access.

**Warning signs:**
- Emergency access justifications are optional fields
- No follow-up reminders for missing justifications
- Access completion not tracked separately from approval

### Pitfall 4: Document State Transitions Without Validation

**What goes wrong:** Documents can transition to invalid states (e.g., published without approval) due to missing validation.

**Why it happens:** State validation is implemented ad-hoc for each transition rather than as a unified system.

**How to avoid:** Implement state machine pattern that defines valid transitions and enforces them at the database level using triggers or application service.

**Warning signs:**
- Documents appear in unexpected states
- Audit log shows state transitions that shouldn't be possible
- Multiple code paths can update document status

## Code Examples

### Document Approval Workflow Implementation

```typescript
// Server action for document approval
async function approveDocument(
  documentId: string,
  reason?: string
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) {
    return { error: 'Authentication required' };
  }

  const rbac = new RBACService();
  if (!await rbac.hasPermission(session.user.id, 'document.approve')) {
    return { error: 'Permission denied: document.approve required' };
  }

  const workflow = new DocumentWorkflowEngine();
  const result = await workflow.transition(
    documentId,
    'pending_review',
    'approved',
    session.user.id,
    reason
  );

  if (!result.success) {
    return { error: result.error };
  }

  // Trigger notifications
  await notifyDocumentApproved(documentId);

  return { success: true };
}

// Client component for document approval
function DocumentApprovalCard({ document }: { document: Document }) {
  const [isApproving, setIsApproving] = useState(false);
  const [reason, setReason] = useState('');

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await approveDocument(document.id, reason);
      toast({ title: 'Document approved' });
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{document.title}</CardTitle>
        <CardDescription>Version {document.version} • {document.clinicalCategory}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground mb-4">
          Submitted by {document.uploadedBy} on {new Date(document.submittedAt).toLocaleDateString()}
        </div>
        <Textarea
          placeholder="Approval notes (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => rejectDocument(document.id)}>
          Reject
        </Button>
        <Button onClick={handleApprove} disabled={isApproving}>
          {isApproving ? 'Approving...' : 'Approve'}
        </Button>
      </CardFooter>
    </Card>
  );
}
```

### Audit Log CSV Export

```typescript
// Server action for audit log export
async function exportAuditLogs(params: {
  startDate: Date;
  endDate: Date;
  filters?: {
    userId?: string;
    action?: string;
    resourceType?: string;
  };
}): Promise<{ data: string; filename: string }> {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Authentication required');
  }

  const rbac = new RBACService();
  if (!await rbac.hasPermission(session.user.id, 'audit.export')) {
    throw new Error('Permission denied: audit.export required');
  }

  const audit = new AuditService();
  const csv = await audit.exportToCSV({
    organizationId: session.user.organizationId,
    startDate: params.startDate,
    endDate: params.endDate,
    filters: params.filters,
  });

  const filename = `audit-logs-${params.startDate.toISOString().split('T')[0]}-to-${params.endDate.toISOString().split('T')[0]}.csv`;

  return { data: csv, filename };
}

// Client component for export
function AuditLogExport() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const { data, filename } = await exportAuditLogs({
        startDate: dateRange.from,
        endDate: dateRange.to,
      });

      // Download CSV
      const blob = new Blob([data], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <DateRangePicker
        value={dateRange}
        onChange={setDateRange}
      />
      <Button onClick={handleExport} disabled={isExporting}>
        {isExporting ? 'Exporting...' : 'Export CSV'}
      </Button>
    </div>
  );
}
```

### User Invitation Flow

```typescript
// Server action for inviting users
async function inviteUser(params: {
  email: string;
  role: 'admin' | 'provider' | 'staff';
  message?: string;
}): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) {
    return { error: 'Authentication required' };
  }

  const rbac = new RBACService();
  if (!await rbac.hasPermission(session.user.id, 'user.invite')) {
    return { error: 'Permission denied: user.invite required' };
  }

  // Check if user already exists in organization
  const existing = await db.users.find({
    where: {
      organizationId: session.user.organizationId,
      email: params.email,
    },
  });

  if (existing) {
    return { error: 'User already exists in this organization' };
  }

  // Create invitation
  const invitation = await db.user_invitations.insert({
    organizationId: session.user.organizationId,
    email: params.email,
    role: params.role,
    invitedBy: session.user.id,
    message: params.message,
    expiresAt: addDays(new Date(), 7),
    status: 'pending',
  });

  // Send invitation email
  await emailService.sendInvitation({
    to: params.email,
    organizationName: session.user.organizationName,
    invitedBy: session.user.name,
    role: params.role,
    message: params.message,
    acceptUrl: `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitation.id}`,
  });

  // Audit log
  await auditService.log({
    organization_id: session.user.organizationId,
    user_id: session.user.id,
    action: 'USER_INVITED',
    resource_type: 'user',
    resource_id: invitation.id,
    details: {
      invited_email: params.email,
      role: params.role,
    },
    ip_address: '',
    user_agent: '',
    request_id: '',
    session_id: '',
  });

  return { success: true };
}

// Client component for user invitation
function InviteUserForm({ onInvite }: { onInvite: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'provider' | 'staff'>('staff');
  const [message, setMessage] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsInviting(true);
    try {
      const result = await inviteUser({ email, role, message });
      if (result.success) {
        toast({ title: 'Invitation sent', description: `Invitation sent to ${email}` });
        setEmail('');
        setMessage('');
        onInvite();
      } else {
        toast({ title: 'Error', description: result.error, variant: 'destructive' });
      }
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
          required
        />
      </div>
      <div>
        <Label htmlFor="role">Role</Label>
        <Select value={role} onValueChange={(v) => setRole(v as Role)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="provider">Provider</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="message">Personal Message (optional)</Label>
        <Textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add a personal note to the invitation..."
        />
      </div>
      <Button type="submit" disabled={isInviting}>
        {isInviting ? 'Sending...' : 'Send Invitation'}
      </Button>
    </form>
  );
}
```

### Emergency Access Request

```typescript
// Server action for emergency access request
async function requestEmergencyAccess(params: {
  documentId: string;
  reason: EmergencyAccessReason;
  justification: string;
}): Promise<{ success: boolean; requestId?: string; error?: string }> {
  const session = await auth();
  if (!session?.user) {
    return { error: 'Authentication required' };
  }

  const rbac = new RBACService();
  if (!await rbac.hasPermission(session.user.id, 'admin.emergency_access')) {
    return { error: 'Permission denied: admin.emergency_access required' };
  }

  const emergency = new EmergencyAccessService();
  const request = await emergency.requestEmergencyAccess({
    organizationId: session.user.organizationId,
    requesterId: session.user.id,
    documentId: params.documentId,
    accessType: 'read',
    reason: params.reason,
    justification: params.justification,
  });

  return { success: true, requestId: request.id };
}

// Client component for emergency access
function EmergencyAccessRequest({ documentId }: { documentId: string }) {
  const [reason, setReason] = useState<EmergencyAccessReason>('patient_safety');
  const [justification, setJustification] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestStatus, setRequestStatus] = useState<'idle' | 'pending' | 'approved'>('idle');

  const handleRequest = async () => {
    setIsRequesting(true);
    try {
      const result = await requestEmergencyAccess({
        documentId,
        reason,
        justification,
      });

      if (result.success) {
        setRequestStatus('pending');
        toast({
          title: 'Emergency Access Requested',
          description: 'Your request is pending approval from a compliance officer.',
        });
      } else {
        toast({ title: 'Error', description: result.error, variant: 'destructive' });
      }
    } finally {
      setIsRequesting(false);
    }
  };

  if (requestStatus === 'pending') {
    return (
      <Alert>
        <AlertTitle>Request Submitted</AlertTitle>
        <AlertDescription>
          Emergency access request has been submitted. You will be notified when approved.
          Please prepare to provide post-access justification.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-destructive/5">
      <AlertTitle>Emergency Access Request</AlertTitle>
      <AlertDescription className="text-sm">
        This access requires justification and will be logged for compliance review.
      </AlertDescription>

      <div>
        <Label>Reason for Emergency Access</Label>
        <Select value={reason} onValueChange={(v) => setReason(v as EmergencyAccessReason)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="patient_safety">Patient Safety</SelectItem>
            <SelectItem value="urgent_treatment">Urgent Treatment</SelectItem>
            <SelectItem value="system_unavailable">System Unavailable</SelectItem>
            <SelectItem value="provider_unavailable">Provider Unavailable</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Justification *</Label>
        <Textarea
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          placeholder="Explain why this emergency access is necessary..."
          required
        />
      </div>

      <Button
        onClick={handleRequest}
        disabled={isRequesting || !justification.trim()}
        variant="destructive"
      >
        {isRequesting ? 'Submitting...' : 'Request Emergency Access'}
      </Button>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-----------------|--------------|--------|
| Hardcoded role checks | Permission-based RBAC | Current | Flexible role composition, auditable permissions |
| Manual state transitions | State machine validation | Current | Prevents invalid states, clear audit trail |
| Ad-hoc audit logging | Database trigger + API middleware | Current | Complete compliance coverage |
| Optional feedback | Required compliance justification | HIPAA 2024 updates | Post-access review enforcement |
| Single timeout setting | Granular session policies | Current | HIPAA compliance with UX balance |

**Deprecated/outdated:**
- Simple boolean role flags → Use permission-based access control
- Client-side only feature hiding → Must combine with server validation
- Manual compliance tracking → Automated audit and alerting

## Divergence from Project Baseline

This phase builds on established project baseline without significant divergence:

**Baseline alignment:**
- Supabase authentication integration continues for user management
- Row Level Security patterns extend to new compliance tables
- Audit logging extends existing trigger architecture
- shadcn/ui components used for compliance UI elements
- Zod schemas validate all compliance data structures

**No divergence required:** Phase 4 features integrate seamlessly with existing Phase 1-3 foundations.

## Open Questions

1. **Emergency Access Approval Workflow:** Should emergency access require dual authorization (two admins) for sensitive documents?
   - What we know: HIPAA requires documented procedures, dual authorization is recommended best practice
   - What's unclear: Whether dual auth should apply to all emergency access or only specific document types
   - Recommendation: Implement configurable dual auth requirement in organization settings

2. **Audit Log Retention for Inactive Organizations:** What happens to audit logs when an organization is deactivated?
   - What we know: HIPAA requires 6-year retention regardless of organization status
   - What's unclear: Who pays for storage of inactive organization logs
   - Recommendation: Implement archival to cold storage with automated retention policies

3. **Feedback Loop for Document Improvement:** How should negative feedback trigger document review?
   - What we know: Feedback helps identify problematic documents
   - What's unclear: Threshold for automatic escalation to compliance
   - Recommendation: Implement configurable feedback thresholds with admin notifications

## Sources

### Primary (HIGH confidence)
- Supabase Documentation - RLS policies, authentication patterns, database functions
- HIPAA Security Rule (164.312) - Technical safeguards requirements
- Vercel AI SDK Documentation - Streaming and state management patterns

### Secondary (MEDIUM confidence)
- shadcn/ui Component Library - Accessible React components
- XState Documentation - State machine patterns
- Healthcare compliance patterns - Industry best practices

### Tertiary (LOW confidence)
- Community implementations of compliance dashboards
- Open source RBAC libraries for reference patterns

## Metadata

**Confidence breakdown:**
- Document approval workflow: HIGH - Well-documented patterns, clear HIPAA requirements
- RBAC implementation: HIGH - Established patterns from prior research
- Audit logging: HIGH - Existing trigger architecture extends naturally
- Emergency access: MEDIUM - HIPAA requirements clear, implementation patterns vary
- System health dashboard: MEDIUM - Best practices emerging, healthcare-specific needs unclear
- User feedback: MEDIUM - Simple mechanism, quality signal integration needs validation

**Research date:** February 7, 2026
**Valid until:** February 7, 2027 (HIPAA requirements stable, implementation patterns evolving)

/**
 * Governance Committee Service
 * 
 * Provides programmatic management of clinical governance committee operations,
 * including member management, oversight area tracking, and committee administration.
 * 
 * This service implements the governance committee structure defined in:
 * - docs/governance/clinical-governance-framework.md
 * - docs/governance/committee-charter.md
 */

import { z } from 'zod';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Governance committee role types with qualification requirements
 */
export const CommitteeRoleSchema = z.enum([
  'CHAIR',
  'CLINICAL_LEAD',
  'COMPLIANCE_OFFICER',
  'ETHICIST',
  'PATIENT_REPRESENTATIVE'
]);

export type CommitteeRole = z.infer<typeof CommitteeRoleSchema>;

/**
 * Qualification requirements for each committee role
 */
export const RoleQualificationsSchema = z.object({
  role: CommitteeRoleSchema,
  requiredCredentials: z.array(z.string()),
  requiredCertifications: z.array(z.string()),
  requiredExperience: z.string(),
  termLengthMonths: z.number(),
  renewalEligibility: z.boolean(),
});

export type RoleQualifications = z.infer<typeof RoleQualificationsSchema>;

/**
 * Committee member information
 */
export const CommitteeMemberSchema = z.object({
  id: z.string().uuid(),
  role: CommitteeRoleSchema,
  name: z.string().min(1).max(100),
  email: z.string().email(),
  credentials: z.array(z.string()),
  certifications: z.array(z.string()),
  appointmentDate: z.string().datetime(),
  termEndDate: z.string().datetime(),
  isActive: z.boolean(),
  responsibilities: z.array(z.string()),
});

export type CommitteeMember = z.infer<typeof CommitteeMemberSchema>;

/**
 * Oversight area definitions
 */
export const OversightAreaSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  reviewFrequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL']),
  metrics: z.array(z.object({
    name: z.string(),
    target: z.number(),
    unit: z.string(),
  })),
});

export type OversightArea = z.infer<typeof OversightAreaSchema>;

/**
 * Committee meeting information
 */
export const CommitteeMeetingSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['REGULAR', 'EMERGENCY', 'ANNUAL', 'SPECIAL']),
  scheduledDate: z.string().datetime(),
  actualDate: z.string().datetime().optional(),
  duration: z.number().min(0), // minutes
  attendees: z.array(z.string()), // member IDs
  quorum: z.number(),
  quorumPresent: z.boolean(),
  agenda: z.array(z.object({
    item: z.string(),
    discussion: z.string().optional(),
    decision: z.string().optional(),
  })),
  decisions: z.array(z.object({
    id: z.string().uuid(),
    description: z.string(),
    voteOutcome: z.enum(['APPROVED', 'REJECTED', 'TABLED']),
    voteCount: z.object({
      yes: z.number(),
      no: z.number(),
      abstain: z.number(),
    }),
  })),
  actionItems: z.array(z.object({
    id: z.string().uuid(),
    description: z.string(),
    assignee: z.string(),
    dueDate: z.string().datetime(),
    status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE']),
  })),
  minutes: z.string().optional(),
});

export type CommitteeMeeting = z.infer<typeof CommitteeMeetingSchema>;

/**
 * Governance decision record
 */
export const GovernanceDecisionSchema = z.object({
  id: z.string().uuid(),
  date: z.string().datetime(),
  type: z.enum(['POLICY', 'DEPLOYMENT', 'INCIDENT_RESPONSE', 'COMPLIANCE', 'ETHICAL_REVIEW', 'OPERATIONAL']),
  description: z.string(),
  rationale: z.string(),
  voteOutcome: z.enum(['UNANIMOUS', 'MAJORITY', 'SUPERMAJORITY', 'TIED', 'CHAIR_BREAK']),
  voteCount: z.object({
    yes: z.number(),
    no: z.number(),
    abstain: z.number(),
  }),
  dissentingViews: z.array(z.object({
    memberId: z.string().uuid(),
    view: z.string(),
  })).optional(),
  implementationDeadline: z.string().datetime().optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SUPERSEDED']),
});

export type GovernanceDecision = z.infer<typeof GovernanceDecisionSchema>;

// ============================================================================
// Qualification Requirements by Role
// ============================================================================

/**
 * Defines qualification requirements for each governance committee role
 * aligned with the committee charter specifications
 */
export const ROLE_QUALIFICATIONS: RoleQualifications[] = [
  {
    role: 'CHAIR',
    requiredCredentials: ['MD', 'DO'],
    requiredCertifications: ['Clinical Informatics Board Certification (ABMS)'],
    requiredExperience: '5+ years clinical informatics leadership',
    termLengthMonths: 24,
    renewalEligibility: true,
  },
  {
    role: 'CLINICAL_LEAD',
    requiredCredentials: ['MD', 'DO', 'NP', 'PA'],
    requiredCertifications: ['AI/ML Certification', 'Clinical Specialty Certification'],
    requiredExperience: '3+ years clinical practice + AI/ML training',
    termLengthMonths: 24,
    renewalEligibility: true,
  },
  {
    role: 'COMPLIANCE_OFFICER',
    requiredCredentials: ['JD', 'RHIA', 'CHPC'],
    requiredCertifications: ['HIPAA Certification', 'Healthcare Compliance Certification'],
    requiredExperience: '5+ years healthcare regulatory compliance',
    termLengthMonths: 36,
    renewalEligibility: true,
  },
  {
    role: 'ETHICIST',
    requiredCredentials: ['PhD', 'MD', 'ThD'],
    requiredCertifications: ['Bioethics Certification (ASBH)'],
    requiredExperience: '5+ years clinical ethics consultation',
    termLengthMonths: 24,
    renewalEligibility: true,
  },
  {
    role: 'PATIENT_REPRESENTATIVE',
    requiredCredentials: [],
    requiredCertifications: [],
    requiredExperience: 'Lived patient experience in healthcare systems',
    termLengthMonths: 24,
    renewalEligibility: true,
  },
];

// ============================================================================
// Oversight Area Definitions
// ============================================================================

/**
 * Defines oversight areas for the governance committee as specified
 * in the clinical governance framework
 */
export const OVERSIGHT_AREAS: OversightArea[] = [
  {
    id: 'CLINICAL_ACCURACY',
    name: 'Clinical Accuracy',
    description: 'Monitoring and ensuring AI recommendation accuracy against clinical evidence and standards of care',
    priority: 'CRITICAL',
    reviewFrequency: 'MONTHLY',
    metrics: [
      { name: 'Recommendation Accuracy Rate', target: 0.95, unit: 'percentage' },
      { name: 'Citation Verification Rate', target: 0.98, unit: 'percentage' },
      { name: 'Clinician Override Rate', target: 0.15, unit: 'percentage' },
    ],
  },
  {
    id: 'PATIENT_SAFETY',
    name: 'Patient Safety',
    description: 'Monitoring patient safety incidents and near-misses involving AI-assisted clinical decisions',
    priority: 'CRITICAL',
    reviewFrequency: 'DAILY',
    metrics: [
      { name: 'Critical Safety Incidents', target: 0, unit: 'count' },
      { name: 'High Severity Near-Misses', target: 0, unit: 'count' },
      { name: 'Safety Incident Response Time', target: 4, unit: 'hours' },
    ],
  },
  {
    id: 'REGULATORY_COMPLIANCE',
    name: 'Regulatory Compliance',
    description: 'Ensuring AI-assisted activities meet HIPAA, FDA, state medical board, and accreditation requirements',
    priority: 'CRITICAL',
    reviewFrequency: 'WEEKLY',
    metrics: [
      { name: 'Compliance Audit Score', target: 100, unit: 'percentage' },
      { name: 'Regulatory Inquiries', target: 0, unit: 'count' },
      { name: 'Compliance Training Completion', target: 1.0, unit: 'percentage' },
    ],
  },
  {
    id: 'ETHICAL_USE',
    name: 'Ethical Use',
    description: 'Ensuring AI deployment aligns with healthcare ethical principles including autonomy, beneficence, and justice',
    priority: 'HIGH',
    reviewFrequency: 'MONTHLY',
    metrics: [
      { name: 'Ethical Review Completion Rate', target: 1.0, unit: 'percentage' },
      { name: 'Patient Consent Documentation', target: 1.0, unit: 'percentage' },
      { name: 'Bias Assessment Completion', target: 1.0, unit: 'percentage' },
    ],
  },
  {
    id: 'PERFORMANCE_MONITORING',
    name: 'Performance Monitoring',
    description: 'Monitoring AI system technical performance, availability, and reliability metrics',
    priority: 'HIGH',
    reviewFrequency: 'DAILY',
    metrics: [
      { name: 'System Availability', target: 0.999, unit: 'percentage' },
      { name: 'Average Response Latency', target: 2, unit: 'seconds' },
      { name: 'Error Rate', target: 0.01, unit: 'percentage' },
    ],
  },
];

// ============================================================================
// Committee Service Implementation
// ============================================================================

/**
 * GovernanceCommitteeService provides programmatic management of clinical
 * governance committee operations including member management, oversight
 * area tracking, and committee administration.
 */
export class GovernanceCommitteeService {
  private members: Map<string, CommitteeMember> = new Map();
  private meetings: Map<string, CommitteeMeeting> = new Map();
  private decisions: Map<string, GovernanceDecision> = new Map();
  private oversightAreas: Map<string, OversightArea> = new Map();

  constructor() {
    // Initialize oversight areas from configuration
    OVERSIGHT_AREAS.forEach(area => {
      this.oversightAreas.set(area.id, area);
    });
  }

  /**
   * Initialize the governance committee with required members
   * Following the committee charter structure
   */
  async initializeCommittee(initialMembers: Omit<CommitteeMember, 'id'>[]): Promise<{
    success: boolean;
    committeeId: string;
    missingRoles: CommitteeRole[];
  }> {
    const committeeId = crypto.randomUUID();
    const requiredRoles: CommitteeRole[] = ['CHAIR', 'CLINICAL_LEAD', 'COMPLIANCE_OFFICER', 'ETHICIST', 'PATIENT_REPRESENTATIVE'];
    const assignedRoles: CommitteeRole[] = [];

    // Validate and add initial members
    for (const memberData of initialMembers) {
      const memberId = crypto.randomUUID();
      
      // Validate role qualifications
      const qualifications = ROLE_QUALIFICATIONS.find(q => q.role === memberData.role);
      if (!qualifications) {
        throw new Error(`Invalid committee role: ${memberData.role}`);
      }

      // Check credential requirements
      const hasRequiredCredentials = qualifications.requiredCredentials.every(
        cred => memberData.credentials.includes(cred)
      );
      if (!hasRequiredCredentials) {
        throw new Error(`Member ${memberData.name} missing required credentials for ${memberData.role}`);
      }

      // Check certification requirements
      const hasRequiredCertifications = qualifications.requiredCertifications.every(
        cert => memberData.certifications.includes(cert)
      );
      if (!hasRequiredCertifications) {
        throw new Error(`Member ${memberData.name} missing required certifications for ${memberData.role}`);
      }

      const member: CommitteeMember = {
        ...memberData,
        id: memberId,
      };

      this.members.set(memberId, member);
      assignedRoles.push(memberData.role);
    }

    // Identify missing roles
    const missingRoles = requiredRoles.filter(role => !assignedRoles.includes(role));

    return {
      success: missingRoles.length === 0,
      committeeId,
      missingRoles,
    };
  }

  /**
   * Get all current committee members
   */
  async getCommitteeMembers(filter?: {
    role?: CommitteeRole;
    activeOnly?: boolean;
  }): Promise<CommitteeMember[]> {
    let members = Array.from(this.members.values());

    if (filter?.role) {
      members = members.filter(m => m.role === filter.role);
    }

    if (filter?.activeOnly) {
      members = members.filter(m => m.isActive);
    }

    return members;
  }

  /**
   * Get committee member by ID
   */
  async getMemberById(memberId: string): Promise<CommitteeMember | null> {
    return this.members.get(memberId) || null;
  }

  /**
   * Get member qualifications for a specific role
   */
  async getRoleQualifications(role: CommitteeRole): Promise<RoleQualifications | null> {
    return ROLE_QUALIFICATIONS.find(q => q.role === role) || null;
  }

  /**
   * Get all oversight areas
   */
  async getOversightAreas(filter?: {
    priority?: OversightArea['priority'];
    reviewFrequency?: OversightArea['reviewFrequency'];
  }): Promise<OversightArea[]> {
    let areas = Array.from(this.oversightAreas.values());

    if (filter?.priority) {
      areas = areas.filter(a => a.priority === filter.priority);
    }

    if (filter?.reviewFrequency) {
      areas = areas.filter(a => a.reviewFrequency === filter.reviewFrequency);
    }

    return areas;
  }

  /**
   * Get specific oversight area by ID
   */
  async getOversightAreaById(areaId: string): Promise<OversightArea | null> {
    return this.oversightAreas.get(areaId) || null;
  }

  /**
   * Schedule a committee meeting
   */
  async scheduleMeeting(meeting: Omit<CommitteeMeeting, 'id' | 'quorumPresent'>): Promise<CommitteeMeeting> {
    const id = crypto.randomUUID();
    const activeMembers = Array.from(this.members.values()).filter(m => m.isActive);
    const quorum = Math.ceil(activeMembers.length * 0.8); // 80% for governance decisions

    const fullMeeting: CommitteeMeeting = {
      ...meeting,
      id,
      quorum,
      quorumPresent: false, // Will be updated when meeting occurs
    };

    this.meetings.set(id, fullMeeting);
    return fullMeeting;
  }

  /**
   * Record meeting attendance and quorum status
   */
  async recordMeetingAttendance(
    meetingId: string,
    attendeeIds: string[]
  ): Promise<{ success: boolean; quorumMet: boolean; quorumRequired: number }> {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting not found: ${meetingId}`);
    }

    meeting.attendees = attendeeIds;
    meeting.quorumPresent = attendeeIds.length >= meeting.quorum;

    return {
      success: true,
      quorumMet: meeting.quorumPresent,
      quorumRequired: meeting.quorum,
    };
  }

  /**
   * Record a governance decision
   */
  async recordDecision(decision: Omit<GovernanceDecision, 'id'>): Promise<GovernanceDecision> {
    const id = crypto.randomUUID();
    const fullDecision: GovernanceDecision = {
      ...decision,
      id,
    };

    this.decisions.set(id, fullDecision);
    return fullDecision;
  }

  /**
   * Get governance decisions by type or date range
   */
  async getDecisions(filter?: {
    type?: GovernanceDecision['type'];
    startDate?: string;
    endDate?: string;
    status?: GovernanceDecision['status'];
  }): Promise<GovernanceDecision[]> {
    let decisions = Array.from(this.decisions.values());

    if (filter?.type) {
      decisions = decisions.filter(d => d.type === filter.type);
    }

    if (filter?.startDate) {
      decisions = decisions.filter(d => d.date >= filter.startDate!);
    }

    if (filter?.endDate) {
      decisions = decisions.filter(d => d.date <= filter.endDate!);
    }

    if (filter?.status) {
      decisions = decisions.filter(d => d.status === filter.status);
    }

    return decisions.sort((a, b) => b.date.localeCompare(a.date));
  }

  /**
   * Add a new committee member
   */
  async addMember(member: Omit<CommitteeMember, 'id'>): Promise<CommitteeMember> {
    const id = crypto.randomUUID();
    const fullMember: CommitteeMember = {
      ...member,
      id,
    };

    this.members.set(id, fullMember);
    return fullMember;
  }

  /**
   * Update committee member status
   */
  async updateMember(
    memberId: string,
    updates: Partial<CommitteeMember>
  ): Promise<CommitteeMember | null> {
    const member = this.members.get(memberId);
    if (!member) {
      return null;
    }

    const updatedMember = { ...member, ...updates };
    this.members.set(memberId, updatedMember);
    return updatedMember;
  }

  /**
   * Deactivate a committee member
   */
  async deactivateMember(memberId: string): Promise<boolean> {
    const member = this.members.get(memberId);
    if (!member) {
      return false;
    }

    member.isActive = false;
    return true;
  }

  /**
   * Check if all required committee roles are filled
   */
  async validateCommitteeComposition(): Promise<{
    isComplete: boolean;
    missingRoles: CommitteeRole[];
    memberCount: number;
  }> {
    const requiredRoles: CommitteeRole[] = [
      'CHAIR',
      'CLINICAL_LEAD',
      'COMPLIANCE_OFFICER',
      'ETHICIST',
      'PATIENT_REPRESENTATIVE'
    ];

    const activeMembers = Array.from(this.members.values()).filter(m => m.isActive);
    const assignedRoles = new Set(activeMembers.map(m => m.role));

    const missingRoles = requiredRoles.filter(role => !assignedRoles.has(role));

    return {
      isComplete: missingRoles.length === 0,
      missingRoles,
      memberCount: activeMembers.length,
    };
  }

  /**
   * Get governance committee summary report
   */
  async getCommitteeSummary(): Promise<{
    memberCount: number;
    activeMembers: number;
    oversightAreas: number;
    meetingsThisMonth: number;
    pendingDecisions: number;
    recentDecisions: GovernanceDecision[];
    committeeStatus: 'OPERATIONAL' | 'INCOMPLETE' | 'QUORUM_NOT_MET';
  }> {
    const activeMembers = Array.from(this.members.values()).filter(m => m.isActive);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    
    const meetingsThisMonth = Array.from(this.meetings.values()).filter(
      m => m.scheduledDate >= startOfMonth
    ).length;

    const pendingDecisions = Array.from(this.decisions.values()).filter(
      d => d.status === 'PENDING' || d.status === 'IN_PROGRESS'
    ).length;

    const recentDecisions = Array.from(this.decisions.values())
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);

    const composition = await this.validateCommitteeComposition();
    const committeeStatus: 'OPERATIONAL' | 'INCOMPLETE' | 'QUORUM_NOT_MET' = 
      !composition.isComplete ? 'INCOMPLETE' : 
      activeMembers.length < 4 ? 'QUORUM_NOT_MET' : 
      'OPERATIONAL';

    return {
      memberCount: this.members.size,
      activeMembers: activeMembers.length,
      oversightAreas: this.oversightAreas.size,
      meetingsThisMonth,
      pendingDecisions,
      recentDecisions,
      committeeStatus,
    };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const governanceCommitteeService = new GovernanceCommitteeService();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Initialize the governance committee with required members
 */
export async function initializeCommittee(
  initialMembers: Omit<CommitteeMember, 'id'>[]
): Promise<ReturnType<GovernanceCommitteeService['initializeCommittee']>> {
  return governanceCommitteeService.initializeCommittee(initialMembers);
}

/**
 * Get all current committee members
 */
export async function getCommitteeMembers(
  filter?: Parameters<GovernanceCommitteeService['getCommitteeMembers']>[0]
): Promise<ReturnType<GovernanceCommitteeService['getCommitteeMembers']>> {
  return governanceCommitteeService.getCommitteeMembers(filter);
}

/**
 * Get committee members for a specific role
 */
export async function getMembersByRole(
  role: CommitteeRole
): Promise<CommitteeMember[]> {
  return governanceCommitteeService.getCommitteeMembers({ role, activeOnly: true });
}

/**
 * Get oversight areas managed by the committee
 */
export async function getOversightAreas(
  filter?: Parameters<GovernanceCommitteeService['getOversightAreas']>[0]
): Promise<ReturnType<GovernanceCommitteeService['getOversightAreas']>> {
  return governanceCommitteeService.getOversightAreas(filter);
}

/**
 * Get committee governance summary
 */
export async function getCommitteeSummary(): Promise<ReturnType<GovernanceCommitteeService['getCommitteeSummary']>> {
  return governanceCommitteeService.getCommitteeSummary();
}

/**
 * Check if committee can make decisions (has quorum)
 */
export async function hasQuorum(): Promise<boolean> {
  const summary = await governanceCommitteeService.getCommitteeSummary();
  return summary.committeeStatus === 'OPERATIONAL';
}

/**
 * HIPAA-Compliant Audit Logging Service
 * 
 * Centralized audit logging for all safety events including:
 * - PHI detection and blocking
 * - Injection detection and blocking
 * - Intent classification events
 * - Groundedness scoring
 * - Citation verification
 * - System prompt isolation violations
 */

import { createClient } from '@supabase/supabase-js';
import { DetectedPHI } from '@/safety/phi/detector';
import { InjectionPattern } from '@/safety/injection/detector';
import { IntentType } from '@/safety/intent';
import { GroundednessScore } from '@/safety/grounding/scorer';
import { Citation } from '@/safety/citation/generator';
import { IsolationViolation } from '@/safety/system-prompt/isolator';

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Initialize Supabase client for audit logging
const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

/**
 * Safety-specific audit event types
 */
export type SafetyAuditEvent =
  | { type: 'PHI_DETECTED'; input_hash: string; entities: DetectedPHI[]; blocked: boolean; org_id: string }
  | { type: 'PHI_BLOCKED'; input_hash: string; entities: DetectedPHI[]; org_id: string }
  | { type: 'INJECTION_DETECTED'; input_hash: string; patterns: InjectionPattern[]; org_id: string }
  | { type: 'INJECTION_BLOCKED'; input_hash: string; patterns: InjectionPattern[]; org_id: string }
  | { type: 'INTENT_CLASSIFIED'; input_hash: string; intent: IntentType; confidence: number; org_id: string }
  | { type: 'GROUNDEDNESS_SCORED'; score: GroundednessScore; allowed: boolean; query_hash: string; org_id: string }
  | { type: 'NO_RESPONSE_TRIGGERED'; query_hash: string; reason: string; groundedness: number; org_id: string }
  | { type: 'CITATION_VERIFIED'; citation: Citation; verified: boolean; similarity: number; org_id: string }
  | { type: 'SYSTEM_PROMPT_ISOLATED'; violations: IsolationViolation[]; query_hash: string; org_id: string }
  | { type: 'CHAT_REQUEST_PROCESSED'; query_hash: string; allowed: boolean; safety_violations: string[]; org_id: string }
  | { type: 'RESPONSE_GENERATED'; query_hash: string; citations_count: number; groundedness_score: number; org_id: string };

/**
 * Generic audit event interface
 */
export interface AuditEvent {
  id?: string;
  event_type: string;
  organization_id: string;
  user_id?: string;
  resource_type?: string;
  resource_id?: string;
  action: string;
  details: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  timestamp: string;
  success: boolean;
  error_message?: string;
}

/**
 * Audit filters for querying events
 */
export interface AuditFilters {
  organizationId?: string;
  userId?: string;
  eventTypes?: string[];
  startDate?: Date;
  endDate?: Date;
  success?: boolean;
}

/**
 * Date range for queries
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * AuditService class for HIPAA-compliant logging
 */
export class AuditService {
  private supabaseClient: ReturnType<typeof createClient> | null;

  constructor(supabaseClient?: ReturnType<typeof createClient> | null) {
    this.supabaseClient = supabaseClient || supabase;
  }

  /**
   * Log PHI detection event
   */
  async logPHIDetected(input: string, entities: DetectedPHI[], blocked: boolean, orgId: string): Promise<void> {
    const event: SafetyAuditEvent = {
      type: 'PHI_DETECTED',
      input_hash: this.hashInput(input),
      entities,
      blocked,
      org_id: orgId
    };

    await this.logEvent({
      event_type: 'safety_phi_detected',
      organization_id: orgId,
      action: blocked ? 'phi_blocked' : 'phi_detected',
      details: {
        input_hash: event.input_hash,
        entity_types: entities.map(e => e.type),
        entity_count: entities.length,
        blocked: event.blocked
      },
      timestamp: new Date().toISOString(),
      success: true
    });
  }

  /**
   * Log PHI blocking event
   */
  async logPHIBlocked(input: string, entities: DetectedPHI[], orgId: string): Promise<void> {
    await this.logPHIDetected(input, entities, true, orgId);
  }

  /**
   * Log injection detection event
   */
  async logInjectionDetected(input: string, patterns: InjectionPattern[], orgId: string): Promise<void> {
    const event: SafetyAuditEvent = {
      type: 'INJECTION_DETECTED',
      input_hash: this.hashInput(input),
      patterns,
      org_id: orgId
    };

    await this.logEvent({
      event_type: 'safety_injection_detected',
      organization_id: orgId,
      action: 'injection_detected',
      details: {
        input_hash: event.input_hash,
        pattern_types: patterns.map(p => p.type),
        pattern_count: patterns.length,
        severity: patterns.reduce((max, p) => p.severity === 'critical' ? 'critical' : max, 'high')
      },
      timestamp: new Date().toISOString(),
      success: true
    });
  }

  /**
   * Log injection blocking event
   */
  async logInjectionBlocked(input: string, patterns: InjectionPattern[], orgId: string): Promise<void> {
    const event: SafetyAuditEvent = {
      type: 'INJECTION_BLOCKED',
      input_hash: this.hashInput(input),
      patterns,
      org_id: orgId
    };

    await this.logEvent({
      event_type: 'safety_injection_blocked',
      organization_id: orgId,
      action: 'injection_blocked',
      details: {
        input_hash: event.input_hash,
        pattern_types: patterns.map(p => p.type),
        pattern_count: patterns.length
      },
      timestamp: new Date().toISOString(),
      success: true
    });
  }

  /**
   * Log intent classification event
   */
  async logIntentClassified(input: string, intent: IntentType, confidence: number, orgId: string): Promise<void> {
    const event: SafetyAuditEvent = {
      type: 'INTENT_CLASSIFIED',
      input_hash: this.hashInput(input),
      intent,
      confidence,
      org_id: orgId
    };

    await this.logEvent({
      event_type: 'safety_intent_classified',
      organization_id: orgId,
      action: 'intent_classified',
      details: {
        input_hash: event.input_hash,
        intent_type: event.intent,
        confidence: event.confidence,
        is_personal_health: intent === 'personal_health'
      },
      timestamp: new Date().toISOString(),
      success: true
    });
  }

  /**
   * Log groundedness scoring event
   */
  async logGroundednessScored(score: GroundednessScore, allowed: boolean, queryHash: string, orgId: string): Promise<void> {
    const event: SafetyAuditEvent = {
      type: 'GROUNDEDNESS_SCORED',
      score,
      allowed,
      query_hash: queryHash,
      org_id: orgId
    };

    await this.logEvent({
      event_type: 'safety_groundedness_scored',
      organization_id: orgId,
      action: allowed ? 'groundedness_passed' : 'groundedness_failed',
      details: {
        query_hash: event.query_hash,
        overall_score: score.overall,
        coverage: score.coverage,
        relevance: score.relevance,
        accuracy: score.accuracy,
        verification: score.verification,
        allowed: event.allowed
      },
      timestamp: new Date().toISOString(),
      success: true
    });
  }

  /**
   * Log no-response triggered event
   */
  async logNoResponseTriggered(query: string, reason: string, groundedness: number, orgId: string): Promise<void> {
    const event: SafetyAuditEvent = {
      type: 'NO_RESPONSE_TRIGGERED',
      query_hash: this.hashInput(query),
      reason,
      groundedness,
      org_id: orgId
    };

    await this.logEvent({
      event_type: 'safety_no_response',
      organization_id: orgId,
      action: 'no_response_triggered',
      details: {
        query_hash: event.query_hash,
        reason: event.reason,
        groundedness_score: event.groundedness
      },
      timestamp: new Date().toISOString(),
      success: true
    });
  }

  /**
   * Log citation verification event
   */
  async logCitationVerified(citation: Citation, verified: boolean, similarity: number, orgId: string): Promise<void> {
    const event: SafetyAuditEvent = {
      type: 'CITATION_VERIFIED',
      citation,
      verified,
      similarity,
      org_id: orgId
    };

    await this.logEvent({
      event_type: 'safety_citation_verified',
      organization_id: orgId,
      action: verified ? 'citation_verified' : 'citation_failed',
      details: {
        citation_id: citation.id,
        similarity_score: event.similarity,
        verified: event.verified,
        chunk_id: citation.chunkId
      },
      timestamp: new Date().toISOString(),
      success: true
    });
  }

  /**
   * Log system prompt isolation event
   */
  async logSystemPromptIsolated(violations: IsolationViolation[], queryHash: string, orgId: string): Promise<void> {
    const event: SafetyAuditEvent = {
      type: 'SYSTEM_PROMPT_ISOLATED',
      violations,
      query_hash: queryHash,
      org_id: orgId
    };

    await this.logEvent({
      event_type: 'safety_system_prompt_isolated',
      organization_id: orgId,
      action: violations.length > 0 ? 'isolation_violations_found' : 'isolation_clean',
      details: {
        query_hash: event.query_hash,
        violation_count: violations.length,
        violation_types: [...new Set(violations.map(v => v.type))],
        critical_violations: violations.filter(v => v.severity === 'critical').length
      },
      timestamp: new Date().toISOString(),
      success: true
    });
  }

  /**
   * Log complete chat request processing
   */
  async logChatRequestProcessed(
    query: string,
    allowed: boolean,
    safetyViolations: string[],
    orgId: string
  ): Promise<void> {
    const event: SafetyAuditEvent = {
      type: 'CHAT_REQUEST_PROCESSED',
      query_hash: this.hashInput(query),
      allowed,
      safety_violations: safetyViolations,
      org_id: orgId
    };

    await this.logEvent({
      event_type: 'chat_request_processed',
      organization_id: orgId,
      action: allowed ? 'request_allowed' : 'request_blocked',
      details: {
        query_hash: event.query_hash,
        allowed: event.allowed,
        safety_violations: event.safety_violations,
        violations_count: safetyViolations.length
      },
      timestamp: new Date().toISOString(),
      success: true
    });
  }

  /**
   * Log response generation event
   */
  async logResponseGenerated(
    query: string,
    citationsCount: number,
    groundednessScore: number,
    orgId: string
  ): Promise<void> {
    const event: SafetyAuditEvent = {
      type: 'RESPONSE_GENERATED',
      query_hash: this.hashInput(query),
      citations_count: citationsCount,
      groundedness_score: groundednessScore,
      org_id: orgId
    };

    await this.logEvent({
      event_type: 'response_generated',
      organization_id: orgId,
      action: 'response_generated',
      details: {
        query_hash: event.query_hash,
        citations_count: event.citations_count,
        groundedness_score: event.groundedness_score
      },
      timestamp: new Date().toISOString(),
      success: true
    });
  }

  /**
   * Query safety events with filters
   */
  async getSafetyEvents(filters: AuditFilters): Promise<SafetyAuditEvent[]> {
    if (!this.supabaseClient) {
      console.log('AuditService: Supabase client not configured, returning empty results');
      return [];
    }

    let query = this.supabaseClient
      .from('audit_log')
      .select('*')
      .eq('organization_id', filters.organizationId);

    if (filters.eventTypes && filters.eventTypes.length > 0) {
      query = query.in('event_type', filters.eventTypes);
    }

    if (filters.startDate) {
      query = query.gte('timestamp', filters.startDate.toISOString());
    }

    if (filters.endDate) {
      query = query.lte('timestamp', filters.endDate.toISOString());
    }

    if (filters.success !== undefined) {
      query = query.eq('success', filters.success);
    }

    const { data, error } = await query.order('timestamp', { ascending: false });

    if (error) {
      console.error('AuditService: Error fetching safety events:', error);
      return [];
    }

    return (data || []).map(event => this.parseSafetyEvent(event));
  }

  /**
   * Get PHI blocked events for date range
   */
  async getPHIBlockedEvents(dateRange: DateRange): Promise<AuditEvent[]> {
    return this.getSafetyEvents({
      eventTypes: ['safety_phi_blocked', 'safety_phi_detected'],
      startDate: dateRange.start,
      endDate: dateRange.end,
      success: true
    }) as Promise<AuditEvent[]>;
  }

  /**
   * Get injection blocked events for date range
   */
  async getInjectionBlockedEvents(dateRange: DateRange): Promise<AuditEvent[]> {
    return this.getSafetyEvents({
      eventTypes: ['safety_injection_blocked', 'safety_injection_detected'],
      startDate: dateRange.start,
      endDate: dateRange.end,
      success: true
    }) as Promise<AuditEvent[]>;
  }

  /**
   * Get safety statistics for dashboard
   */
  async getSafetyStats(orgId: string, days: number = 30): Promise<{
    phiBlocked: number;
    injectionBlocked: number;
    noResponseTriggered: number;
    avgGroundedness: number;
  }> {
    if (!this.supabaseClient) {
      return { phiBlocked: 0, injectionBlocked: 0, noResponseTriggered: 0, avgGroundedness: 0 };
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [phiResult, injectionResult, noResponseResult, groundingResult] = await Promise.all([
      this.supabaseClient
        .from('audit_log')
        .count()
        .eq('organization_id', orgId)
        .eq('event_type', 'safety_phi_blocked')
        .gte('timestamp', startDate.toISOString()),
      
      this.supabaseClient
        .from('audit_log')
        .count()
        .eq('organization_id', orgId)
        .eq('event_type', 'safety_injection_blocked')
        .gte('timestamp', startDate.toISOString()),
      
      this.supabaseClient
        .from('audit_log')
        .count()
        .eq('organization_id', orgId)
        .eq('event_type', 'safety_no_response')
        .gte('timestamp', startDate.toISOString()),
      
      this.supabaseClient
        .from('audit_log')
        .select('details')
        .eq('organization_id', orgId)
        .eq('event_type', 'safety_groundedness_scored')
        .gte('timestamp', startDate.toISOString())
    ]);

    const groundingScores = groundingResult.data
      ?.map(d => (d.details as Record<string, unknown>)?.overall_score as number || 0)
      .filter(s => s > 0) || [];

    const avgGroundedness = groundingScores.length > 0
      ? groundingScores.reduce((a, b) => a + b, 0) / groundingScores.length
      : 0;

    return {
      phiBlocked: phiResult.count || 0,
      injectionBlocked: injectionResult.count || 0,
      noResponseTriggered: noResponseResult.count || 0,
      avgGroundedness: Math.round(avgGroundedness * 100) / 100
    };
  }

  /**
   * Core logging method
   */
  private async logEvent(event: Omit<AuditEvent, 'id'>): Promise<void> {
    if (!this.supabaseClient) {
      console.log('AuditService: Logging event (Supabase not configured):', event.event_type);
      return;
    }

    const { error } = await this.supabaseClient
      .from('audit_log')
      .insert(event);

    if (error) {
      console.error('AuditService: Failed to log event:', error);
      // Don't throw - audit logging should not break main functionality
    }
  }

  /**
   * Hash input for secure logging (never log PHI values)
   */
  private hashInput(input: string): string {
    // Simple hash for audit logging - in production, use crypto.createHash
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Parse raw database event to SafetyAuditEvent
   */
  private parseSafetyEvent(event: Record<string, unknown>): SafetyAuditEvent {
    const baseEvent = event as Record<string, unknown>;
    
    switch (event.event_type) {
      case 'safety_phi_detected':
      case 'safety_phi_blocked':
        return {
          type: 'PHI_DETECTED',
          input_hash: (baseEvent.details as Record<string, unknown>)?.input_hash as string,
          entities: [],
          blocked: (baseEvent.action as string)?.includes('blocked') || false,
          org_id: event.organization_id as string
        };
      
      case 'safety_injection_detected':
      case 'safety_injection_blocked':
        return {
          type: 'INJECTION_DETECTED',
          input_hash: (baseEvent.details as Record<string, unknown>)?.input_hash as string,
          patterns: [],
          org_id: event.organization_id as string
        };
      
      case 'safety_intent_classified':
        return {
          type: 'INTENT_CLASSIFIED',
          input_hash: (baseEvent.details as Record<string, unknown>)?.input_hash as string,
          intent: (baseEvent.details as Record<string, unknown>)?.intent_type as IntentType,
          confidence: (baseEvent.details as Record<string, unknown>)?.confidence as number,
          org_id: event.organization_id as string
        };
      
      case 'safety_groundedness_scored':
        return {
          type: 'GROUNDEDNESS_SCORED',
          score: {
            overall: (baseEvent.details as Record<string, unknown>)?.overall_score as number,
            coverage: (baseEvent.details as Record<string, unknown>)?.coverage as number,
            relevance: (baseEvent.details as Record<string, unknown>)?.relevance as number,
            accuracy: (baseEvent.details as Record<string, unknown>)?.accuracy as number,
            verification: (baseEvent.details as Record<string, unknown>)?.verification as number,
            breakdown: {}
          },
          allowed: (baseEvent.details as Record<string, unknown>)?.allowed as boolean,
          query_hash: (baseEvent.details as Record<string, unknown>)?.query_hash as string,
          org_id: event.organization_id as string
        };
      
      default:
        return {
          type: 'CHAT_REQUEST_PROCESSED',
          query_hash: (baseEvent.details as Record<string, unknown>)?.query_hash as string,
          allowed: (baseEvent.details as Record<string, unknown>)?.allowed as boolean,
          safety_violations: [],
          org_id: event.organization_id as string
        };
    }
  }
}

/**
 * Singleton instance for audit service
 */
export const auditService = new AuditService();

/**
 * Type exports for other modules
 */
export type { AuditEvent, AuditFilters, DateRange } from '@/lib/audit';

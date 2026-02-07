/**
 * Groundedness Validator Service
 * Healthcare AI Assistant - HIPAA-Aware RAG
 * 
 * Validates groundedness scores and determines if responses should be provided.
 * Implements no-response pathway with helpful suggestions when grounding is insufficient.
 */

import { 
  GroundednessScore, 
  ValidationResult,
  ConfidenceIndicator,
  GroundednessInput
} from '../../types/safety';
import { GroundednessScorer } from './scorer';
import { ChunkResult } from '../../types/safety';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_GROUNDEDNESS_THRESHOLD = 0.7;
const CONFIDENCE_THRESHOLDS = {
  high: 0.8,
  medium: 0.6
};

// ============================================================================
// No-Response Message Templates
// ============================================================================

const NO_RESPONSE_MESSAGES = {
  insufficient_evidence: "I don't have sufficient evidence to answer this question about {topic}.",
  low_relevance: "I found some information but it's not sufficiently relevant to your question.",
  unverified_claims: "I cannot verify all the claims in my response, so I'm unable to provide an answer.",
  no_sources: "I don't have any relevant documents to answer this question.",
  general: "I don't have sufficient evidence to answer this question."
};

const SUGGESTION_TEMPLATES = [
  "Try rephrasing your question with more clinical terminology.",
  "Consider asking about general protocols rather than specific symptoms.",
  "Review available documents and ask about specific topics covered.",
  "Try asking about evidence-based guidelines for this topic.",
  "Consider breaking your question into smaller, more specific parts."
];

// ============================================================================
// GroundednessValidator Service
// 
// Validates groundedness and determines response eligibility.
// Ensures clinical responses meet minimum groundedness threshold (0.7).
// ============================================================================

export class GroundednessValidator {
  private scorer: GroundednessScorer;
  private threshold: number;
  private noResponseTemplates: Record<string, string>;

  /**
   * Create a new GroundednessValidator
   * @param scorer - Optional GroundednessScorer instance (creates default if not provided)
   * @param threshold - Minimum groundedness threshold (default: 0.7)
   */
  constructor(scorer?: GroundednessScorer, threshold?: number) {
    this.scorer = scorer || new GroundednessScorer();
    this.threshold = threshold ?? DEFAULT_GROUNDEDNESS_THRESHOLD;
    this.noResponseTemplates = NO_RESPONSE_MESSAGES;
  }

  /**
   * Validate groundedness and determine if response should be provided
   * 
   * @param input - Response content, citations, retrieval results, and verification status
   * @returns ValidationResult with allowed status, groundedness score, confidence, and suggestions
   */
  validate(input: GroundednessInput): ValidationResult {
    // Calculate groundedness score
    const groundedness = this.scorer.score(input);

    // Determine if response should be allowed
    const allowed = this.shouldRespond(groundedness);

    // Calculate confidence indicator
    const confidence = this.calculateConfidence(groundedness);

    // If not allowed, generate no-response message and suggestions
    let noResponseMessage: string | undefined;
    let suggestions: string[] | undefined;

    if (!allowed) {
      noResponseMessage = this.getNoResponseMessage(input.responseContent, groundedness);
      suggestions = this.getSuggestions(input.retrievalResults, input.responseContent);
    }

    return {
      allowed,
      groundedness,
      confidence,
      noResponseMessage,
      suggestions
    };
  }

  /**
   * Determine if response should be provided based on groundedness score
   * 
   * @param score - GroundednessScore to evaluate
   * @returns true if groundedness >= threshold (0.7 by default)
   */
  shouldRespond(score: GroundednessScore): boolean {
    return score.overall >= this.threshold;
  }

  /**
   * Get helpful no-response message when grounding is insufficient
   * 
   * @param query - Original user query
   * @param groundedness - GroundednessScore explaining why response was blocked
   * @returns Human-friendly message explaining why response cannot be provided
   */
  getNoResponseMessage(query: string, groundedness: GroundednessScore): string {
    // Determine the primary reason for blocking
    const reasons: string[] = [];

    if (groundedness.coverage < this.threshold) {
      reasons.push('insufficient citations');
    }

    if (groundedness.relevance < this.threshold) {
      reasons.push('low relevance of retrieved information');
    }

    if (groundedness.accuracy < this.threshold) {
      reasons.push('unverified claims');
    }

    if (groundedness.overall < this.threshold) {
      reasons.push('overall groundedness below threshold');
    }

    // Extract topic from query (simple heuristic: first significant noun phrase)
    const topic = this.extractTopic(query);

    // Generate message based on primary reason
    if (reasons.length === 1) {
      const reason = reasons[0];
      if (reason === 'insufficient citations') {
        return `I don't have enough supporting evidence to answer this question about ${topic}.`;
      } else if (reason === 'low relevance of retrieved information') {
        return `I found some information but it's not relevant enough to answer your question about ${topic}.`;
      } else if (reason === 'unverified claims') {
        return `I cannot verify the accuracy of my response about ${topic}, so I'm unable to provide an answer.`;
      }
    }

    // Default to general message for multiple reasons
    return `I don't have sufficient evidence to answer this question about ${topic}. ${reasons.length > 1 ? 'The retrieved information was insufficient and not fully verified.' : ''}`;
  }

  /**
   * Generate suggestions for improving query to get better results
   * 
   * @param retrievalResults - Results from RAG retrieval
   * @param query - Original user query
   * @returns Array of suggestions for query rephrasing
   */
  getSuggestions(retrievalResults: ChunkResult[], query: string): string[] {
    const suggestions: string[] = [];

    // Add general suggestions
    suggestions.push(SUGGESTION_TEMPLATES[0]); // Clinical terminology
    suggestions.push(SUGGESTION_TEMPLATES[2]); // Review available documents

    // If no results found
    if (retrievalResults.length === 0) {
      suggestions.push("No relevant documents were found. Try asking about topics that might be covered in your documents.");
    }

    // If low relevance results
    const avgRelevance = retrievalResults.length > 0
      ? retrievalResults.reduce((sum, r) => sum + r.relevanceScore, 0) / retrievalResults.length
      : 0;

    if (avgRelevance < 0.5) {
      suggestions.push("The retrieved information had low relevance. Try using different clinical terms.");
      suggestions.push(SUGGESTION_TEMPLATES[3]); // Evidence-based guidelines
    }

    // If personal health indicators detected
    const personalHealthPatterns = [
      'my symptoms', 'i feel', 'should i take', 'is it safe for me',
      'my condition', 'what should i do'
    ];

    const normalizedQuery = query.toLowerCase();
    if (personalHealthPatterns.some(p => normalizedQuery.includes(p))) {
      suggestions.push("For personal medical advice, please consult a healthcare professional.");
      suggestions.push(SUGGESTION_TEMPLATES[1]); // General protocols vs symptoms
    }

    // Limit to 3 suggestions
    return suggestions.slice(0, 3);
  }

  /**
   * Calculate confidence indicator based on groundedness score
   * 
   * @param score - GroundednessScore to evaluate
   * @returns ConfidenceIndicator with level (high/medium/low), score, and factors
   */
  calculateConfidence(score: GroundednessScore): ConfidenceIndicator {
    const factors: string[] = [];

    // Determine confidence level
    let level: 'high' | 'medium' | 'low';
    let confidenceScore: number;

    if (score.overall >= CONFIDENCE_THRESHOLDS.high) {
      level = 'high';
      confidenceScore = score.overall;
    } else if (score.overall >= CONFIDENCE_THRESHOLDS.medium) {
      level = 'medium';
      confidenceScore = score.overall;
    } else {
      level = 'low';
      confidenceScore = score.overall;
    }

    // Add contributing factors
    if (score.coverage >= 0.7) {
      factors.push('well-cited claims');
    }

    if (score.relevance >= 0.7) {
      factors.push('highly relevant sources');
    }

    if (score.accuracy >= 0.7) {
      factors.push('verified information');
    }

    if (score.verification >= 0.7) {
      factors.push('verified citations');
    }

    // Add warning factors for lower confidence
    if (score.coverage < 0.5) {
      factors.push('limited citations');
    }

    if (score.relevance < 0.5) {
      factors.push('low relevance');
    }

    if (score.accuracy < 0.5) {
      factors.push('unverified claims');
    }

    return {
      level,
      score: Math.round(score.overall * 100) / 100,
      factors
    };
  }

  /**
   * Extract topic from query for message generation
   */
   private extractTopic(query: string): string {
    // Simple topic extraction: take first 5-10 words
    const words = query.split(' ').slice(0, 10);
    
    // Filter out question words
    const skipWords = ['what', 'how', 'why', 'when', 'where', 'who', 'is', 'are', 'can', 'could', 'should', 'would'];
    const meaningfulWords = words.filter(w => !skipWords.includes(w.toLowerCase()));

    if (meaningfulWords.length === 0) {
      return 'this topic';
    }

    return meaningfulWords.join(' ').toLowerCase().replace(/[^\w\s]/g, '');
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const groundednessValidator = new GroundednessValidator();

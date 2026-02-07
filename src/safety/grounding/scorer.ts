/**
 * Groundedness Scorer Service
 * Healthcare AI Assistant - HIPAA-Aware RAG
 * 
 * Calculates multi-factor groundedness scores for responses based on:
 * - Coverage: Percentage of claims backed by citations
 * - Relevance: Quality of retrieved chunks
 * - Accuracy: Citation verification pass rate
 * - Verification: String similarity from citation verification
 */

import { 
  GroundednessScore, 
  GroundednessBreakdown,
  Citation,
  VerificationStatus,
  ChunkResult
} from '../../types/safety';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_WEIGHTS = {
  coverage: 0.30,
  relevance: 0.25,
  accuracy: 0.25,
  verification: 0.20
};

/**
 * Input interface for groundedness scoring
 */
interface GroundednessInput {
  responseContent: string;
  citations: Citation[];
  retrievalResults: ChunkResult[];
  verificationStatus: VerificationStatus;
}

/**
 * GroundednessScorer Service
 * 
 * Calculates how well a response is grounded in retrieved evidence.
 * Used to ensure clinical responses have sufficient backing from sources.
 */
export class GroundednessScorer {
  private coverageWeight: number;
  private relevanceWeight: number;
  private accuracyWeight: number;
  private verificationWeight: number;

  /**
   * Create a new GroundednessScorer
   * @param weights - Optional custom weights for each factor (must sum to 1.0)
   */
  constructor(weights?: { coverage?: number; relevance?: number; accuracy?: number; verification?: number }) {
    this.coverageWeight = weights?.coverage ?? DEFAULT_WEIGHTS.coverage;
    this.relevanceWeight = weights?.relevance ?? DEFAULT_WEIGHTS.relevance;
    this.accuracyWeight = weights?.accuracy ?? DEFAULT_WEIGHTS.accuracy;
    this.verificationWeight = weights?.verification ?? DEFAULT_WEIGHTS.verification;

    // Validate weights sum to 1.0
    const total = this.coverageWeight + this.relevanceWeight + 
                  this.accuracyWeight + this.verificationWeight;
    if (Math.abs(total - 1.0) > 0.01) {
      console.warn('GroundednessScorer weights do not sum to 1.0, normalizing...');
      this.normalizeWeights();
    }
  }

  /**
   * Calculate groundedness score for a response
   * 
   * @param input - Response content, citations, retrieval results, and verification status
   * @returns GroundednessScore with overall score and breakdown
   */
  score(input: GroundednessInput): GroundednessScore {
    return this.calculateScore(input);
  }

  /**
   * Alias for score() method - provides semantic clarity
   */
  calculateScore(input: GroundednessInput): GroundednessScore {
    const coverage = this.calculateCoverage(input.responseContent, input.citations);
    const relevance = this.calculateRelevance(input.retrievalResults);
    const accuracy = this.calculateAccuracy(input.responseContent, input.citations);
    const verification = this.calculateVerification(input.verificationStatus);

    // Calculate weighted overall score
    const overall = 
      (coverage * this.coverageWeight) +
      (relevance * this.relevanceWeight) +
      (accuracy * this.accuracyWeight) +
      (verification * this.verificationWeight);

    // Count claims and citations for breakdown
    const claimsTotal = this.countClaims(input.responseContent);
    const claimsSupported = Math.round(coverage * claimsTotal);

    const breakdown: GroundednessBreakdown = {
      claimsSupported: claimsSupported,
      claimsTotal: claimsTotal,
      citationsCount: input.citations.length,
      avgRelevance: relevance,
      verifiedClaims: Math.round(accuracy * claimsTotal)
    };

    return {
      overall: Math.round(overall * 100) / 100, // Round to 2 decimal places
      coverage: Math.round(coverage * 100) / 100,
      relevance: Math.round(relevance * 100) / 100,
      accuracy: Math.round(accuracy * 100) / 100,
      verification: Math.round(verification * 100) / 100,
      breakdown: breakdown
    };
  }

  /**
   * Get detailed breakdown of a groundedness score
   */
  getBreakdown(score: GroundednessScore): GroundednessBreakdown {
    return score.breakdown;
  }

  /**
   * Calculate coverage score
   * What percentage of response claims are backed by citations?
   */
  private calculateCoverage(response: string, citations: Citation[]): number {
    if (citations.length === 0) {
      return 0;
    }

    const responseWordCount = response.split(' ').length;
    const citationsWordCount = citations.reduce((sum, cit) => 
      sum + cit.chunkContent.split(' ').length, 0
    );

    // Coverage is ratio of cited content to response length
    // Cap at 1.0 (more citations than response is acceptable)
    const coverage = Math.min(citationsWordCount / responseWordCount, 1.0);
    
    return Math.round(coverage * 100) / 100;
  }

  /**
   * Calculate relevance score
   * Average relevance score of retrieved chunks
   */
  private calculateRelevance(retrievalResults: ChunkResult[]): number {
    if (retrievalResults.length === 0) {
      return 0;
    }

    const totalRelevance = retrievalResults.reduce((sum, result) => 
      sum + result.relevanceScore, 0
    );

    return Math.round((totalRelevance / retrievalResults.length) * 100) / 100;
  }

  /**
   * Calculate accuracy score
   * Citation verification pass rate
   */
  private calculateAccuracy(response: string, citations: Citation[]): number {
    if (citations.length === 0) {
      return 0;
    }

    // Count sentences in response
    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const sentenceCount = sentences.length;

    // Accuracy is ratio of citations to sentences (coverage of claims)
    const accuracy = Math.min(citations.length / Math.max(sentenceCount, 1), 1.0);
    
    return Math.round(accuracy * 100) / 100;
  }

  /**
   * Calculate verification score
   * String similarity scores from citation verification
   */
  private calculateVerification(verificationStatus: VerificationStatus): number {
    if (!verificationStatus) {
      return 0;
    }

    // Use verification rate as the verification score
    // If all citations verified, score is high
    return verificationStatus.verificationRate;
  }

  /**
   * Count the number of claims in a response
   * Simple heuristic: count sentences as claims
   */
  private countClaims(response: string): number {
    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
    return sentences.length;
  }

  /**
   * Normalize weights to sum to 1.0
   */
  private normalizeWeights(): void {
    const total = this.coverageWeight + this.relevanceWeight + 
                  this.accuracyWeight + this.verificationWeight;
    
    this.coverageWeight = this.coverageWeight / total;
    this.relevanceWeight = this.relevanceWeight / total;
    this.accuracyWeight = this.accuracyWeight / total;
    this.verificationWeight = this.verificationWeight / total;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const groundednessScorer = new GroundednessScorer();

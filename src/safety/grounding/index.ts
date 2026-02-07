/**
 * Groundedness Scoring Public API
 * Healthcare AI Assistant - HIPAA-Aware RAG
 * 
 * Provides convenient exports and utility functions for groundedness validation.
 */

// Core scorer and validator
export { GroundednessScorer, groundednessScorer } from './scorer';
export { GroundednessValidator, groundednessValidator } from './validator';

// Types
export { 
  GroundednessScore, 
  GroundednessBreakdown,
  ValidationResult,
  ConfidenceIndicator,
  GroundednessInput 
} from '../../types/safety';

/**
 * Convenience function for full groundedness validation workflow
 * 
 * @param responseContent - Generated response to validate
 * @param citations - Citations used in response
 * @param retrievalResults - RAG retrieval results
 * @param verificationStatus - Citation verification status
 * @returns ValidationResult with allowed status, groundedness score, and suggestions
 */
export function validateGroundedness(
  responseContent: string,
  citations: any[],
  retrievalResults: any[],
  verificationStatus: any
): ValidationResult {
  const validator = new GroundednessValidator();
  return validator.validate({
    responseContent,
    citations,
    retrievalResults,
    verificationStatus
  });
}

/**
 * Check if response has sufficient grounding for clinical use
 * 
 * @param score - GroundednessScore to evaluate
 * @returns true if groundedness >= 0.7 threshold
 */
export function hasSufficientGrounding(score: GroundednessScore): boolean {
  const validator = new GroundednessValidator();
  return validator.shouldRespond(score);
}

/**
 * Get confidence level for a groundedness score
 * 
 * @param score - GroundednessScore to evaluate
 * @returns ConfidenceIndicator with level, score, and factors
 */
export function getConfidenceIndicator(score: GroundednessScore): ConfidenceIndicator {
  const validator = new GroundednessValidator();
  return validator.calculateConfidence(score);
}

/**
 * Generate no-response message for insufficient grounding
 * 
 * @param query - Original user query
 * @param groundedness - GroundednessScore explaining why response was blocked
 * @returns Human-friendly message explaining why response cannot be provided
 */
export function getNoResponseMessage(query: string, groundedness: GroundednessScore): string {
  const validator = new GroundednessValidator();
  return validator.getNoResponseMessage(query, groundedness);
}

/**
 * Generate suggestions for improving query based on retrieval results
 * 
 * @param retrievalResults - Results from RAG retrieval
 * @param query - Original user query
 * @returns Array of suggestions for query rephrasing
 */
export function getRephrasingSuggestions(retrievalResults: any[], query: string): string[] {
  const validator = new GroundednessValidator();
  return validator.getSuggestions(retrievalResults, query);
}

/**
 * Calculate groundedness score for a response
 * 
 * @param responseContent - Generated response to score
 * @param citations - Citations used in response
 * @param retrievalResults - RAG retrieval results
 * @param verificationStatus - Citation verification status
 * @returns GroundednessScore with overall score and breakdown
 */
export function calculateGroundednessScore(
  responseContent: string,
  citations: any[],
  retrievalResults: any[],
  verificationStatus: any
): GroundednessScore {
  const scorer = new GroundednessScorer();
  return scorer.score({
    responseContent,
    citations,
    retrievalResults,
    verificationStatus
  });
}

/**
 * Intent Classification Public API
 * Healthcare AI Assistant - HIPAA-Aware RAG
 * 
 * Provides convenient exports and utility functions for intent classification.
 */

// Core classifier
export { IntentClassifier, intentClassifier } from './classifier';

// Types
export { IntentType, IntentClassification } from '../../types/safety';

/**
 * Convenience function for full intent classification workflow
 * 
 * @param query - User query to classify
 * @returns IntentClassification with intent type and confidence
 */
export function classifyIntent(query: string): IntentClassification {
  return intentClassifier.classify(query);
}

/**
 * Check if a query is requesting personal health advice
 * Used to block harmful personal medical advice
 * 
 * @param query - User query to check
 * @returns true if query appears to be personal health advice request
 */
export function isPersonalHealthQuery(query: string): boolean {
  const result = intentClassifier.classify(query);
  return result.intent === 'personal_health';
}

/**
 * Check if a query is a clinical protocol question
 * Clinical queries require strict grounding (>0.7 threshold)
 * 
 * @param query - User query to check
 * @returns true if query appears to be clinical in nature
 */
export function isClinicalQuery(query: string): boolean {
  const result = intentClassifier.classify(query);
  return result.intent === 'clinical';
}

/**
 * Check if a query is conversational/general
 * Conversational queries have lighter constraints
 * 
 * @param query - User query to check
 * @returns true if query appears to be conversational
 */
export function isConversationalQuery(query: string): boolean {
  const result = intentClassifier.classify(query);
  return result.intent === 'conversational';
}

/**
 * Get classification indicators for debugging/analysis
 * 
 * @returns Object containing all indicator arrays used for classification
 */
export function getIntentIndicators(): { 
  clinical: string[]; 
  personalHealth: string[]; 
  conversational: string[] 
} {
  return intentClassifier.getIntentIndicators();
}

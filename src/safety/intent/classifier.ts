/**
 * Intent Classifier Service
 * Healthcare AI Assistant - HIPAA-Aware RAG
 * 
 * Classifies user queries into clinical, personal_health, conversational, or unknown intent.
 * Ensures appropriate response constraints based on query type.
 */

import { IntentType, IntentClassification } from '../../types/safety';

// ============================================================================
// Intent Detection Keywords
// ============================================================================

const CLINICAL_INDICATORS = [
  'protocol', 'guideline', 'treatment', 'diagnosis', 'medication',
  'procedure', 'symptom', 'therapy', 'prescription', 'clinical',
  'evidence', 'research', 'study', 'recommendation', 'standard',
  'care', 'management', 'assessment', 'evaluation', 'intervention',
  'prevention', 'screening', 'diagnostic', 'therapeutic', 'pharmacology'
];

const PERSONAL_HEALTH_INDICATORS = [
  'my symptoms', 'i feel', 'should i take', 'is it safe for me',
  'my condition', 'my medication', 'personal advice', 'my doctor',
  'i should', 'what should i do', 'is this serious', 'should i worry',
  'my pain', 'my illness', 'my health', 'am i at risk', 'i have been feeling',
  'my test results', 'my blood', 'my temperature', 'i experienced',
  'for me personally', 'what does this mean for me', 'should i be concerned'
];

const CONVERSATIONAL_INDICATORS = [
  'hello', 'thanks', 'thank you', 'goodbye', 'help', 'what can you do',
  'explain', 'tell me about', 'what is', 'how does', 'describe',
  'who are you', 'what do you know', 'tell me more', 'i am curious',
  'interesting', 'i understand', 'got it', 'makes sense', 'cool'
];

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CLASSIFICATION_THRESHOLD = 0.8;
const PERSONAL_HEALTH_PRECEDENCE = true;

/**
 * Interface for intent detection indicators
 */
interface IntentIndicators {
  clinical: string[];
  personalHealth: string[];
  conversational: string[];
}

/**
 * IntentClassifier Service
 * 
 * Classifies user queries into intent categories:
 * - clinical: Medical protocol, treatment, research queries (strict grounding required)
 * - personal_health: Personal medical advice requests (BLOCKED)
 * - conversational: General questions and system interactions (lighter constraints)
 * - unknown: Unclassifiable queries
 */
export class IntentClassifier {
  private clinicalIndicators: string[];
  private personalHealthIndicators: string[];
  private conversationalIndicators: string[];
  private threshold: number;

  /**
   * Create a new IntentClassifier
   * @param threshold - Minimum confidence threshold for classification (default: 0.8)
   */
  constructor(threshold: number = DEFAULT_CLASSIFICATION_THRESHOLD) {
    this.clinicalIndicators = CLINICAL_INDICATORS;
    this.personalHealthIndicators = PERSONAL_HEALTH_INDICATORS;
    this.conversationalIndicators = CONVERSATIONAL_INDICATORS;
    this.threshold = threshold;
  }

  /**
   * Classify a user query into intent category
   * 
   * @param query - The user query to classify
   * @returns IntentClassification with intent type, confidence, and matched indicators
   */
  classify(query: string): IntentClassification {
    const normalizedQuery = this.normalizeQuery(query);
    const indicators = this.extractIndicators(normalizedQuery);

    // Score each intent type
    const clinicalScore = this.calculateIntentScore(normalizedQuery, this.clinicalIndicators);
    const personalHealthScore = this.calculateIntentScore(normalizedQuery, this.personalHealthIndicators);
    const conversationalScore = this.calculateIntentScore(normalizedQuery, this.conversationalIndicators);

    // Personal health takes precedence if detected
    if (personalHealthScore > 0) {
      const confidence = this.calculateConfidence(normalizedQuery, 'personal_health', personalHealthScore);
      return {
        intent: 'personal_health',
        confidence: confidence,
        clinicalIndicators: indicators.clinical,
        personalHealthIndicators: indicators.personalHealth
      };
    }

    // Determine highest scoring intent
    let intent: IntentType = 'unknown';
    let maxScore = 0;

    if (clinicalScore > conversationalScore && clinicalScore > maxScore) {
      intent = 'clinical';
      maxScore = clinicalScore;
    } else if (conversationalScore > clinicalScore && conversationalScore > maxScore) {
      intent = 'conversational';
      maxScore = conversationalScore;
    }

    // Calculate confidence
    const confidence = this.calculateConfidence(normalizedQuery, intent, maxScore);

    return {
      intent: confidence >= this.threshold ? intent : 'unknown',
      confidence: confidence,
      clinicalIndicators: intent === 'clinical' ? indicators.clinical : [],
      personalHealthIndicators: []
    };
  }

  /**
   * Alias for classify() method - provides semantic clarity for query classification
   */
  classifyQuery(query: string): IntentClassification {
    return this.classify(query);
  }

  /**
   * Get all intent indicators used for classification
   */
  getIntentIndicators(): { clinical: string[]; personalHealth: string[]; conversational: string[] } {
    return {
      clinical: this.clinicalIndicators,
      personalHealth: this.personalHealthIndicators,
      conversational: this.conversationalIndicators
    };
  }

  /**
   * Normalize query for consistent processing
   */
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '');
  }

  /**
   * Extract matched indicators from query
   */
  private extractIndicators(query: string): IntentIndicators {
    const normalized = this.normalizeQuery(query);

    const clinical = this.clinicalIndicators.filter(indicator => 
      normalized.includes(indicator)
    );

    const personalHealth = this.personalHealthIndicators.filter(indicator => {
      // Check for exact phrases first
      if (indicator.includes(' ')) {
        return normalized.includes(indicator);
      }
      // For single words, use word boundary matching
      const regex = new RegExp(`\\b${indicator}\\b`, 'i');
      return regex.test(normalized);
    });

    const conversational = this.conversationalIndicators.filter(indicator => 
      normalized.includes(indicator)
    );

    return {
      clinical,
      personalHealth,
      conversational
    };
  }

  /**
   * Calculate score for a specific intent based on matched indicators
   */
  private calculateIntentScore(query: string, indicators: string[]): number {
    if (indicators.length === 0) return 0;

    const normalized = this.normalizeQuery(query);
    let matchedCount = 0;
    let totalWeight = 0;

    for (const indicator of indicators) {
      const weight = this.getIndicatorWeight(indicator);
      totalWeight += weight;

      if (indicator.includes(' ')) {
        // Multi-word indicator - check for phrase match
        if (normalized.includes(indicator)) {
          matchedCount += weight;
        }
      } else {
        // Single word - use word boundary matching
        const regex = new RegExp(`\\b${indicator}\\b`, 'i');
        if (regex.test(normalized)) {
          matchedCount += weight;
        }
      }
    }

    return totalWeight > 0 ? matchedCount / totalWeight : 0;
  }

  /**
   * Get weight for an indicator (higher = more important for classification)
   */
  private getIndicatorWeight(indicator: string): number {
    // Personal health indicators have higher weight due to safety implications
    if (this.personalHealthIndicators.includes(indicator)) {
      return 2.0;
    }

    // Clinical indicators have medium-high weight
    if (this.clinicalIndicators.includes(indicator)) {
      return 1.5;
    }

    // Conversational indicators have lower weight
    if (this.conversationalIndicators.includes(indicator)) {
      return 1.0;
    }

    return 1.0;
  }

  /**
   * Calculate confidence score for classification
   */
  private calculateConfidence(query: string, intent: IntentType, intentScore: number): number {
    // Base confidence on intent score
    let confidence = intentScore;

    // Boost confidence for longer, more specific queries
    const wordCount = query.split(' ').length;
    if (wordCount > 5) {
      confidence += 0.1;
    }
    if (wordCount > 10) {
      confidence += 0.1;
    }

    // Boost for multiple indicator matches
    const indicators = this.extractIndicators(query);
    const totalMatches = indicators.clinical.length + 
                        indicators.personalHealth.length + 
                        indicators.conversational.length;
    
    if (totalMatches > 3) {
      confidence += 0.15;
    }

    // Cap confidence at 1.0
    return Math.min(confidence, 1.0);
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const intentClassifier = new IntentClassifier();

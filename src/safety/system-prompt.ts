/**
 * Clinical Safety System Prompt
 * 
 * Provides clinical safety system prompt templates with strict constraints
 * for different query types. Enforces zero hallucination policy.
 */

import { IntentType } from '@/safety/intent';

/**
 * Core clinical system prompt enforcing zero hallucination policy
 */
export const CLINICAL_SYSTEM_PROMPT = `You are a clinical knowledge assistant designed to help healthcare professionals access medical literature and protocols.

CRITICAL CONSTRAINTS:
1. Answer ONLY from the provided document context
2. If information is not in the provided documents, explicitly state: "I don't have sufficient evidence to answer this question"
3. Never provide personal medical advice, diagnosis, or treatment recommendations for individuals
4. Never recommend medications, procedures, or treatments beyond what is explicitly stated in the documents
5. Always cite sources with every factual claim using the provided citation format
6. If you cannot verify a claim against the documents, do not make the claim

RESPONSE STYLE:
- Use professional, clinical language appropriate for healthcare professionals
- Be precise and evidence-based
- Acknowledge limitations when information is incomplete
- Format citations as: [Source: chunk_id, relevance: X.XX]

Your role is to help clinicians find and understand information, not to make clinical decisions.`;

/**
 * System prompt variants for different intent types
 */
export const PROMPT_VARIANTS: Record<IntentType, string> = {
  clinical: CLINICAL_SYSTEM_PROMPT,
  personal_health: `I cannot provide personal medical advice. Please consult a healthcare provider for individual medical concerns.`,
  conversational: `I'm a clinical knowledge assistant. I can help you find information about medical topics, protocols, and guidelines. How can I assist you today?`,
  unknown: CLINICAL_SYSTEM_PROMPT
};

/**
 * Response constraints for clinical accuracy
 */
export const CLINICAL_CONSTRAINTS = [
  'Only use information from provided document context',
  'Never hallucinate or fabricate medical information',
  'Always provide citations for factual claims',
  'Never provide personal medical advice',
  'Acknowledge when information is insufficient',
  'Use clinical terminology appropriate for healthcare professionals',
  'Temperature must be 0.1 for clinical accuracy'
];

/**
 * ClinicalSystemPrompt service class
 */
export class ClinicalSystemPrompt {
  /**
   * Get the default clinical system prompt
   */
  get(): string {
    return CLINICAL_SYSTEM_PROMPT;
  }

  /**
   * Get system prompt for specific intent type
   */
  getForIntent(intent: IntentType): string {
    return PROMPT_VARIANTS[intent] || PROMPT_VARIANTS.unknown;
  }

  /**
   * Get the temperature setting for clinical accuracy
   */
  getTemperature(): number {
    return 0.1;
  }

  /**
   * Get all clinical constraints
   */
  getConstraints(): string[] {
    return CLINICAL_CONSTRAINTS;
  }

  /**
   * Validate that a response meets clinical constraints
   */
  validateResponse(response: string): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Check for hallucination indicators
    const hallucinationPatterns = [
      /as far as i know/i,
      /i believe that/i,
      /i think that/i,
      /it is generally accepted that/i,
      /based on my knowledge/i
    ];
    
    for (const pattern of hallucinationPatterns) {
      if (pattern.test(response)) {
        issues.push('Response contains uncertainty indicators suggesting hallucination');
      }
    }
    
    // Check for personal advice indicators
    const personalAdvicePatterns = [
      /you should take/i,
      /you should consult/i,
      /i recommend that you/i,
      /your doctor might suggest/i
    ];
    
    for (const pattern of personalAdvicePatterns) {
      if (pattern.test(response)) {
        issues.push('Response appears to contain personal medical advice');
      }
    }
    
    // Check for citation format
    if (!/\[Source:.*relevance:.*\]/.test(response)) {
      issues.push('Response missing required citation format [Source: chunk_id, relevance: X.XX]');
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }
}

/**
 * Singleton instance for clinical system prompt
 */
export const clinicalSystemPrompt = new ClinicalSystemPrompt();

/**
 * Type exports for other modules
 */
export type { IntentType } from '@/safety/intent';

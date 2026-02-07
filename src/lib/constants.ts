/**
 * Safety Constants
 * 
 * Safety thresholds, limits, and configuration values for PHI detection,
 * injection prevention, groundedness scoring, and citation systems.
 */

// ============================================================================
// PHI Detection Constants
// ============================================================================

export const PHI_BLOCK_THRESHOLD = 0.95;
export const PHI_FALSE_POSITIVE_RATE = 0.01; // 1% target
export const PHI_ENTITY_TYPES = [
  'SSN',
  'MRN', 
  'DOB',
  'phone',
  'email',
  'address',
  'medicare',
  'insurance',
  'passport',
  'drivers_license'
] as const;

export const PHI_SEVERITY_LEVELS = {
  high: ['SSN', 'MRN', 'DOB', 'medicare', 'passport', 'drivers_license'],
  medium: ['phone', 'email', 'address', 'insurance'],
  low: []
} as const;

// ============================================================================
// Injection Detection Constants
// ============================================================================

export const INJECTION_BLOCK_THRESHOLD: 'low' | 'medium' | 'high' | 'critical' = 'high';

export const CRITICAL_PATTERNS = [
  'eval(',
  'exec(',
  '__import__',
  'base64_decode',
  'atob(',
  'os.system',
  'child_process'
];

export const HIGH_RISK_PATTERNS = [
  'ignore previous',
  'you are now',
  'system prompt',
  'show me your prompt',
  'what are your instructions',
  'forget everything'
];

export const INJECTION_SEVERITY_THRESHOLDS = {
  critical: 0,
  high: 1,
  medium: 3,
  low: Infinity
} as const;

// ============================================================================
// Groundedness Constants
// ============================================================================

export const GROUNDEDNESS_THRESHOLD = 0.7; // Minimum for clinical use
export const GROUNDEDNESS_WEIGHTS = {
  coverage: 0.25,
  relevance: 0.25,
  accuracy: 0.30,
  verification: 0.20
} as const;

export const GROUNDEDNESS_LEVELS = {
  excellent: 0.9,
  good: 0.8,
  acceptable: 0.7,
  marginal: 0.6,
  insufficient: 0.5
} as const;

// ============================================================================
// Citation Constants
// ============================================================================

export const CITATION_RELEVANCE_THRESHOLD = 0.7;
export const CITATION_VERIFICATION_THRESHOLD = 0.7;
export const CITATION_SIMILARITY_THRESHOLD = 0.8;

export const MAX_CITATIONS_PER_RESPONSE = 10;
export const MIN_CITATIONS_FOR_CLINICAL = 3;

export const CITATION_FORMAT = {
  pattern: '[Source: {chunk_id}, relevance: {relevance}]',
  maxLength: 100
} as const;

// ============================================================================
// Query Intent Constants
// ============================================================================

export const INTENT_CLINICAL = 'clinical';
export const INTENT_PERSONAL_HEALTH = 'personal_health';
export const INTENT_CONVERSATIONAL = 'conversational';
export const INTENT_CLASSIFICATION_THRESHOLD = 0.8;

export const INTENT_WEIGHTS = {
  clinical_keywords: 0.4,
  medical_terminology: 0.3,
  question_structure: 0.2,
  context_alignment: 0.1
} as const;

// ============================================================================
// Confidence Indicator Constants
// ============================================================================

export const CONFIDENCE_INDICATOR_ENABLED = true;
export const CONFIDENCE_LEVELS = {
  high: 0.8,
  medium: 0.6,
  low: 0.4
} as const;

export const CONFIDENCE_MESSAGES = {
  high: 'High confidence response based on verified sources',
  medium: 'Moderate confidence - additional verification recommended',
  low: 'Low confidence - response may not be fully supported'
} as const;

// ============================================================================
// Response Constants
// ============================================================================

export const NO_RESPONSE_THRESHOLD = 0.5;
export const MAX_RESPONSE_LENGTH = 2000;

export const NO_RESPONSE_MESSAGE = 
  "I don't have sufficient evidence to answer this question based on the available documents.";

export const SUGGESTION_MESSAGE = 
  'Consider rephrasing your question or providing more context. Here are some relevant documents:';

// ============================================================================
// Audit Logging Constants
// ============================================================================

export const AUDIT_PHI_BLOCKED = true;
export const AUDIT_INJECTION_BLOCKED = true;
export const AUDIT_ENABLED = true;
export const AUDIT_LOG_RETENTION_DAYS = 2555; // 7 years (HIPAA requirement)

export const AUDIT_EVENT_TYPES = {
  PHI_DETECTED: 'phi_detected',
  PHI_BLOCKED: 'phi_blocked',
  INJECTION_DETECTED: 'injection_detected',
  INJECTION_BLOCKED: 'injection_blocked',
  QUERY_PROCESSED: 'query_processed',
  RESPONSE_GENERATED: 'response_generated',
  CITATION_ADDED: 'citation_added',
  GROUNDEDNESS_CHECK: 'groundedness_check',
  INTENT_CLASSIFIED: 'intent_classified'
} as const;

// ============================================================================
// System Prompt Constants
// ============================================================================

export const SYSTEM_PROMPT_ISOLATION_ENABLED = true;
export const MAX_PROMPT_LENGTH = 8000;
export const PROMPT_SANITIZATION_ENABLED = true;

export const SANITIZATION_PATTERNS = [
  /system\s*prompt/gi,
  /ignore\s*previous/gi,
  /you\s*are\s*now/gi,
  /forget\s*everything/gi
];

export const SYSTEM_PROMPT_SECTIONS = {
  role: 'You are a clinical knowledge assistant.',
  constraints: [
    'Answer ONLY from the provided document context.',
    'If information is not in documents, say so.',
    'Never provide medical advice beyond approved documents.',
    'Cite sources with every claim.'
  ],
  temperature: 0.1,
  format: 'plain'
} as const;

// ============================================================================
// Rate Limiting Constants
// ============================================================================

export const RATE_LIMIT_ENABLED = true;
export const RATE_LIMIT_REQUESTS_PER_MINUTE = 60;
export const RATE_LIMIT_REQUESTS_PER_HOUR = 1000;
export const RATE_LIMIT_BLOCK_DURATION_MINUTES = 15;

// ============================================================================
// Healthcare Domain Constants
// ============================================================================

export const CLINICAL_KEYWORDS = [
  'diagnosis', 'treatment', 'symptoms', 'medication', 'prescription',
  'therapy', 'prognosis', 'clinical', 'patient', 'medical', 'healthcare',
  'hospital', 'physician', 'nurse', 'procedure', 'surgery', 'laboratory',
  'imaging', 'radiology', 'pathology', 'pharmacology', 'toxicology'
];

export const HIPAA_SENSITIVE_FIELDS = [
  'ssn', 'social_security', 'date_of_birth', 'dob', 'mrn', 'medical_record',
  'medicare', 'insurance', 'phone', 'email', 'address', 'name', 'patient_id'
] as const;

// ============================================================================
// Validation Constants
// ============================================================================

export const MIN_INPUT_LENGTH = 1;
export const MAX_INPUT_LENGTH = 5000;
export const MIN_QUERY_LENGTH = 3;
export const MAX_QUERY_TOKENS = 1000;

export const VALIDATION_PATTERNS = {
  alphanumeric: /^[a-zA-Z0-9\s\-\.\,\?\!]+$/,
  medical_terminology: /^[a-zA-Z0-9\s\-\.\,\?\!\(\)\[\]\{\}]+$/,
  safe_chars: /^[\x20-\x7E\s]+$/
} as const;

// ============================================================================
// Export all constants as single object
// ============================================================================

export const SAFETY_CONSTANTS = {
  phi: {
    BLOCK_THRESHOLD: PHI_BLOCK_THRESHOLD,
    FALSE_POSITIVE_RATE: PHI_FALSE_POSITIVE_RATE,
    ENTITY_TYPES: PHI_ENTITY_TYPES,
    SEVERITY_LEVELS: PHI_SEVERITY_LEVELS
  },
  injection: {
    BLOCK_THRESHOLD: INJECTION_BLOCK_THRESHOLD,
    CRITICAL_PATTERNS,
    HIGH_RISK_PATTERNS,
    SEVERITY_THRESHOLDS: INJECTION_SEVERITY_THRESHOLDS
  },
  groundedness: {
    THRESHOLD: GROUNDEDNESS_THRESHOLD,
    WEIGHTS: GROUNDEDNESS_WEIGHTS,
    LEVELS: GROUNDEDNESS_LEVELS
  },
  citation: {
    RELEVANCE_THRESHOLD: CITATION_RELEVANCE_THRESHOLD,
    VERIFICATION_THRESHOLD: CITATION_VERIFICATION_THRESHOLD,
    MAX_CITATIONS: MAX_CITATIONS_PER_RESPONSE,
    MIN_CITATIONS_CLINICAL: MIN_CITATIONS_FOR_CLINICAL
  },
  intent: {
    CLASSIFICATION_THRESHOLD: INTENT_CLASSIFICATION_THRESHOLD,
    WEIGHTS: INTENT_WEIGHTS,
    TYPES: {
      CLINICAL: INTENT_CLINICAL,
      PERSONAL_HEALTH: INTENT_PERSONAL_HEALTH,
      CONVERSATIONAL: INTENT_CONVERSATIONAL
    }
  },
  confidence: {
    ENABLED: CONFIDENCE_INDICATOR_ENABLED,
    LEVELS: CONFIDENCE_LEVELS
  },
  audit: {
    ENABLED: AUDIT_ENABLED,
    PHI_BLOCKED: AUDIT_PHI_BLOCKED,
    INJECTION_BLOCKED: AUDIT_INJECTION_BLOCKED,
    LOG_RETENTION_DAYS: AUDIT_LOG_RETENTION_DAYS,
    EVENT_TYPES: AUDIT_EVENT_TYPES
  }
};

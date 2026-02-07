/**
 * Safety Layer Type Definitions
 * Healthcare AI Assistant - HIPAA-Aware RAG
 * 
 * Provides TypeScript interfaces for citation system, verification,
 * groundedness scoring, query intent classification, and safety responses.
 */

// ============================================================================
// Citation Types
// ============================================================================

export interface Citation {
  id: string;
  documentId: string;
  documentTitle: string;
  sectionPath: string;
  chunkId: string;
  chunkContent: string;
  relevanceScore: number;
  createdAt: Date;
}

export interface CitationResult {
  citations: Citation[];
  formattedResponse: string;
  totalCitations: number;
  verificationStatus: VerificationStatus;
}

export interface VerificationStatus {
  allVerified: boolean;
  verifiedCount: number;
  failedCount: number;
  verificationRate: number;
  failedCitations: FailedCitation[];
}

export interface FailedCitation {
  citationId: string;
  reason: string;
  similarityScore: number;
}

export interface VerificationResult {
  citationId: string;
  verified: boolean;
  similarityScore: number;
  matchedText: string;
  expectedText: string;
  reason?: string;
}

// ============================================================================
// Query Intent Types
// ============================================================================

export type IntentType = "clinical" | "personal_health" | "conversational" | "unknown";

export interface IntentClassification {
  intent: IntentType;
  confidence: number;
  clinicalIndicators: string[];
  personalHealthIndicators: string[];
}

// ============================================================================
// Groundedness Types
// ============================================================================

export interface GroundednessScore {
  overall: number;
  coverage: number;
  relevance: number;
  accuracy: number;
  verification: number;
  breakdown: GroundednessBreakdown;
}

export interface GroundednessBreakdown {
  claimsSupported: number;
  claimsTotal: number;
  citationsCount: number;
  avgRelevance: number;
  verifiedClaims: number;
}

// ============================================================================
// Response Types
// ============================================================================

export interface SafetyResponse {
  allowed: boolean;
  citations?: CitationResult;
  groundedness?: GroundednessScore;
  intent?: IntentClassification;
  confidence?: ConfidenceIndicator;
  blockedReason?: string;
  suggestions?: string[];
}

export interface ConfidenceIndicator {
  level: "high" | "medium" | "low";
  score: number;
  factors: string[];
}

// ============================================================================
// Chunk Result Types (for RAG pipeline integration)
// ============================================================================

export interface ChunkResult {
  documentId: string;
  documentTitle: string;
  sectionPath: string;
  chunkId: string;
  chunkContent: string;
  relevanceScore: number;
}

// ============================================================================
// Formatted Citation Types
// ============================================================================

export interface FormattedCitation {
  inline: string;
  reference: string;
  bibliography: string;
}

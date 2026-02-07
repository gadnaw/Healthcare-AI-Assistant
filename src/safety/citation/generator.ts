/**
 * CitationGenerator Service
 * Healthcare AI Assistant - HIPAA-Aware RAG
 * 
 * Generates citations from RAG chunk results with relevance scores.
 * Provides source attribution for clinical traceability.
 */

import { Citation, ChunkResult } from '../../types/safety';

// Default relevance threshold for citation inclusion
const DEFAULT_RELEVANCE_THRESHOLD = 0.7;

// Maximum citations for clinical responses
const DEFAULT_MAX_CITATIONS = 10;
const CLINICAL_MAX_CITATIONS = 3;

/**
 * Generates unique citation IDs
 */
function generateCitationId(): string {
  return `cite-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * CitationGenerator Service
 * 
 * Creates citations from RAG pipeline chunk results, enabling
 * clinical traceability and source attribution.
 */
export class CitationGenerator {
  private defaultRelevanceThreshold: number;

  /**
   * Initialize CitationGenerator
   * @param defaultRelevanceThreshold - Minimum relevance score for citations (default: 0.7)
   */
  constructor(defaultRelevanceThreshold: number = DEFAULT_RELEVANCE_THRESHOLD) {
    this.defaultRelevanceThreshold = defaultRelevanceThreshold;
  }

  /**
   * Generate citations from RAG chunk results
   * @param chunks - Array of chunk results from RAG pipeline
   * @returns Array of citations with document IDs, titles, section paths, and relevance scores
   */
  generateFromChunks(chunks: ChunkResult[]): Citation[] {
    if (!chunks || chunks.length === 0) {
      return [];
    }

    // Filter by relevance threshold
    const relevantChunks = chunks.filter(
      chunk => chunk.relevanceScore >= this.defaultRelevanceThreshold
    );

    // Create citations from filtered chunks
    return relevantChunks.map(chunk => this.createCitation(chunk));
  }

  /**
   * Create individual citation from chunk result
   * @param chunk - Single chunk result from RAG pipeline
   * @returns Citation with unique ID and full metadata
   */
  createCitation(chunk: ChunkResult): Citation {
    return {
      id: generateCitationId(),
      documentId: chunk.documentId,
      documentTitle: chunk.documentTitle,
      sectionPath: chunk.sectionPath,
      chunkId: chunk.chunkId,
      chunkContent: chunk.chunkContent,
      relevanceScore: chunk.relevanceScore,
      createdAt: new Date()
    };
  }

  /**
   * Generate citations with optional limit
   * @param chunks - Array of chunk results from RAG pipeline
   * @param limit - Maximum number of citations to generate (optional)
   * @param isClinical - Whether this is a clinical query (affects max limit)
   * @returns Array of citations limited to specified count
   */
  generateMultiple(
    chunks: ChunkResult[], 
    limit?: number, 
    isClinical: boolean = false
  ): Citation[] {
    if (!chunks || chunks.length === 0) {
      return [];
    }

    // Determine effective limit
    const effectiveLimit = limit ?? (isClinical ? CLINICAL_MAX_CITATIONS : DEFAULT_MAX_CITATIONS);
    
    // Get all relevant citations
    const allCitations = this.generateFromChunks(chunks);
    
    // Sort by relevance score (highest first)
    allCitations.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    // Return limited set
    return allCitations.slice(0, effectiveLimit);
  }
}

// Singleton instance for convenient access
export const citationGenerator = new CitationGenerator();

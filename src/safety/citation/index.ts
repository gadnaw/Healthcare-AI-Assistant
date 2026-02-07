/**
 * Citation Services Index
 * Healthcare AI Assistant - HIPAA-Aware RAG
 * 
 * Public API export for citation system services.
 * Provides complete citation workflow: generation, verification, and formatting.
 */

// Service exports
export { CitationGenerator, citationGenerator } from './generator';
export { CitationVerifier, citationVerifier } from './verifier';
export { CitationFormatter, citationFormatter } from './formatter';

// Type exports
export * from '../../types/safety';

/**
 * Convenience function for complete citation workflow
 * 
 * Generates citations from RAG chunks, verifies against response content,
 * and formats for display.
 * 
 * @param chunks - Chunk results from RAG pipeline
 * @param responseContent - AI response content to verify
 * @returns Complete CitationResult with citations, formatted response, and verification status
 */
export async function generateAndVerifyCitations(
  chunks: import('../../types/safety').ChunkResult[],
  responseContent: string
): Promise<import('../../types/safety').CitationResult> {
  // Generate citations from chunks
  const citations = citationGenerator.generateFromChunks(chunks);
  
  // Verify citations against response content
  const verificationStatus = citationVerifier.verify(citations, responseContent);
  
  // Format citations for response display
  const formattedResponse = citationFormatter.formatForResponse(citations);
  
  return {
    citations,
    formattedResponse,
    totalCitations: citations.length,
    verificationStatus
  };
}

/**
 * Generate citations only (without verification)
 * Useful for preview or when verification is done separately
 * 
 * @param chunks - Chunk results from RAG pipeline
 * @param limit - Maximum citations to generate (optional)
 * @param isClinical - Whether this is a clinical query (optional)
 * @returns Array of citations
 */
export function generateCitations(
  chunks: import('../../types/safety').ChunkResult[],
  limit?: number,
  isClinical: boolean = false
): import('../../types/safety').Citation[] {
  return citationGenerator.generateMultiple(chunks, limit, isClinical);
}

/**
 * Verify citations against response content
 * Useful when citations are pre-generated
 * 
 * @param citations - Citations to verify
 * @param responseContent - AI response content to verify against
 * @returns Verification status with results
 */
export function verifyCitations(
  citations: import('../../types/safety').Citation[],
  responseContent: string
): import('../../types/safety').VerificationStatus {
  return citationVerifier.verify(citations, responseContent);
}

/**
 * Format citations for response display
 * Useful when generation and verification are done separately
 * 
 * @param citations - Citations to format
 * @returns Formatted response with inline citations and bibliography
 */
export function formatCitations(
  citations: import('../../types/safety').Citation[]
): string {
  return citationFormatter.formatForResponse(citations);
}

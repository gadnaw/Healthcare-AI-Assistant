/**
 * CitationFormatter Service
 * Healthcare AI Assistant - HIPAA-Aware RAG
 * 
 * Formats citations for display in AI responses.
 * Produces inline [Source: chunk_id, relevance: X.XX] format.
 */

import { Citation, FormattedCitation as CitationFormatterType } from '../../types/safety';

/**
 * CitationFormatter Service
 * 
 * Formats citations for human-readable responses with inline
 * citations, references, and bibliography sections.
 */
export class CitationFormatter {
  private formatPattern: string;

  /**
   * Initialize CitationFormatter
   * @param formatPattern - Custom format pattern (optional)
   */
  constructor(formatPattern?: string) {
    this.formatPattern = formatPattern ?? '[Source: {chunkId}, relevance: {relevance}]';
  }

  /**
   * Format all citations for response inclusion
   * @param citations - Array of citations to format
   * @returns Formatted response with inline citations and bibliography
   */
  formatForResponse(citations: Citation[]): string {
    if (!citations || citations.length === 0) {
      return '';
    }

    const inlineCitations = citations.map(c => this.formatInline(c)).join(' ');
    const bibliography = this.formatBibliography(citations);

    return `${inlineCitations}\n\n${bibliography}`;
  }

  /**
   * Format single citation as inline reference
   * @param citation - Citation to format inline
   * @returns Inline citation string: [Source: chunk_id, relevance: X.XX]
   */
  formatInline(citation: Citation): string {
    const relevance = citation.relevanceScore.toFixed(2);
    return `[Source: ${citation.chunkId}, relevance: ${relevance}]`;
  }

  /**
   * Format citations as numbered bibliography
   * @param citations - Array of citations to format as bibliography
   * @returns Numbered bibliography with full document details
   */
  formatBibliography(citations: Citation[]): string {
    if (!citations || citations.length === 0) {
      return '';
    }

    const numberedReferences = citations.map((citation, index) =>
      `[${index + 1}] ${this.formatReference(citation)}`
    );

    return '## References\n' + numberedReferences.join('\n');
  }

  /**
   * Format single citation as reference entry
   * @param citation - Citation to format as reference
   * @returns Reference entry: documentTitle > sectionPath (Relevance: X.XX)
   */
  formatReference(citation: Citation): string {
    const relevance = citation.relevanceScore.toFixed(2);
    return `${citation.documentTitle} > ${citation.sectionPath} (Relevance: ${relevance})`;
  }

  /**
   * Format citation as full formatted citation object
   * @param citation - Citation to format
   * @returns FormattedCitation with inline, reference, and bibliography formats
   */
  formatFullCitation(citation: Citation): CitationFormatterType {
    return {
      inline: this.formatInline(citation),
      reference: this.formatReference(citation),
      bibliography: `**Source**: ${citation.documentTitle} > ${citation.sectionPath}`
    };
  }

  /**
   * Escape HTML in text for safe display
   * @param text - Text to escape
   * @returns HTML-escaped text
   */
  private escapeHtml(text: string): string {
    if (!text) return '';
    
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Format citation with HTML escaping for web display
   * @param citation - Citation to format
   * @returns HTML-safe formatted citation
   */
  formatForHtml(citation: Citation): string {
    const escapedContent = this.escapeHtml(citation.chunkContent);
    const relevance = citation.relevanceScore.toFixed(2);
    
    return `<span class="citation" data-chunk-id="${citation.chunkId}" data-relevance="${relevance}">[Source: ${citation.chunkId}, relevance: ${relevance}]</span>`;
  }
}

// Singleton instance for convenient access
export const citationFormatter = new CitationFormatter();

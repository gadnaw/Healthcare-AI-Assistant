import { DocumentChunk, ChunkMetadata, ClinicalSplitterConfig } from '../types';

/**
 * ClinicalSplitter - Clinical-aware text splitting with section preservation
 * 
 * Extends recursive character splitting with medical-specific separators
 * and section header extraction for healthcare document processing.
 */
export class ClinicalSplitter {
  private chunkSize: number;
  private chunkOverlap: number;
  private separators: string[];
  private lengthFunction: (text: string) => number;
  private preserveHeaders: boolean;
  private medicalKeywords: RegExp[];

  constructor(config: ClinicalSplitterConfig = {}) {
    this.chunkSize = config.chunkSize || 512;
    this.chunkOverlap = config.chunkOverlap || 128;
    this.preserveHeaders = config.preserveHeaders !== false;
    
    // Clinical separators prioritized by document structure
    this.separators = config.separators || [
      '\n## ',      // Major sections (## Introduction)
      '\n### ',     // Subsections (### Diagnosis)
      '\n#### ',    // Sub-subsections (#### Lab Results)
      '\n\n',       // Paragraphs
      '\n',         // Lines
      ' ',          // Words
      ''            // Characters
    ];

    // Length function using token estimation
    this.lengthFunction = config.lengthFunction || this.estimateTokens;

    // Medical keywords for section detection
    this.medicalKeywords = config.medicalKeywords || [
      /INDICATIONS?/i,
      /CONTRAINDICATIONS?/i,
      /DOSAGE(?: AND ADMINISTRATION)?/i,
      /SIDE EFFECTS?/i,
      /ADVERSE REACTIONS?/i,
      /WARNINGS?/i,
      /PRECAUTIONS?/i,
      /PROTOCOL/,
      /ADMINISTRATION/i,
      /CLINICAL/i,
      /PHARMACOLOGY/i,
      /TOXICOLOGY/i,
      /INTERACTIONS?/i,
      /OVERDOSE/i,
      /STORAGE/i,
      /DISPOSAL/i
    ];
  }

  /**
   * Estimate token count (approximate: 4 chars per token)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Split text into clinical-aware chunks
   */
  async clinicalChunking(text: string, documentId: string): Promise<DocumentChunk[]> {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const chunks: DocumentChunk[] = [];
    const sectionHeaders = this.extractAllSectionHeaders(text);
    
    // Primary splitting with clinical awareness
    const primaryChunks = await this.splitText(text);
    
    // Process each chunk with metadata
    let chunkIndex = 0;
    for (const chunkText of primaryChunks) {
      const metadata = this.generateChunkMetadata(
        chunkText, 
        documentId, 
        chunkIndex, 
        sectionHeaders
      );
      
      chunks.push({
        id: `${documentId}-chunk-${chunkIndex}`,
        documentId,
        content: chunkText,
        chunkIndex,
        tokenCount: this.lengthFunction(chunkText),
        metadata
      });
      
      chunkIndex++;
    }

    return chunks;
  }

  /**
   * Main split function using recursive character splitting
   */
  async splitText(text: string): Promise<string[]> {
    const splits: string[] = [];
    
    // First split attempt with clinical separators
    let currentSplits = [text];
    
    for (const separator of this.separators) {
      const newSplits: string[] = [];
      
      for (const split of currentSplits) {
        if (this.lengthFunction(split) <= this.chunkSize) {
          // Split is small enough, keep as is
          if (separator === '') {
            // Character-level splitting for oversized chunks
            const charSplits = this.splitByChar(split);
            newSplits.push(...charSplits);
          } else {
            newSplits.push(split);
          }
        } else {
          // Split needs further processing
          const subSplits = this.splitOnSeparator(split, separator);
          newSplits.push(...subSplits);
        }
      }
      
      currentSplits = newSplits;
    }

    // Apply overlap to adjacent chunks
    return this.applyOverlap(currentSplits);
  }

  /**
   * Split text on separator while respecting chunk size
   */
  private splitOnSeparator(text: string, separator: string): string[] {
    if (separator === '') {
      return [text];
    }

    const splits: string[] = [];
    const parts = text.split(separator);
    
    let currentChunk = '';
    for (const part of parts) {
      const potentialChunk = currentChunk + (currentChunk ? separator : '') + part;
      
      if (this.lengthFunction(potentialChunk) > this.chunkSize) {
        if (currentChunk) {
          splits.push(currentChunk);
        }
        // Start new chunk with separator prefix (except first)
        currentChunk = separator + part;
      } else {
        currentChunk = potentialChunk;
      }
    }
    
    if (currentChunk) {
      splits.push(currentChunk);
    }
    
    return splits;
  }

  /**
   * Split oversized chunks by character
   */
  private splitByChar(text: string): string[] {
    const splits: string[] = [];
    
    for (let i = 0; i < text.length; i += this.chunkSize * 4) {
      splits.push(text.substring(i, i + this.chunkSize * 4));
    }
    
    return splits;
  }

  /**
   * Apply overlap between adjacent chunks
   */
  private applyOverlap(splits: string[]): string[] {
    if (this.chunkOverlap <= 0 || splits.length <= 1) {
      return splits;
    }

    const overlapped: string[] = [splits[0]];
    
    for (let i = 1; i < splits.length; i++) {
      const previous = splits[i - 1];
      const current = splits[i];
      
      // Calculate overlap text from end of previous chunk
      const overlapTokens = this.chunkOverlap;
      const overlapChars = overlapTokens * 4; // Approximate
      
      const overlapText = previous.substring(
        Math.max(0, previous.length - overlapChars)
      );
      
      // Prepend overlap to current chunk
      overlapped.push(overlapText + current);
    }
    
    return overlapped;
  }

  /**
   * Extract all section headers from document
   */
  extractAllSectionHeaders(text: string): string[] {
    const headers: string[] = [];
    
    // Match various header formats
    const headerPatterns = [
      /(?:^|\n)##\s+(.+)/g,           // ## Header
      /(?:^|\n)###\s+(.+)/g,          // ### Header
      /(?:^|\n)####\s+(.+)/g,         // #### Header
      /(?:^|\n)([A-Z][A-Z\s]+):/g,    // UPPERCASE: Headers
      /(?:^|\n)([0-9]+\.[0-9]*\s+.+)/g // Numbered sections
    ];
    
    for (const pattern of headerPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && !headers.includes(match[1].trim())) {
          headers.push(match[1].trim());
        }
      }
    }
    
    return headers;
  }

  /**
   * Extract section header from chunk content
   */
  extractSectionHeader(chunkText: string): string | null {
    // Try various header patterns
    const patterns = [
      /(?:^|\n)##\s+(.+)/,
      /(?:^|\n)###\s+(.+)/,
      /(?:^|\n)####\s+(.+)/,
      /^([A-Z][A-Z\s]+):/
    ];
    
    for (const pattern of patterns) {
      const match = chunkText.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    return null;
  }

  /**
   * Detect medical keywords in chunk
   */
  detectMedicalKeywords(chunkText: string): string[] {
    const detected: string[] = [];
    
    for (const keyword of this.medicalKeywords) {
      if (keyword.test(chunkText)) {
        const match = chunkText.match(keyword);
        if (match) {
          detected.push(match[0]);
        }
      }
    }
    
    return [...new Set(detected)];
  }

  /**
   * Generate chunk metadata
   */
  private generateChunkMetadata(
    content: string,
    documentId: string,
    chunkIndex: number,
    allHeaders: string[]
  ): ChunkMetadata {
    const sectionHeader = this.extractSectionHeader(content);
    const medicalKeywords = this.detectMedicalKeywords(content);
    
    // Find which headers this chunk relates to
    const relatedHeaders = allHeaders.filter(header => {
      const headerIndex = content.toLowerCase().indexOf(header.toLowerCase());
      return headerIndex !== -1;
    });

    return {
      documentId,
      chunkIndex,
      sectionHeader: this.preserveHeaders ? sectionHeader : null,
      medicalKeywords,
      relatedHeaders: relatedHeaders.length > 0 ? relatedHeaders : undefined,
      hasClinicalContent: medicalKeywords.length > 0 || relatedHeaders.length > 0
    };
  }

  /**
   * Create multiple documents from clinical text
   */
  async createDocuments(
    texts: string[],
    documentId: string
  ): Promise<DocumentChunk[]> {
    const allChunks: DocumentChunk[] = [];
    
    for (const text of texts) {
      const chunks = await this.clinicalChunking(text, documentId);
      allChunks.push(...chunks);
    }
    
    return allChunks;
  }
}

/**
 * Factory function to create ClinicalSplitter instance
 */
export function createClinicalSplitter(config?: ClinicalSplitterConfig): ClinicalSplitter {
  return new ClinicalSplitter(config);
}

export default ClinicalSplitter;

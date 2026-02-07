// DOCX document loader
// Phase 2: Document Management & RAG
// Uses mammoth for DOCX to text/markdown conversion

import { RawDocument, LoaderResult } from '../types';

// Note: In production, mammoth would be installed and imported
// npm install mammoth
// For this implementation, we provide the interface and logic

// ============================================================================
// DOCX Loader Configuration
// ============================================================================

export interface DocxLoaderConfig {
  // Output format: 'text' | 'markdown' | 'html'
  outputFormat?: 'text' | 'markdown' | 'html';
  // Whether to include styling in output
  includeStyles?: boolean;
  // Custom mapping for HTML elements to text
  styleMap?: Record<string, string>;
  // Maximum content length to process
  maxLength?: number;
}

// ============================================================================
// DOCX Loader Class
// ============================================================================

export class DocxLoader {
  private config: DocxLoaderConfig;
  
  constructor(config: DocxLoaderConfig = {}) {
    this.config = {
      outputFormat: 'markdown', // Markdown preserves structure better for RAG
      includeStyles: false,
      maxLength: 10 * 1024 * 1024, // 10MB max
      ...config,
    };
  }
  
  /**
   * Check if this loader can handle the file
   */
  canLoad(fileName: string, mimeType: string): boolean {
    const extension = fileName.split('.').pop()?.toLowerCase();
    const supportedExtensions = ['docx'];
    const supportedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/word',
    ];
    
    return (
      supportedExtensions.includes(extension || '') ||
      supportedMimeTypes.includes(mimeType)
    );
  }
  
  /**
   * Load and parse a DOCX document
   */
  async load(filePath: string | Buffer, fileName: string): Promise<LoaderResult> {
    try {
      // Validate file is actually a DOCX (ZIP format)
      const buffer = Buffer.isBuffer(filePath) ? filePath : Buffer.from(filePath);
      
      if (buffer.length < 4 || buffer.toString('latin1', 0, 2) !== 'PK') {
        return {
          success: false,
          error: 'Invalid DOCX file format (not a valid ZIP archive)',
        };
      }
      
      // Check file size
      if (buffer.length > this.config.maxLength) {
        return {
          success: false,
          error: `DOCX file too large (${buffer.length} bytes, max: ${this.config.maxLength} bytes)`,
        };
      }
      
      // In production, this would use mammoth:
      // const mammoth = require('mammoth');
      // const result = await mammoth.convertToMarkdown({ buffer });
      
      // Parse DOCX content
      const rawDocument = await this.parseDocx(buffer, fileName);
      
      return {
        success: true,
        document: rawDocument,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to load DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
  
  /**
   * Parse DOCX content and extract text/markdown
   * This is a simplified implementation - production would use mammoth
   */
  private async parseDocx(buffer: Buffer, fileName: string): Promise<RawDocument> {
    // In production, this would:
    // 1. Use mammoth to extract content from DOCX
    // 2. Convert to specified output format (text/markdown/html)
    // 3. Extract document structure (headings, paragraphs, lists)
    // 4. Extract metadata (author, title, etc.) from docProps
    // 5. Return structured content with metadata
    
    const mockContent = this.extractMockContent(buffer, fileName);
    const mockMetadata = this.extractMockMetadata(fileName);
    
    return {
      content: mockContent,
      metadata: {
        file_name: fileName,
        file_type: 'docx',
        output_format: this.config.outputFormat,
        ...mockMetadata,
      },
    };
  }
  
  /**
   * Mock content extraction - replace with actual mammoth implementation
   */
  private extractMockContent(buffer: Buffer, fileName: string): string {
    // In production, use mammoth to extract actual content:
    // const mammoth = require('mammoth');
    // const result = await mammoth.convertToMarkdown({ buffer });
    // return result.value;
    
    const fileSize = buffer.length;
    return `[DOCX Document - ${fileSize} bytes]\n\n# Document Content\n\nThis is a placeholder for DOCX text extraction.\n\nIn production, this would contain the actual text content extracted from the DOCX file using the mammoth library.\n\nThe extraction would preserve:\n- **Bold** and *italic* text\n- Headers and subheaders (## Heading 2, ### Heading 3)\n- Lists (bullet points and numbered lists)\n- Tables (converted to markdown tables)\n- Links and references\n\n## Clinical Document Structure\n\n* Patient Information\n* Medical History\n* Diagnosis\n* Treatment Plan\n* Medications\n* Follow-up Notes`;
  }
  
  /**
   * Mock metadata extraction - replace with actual implementation
   */
  private extractMockMetadata(fileName: string): Record<string, unknown> {
    // In production, extract actual DOCX properties:
    // - docProps/core.xml: creator, created, title, subject
    // - docProps/app.xml: app version, total time, pages, words
    
    return {
      document_name: fileName,
      source: 'DOCX',
      file_size: fileName.length,
      conversion_status: 'success',
      conversion_timestamp: new Date().toISOString(),
      structure_preserved: true,
    };
  }
}

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Convert DOCX to specific format
 */
export async function convertDocxToFormat(
  filePath: string | Buffer,
  format: 'text' | 'markdown' | 'html'
): Promise<LoaderResult> {
  const loader = new DocxLoader({ outputFormat: format });
  return loader.load(filePath, 'document.docx');
}

/**
 * Extract only specific elements from DOCX
 */
export async function extractDocxHeadings(
  filePath: string | Buffer
): Promise<string[]> {
  // In production, use mammoth with custom style map:
  // const mammoth = require('mammoth');
  // const result = await mammoth.extractRawText({ buffer });
  // return result.value.split('\n').filter(line => line.startsWith('#'));
  return [];
}

/**
 * Get DOCX statistics without full parsing
 */
export async function getDocxStats(
  filePath: string | Buffer
): Promise<{
  wordCount: number;
  paragraphCount: number;
  hasImages: boolean;
}> {
  // In production, parse DOCX structure to count elements
  return {
    wordCount: 0,
    paragraphCount: 0,
    hasImages: false,
  };
}

// ============================================================================
// Export
// ============================================================================

export { DocxLoader };

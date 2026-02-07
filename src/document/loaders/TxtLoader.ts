// Plain text document loader
// Phase 2: Document Management & RAG
// Handles text file encoding detection and normalization

import { RawDocument, LoaderResult } from '../types';
import * as iconv from 'iconv-lite';

// ============================================================================
// Text Loader Configuration
// ============================================================================

export interface TxtLoaderConfig {
  // Output encoding
  outputEncoding?: string;
  // Maximum file size (prevent memory issues)
  maxFileSize?: number;
  // Whether to normalize line endings
  normalizeLineEndings?: boolean;
  // Whether to trim whitespace
  trimWhitespace?: boolean;
  // Maximum lines to process
  maxLines?: number;
}

// ============================================================================
// Supported Encodings
// ============================================================================

export const SUPPORTED_ENCODINGS = [
  'utf-8',
  'utf-16le',
  'utf-16be',
  'ascii',
  'iso-8859-1',
  'windows-1252',
  'shift_jis',
  'euc-kr',
] as const;

export type SupportedEncoding = typeof SUPPORTED_ENCODINGS[number];

// ============================================================================
// Text Loader Class
// ============================================================================

export class TxtLoader {
  private config: TxtLoaderConfig;
  
  constructor(config: TxtLoaderConfig = {}) {
    this.config = {
      outputEncoding: 'utf-8',
      maxFileSize: 50 * 1024 * 1024, // 50MB max (same as file upload limit)
      normalizeLineEndings: true,
      trimWhitespace: true,
      maxLines: 1000000, // 1M lines max
      ...config,
    };
  }
  
  /**
   * Check if this loader can handle the file
   */
  canLoad(fileName: string, mimeType: string): boolean {
    const extension = fileName.split('.').pop()?.toLowerCase();
    const supportedExtensions = ['txt', 'text', 'log', 'csv', 'tsv', 'md', 'markdown'];
    const supportedMimeTypes = [
      'text/plain',
      'text/markdown',
      'text/csv',
      'text/tab-separated-values',
      'application/octet-stream', // Sometimes text files are served as octet-stream
    ];
    
    return (
      supportedExtensions.includes(extension || '') ||
      supportedMimeTypes.includes(mimeType)
    );
  }
  
  /**
   * Load and parse a text document
   */
  async load(filePath: string | Buffer, fileName: string): Promise<LoaderResult> {
    try {
      // Get buffer from file path or direct buffer
      const buffer = Buffer.isBuffer(filePath) ? filePath : Buffer.from(filePath);
      
      // Check file size
      if (buffer.length > this.config.maxFileSize) {
        return {
          success: false,
          error: `Text file too large (${buffer.length} bytes, max: ${this.config.maxFileSize} bytes)`,
        };
      }
      
      // Detect encoding
      const detectedEncoding = this.detectEncoding(buffer);
      let content = '';
      
      try {
        // Convert to UTF-8
        if (iconv && iconv.decode) {
          content = iconv.decode(buffer, detectedEncoding);
        } else {
          // Fallback to built-in conversion
          content = buffer.toString('utf-8');
        }
      } catch (encodingError) {
        return {
          success: false,
          error: `Failed to decode text file with encoding '${detectedEncoding}': ${encodingError instanceof Error ? encodingError.message : 'Unknown error'}`,
        };
      }
      
      // Apply text normalization
      if (this.config.normalizeLineEndings) {
        content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      }
      
      if (this.config.trimWhitespace) {
        content = content.trim();
      }
      
      // Check line count
      const lineCount = (content.match(/\n/g) || []).length + 1;
      if (lineCount > this.config.maxLines) {
        return {
          success: false,
          error: `Text file has too many lines (${lineCount}, max: ${this.config.maxLines})`,
        };
      }
      
      // Extract metadata
      const metadata = this.extractMetadata(fileName, content, detectedEncoding);
      
      return {
        success: true,
        document: {
          content,
          metadata: {
            file_name: fileName,
            file_type: 'txt',
            ...metadata,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to load text file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
  
  /**
   * Detect text encoding from buffer
   */
  private detectEncoding(buffer: Buffer): SupportedEncoding {
    // Check for UTF-8 BOM
    if (buffer.length >= 3 && 
        buffer[0] === 0xEF && 
        buffer[1] === 0xBB && 
        buffer[2] === 0xBF) {
      return 'utf-8';
    }
    
    // Check for UTF-16 LE BOM
    if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
      return 'utf-16le';
    }
    
    // Check for UTF-16 BE BOM
    if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
      return 'utf-16be';
    }
    
    // Check for UTF-32 BOMs
    if (buffer.length >= 4) {
      if (buffer[0] === 0xFF && buffer[1] === 0xFE && buffer[2] === 0x00 && buffer[3] === 0x00) {
        return 'utf-8'; // UTF-32 LE not supported, fallback to UTF-8
      }
      if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0xFE && buffer[3] === 0xFF) {
        return 'utf-8'; // UTF-32 BE not supported, fallback to UTF-8
      }
    }
    
    // Statistical encoding detection for plain text
    // Check if content appears to be valid UTF-8
    if (this.looksLikeUtf8(buffer)) {
      return 'utf-8';
    }
    
    // Check for valid ASCII
    if (this.looksLikeAscii(buffer)) {
      return 'ascii';
    }
    
    // Default to UTF-8 for most cases
    // In production, you might use a library like 'jschardet' for better detection
    return 'utf-8';
  }
  
  /**
   * Check if buffer contains valid UTF-8
   */
  private looksLikeUtf8(buffer: Buffer): boolean {
    try {
      buffer.toString('utf-8');
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Check if buffer contains only ASCII characters
   */
  private looksLikeAscii(buffer: Buffer): boolean {
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] > 127) {
        return false;
      }
    }
    return true;
  }
  
  /**
   * Extract metadata from text content
   */
  private extractMetadata(
    fileName: string,
    content: string,
    encoding: string
  ): Record<string, unknown> {
    // Basic metadata extraction
    const lineCount = (content.match(/\n/g) || []).length + 1;
    const wordCount = (content.match(/\b\w+\b/g) || []).length;
    const charCount = content.length;
    
    // Detect if it appears to be markdown
    const isMarkdown = (
      content.startsWith('# ') ||
      content.includes('## ') ||
      content.includes('**') ||
      content.includes('```')
    );
    
    // Detect if it appears to be structured data (CSV/TSV)
    const firstLine = content.split('\n')[0] || '';
    const isDelimited = (
      firstLine.includes('\t') ||
      (firstLine.includes(',') && firstLine.split(',').length > 1)
    );
    
    return {
      encoding,
      line_count: lineCount,
      word_count: wordCount,
      char_count: charCount,
      is_markdown: isMarkdown,
      is_structured: isDelimited,
      extraction_status: 'success',
      extraction_timestamp: new Date().toISOString(),
    };
  }
}

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Convert text file to specific encoding
 */
export async function convertTextEncoding(
  filePath: string | Buffer,
  targetEncoding: SupportedEncoding
): Promise<LoaderResult> {
  const loader = new TxtLoader({ outputEncoding: targetEncoding });
  return loader.load(filePath, 'document.txt');
}

/**
 * Get text statistics without loading full content
 */
export async function getTextStats(
  filePath: string | Buffer,
  sampleSize: number = 1024 * 1024 // 1MB sample
): Promise<{
  encoding: string;
  lineCount: number;
  wordCount: number;
  isBinary: boolean;
}> {
  const buffer = Buffer.isBuffer(filePath) ? filePath : Buffer.from(filePath);
  const sample = buffer.slice(0, Math.min(sampleSize, buffer.length));
  
  // Basic stats from sample
  const sampleText = sample.toString('utf-8');
  const lineCount = (sampleText.match(/\n/g) || []).length;
  const wordCount = (sampleText.match(/\b\w+\b/g) || []).length;
  
  return {
    encoding: 'unknown', // Would need full detection
    lineCount,
    wordCount,
    isBinary: false,
  };
}

// ============================================================================
// Export
// ============================================================================

export { TxtLoader };
export type { TxtLoaderConfig };

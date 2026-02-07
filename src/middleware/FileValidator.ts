// File validation middleware for clinical document uploads
// Phase 2: Document Management & RAG
// HIPAA-compliant security validation for document uploads

import * as crypto from 'crypto';

// ============================================================================
// Constants and Configuration
// ============================================================================

// Maximum file size: 50MB (50 * 1024 * 1024 bytes)
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Allowed MIME types for clinical documents
export const ALLOWED_MIME_TYPES = [
  'application/pdf', // PDF documents
  'text/plain', // Plain text files
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
] as const;

// Allowed file extensions
export const ALLOWED_EXTENSIONS = ['pdf', 'txt', 'docx'] as const;

// Magic bytes for file type detection
const MAGIC_BYTES: Record<string, Buffer> = {
  pdf: Buffer.from('%PDF-'), // PDF file signature
  docx: Buffer.from('PK'), // DOCX is ZIP-based (Office Open XML)
  txt: Buffer.from(''), // Text files have no magic bytes
};

// ============================================================================
// Type Definitions
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  metadata: FileValidationMetadata;
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface FileValidationMetadata {
  file_hash: string;
  file_size: number;
  mime_type: string;
  detected_encoding?: string;
  validation_timestamp: string;
  file_name: string;
  detected_type: string;
}

// ============================================================================
// Clinical File Validator Class
// ============================================================================

export class ClinicalFileValidator {
  private readonly allowedMimeTypes: Set<string>;
  private readonly allowedExtensions: Set<string>;
  private readonly maxFileSize: number;
  private readonly maliciousPatterns: RegExp[];

  constructor() {
    this.allowedMimeTypes = new Set(ALLOWED_MIME_TYPES);
    this.allowedExtensions = new Set(ALLOWED_EXTENSIONS);
    this.maxFileSize = MAX_FILE_SIZE;
    
    // Patterns for malicious content detection
    this.maliciousPatterns = [
      // Script injection patterns
      /<script[\s>]/gi,
      /javascript:/gi,
      /on\w+=/gi,
      // Shell command patterns
      /\b(rm|mv|cp|chmod|chown|wget|curl|nc|bash|sh)\b/gi,
      // Path traversal attempts
      /\.\.\/.*$/gm,
      /%%2e%%2e/gi,
      // Potential executable content
      /\x00\x00\x00\x00/gi, // Null bytes at start
      /#!\/bin\/(ba)?sh/gi, // Shell script shebang
      /powershell/gi,
      // Sensitive patterns (potential PHI or credentials)
      /\b\d{3}-\d{2}-\d{4}\b/gi, // SSN pattern
      /\b\d{9}\b/gi, // Potential ID numbers
    ];
  }

  /**
   * Main validation method for clinical files
   */
  async validateClinicalFile(
    buffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const timestamp = new Date().toISOString();
    
    // Calculate file hash immediately for audit trail
    const fileHash = this.calculateFileHash(buffer);
    
    // Step 1: Validate file size
    if (buffer.length > this.maxFileSize) {
      errors.push({
        code: 'FILE_TOO_LARGE',
        message: `File size (${this.formatBytes(buffer.length)}) exceeds maximum allowed size (${this.formatBytes(this.maxFileSize)})`,
        field: 'file_size',
      });
    }
    
    // Step 2: Validate file extension
    const extension = this.getFileExtension(fileName);
    if (!this.allowedExtensions.has(extension)) {
      errors.push({
        code: 'INVALID_EXTENSION',
        message: `File extension '.${extension}' is not allowed. Allowed types: ${Array.from(this.allowedExtensions).join(', ')}`,
        field: 'file_name',
      });
    }
    
    // Step 3: Validate MIME type
    if (!this.allowedMimeTypes.has(mimeType)) {
      errors.push({
        code: 'INVALID_MIME_TYPE',
        message: `MIME type '${mimeType}' is not allowed. Allowed types: ${Array.from(this.allowedMimeTypes).join(', ')}`,
        field: 'mime_type',
      });
    }
    
    // Step 4: Magic byte validation (file signature check)
    const detectedType = this.detectFileType(buffer);
    if (detectedType !== 'unknown' && detectedType !== extension) {
      // Allow mismatches for text files (no magic bytes)
      if (detectedType !== 'txt' && extension !== detectedType) {
        errors.push({
          code: 'MAGIC_BYTES_MISMATCH',
          message: `File type mismatch: extension suggests '.${extension}' but content indicates '${detectedType}'`,
          field: 'file_content',
        });
      }
    }
    
    // Step 5: PDF-specific validation
    if (extension === 'pdf' || mimeType === 'application/pdf') {
      const pdfErrors = this.validatePdf(buffer);
      errors.push(...pdfErrors);
    }
    
    // Step 6: Scan for malicious patterns
    if (errors.length === 0) { // Only scan if basic validation passes
      const maliciousErrors = this.scanForMaliciousPatterns(buffer, fileName);
      errors.push(...maliciousErrors);
    }
    
    // Step 7: Text encoding detection for text files
    let detectedEncoding: string | undefined;
    if (extension === 'txt' || mimeType === 'text/plain') {
      detectedEncoding = this.detectTextEncoding(buffer);
    }
    
    const metadata: FileValidationMetadata = {
      file_hash: fileHash,
      file_size: buffer.length,
      mime_type: mimeType,
      detected_encoding: detectedEncoding,
      validation_timestamp: timestamp,
      file_name: fileName,
      detected_type: this.detectFileType(buffer),
    };
    
    return {
      isValid: errors.length === 0,
      errors,
      metadata,
    };
  }

  /**
   * PDF-specific validation
   */
  validatePdf(buffer: Buffer): ValidationError[] {
    const errors: ValidationError[] = [];
    const content = buffer.toString('latin1', 0, Math.min(buffer.length, 10000));
    
    // Check PDF header
    const pdfHeader = buffer.toString('latin1', 0, 5);
    if (pdfHeader !== '%PDF-') {
      errors.push({
        code: 'INVALID_PDF_HEADER',
        message: 'File does not have valid PDF header',
        field: 'pdf_header',
      });
      return errors; // Skip further validation if not a valid PDF
    }
    
    // Check for embedded JavaScript
    const jsPatterns = [
      /\/JS\s*\(/gi,
      /\/JavaScript\s*\(/gi,
      /openAction\s*<<[^>]*\/Launch/gi,
    ];
    
    for (const pattern of jsPatterns) {
      if (pattern.test(content)) {
        errors.push({
          code: 'PDF_CONTAINS_JAVASCRIPT',
          message: 'PDF contains JavaScript which is not allowed for security reasons',
          field: 'pdf_content',
        });
        break; // Only report once
      }
    }
    
    // Check for auto-open actions (potential security risk)
    const autoOpenPatterns = [
      /\/OpenAction\s*<<[^>]*\/Launch/gi,
      /\/AA\s*<<[^>]*\/Open/gi,
    ];
    
    for (const pattern of autoOpenPatterns) {
      if (pattern.test(content)) {
        errors.push({
          code: 'PDF_CONTAINS_AUTO_OPEN',
          message: 'PDF contains auto-open actions which are not allowed',
          field: 'pdf_content',
        });
        break;
      }
    }
    
    // Check for embedded files (potential data exfiltration vector)
    const embeddedFilePattern = /\/EmbeddedFiles/gi;
    if (embeddedFilePattern.test(content)) {
      errors.push({
        code: 'PDF_CONTAINS_EMBEDDED_FILES',
        message: 'PDF contains embedded files which are not allowed',
        field: 'pdf_content',
      });
    }
    
    return errors;
  }

  /**
   * Scan buffer for malicious patterns
   */
  scanForMaliciousPatterns(buffer: Buffer, fileName: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const content = buffer.toString('utf8', 0, Math.min(buffer.length, 50000)); // Check first 50KB
    
    for (let i = 0; i < this.maliciousPatterns.length; i++) {
      const pattern = this.maliciousPatterns[i];
      if (pattern.test(content)) {
        const errorCodes = [
          'SCRIPT_INJECTION',
          'SHELL_COMMAND',
          'PATH_TRAVERSAL',
          'EXECUTABLE_CONTENT',
          'SENSITIVE_PATTERN',
        ];
        
        errors.push({
          code: `MALICIOUS_PATTERN_${errorCodes[i] || 'DETECTED'}`,
          message: `File contains potentially malicious content: ${pattern.source.substring(0, 50)}...`,
          field: 'file_content',
        });
      }
    }
    
    // Check filename for path traversal
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      errors.push({
        code: 'SUSPICIOUS_FILENAME',
        message: 'Filename contains path traversal characters',
        field: 'file_name',
      });
    }
    
    return errors;
  }

  /**
   * Detect file type from magic bytes
   */
  private detectFileType(buffer: Buffer): string {
    // Check PDF
    if (buffer.length >= 5 && MAGIC_BYTES.pdf.equals(buffer.slice(0, 5))) {
      return 'pdf';
    }
    
    // Check DOCX (ZIP format)
    if (buffer.length >= 4 && MAGIC_BYTES.docx.equals(buffer.slice(0, 2))) {
      return 'docx';
    }
    
    // Check for text (UTF-8 BOM or printable ASCII)
    if (this.looksLikeText(buffer)) {
      return 'txt';
    }
    
    return 'unknown';
  }

  /**
   * Check if buffer contains valid text content
   */
  private looksLikeText(buffer: Buffer): boolean {
    // Check for UTF-8 BOM
    if (buffer.length >= 3 && 
        buffer[0] === 0xEF && 
        buffer[1] === 0xBB && 
        buffer[2] === 0xBF) {
      return true;
    }
    
    // Check for UTF-16 BOM
    if (buffer.length >= 2 &&
        ((buffer[0] === 0xFF && buffer[1] === 0xFE) ||
         (buffer[0] === 0xFE && buffer[1] === 0xFF))) {
      return true;
    }
    
    // Check for printable ASCII/UTF-8 content
    let printableCount = 0;
    const sampleSize = Math.min(buffer.length, 1000);
    
    for (let i = 0; i < sampleSize; i++) {
      const byte = buffer[i];
      // Allow printable characters, spaces, tabs, newlines, and common punctuation
      if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
        printableCount++;
      } else if (byte > 127) {
        // High bytes could be valid UTF-8 continuation bytes
        printableCount++;
      }
    }
    
    return (printableCount / sampleSize) > 0.9; // 90% threshold
  }

  /**
   * Detect text encoding
   */
  private detectTextEncoding(buffer: Buffer): string {
    // Check for UTF-8 BOM
    if (buffer.length >= 3 && 
        buffer[0] === 0xEF && 
        buffer[1] === 0xBB && 
        buffer[2] === 0xBF) {
      return 'UTF-8-BOM';
    }
    
    // Check for UTF-16
    if (buffer.length >= 2) {
      if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
        return 'UTF-16-LE';
      }
      if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
        return 'UTF-16-BE';
      }
    }
    
    // Default to UTF-8
    return 'UTF-8';
  }

  /**
   * Calculate SHA-256 file hash
   */
  private calculateFileHash(buffer: Buffer): string {
    const hash = crypto.createHash('sha256');
    hash.update(buffer);
    return hash.digest('hex');
  }

  /**
   * Get file extension from filename
   */
  private getFileExtension(fileName: string): string {
    const parts = fileName.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// ============================================================================
// Singleton instance for easy import
// ============================================================================

export const fileValidator = new ClinicalFileValidator();

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Validate file from buffer
 */
export async function validateFile(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<ValidationResult> {
  return fileValidator.validateClinicalFile(buffer, fileName, mimeType);
}

/**
 * Validate PDF-specific security concerns
 */
export function validatePdf(buffer: Buffer): ValidationError[] {
  return fileValidator.validatePdf(buffer);
}

/**
 * Scan for malicious patterns
 */
export function scanForMaliciousPatterns(
  buffer: Buffer,
  fileName: string
): ValidationError[] {
  return fileValidator.scanForMaliciousPatterns(buffer, fileName);
}

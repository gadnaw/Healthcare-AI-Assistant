/**
 * PHI Sanitizer Service
 * 
 * Service for sanitizing user input by detecting and redacting PHI entities.
 * Ensures HIPAA compliance by removing Protected Health Information from input.
 */

import { PHIDetectorService, DetectedPHI, PHIDetectionResult } from './detector';
import { PHI_BLOCK_THRESHOLD } from '../../lib/constants';

export interface RedactionInfo {
  type: string;
  originalValue: string;
  replacement: string;
  startIndex: number;
  endIndex: number;
}

export interface SanitizationResult {
  sanitized: boolean;
  originalLength: number;
  sanitizedLength: number;
  redactions: RedactionInfo[];
  phiDetected: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  detectionDetails?: PHIDetectionResult;
}

class PHISanitizer {
  private detector: PHIDetectorService;
  private redactionSymbol: string;
  private redactAll: boolean;

  constructor(detector?: PHIDetectorService, redactAll: boolean = true) {
    this.detector = detector || new PHIDetectorService();
    this.redactionSymbol = '[REDACTED]';
    this.redactAll = redactAll;
  }

  /**
   * Sanitize input by replacing PHI with redaction markers
   * @param input - The input string to sanitize
   * @returns Sanitized string with PHI replaced
   */
  sanitize(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    const entities = this.detector.detectEntities(input);
    
    if (entities.length === 0) {
      return input;
    }

    // Sort entities by start position (descending) to replace from end to start
    const sortedEntities = [...entities].sort((a, b) => b.startIndex - a.startIndex);

    let sanitized = input;

    for (const entity of sortedEntities) {
      const redaction = this.getRedactionText(entity.type);
      sanitized = sanitized.substring(0, entity.startIndex) + 
                  redaction + 
                  sanitized.substring(entity.endIndex);
    }

    return sanitized;
  }

  /**
   * Sanitize input and return detailed redaction information
   * @param input - The input string to sanitize
   * @returns SanitizationResult with details about redactions
   */
  redactPHI(input: string): SanitizationResult {
    if (!input || typeof input !== 'string') {
      return this.createEmptyResult();
    }

    const detectionResult = this.detector.detect(input);
    
    if (!detectionResult.hasPHI) {
      return {
        sanitized: false,
        originalLength: input.length,
        sanitizedLength: input.length,
        redactions: [],
        phiDetected: false,
        riskLevel: 'low'
      };
    }

Entities = [...det    const sortedectionResult.entities].sort((a, b) => b.startIndex - a.startIndex);
    const redactions: RedactionInfo[] = [];
    let sanitized = input;

    for (const entity of sortedEntities) {
      const replacement = this.getRedactionText(entity.type);
      const redactionInfo: RedactionInfo = {
        type: entity.type,
        originalValue: entity.value,
        replacement,
        startIndex: entity.startIndex,
        endIndex: entity.endIndex
      };
      redactions.push(redactionInfo);

      sanitized = sanitized.substring(0, entity.startIndex) + 
                  replacement + 
                  sanitized.substring(entity.endIndex);
    }

    return {
      sanitized: true,
      originalLength: input.length,
      sanitizedLength: sanitized.length,
      redactions,
      phiDetected: true,
      riskLevel: detectionResult.riskLevel,
      detectionDetails: detectionResult
    };
  }

  /**
   * Check if input is free of PHI
   * @param input - The input string to check
   * @returns boolean indicating if input contains no PHI
   */
  isPHIFree(input: string): boolean {
    if (!input || typeof input !== 'string') {
      return true;
    }

    const result = this.detector.detect(input);
    return !result.hasPHI;
  }

  /**
   * Sanitize input but preserve the original structure
   * Useful for debugging while maintaining compliance
   * @param input - The input string to sanitize
   * @returns Object with sanitized version and metadata
   */
  sanitizeWithMetadata(input: string): {
    sanitized: string;
    originalLength: number;
    sanitizedLength: number;
    entitiesRemoved: number;
    riskLevel: 'low' | 'medium' | 'high';
  } {
    const result = this.redactPHI(input);

    return {
      sanitized: result.sanitized ? this.sanitize(input) : input,
      originalLength: result.originalLength,
      sanitizedLength: result.sanitizedLength,
      entitiesRemoved: result.redactions.length,
      riskLevel: result.riskLevel
    };
  }

  /**
   * Get the redaction text for a specific PHI type
   * @param phiType - The type of PHI to redact
   * @returns Redaction text string
   */
  private getRedactionText(phiType: string): string {
    const redactionMap: Record<string, string> = {
      'SSN': '[REDACTED-SSN]',
      'MRN': '[REDACTED-MRN]',
      'DOB': '[REDACTED-DOB]',
      'phone': '[REDACTED-PHONE]',
      'email': '[REDACTED-EMAIL]',
      'address': '[REDACTED-ADDRESS]',
      'medicare': '[REDACTED-MEDICARE]',
      'insurance': '[REDACTED-INSURANCE]',
      'passport': '[REDACTED-PASSPORT]',
      'drivers_license': '[REDACTED-DL]'
    };

    return redactionMap[phiType] || '[REDACTED-PHI]';
  }

  /**
   * Create empty sanitization result
   * @returns Empty SanitizationResult
   */
  private createEmptyResult(): SanitizationResult {
    return {
      sanitized: false,
      originalLength: 0,
      sanitizedLength: 0,
      redactions: [],
      phiDetected: false,
      riskLevel: 'low'
    };
  }

  /**
   * Configure redaction symbol
   * @param symbol - The symbol to use for redaction
   */
  setRedactionSymbol(symbol: string): void {
    this.redactionSymbol = symbol;
  }

  /**
   * Configure whether to redact all PHI or only high severity
   * @param redactAll - Whether to redact all PHI types
   */
  setRedactAll(redactAll: boolean): void {
    this.redactAll = redactAll;
  }
}

// Export singleton instance
export const phiSanitizer = new PHISanitizer();

// Export class for testing/customization
export { PHISanitizer };

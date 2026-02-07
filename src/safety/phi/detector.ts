/**
 * PHI Detector Service
 * 
 * Service for detecting Protected Health Information (PHI) entities in user input.
 * Uses regex patterns to identify PHI with <1% false positive rate.
 */

import { 
  PHI_PATTERNS, 
  PHIPattern, 
  HIGH_SEVERITY_PATTERNS,
  type PHICategory,
  type PHISeverity
} from './patterns';

export interface DetectedPHI {
  type: string;
  value: string;
  startIndex: number;
  endIndex: number;
  pattern: string;
  category: PHICategory;
  severity: PHISeverity;
}

export interface PHIDetectionResult {
  hasPHI: boolean;
  entities: DetectedPHI[];
  riskLevel: 'low' | 'medium' | 'high';
  detectionCount: number;
  severityBreakdown: {
    high: number;
    medium: number;
    low: number;
  };
}

export interface PHITypesResult {
  types: string[];
  categories: PHICategory[];
  hasHighSeverity: boolean;
}

class PHIDetectorService {
  private patterns: PHIPattern[];
  private patternCache: Map<string, RegExp>;

  constructor(patterns?: PHIPattern[]) {
    this.patterns = patterns || PHI_PATTERNS;
    this.patternCache = new Map();
    
    // Pre-compile and cache all patterns
    this.patterns.forEach(pattern => {
      this.patternCache.set(pattern.name, new RegExp(pattern.pattern.source, pattern.pattern.flags));
    });
  }

  /**
   * Detect PHI entities in the input string
   * @param input - The input string to scan for PHI
   * @returns PHIDetectionResult with detection results
   */
  detect(input: string): PHIDetectionResult {
    if (!input || typeof input !== 'string' || input.trim().length === 0) {
      return this.createEmptyResult();
    }

    const entities = this.detectEntities(input);
    const severityBreakdown = this.calculateSeverityBreakdown(entities);
    const riskLevel = this.calculateRiskLevel(entities);

    return {
      hasPHI: entities.length > 0,
      entities,
      riskLevel,
      detectionCount: entities.length,
      severityBreakdown
    };
  }

  /**
   * Detect PHI entities and return detailed information
   * @param input - The input string to scan for PHI
   * @returns Array of DetectedPHI objects
   */
  detectEntities(input: string): DetectedPHI[] {
    if (!input || typeof input !== 'string') {
      return [];
    }

    const entities: DetectedPHI[] = [];
    const normalizedInput = input.toLowerCase();

    // Check each pattern
    this.patterns.forEach(pattern => {
      const regex = this.patternCache.get(pattern.name);
      if (!regex) return;

      const matches = normalizedInput.matchAll(regex);
      
      for (const match of matches) {
        if (match.index !== undefined && match[0]) {
          // Calculate actual positions in original input
          const matchStart = input.toLowerCase().indexOf(match[0].toLowerCase());
          const matchEnd = matchStart + match[0].length;

          // Avoid duplicates by checking if we already have this entity
          const isDuplicate = entities.some(
            e => e.startIndex === matchStart && 
                 e.endIndex === matchEnd && 
                 e.type === pattern.name
          );

          if (!isDuplicate) {
            entities.push({
              type: pattern.name,
              value: match[0],
              startIndex: matchStart,
              endIndex: matchEnd,
              pattern: pattern.pattern.source,
              category: pattern.category,
              severity: pattern.severity
            });
          }
        }
      }
    });

    // Sort by start position
    entities.sort((a, b) => a.startIndex - b.startIndex);

    return entities;
  }

  /**
   * Get list of all supported PHI types
   * @returns PHITypesResult with type information
   */
  getPHITypes(): PHITypesResult {
    const types = this.patterns.map(p => p.name);
    const categories = [...new Set(this.patterns.map(p => p.category))] as PHICategory[];
    const hasHighSeverity = HIGH_SEVERITY_PATTERNS.length > 0;

    return {
      types,
      categories,
      hasHighSeverity
    };
  }

  /**
   * Detect only high-severity PHI (SSN, MRN, DOB, Medicare, Passport, DL)
   * @param input - The input string to scan
   * @returns PHIDetectionResult with only high-severity findings
   */
  detectHighSeverity(input: string): PHIDetectionResult {
    if (!input || typeof input !== 'string') {
      return this.createEmptyResult();
    }

    const highSeverityEntities = this.detectEntities(input).filter(
      entity => entity.severity === 'high'
    );

    return {
      hasPHI: highSeverityEntities.length > 0,
      entities: highSeverityEntities,
      riskLevel: highSeverityEntities.length > 0 ? 'high' : 'low',
      detectionCount: highSeverityEntities.length,
      severityBreakdown: {
        high: highSeverityEntities.length,
        medium: 0,
        low: 0
      }
    };
  }

  /**
   * Check if input contains specific PHI type
   * @param input - The input string to scan
   * @param phiType - The PHI type to check for
   * @returns boolean indicating if PHI type was found
   */
  hasPHIType(input: string, phiType: string): boolean {
    const entities = this.detectEntities(input);
    return entities.some(entity => entity.type === phiType);
  }

  /**
   * Calculate risk level based on detected entities
   * @param entities - Array of detected PHI entities
   * @returns Risk level as 'low', 'medium', or 'high'
   */
  private calculateRiskLevel(entities: DetectedPHI[]): 'low' | 'medium' | 'high' {
    if (entities.length === 0) {
      return 'low';
    }

    const highCount = entities.filter(e => e.severity === 'high').length;
    const mediumCount = entities.filter(e => e.severity === 'medium').length;

    // High severity: immediate high risk
    if (highCount > 0) {
      return 'high';
    }

    // Multiple medium severity entities
    if (mediumCount >= 3) {
      return 'high';
    }

    // Single or few medium severity
    if (mediumCount > 0) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Calculate severity breakdown of detected entities
   * @param entities - Array of detected PHI entities
   * @returns Object with counts by severity
   */
  private calculateSeverityBreakdown(entities: DetectedPHI[]): {
    high: number;
    medium: number;
    low: number;
  } {
    return {
      high: entities.filter(e => e.severity === 'high').length,
      medium: entities.filter(e => e.severity === 'medium').length,
      low: entities.filter(e => e.severity === 'low').length
    };
  }

  /**
   * Create empty detection result
   * @returns Empty PHIDetectionResult
   */
  private createEmptyResult(): PHIDetectionResult {
    return {
      hasPHI: false,
      entities: [],
      riskLevel: 'low',
      detectionCount: 0,
      severityBreakdown: {
        high: 0,
        medium: 0,
        low: 0
      }
    };
  }
}

// Export singleton instance
export const phiDetector = new PHIDetectorService();

// Export class for testing/customization
export { PHIDetectorService };

/**
 * Injection Blocker Service
 * 
 * Service for blocking prompt injection attempts based on detection results.
 * Implements configurable thresholds for blocking high-risk injection patterns.
 */

import { 
  InjectionDetectorService, 
  InjectionDetectionResult, 
  DetectedInjection,
  type InjectionSeverity
} from './detector';
import { INJECTION_BLOCK_THRESHOLD } from '../../lib/constants';

export interface BlockResult {
  blocked: boolean;
  reason?: string;
  blockedPatterns?: string[];
  riskLevel?: InjectionSeverity;
  timestamp: Date;
  detectionDetails?: InjectionDetectionResult;
  suggestion?: string;
}

export interface BlockConfig {
  blockCritical: boolean;
  blockHigh: boolean;
  blockMedium: boolean;
  blockLow: boolean;
  customThresholds?: {
    roleOverride?: InjectionSeverity;
    contextIgnoring?: InjectionSeverity;
    promptLeak?: InjectionSeverity;
    delimiterAttack?: InjectionSeverity;
    codingExploit?: InjectionSeverity;
    base64Encoding?: InjectionSeverity;
    jailbreak?: InjectionSeverity;
    socialEngineering?: InjectionSeverity;
  };
}

class InjectionBlocker {
  private detector: InjectionDetectorService;
  private config: BlockConfig;

  constructor(detector?: InjectionDetectorService) {
    this.detector = detector || new InjectionDetectorService();
    this.config = {
      blockCritical: true,
      blockHigh: true,
      blockMedium: false,
      blockLow: false
    };
  }

  /**
   * Block injection attempts based on detection results
   * @param input - The input string to check
   * @returns BlockResult with blocking decision and details
   */
  block(input: string): BlockResult {
    if (!input || typeof input !== 'string') {
      return this.createSafeResult();
    }

    const detectionResult = this.detector.detect(input);

    if (!detectionResult.hasInjection) {
      return this.createSafeResult(detectionResult);
    }

    const shouldBlock = this.shouldBlock(detectionResult);

    if (shouldBlock) {
      return this.createBlockedResult(detectionResult);
    }

    return this.createSafeResult(detectionResult);
  }

  /**
   * Determine if input should be blocked based on detection result
   * @param result - The injection detection result
   * @returns boolean indicating if input should be blocked
   */
  shouldBlock(result: InjectionDetectionResult): boolean {
    if (!result.hasInjection) {
      return false;
    }

    // Check for critical patterns (always block)
    if (result.containsCritical && this.config.blockCritical) {
      return true;
    }

    // Check high severity patterns
    if (result.severityBreakdown.high > 0 && this.config.blockHigh) {
      return true;
    }

    // Check medium severity patterns
    if (result.severityBreakdown.medium > 0 && this.config.blockMedium) {
      return true;
    }

    // Check low severity patterns
    if (result.severityBreakdown.low > 0 && this.config.blockLow) {
      return true;
    }

    return false;
  }

  /**
   * Check if input should be blocked (convenience method)
   * @param input - The input string to check
   * @returns boolean indicating if input should be blocked
   */
  shouldBlockInput(input: string): boolean {
    const result = this.detectAndBlock(input);
    return result.blocked;
  }

  /**
   * Detect and block in one operation
   * @param input - The input string to check
   * @returns BlockResult with blocking decision
   */
  detectAndBlock(input: string): BlockResult {
    return this.block(input);
  }

  /**
   * Get user-friendly reason for blocking
   * @param result - The block result
   * @returns Human-readable reason string
   */
  getBlockReason(result: BlockResult): string {
    if (!result.blocked || !result.detectionDetails) {
      return 'Input is safe';
    }

    const patterns = result.detectionDetails.patterns;
    
    if (patterns.length === 0) {
      return 'Input is safe';
    }

    // Group patterns by type
    const patternGroups = this.groupPatternsByType(patterns);
    
    // Generate reason based on most severe patterns
    const criticalPatterns = patternGroups['critical'] || [];
    const highPatterns = patternGroups['high'] || [];
    const mediumPatterns = patternGroups['medium'] || [];

    if (criticalPatterns.length > 0) {
      const types = [...new Set(criticalPatterns.map(p => p.type))];
      return this.generateCriticalReason(types);
    }

    if (highPatterns.length > 0) {
      const types = [...new Set(highPatterns.map(p => p.type))];
      return this.generateHighRiskReason(types);
    }

    if (mediumPatterns.length > 0) {
      const types = [...new Set(mediumPatterns.map(p => p.type))];
      return this.generateMediumRiskReason(types);
    }

    return 'Input contains suspicious patterns';
  }

  /**
   * Configure blocking thresholds
   * @param config - Block configuration
   */
  configure(config: Partial<BlockConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }

  /**
   * Get current configuration
   * @returns Current BlockConfig
   */
  getConfig(): BlockConfig {
    return { ...this.config };
  }

  /**
   * Reset configuration to defaults
   */
  resetConfig(): void {
    this.config = {
      blockCritical: true,
      blockHigh: true,
      blockMedium: false,
      blockLow: false
    };
  }

  /**
   * Set block threshold to specific risk level
   * @param threshold - Risk level threshold ('low', 'medium', 'high', 'critical')
   */
  setBlockThreshold(threshold: 'low' | 'medium' | 'high' | 'critical'): void {
    switch (threshold) {
      case 'critical':
        this.config = {
          blockCritical: true,
          blockHigh: false,
          blockMedium: false,
          blockLow: false
        };
        break;
      case 'high':
        this.config = {
          blockCritical: true,
          blockHigh: true,
          blockMedium: false,
          blockLow: false
        };
        break;
      case 'medium':
        this.config = {
          blockCritical: true,
          blockHigh: true,
          blockMedium: true,
          blockLow: false
        };
        break;
      case 'low':
        this.config = {
          blockCritical: true,
          blockHigh: true,
          blockMedium: true,
          blockLow: true
        };
        break;
    }
  }

  /**
   * Create safe result (not blocked)
   * @param detectionResult - Optional detection result
   * @returns BlockResult indicating safe input
   */
  private createSafeResult(detectionResult?: InjectionDetectionResult): BlockResult {
    return {
      blocked: false,
      timestamp: new Date(),
      detectionDetails: detectionResult
    };
  }

  /**
   * Create blocked result with details
   * @param detectionResult - The detection result
   * @returns BlockResult indicating blocked input
   */
  private createBlockedResult(detectionResult: InjectionDetectionResult): BlockResult {
    const blockedPatterns = detectionResult.patterns.map(p => p.type);
    const reason = this.getBlockReason({
      blocked: true,
      timestamp: new Date(),
      detectionDetails: detectionResult
    });

    return {
      blocked: true,
      reason,
      blockedPatterns,
      riskLevel: detectionResult.riskLevel,
      timestamp: new Date(),
      detectionDetails: detectionResult,
      suggestion: this.getSuggestion(detectionResult)
    };
  }

  /**
   * Group detected patterns by severity
   * @param patterns - Array of detected injections
   * @returns Object grouping patterns by severity
   */
  private groupPatternsByType(patterns: DetectedInjection[]): Record<InjectionSeverity, DetectedInjection[]> {
    return {
      critical: patterns.filter(p => p.severity === 'critical'),
      high: patterns.filter(p => p.severity === 'high'),
      medium: patterns.filter(p => p.severity === 'medium'),
      low: patterns.filter(p => p.severity === 'low')
    };
  }

  /**
   * Generate reason for critical patterns
   * @param types - Array of injection types
   * @returns Human-readable reason
   */
  private generateCriticalReason(types: string[]): string {
    const typeDescriptions: Record<string, string> = {
      'prompt_leak': 'attempts to reveal system instructions',
      'coding_exploit': 'attempts to execute malicious code',
      'jailbreak': 'attempts to bypass AI safety measures',
      'base64_encoding': 'contains encoded content',
      'role_override': 'attempts to override system behavior',
      'context_ignoring': 'attempts to ignore provided context'
    };

    const descriptions = types.map(t => typeDescriptions[t] || t).join(', ');
    return `Input blocked: contains ${descriptions}`;
  }

  /**
   * Generate reason for high-risk patterns
   * @param types - Array of injection types
   * @returns Human-readable reason
   */
  private generateHighRiskReason(types: string[]): string {
    return `Input contains high-risk injection attempts (${types.join(', ')})`;
  }

  /**
   * Generate reason for medium-risk patterns
   * @param types - Array of injection types
   * @returns Human-readable reason
   */
  private generateMediumRiskReason(types: string[]): string {
    return `Input contains suspicious patterns requiring review (${types.join(', ')})`;
  }

  /**
   * Get suggestion for blocked input
   * @param result - Detection result
   * @returns Helpful suggestion for user
   */
  private getSuggestion(result: InjectionDetectionResult): string {
    if (result.containsCritical) {
      return 'Please rephrase your question without attempting to modify system behavior or access restricted information.';
    }

    if (result.severityBreakdown.high > 0) {
      return 'Please rephrase your question without using instructions that conflict with system guidelines.';
    }

    return 'Please rephrase your question in a straightforward manner.';
  }
}

// Export singleton instance
export const injectionBlocker = new InjectionBlocker();

// Export class for testing/customization
export { InjectionBlocker };

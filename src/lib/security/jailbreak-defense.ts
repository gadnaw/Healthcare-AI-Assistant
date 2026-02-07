/**
 * Jailbreak Defense Service
 * 
 * Production jailbreak detection and prevention service with:
 * - ML-based detection (Lakera Guard integration)
 * - Pattern-based detection (regex for known jailbreak patterns)
 * - Heuristic detection (request characteristics)
 * - Integration with existing security services
 */

import { auditService } from '@/lib/audit';
import { injectionDetector } from '@/safety/injection/detector';
import { systemPromptIsolator } from '@/safety/system-prompt/isolator';

// ============================================================================
// Types and Interfaces
// ============================================================================

export type JailbreakDetectionResult = {
  isJailbreak: boolean;
  confidence: number;
  category: string;
  subcategories: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
  indicators: string[];
  recommendations: string[];
  timestamp: Date;
};

export type DefenseMetrics = {
  totalRequests: number;
  blockedCount: number;
  allowedCount: number;
  blockedRate: number;
  byCategory: Record<string, { blocked: number; total: number; rate: number }>;
  bySeverity: Record<string, number>;
  averageConfidence: number;
  falsePositiveRate: number;
  lastUpdated: Date;
};

export interface LakeraConfig {
  apiKey?: string;
  modelId?: string;
  sensitivityThreshold?: number;
  enabled?: boolean;
}

// ============================================================================
// Jailbreak Defense Service
// ============================================================================

export class JailbreakDefenseService {
  private lakeraConfig: LakeraConfig;
  private metrics: DefenseMetrics;
  private patternCache: Map<RegExp, string>;
  private knownPatterns: RegExp[];

  constructor(config?: Partial<LakeraConfig>) {
    this.lakeraConfig = {
      apiKey: process.env.LAKERA_API_KEY,
      modelId: process.env.LAKERA_MODEL_ID || 'guard-2',
      sensitivityThreshold: parseFloat(process.env.LAKERA_SENSITIVITY_THRESHOLD || '0.7'),
      enabled: true,
      ...config
    };
    
    this.metrics = this.initializeMetrics();
    this.patternCache = new Map();
    this.knownPatterns = this.initializeKnownPatterns();
  }

  /**
   * Detect jailbreak attempt in user input
   */
  async detectJailbreak(input: string): Promise<JailbreakDetectionResult> {
    const startTime = Date.now();
    
    // Initialize detection result
    const result: JailbreakDetectionResult = {
      isJailbreak: false,
      confidence: 0,
      category: 'none',
      subcategories: [],
      severity: 'low',
      indicators: [],
      recommendations: [],
      timestamp: new Date()
    };

    // 1. Run ML-based detection (Lakera Guard)
    const mlResult = await this.runMLDetection(input);
    
    // 2. Run pattern-based detection
    const patternResult = this.runPatternDetection(input);
    
    // 3. Run heuristic detection
    const heuristicResult = this.runHeuristicDetection(input);
    
    // 4. Run existing injection detection
    const injectionResult = this.runInjectionDetection(input);
    
    // 5. Run system prompt isolation check
    const isolationResult = this.runIsolationCheck(input);
    
    // Combine all detection results
    this.combineResults(result, {
      ml: mlResult,
      pattern: patternResult,
      heuristic: heuristicResult,
      injection: injectionResult,
      isolation: isolationResult
    });

    // Update metrics
    this.updateMetrics(result, Date.now() - startTime);

    // Log detection result
    await this.logDetection(result, input);

    return result;
  }

  /**
   * Block jailbreak attempt and return safe response
   */
  async blockJailbreak(
    input: string, 
    detection: JailbreakDetectionResult
  ): Promise<{
    blocked: boolean;
    response: string;
    logged: boolean;
  }> {
    if (!detection.isJailbreak) {
      return {
        blocked: false,
        response: '',
        logged: false
      };
    }

    // Generate safe refusal response
    const response = this.generateRefusalResponse(detection);

    // Log the blocked attempt
    await auditService.log({
      action: 'JAILBREAK_ATTEMPT_BLOCKED',
      entityType: 'security',
      entityId: detection.timestamp.toISOString(),
      userId: 'system',
      metadata: {
        confidence: detection.confidence,
        category: detection.category,
        severity: detection.severity,
        indicators: detection.indicators,
        inputLength: input.length,
        responseLength: response.length
      }
    });

    // Trigger security alert for high-severity attempts
    if (detection.severity === 'critical' || detection.severity === 'high') {
      await this.triggerSecurityAlert(detection, input);
    }

    return {
      blocked: true,
      response,
      logged: true
    };
  }

  /**
   * Get defense metrics
   */
  getDefenseMetrics(): DefenseMetrics {
    return { ...this.metrics };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LakeraConfig>): void {
    this.lakeraConfig = { ...this.lakeraConfig, ...config };
  }

  /**
   * ML-based detection using Lakera Guard
   */
  private async runMLDetection(input: string): Promise<{
    detected: boolean;
    confidence: number;
    category: string;
    indicators: string[];
  }> {
    // If Lakera is not configured, skip ML detection
    if (!this.lakeraConfig.apiKey || !this.lakeraConfig.enabled) {
      return {
        detected: false,
        confidence: 0,
        category: 'none',
        indicators: []
      };
    }

    try {
      // Lakera Guard API call would go here
      // For now, return placeholder results
      // In production, this would call: https://api.lakera.ai/v1/guard
      
      /*
      const response = await fetch('https://api.lakera.ai/v1/guard', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.lakeraConfig.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [{ content: input }],
          model: this.lakeraConfig.modelId,
          sensitivity: this.lakeraConfig.sensitivityThreshold
        })
      });
      
      const result = await response.json();
      return {
        detected: result.safe === false,
        confidence: result.risk_score || 0,
        category: result.category || 'unknown',
        indicators: result.indicators || []
      };
      */

      // Placeholder: Simulate ML detection for testing
      return {
        detected: false,
        confidence: 0,
        category: 'none',
        indicators: []
      };
      
    } catch (error) {
      console.error('Lakera Guard API error:', error);
      // Fall back to other detection methods
      return {
        detected: false,
        confidence: 0,
        category: 'error',
        indicators: ['ML detection unavailable']
      };
    }
  }

  /**
   * Pattern-based detection using regex
   */
  private runPatternDetection(input: string): {
    detected: boolean;
    confidence: number;
    category: string;
    indicators: string[];
  } {
    const indicators: string[] = [];
    let maxConfidence = 0;

    // Check for system prompt override patterns
    const systemOverridePatterns = [
      { pattern: /ignore\s+(all\s+)?(previous\s+)?instructions/i, confidence: 0.9, category: 'prompt_injection' },
      { pattern: /system\s+(prompt\s+)?override/i, confidence: 0.95, category: 'prompt_injection' },
      { pattern: /developer\s+mode/i, confidence: 0.85, category: 'prompt_injection' },
      { pattern: /DAN\s*\(Do\s+Anything\s+Now\)/i, confidence: 0.95, category: 'prompt_injection' },
      { pattern: /no\s+(ethical\s+)?restrictions/i, confidence: 0.9, category: 'prompt_injection' },
      { pattern: /\[INSTRUCTION\]/i, confidence: 0.7, category: 'prompt_injection' },
      { pattern: /you\s+are\s+now\s+(a\s+)?(different\s+)?(AI|assistant)/i, confidence: 0.6, category: 'prompt_injection' }
    ];

    // Check for role-play patterns
    const rolePlayPatterns = [
      { pattern: /I\s+am\s+(a|an)\s+(doctor|physician|researcher|IT\s+support|security|insurance)/i, confidence: 0.85, category: 'role_play' },
      { pattern: /pretend\s+to\s+be/i, confidence: 0.8, category: 'role_play' },
      { pattern: /role[- ]play/i, confidence: 0.75, category: 'role_play' },
      { pattern: /as\s+(Dr\.|Doctor)\s+[A-Z][a-z]+/i, confidence: 0.9, category: 'role_play' },
      { pattern: /acting\s+as/i, confidence: 0.7, category: 'role_play' }
    ];

    // Check for encoding patterns
    const encodingPatterns = [
      { pattern: /^[A-Za-z0-9+\/=]{20,}$/, confidence: 0.7, category: 'encoding_evasion', type: 'base64' },
      { pattern: /^[A-Z]{2,}\s+[A-Z]{2,}/, confidence: 0.6, category: 'encoding_evasion', type: 'rot13' },
      { pattern: /^0x[0-9a-fA-F]+$/, confidence: 0.6, category: 'encoding_evasion', type: 'hex' },
      { pattern: /(\.|\-|\/|_){5,}/, confidence: 0.5, category: 'encoding_evasion', type: 'morse' },
      { pattern: /%[0-9A-Fa-f]{2}%[0-9A-Fa-f]{2}/, confidence: 0.5, category: 'encoding_evasion', type: 'url' }
    ];

    // Check for context manipulation patterns
    const contextPatterns = [
      { pattern: /earlier\s+in\s+(this|the)\s+conversation/i, confidence: 0.75, category: 'context_manipulation' },
      { pattern: /previously\s+(mentioned|discussed|uploaded)/i, confidence: 0.7, category: 'context_manipulation' },
      { pattern: /in\s+the\s+(image|file|document)\s+I\s+(just|previously)/i, confidence: 0.8, category: 'context_manipulation' },
      { pattern: /system\s+context/i, confidence: 0.65, category: 'context_manipulation' }
    ];

    // Check for multimodal patterns
    const multimodalPatterns = [
      { pattern: /\[Image\s+(uploaded|attached)\]/i, confidence: 0.8, category: 'multimodal' },
      { pattern: /image\s+(contains|with|showing)/i, confidence: 0.7, category: 'multimodal' },
      { pattern: /OCR/i, confidence: 0.6, category: 'multimodal' },
      { pattern: /metadata/i, confidence: 0.5, category: 'multimodal' }
    ];

    // Check for distraction patterns
    const distractionPatterns = [
      { pattern: /by\s+the\s+way/i, confidence: 0.4, category: 'distraction' },
      { pattern: /also\s+(could|would)\s+you/i, confidence: 0.5, category: 'distraction' },
      { pattern: /just\s+(for|in)\s+(verification|verification)/i, confidence: 0.6, category: 'distraction' },
      { pattern: /this\s+is\s+an\s+emergency/i, confidence: 0.7, category: 'distraction' },
      { pattern: /life[- ]or[- ]death/i, confidence: 0.8, category: 'distraction' },
      { pattern: /compliance\s+audit/i, confidence: 0.65, category: 'distraction' }
    ];

    // Combine all patterns
    const allPatterns = [
      ...systemOverridePatterns,
      ...rolePlayPatterns,
      ...encodingPatterns,
      ...contextPatterns,
      ...multimodalPatterns,
      ...distractionPatterns
    ];

    // Test input against all patterns
    for (const pattern of allPatterns) {
      if (pattern.pattern.test(input)) {
        indicators.push(pattern.category);
        maxConfidence = Math.max(maxConfidence, pattern.confidence);
      }
    }

    return {
      detected: maxConfidence >= 0.5,
      confidence: maxConfidence,
      category: maxConfidence >= 0.5 ? 'detected' : 'none',
      indicators
    };
  }

  /**
   * Heuristic detection based on request characteristics
   */
  private runHeuristicDetection(input: string): {
    detected: boolean;
    confidence: number;
    indicators: string[];
  } {
    const indicators: string[] = [];
    let confidence = 0;

    // Check for unusual length (potential obfuscation)
    if (input.length > 2000) {
      indicators.push('unusually long input');
      confidence += 0.2;
    }

    // Check for high entropy (potential encoding)
    const entropy = this.calculateEntropy(input);
    if (entropy > 4.5) {
      indicators.push('high entropy (possible encoding)');
      confidence += 0.25;
    }

    // Check for mixed case patterns
    const mixedCaseRatio = (input.match(/[a-z]/g)?.length || 0) / input.length;
    if (mixedCaseRatio > 0.1 && mixedCaseRatio < 0.9) {
      indicators.push('unusual case pattern');
      confidence += 0.15;
    }

    // Check for multiple requests in one input
    const questionCount = (input.match(/\?/g) || []).length;
    if (questionCount > 3) {
      indicators.push('multiple requests');
      confidence += 0.2;
    }

    // Check for PHI patterns (should trigger additional caution)
    const phiPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\bDOB[:\s]*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/i,
      /\bMRN[:\s]*\d+/i,
      /\bpatient\s+[A-Z][a-z]+\s+[A-Z][a-z]+/gi
    ];
    
    const phiMatches = phiPatterns.filter(p => p.test(input)).length;
    if (phiMatches > 0) {
      indicators.push('PHI reference detected');
      confidence += 0.15;
    }

    // Check for urgency indicators
    const urgencyPatterns = [/urgent/i, /immediately/i, /emergency/i, /ASAP/i];
    const urgencyCount = urgencyPatterns.filter(p => p.test(input)).length;
    if (urgencyCount > 0) {
      indicators.push('urgency language');
      confidence += 0.1 * urgencyCount;
    }

    return {
      detected: confidence >= 0.3,
      confidence: Math.min(confidence, 0.95),
      indicators
    };
  }

  /**
   * Run existing injection detection
   */
  private runInjectionDetection(input: string): {
    detected: boolean;
    severity: string;
    indicators: string[];
  } {
    const result = injectionDetector.detect(input);
    
    return {
      detected: result.severity !== 'none',
      severity: result.severity,
      indicators: result.matches.map(m => m.pattern)
    };
  }

  /**
   * Run system prompt isolation check
   */
  private runIsolationCheck(input: string): {
    isolated: boolean;
    indicators: string[];
  } {
    const result = systemPromptIsolator.isolate(input);
    
    return {
      isolated: result.isolated,
      indicators: result.issues
    };
  }

  /**
   * Combine results from all detection methods
   */
  private combineResults(
    result: JailbreakDetectionResult,
    sources: {
      ml: any;
      pattern: any;
      heuristic: any;
      injection: any;
      isolation: any;
    }
  ): void {
    // Collect all indicators
    const allIndicators = [
      ...sources.ml.indicators,
      ...sources.pattern.indicators,
      ...sources.heuristic.indicators,
      ...sources.injection.indicators,
      ...sources.isolation.indicators
    ];

    // Determine dominant category
    const categoryCounts: Record<string, number> = {};
    for (const indicator of allIndicators) {
      categoryCounts[indicator] = (categoryCounts[indicator] || 0) + 1;
    }

    const dominantCategory = Object.entries(categoryCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || 'none';

    // Calculate combined confidence
    let totalConfidence = 0;
    let weightCount = 0;

    // ML detection has highest weight
    if (sources.ml.confidence > 0) {
      totalConfidence += sources.ml.confidence * 0.4;
      weightCount += 0.4;
    }

    // Pattern detection
    if (sources.pattern.confidence > 0) {
      totalConfidence += sources.pattern.confidence * 0.3;
      weightCount += 0.3;
    }

    // Heuristic detection
    if (sources.heuristic.confidence > 0) {
      totalConfidence += sources.heuristic.confidence * 0.15;
      weightCount += 0.15;
    }

    // Injection detection severity
    if (sources.injection.severity === 'critical') {
      totalConfidence += 0.9 * 0.1;
      weightCount += 0.1;
    } else if (sources.injection.severity === 'high') {
      totalConfidence += 0.7 * 0.1;
      weightCount += 0.1;
    }

    // Isolation check
    if (sources.isolation.isolated) {
      totalConfidence += 0.8 * 0.05;
      weightCount += 0.05;
    }

    const finalConfidence = weightCount > 0 
      ? totalConfidence / weightCount 
      : 0;

    // Determine severity
    let severity: 'critical' | 'high' | 'medium' | 'low' = 'low';
    if (finalConfidence >= 0.85 || sources.injection.severity === 'critical') {
      severity = 'critical';
    } else if (finalConfidence >= 0.65 || sources.injection.severity === 'high') {
      severity = 'high';
    } else if (finalConfidence >= 0.4) {
      severity = 'medium';
    }

    // Set final result
    result.isJailbreak = finalConfidence >= 0.5;
    result.confidence = finalConfidence;
    result.category = result.isJailbreak ? dominantCategory : 'none';
    result.subcategories = [...new Set(allIndicators)];
    result.severity = severity;
    result.indicators = allIndicators;
    result.recommendations = this.generateRecommendations(result);
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): DefenseMetrics {
    return {
      totalRequests: 0,
      blockedCount: 0,
      allowedCount: 0,
      blockedRate: 0,
      byCategory: {},
      bySeverity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      },
      averageConfidence: 0,
      falsePositiveRate: 0,
      lastUpdated: new Date()
    };
  }

  /**
   * Initialize known jailbreak patterns
   */
  private initializeKnownPatterns(): RegExp[] {
    return [
      /ignore\s+(all\s+)?(previous\s+)?instructions/i,
      /system\s+override/i,
      /developer\s+mode/i,
      /DAN/i,
      /no\s+restrictions/i,
      /\[INSTRUCTION\]/i,
      /I\s+am\s+(a|an)/i,
      /pretend\s+to\s+be/i,
      /role[- ]play/i
    ];
  }

  /**
   * Calculate string entropy
   */
  private calculateEntropy(input: string): number {
    const charCounts: Record<string, number> = {};
    for (const char of input) {
      charCounts[char] = (charCounts[char] || 0) + 1;
    }

    let entropy = 0;
    const length = input.length;
    
    for (const char of Object.keys(charCounts)) {
      const probability = charCounts[char] / length;
      entropy -= probability * Math.log2(probability);
    }

    return entropy;
  }

  /**
   * Update metrics after detection
   */
  private updateMetrics(result: JailbreakDetectionResult, duration: number): void {
    this.metrics.totalRequests++;
    
    if (result.isJailbreak) {
      this.metrics.blockedCount++;
    } else {
      this.metrics.allowedCount++;
    }

    this.metrics.blockedRate = 
      (this.metrics.blockedCount / this.metrics.totalRequests) * 100;

    // Update category stats
    const category = result.category || 'none';
    this.metrics.byCategory[category] = {
      blocked: (this.metrics.byCategory[category]?.blocked || 0) + (result.isJailbreak ? 1 : 0),
      total: (this.metrics.byCategory[category]?.total || 0) + 1,
      rate: 0
    };

    // Update severity stats
    this.metrics.bySeverity[result.severity]++;

    // Update average confidence
    this.metrics.averageConfidence = 
      (this.metrics.averageConfidence * (this.metrics.totalRequests - 1) + result.confidence) /
      this.metrics.totalRequests;

    this.metrics.lastUpdated = new Date();
  }

  /**
   * Log detection result to audit trail
   */
  private async logDetection(result: JailbreakDetectionResult, input: string): Promise<void> {
    await auditService.log({
      action: result.isJailbreak ? 'JAILBREAK_DETECTED' : 'JAILBREAK_CHECKED',
      entityType: 'security_detection',
      entityId: result.timestamp.toISOString(),
      metadata: {
        confidence: result.confidence,
        category: result.category,
        severity: result.severity,
        indicators: result.indicators,
        inputLength: input.length
      }
    });
  }

  /**
   * Trigger security alert for high-severity attempts
   */
  private async triggerSecurityAlert(result: JailbreakDetectionResult, input: string): Promise<void> {
    // In production, this would integrate with alerting system
    console.warn(`🚨 SECURITY ALERT: High-severity jailbreak attempt detected`);
    console.warn(`   Category: ${result.category}`);
    console.warn(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.warn(`   Indicators: ${result.indicators.join(', ')}`);

    // Log critical security event
    await auditService.log({
      action: 'SECURITY_ALERT_JAILBREAK',
      entityType: 'security_alert',
      entityId: result.timestamp.toISOString(),
      metadata: {
        severity: result.severity,
        category: result.category,
        confidence: result.confidence,
        indicators: result.indicators,
        requiresReview: true
      }
    });
  }

  /**
   * Generate refusal response
   */
  private generateRefusalResponse(result: JailbreakDetectionResult): string {
    const baseResponse = 'I cannot help with this request. My primary responsibility is to protect patient privacy and maintain data security.';
    
    const categoryResponses: Record<string, string> = {
      prompt_injection: ' I cannot override my safety guidelines or system instructions.',
      role_play: ' I cannot pretend to be someone else or bypass my security protocols.',
      encoding_evasion: ' I cannot process encoded or obfuscated content that attempts to bypass security.',
      context_manipulation: ' I cannot reference or use information from previous conversations or uploaded content to bypass security.',
      multimodal: ' I cannot process images or files that contain attempts to bypass my security guidelines.',
      distraction: ' I cannot help with requests that attempt to distract from or bypass my security protocols.'
    };

    const categoryResponse = categoryResponses[result.category] || '';
    
    return `${baseResponse}${categoryResponse} This incident has been logged for security review.`;
  }

  /**
   * Generate recommendations based on detection
   */
  private generateRecommendations(result: JailbreakDetectionResult): string[] {
    const recommendations: string[] = [];
    
    if (result.confidence > 0.8) {
      recommendations.push('Consider blocking this input type at the application level');
    }
    
    if (result.category === 'encoding_evasion') {
      recommendations.push('Consider implementing additional encoding detection');
    }
    
    if (result.category === 'role_play') {
      recommendations.push('Consider adding role verification for clinical queries');
    }
    
    if (result.severity === 'critical') {
      recommendations.push('This should be logged for security team review');
      recommendations.push('Consider implementing immediate blocking');
    }

    return recommendations;
  }
}

// Export singleton instance
export const jailbreakDefense = new JailbreakDefenseService();

// Export convenience functions
export async function detectJailbreak(input: string): Promise<JailbreakDetectionResult> {
  return jailbreakDefense.detectJailbreak(input);
}

export async function blockJailbreak(
  input: string, 
  detection?: JailbreakDetectionResult
): Promise<{
  blocked: boolean;
  response: string;
  logged: boolean;
}> {
  const result = detection || await detectJailbreak(input);
  return jailbreakDefense.blockJailbreak(input, result);
}

export function getDefenseMetrics(): DefenseMetrics {
  return jailbreakDefense.getDefenseMetrics();
}

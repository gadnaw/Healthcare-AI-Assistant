/**
 * System Prompt Isolator
 * 
 * Prevents system prompt injection and role override attacks through
 * content sanitization and role enforcement.
 */

import { PHISanitizer } from '@/safety/phi/sanitizer';
import { InjectionBlocker } from '@/safety/injection/blocker';
import { Message } from '@/types/chat';

/**
 * Result of system prompt isolation process
 */
export interface IsolationResult {
  isolated: boolean;
  sanitizedContent: string;
  roleEnforced: boolean;
  violations: IsolationViolation[];
}

/**
 * Types of isolation violations detected
 */
export interface IsolationViolation {
  type: 'role_override' | 'content_injection' | 'pattern_match' | 'encoding_attempt';
  original: string;
  sanitized: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * SystemPromptIsolator class
 * 
 * Implements multiple isolation strategies:
 * 1. Role enforcement - prevents role override attempts
 * 2. Content sanitization - removes injection patterns
 * 3. Pattern blocking - regex for common injection attempts
 * 4. Encoding detection - blocks base64 and other encoding
 * 5. PHI sanitization - redacts PHI from user messages
 */
export class SystemPromptIsolator {
  private rolePattern: RegExp;
  private contentPatterns: RegExp[];
  private encodingPatterns: RegExp[];
  private injectionPatterns: RegExp[];
  private sanitizer: PHISanitizer;
  private injectionBlocker: InjectionBlocker;

  constructor(sanitizer?: PHISanitizer, injectionBlocker?: InjectionBlocker) {
    this.sanitizer = sanitizer || new PHISanitizer();
    this.injectionBlocker = injectionBlocker || new InjectionBlocker();

    // Pattern to detect role override attempts
    this.rolePattern = /\b(i am|act as|pretend to be|behave like|you are|your role is|imagine you are)\b/i;

    // Patterns that indicate content injection attempts
    this.contentPatterns = [
      /<\|im_end\|>/gi,
      /<\|end_of_turn\|>/gi,
      /\[\/SYSTEM\]/gi,
      /\[SYSTEM\]/gi,
      /\{SYSTEM\}/gi,
      /\\boxed{/gi,
      /\[(INST|INSTRUCTION)\]/gi,
      /ignore (previous|all) (instructions|constraints|rules)/gi,
      /system instruction/gi,
      /override/gi,
      /jailbreak/gi,
      /DAN mode/gi,
      /developer mode/gi
    ];

    // Encoding patterns that might hide injection attempts
    this.encodingPatterns = [
      /^[A-Za-z0-9+/=]{20,}$/, // Base64-like strings
      /\\x[0-9A-Fa-f]{2}/, // Hex encoded
      /%[0-9A-Fa-f]{2}/, // URL encoded
      /&#x[0-9A-Fa-f]+;/, // HTML entities
      /\u202e|\u202d/, // Unicode direction override
      /[\u200b-\u200f\u202a-\u202e]/g // Zero-width characters
    ];

    // Common prompt injection patterns
    this.injectionPatterns = [
      /ignore (previous|all) (instructions|constraints)/gi,
      /system instruction/gi,
      /you are now/gi,
      /act as if/gi,
      /pretend to be/gi,
      /new rule/gi,
      /override rule/gi,
      /your guidelines say/gi,
      /instead of following/gi,
      /disregard (previous|all)/gi,
      /forget (previous|all) (instructions|rules)/gi,
      /from now on/gi,
      /change your behavior/gi,
      /break the rules/gi,
      /do anything now/gi,
      /you can (now|always) /gi
    ];
  }

  /**
   * Isolate system prompt from user input
   * Processes array of Message objects and ensures system messages cannot be injected
   */
  isolate(messages: Message[]): { messages: Message[]; result: IsolationResult } {
    const violations: IsolationViolation[] = [];
    const processedMessages: Message[] = [];

    for (const message of messages) {
      const processed = this.processMessage(message, violations);
      processedMessages.push(processed);
    }

    // Check if any system messages were injected
    const hasInjectedSystem = processedMessages.some(
      (msg, idx) => msg.role === 'system' && idx !== 0
    );

    if (hasInjectedSystem) {
      // Remove injected system messages
      const filteredMessages = processedMessages.filter(
        (msg, idx) => msg.role !== 'system' || idx === 0
      );
      
      violations.push({
        type: 'content_injection',
        original: 'Multiple system messages detected',
        sanitized: 'Removed injected system messages',
        severity: 'high'
      });

      return {
        messages: filteredMessages,
        result: {
          isolated: true,
          sanitizedContent: this.sanitizeContent(messages.map(m => m.content).join(' ')),
          roleEnforced: true,
          violations
        }
      };
    }

    return {
      messages: processedMessages,
      result: {
        isolated: violations.length === 0,
        sanitizedContent: this.sanitizeContent(messages.map(m => m.content).join(' ')),
        roleEnforced: true,
        violations
      }
    };
  }

  /**
   * Sanitize a single content string
   */
  sanitize(content: string): string {
    const result = this.sanitizeContent(content);
    
    // Check for encoding attempts
    for (const pattern of this.encodingPatterns) {
      if (pattern.test(content)) {
        return result; // Already sanitized by sanitizeContent
      }
    }
    
    return result;
  }

  /**
   * Enforce role constraints on messages
   */
  enforceRoles(messages: Message[]): Message[] {
    return messages.map((message, index) => {
      // Only first message can be system role
      if (message.role === 'system' && index !== 0) {
        return { ...message, role: 'user' as const };
      }
      
      // Sanitize user content
      if (message.role === 'user') {
        return {
          ...message,
          content: this.sanitizeContent(message.content)
        };
      }
      
      return message;
    });
  }

  /**
   * Process a single message and detect violations
   */
  private processMessage(message: Message, violations: IsolationViolation[]): Message {
    const content = message.content;
    let sanitized = content;
    let severity: IsolationViolation['severity'] = 'low';

    // Check for role override attempts
    if (this.detectRoleOverride(content)) {
      violations.push({
        type: 'role_override',
        original: content,
        sanitized: '[ROLE_OVERRIDE_REMOVED]',
        severity: 'high'
      });
      sanitized = '[ROLE_OVERRIDE_REMOVED]';
    }

    // Check for content injection patterns
    for (const pattern of this.contentPatterns) {
      if (pattern.test(sanitized)) {
        violations.push({
          type: 'content_injection',
          original: content,
          sanitized: sanitized.replace(pattern, '[INJECTION_PATTERN_REMOVED]'),
          severity: pattern.source.includes('SYSTEM') ? 'critical' : 'high'
        });
        sanitized = sanitized.replace(pattern, '[INJECTION_PATTERN_REMOVED]');
      }
    }

    // Check for prompt injection patterns
    for (const pattern of this.injectionPatterns) {
      if (pattern.test(sanitized)) {
        violations.push({
          type: 'pattern_match',
          original: content,
          sanitized: sanitized.replace(pattern, '[INJECTION_REMOVED]'),
          severity: 'high'
        });
        sanitized = sanitized.replace(pattern, '[INJECTION_REMOVED]');
      }
    }

    // Check for encoding attempts
    for (const pattern of this.encodingPatterns) {
      if (pattern.test(sanitized)) {
        violations.push({
          type: 'encoding_attempt',
          original: content,
          sanitized: '[ENCODED_CONTENT_REMOVED]',
          severity: 'critical'
        });
        sanitized = '[ENCODED_CONTENT_REMOVED]';
        break;
      }
    }

    // Apply PHI sanitization if available
    if (this.sanitizer && sanitized !== '[ENCODED_CONTENT_REMOVED]') {
      const phiResult = this.sanitizer.sanitize(sanitized);
      if (phiResult.redacted) {
        sanitized = phiResult.sanitizedContent;
      }
    }

    return {
      ...message,
      content: sanitized
    };
  }

  /**
   * Detect role override attempts in content
   */
  private detectRoleOverride(content: string): boolean {
    return this.rolePattern.test(content);
  }

  /**
   * Sanitize content by removing injection patterns
   */
  private sanitizeContent(content: string): string {
    let sanitized = content;

    // Remove role override patterns
    sanitized = sanitized.replace(this.rolePattern, '[ROLE_OVERRIDE_REMOVED]');

    // Remove content injection patterns
    for (const pattern of this.contentPatterns) {
      sanitized = sanitized.replace(pattern, '[INJECTION_REMOVED]');
    }

    // Remove prompt injection patterns
    for (const pattern of this.injectionPatterns) {
      sanitized = sanitized.replace(pattern, '[INJECTION_REMOVED]');
    }

    // Remove encoding attempts
    for (const pattern of this.encodingPatterns) {
      sanitized = sanitized.replace(pattern, '[ENCODED_CONTENT_REMOVED]');
    }

    return sanitized;
  }

  /**
   * Check if a message would trigger any isolation violations
   */
  wouldTriggerViolations(content: string): { wouldTrigger: boolean; violations: string[] } {
    const violations: string[] = [];

    if (this.detectRoleOverride(content)) {
      violations.push('role_override');
    }

    for (const pattern of this.injectionPatterns) {
      if (pattern.test(content)) {
        violations.push('pattern_match');
        break;
      }
    }

    for (const pattern of this.encodingPatterns) {
      if (pattern.test(content)) {
        violations.push('encoding_attempt');
        break;
      }
    }

    return {
      wouldTrigger: violations.length > 0,
      violations
    };
  }

  /**
   * Get summary of isolation settings
   */
  getSettings(): {
    patternsBlocked: number;
    hasPHISanitization: boolean;
    hasInjectionBlocking: boolean;
  } {
    return {
      patternsBlocked: 
        this.contentPatterns.length + 
        this.injectionPatterns.length + 
        this.encodingPatterns.length,
      hasPHISanitization: true,
      hasInjectionBlocking: true
    };
  }
}

/**
 * Singleton instance for system prompt isolation
 */
export const systemPromptIsolator = new SystemPromptIsolator();

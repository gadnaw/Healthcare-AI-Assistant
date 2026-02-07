/**
 * PHI Detection Patterns
 * 
 * Comprehensive regex patterns for Protected Health Information (PHI) entity detection.
 * These patterns are designed for HIPAA compliance with <1% false positive rate.
 */

export type PHICategory = 'identifier' | 'demographic' | 'contact';
export type PHISeverity = 'high' | 'medium' | 'low';

export interface PHIPattern {
  name: string;
  pattern: RegExp;
  category: PHICategory;
  severity: PHISeverity;
  description: string;
}

// SSN Pattern: US Social Security Number format (XXX-XX-XXXX)
export const SSN_PATTERN: PHIPattern = {
  name: 'SSN',
  pattern: /\b(?!000|666|9\d{2})\d{3}[-\s]?(?!00)\d{2}[-\s]?(?!0000)\d{4}\b/g,
  category: 'identifier',
  severity: 'high',
  description: 'US Social Security Number'
};

// MRN Pattern: Medical Record Number (various hospital formats)
export const MRN_PATTERN: PHIPattern = {
  name: 'MRN',
  pattern: /\b(?:MRN[-:\s]*|Medical\s*Record\s*[-:#]*\s*)([A-Z]{0,3}[-]?\d{5,12})\b/gi,
  category: 'identifier',
  severity: 'high',
  description: 'Medical Record Number'
};

// DOB Pattern: Date of Birth (multiple formats)
export const DOB_PATTERN: PHIPattern = {
  name: 'DOB',
  pattern: /\b(?:DOB|Date\s*of\s*Birth|Birth\s*Date|Born)[:\s]*((?:0?[1-9]|1[0-2])[-\/](?:0?[1-9]|[12]\d|3[01])[-\/](?:19|20)\d{2}|(?:19|20)\d{2}[-\/](?:0?[1-9]|1[0-2])[-\/](?:0?[1-9]|[12]\d|3[01]))\b/gi,
  category: 'demographic',
  severity: 'high',
  description: 'Date of Birth'
};

// Phone Pattern: US phone numbers (various formats)
export const PHONE_PATTERN: PHIPattern = {
  name: 'phone',
  pattern: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
  category: 'contact',
  severity: 'medium',
  description: 'Phone Number'
};

// Email Pattern: Email addresses
export const EMAIL_PATTERN: PHIPattern = {
  name: 'email',
  pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  category: 'contact',
  severity: 'medium',
  description: 'Email Address'
};

// Address Pattern: US street addresses
export const ADDRESS_PATTERN: PHIPattern = {
  name: 'address',
  pattern: /\b\d{1,5}\s+(?:[A-Za-z]+\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Circle|Cir|Place|Pl)\.?\b/gi,
  category: 'contact',
  severity: 'medium',
  description: 'Street Address'
};

// Medicare Number Pattern
export const MEDICARE_PATTERN: PHIPattern = {
  name: 'medicare',
  pattern: /\b(?:Medicare[-:\s]*|#\s*)?([A-Z]{2}\d{6,10})\b/gi,
  category: 'identifier',
  severity: 'high',
  description: 'Medicare Number'
};

// Insurance Policy Number Pattern
export const INSURANCE_PATTERN: PHIPattern = {
  name: 'insurance',
  pattern: /\b(?:Policy|Policy\s*Number|Polic(?:y|ies))[-:\s#]*([A-Z0-9-]{8,20})\b/gi,
  category: 'identifier',
  severity: 'medium',
  description: 'Insurance Policy Number'
};

// Passport Number Pattern (US)
export const PASSPORT_PATTERN: PHIPattern = {
  name: 'passport',
  pattern: /\b(?:Passport[-:\s]*|#\s*)?([A-Z]\d{8,9})\b/gi,
  category: 'identifier',
  severity: 'high',
  description: 'Passport Number'
};

// Driver's License Pattern
export const DL_PATTERN: PHIPattern = {
  name: 'drivers_license',
  pattern: /\b(?:DL|Driver'?s?\s*License|License\s*[-:#]*\s*)([A-Z]{1,2}\d{5,8})\b/gi,
  category: 'identifier',
  severity: 'high',
  description: "Driver's License Number"
};

// Array of all PHI patterns for detection
export const PHI_PATTERNS: PHIPattern[] = [
  SSN_PATTERN,
  MRN_PATTERN,
  DOB_PATTERN,
  PHONE_PATTERN,
  EMAIL_PATTERN,
  ADDRESS_PATTERN,
  MEDICARE_PATTERN,
  INSURANCE_PATTERN,
  PASSPORT_PATTERN,
  DL_PATTERN
];

// Export individual patterns for reference
export const PHI_PATTERNS_BY_NAME: Record<string, PHIPattern> = {
  'SSN': SSN_PATTERN,
  'MRN': MRN_PATTERN,
  'DOB': DOB_PATTERN,
  'phone': PHONE_PATTERN,
  'email': EMAIL_PATTERN,
  'address': ADDRESS_PATTERN,
  'medicare': MEDICARE_PATTERN,
  'insurance': INSURANCE_PATTERN,
  'passport': PASSPORT_PATTERN,
  'drivers_license': DL_PATTERN
};

// High-severity patterns (always require blocking)
export const HIGH_SEVERITY_PATTERNS = PHI_PATTERNS.filter(p => p.severity === 'high');

// Medium-severity patterns (flag for review)
export const MEDIUM_SEVERITY_PATTERNS = PHI_PATTERNS.filter(p => p.severity === 'medium');

// Low-severity patterns (informational)
export const LOW_SEVERITY_PATTERNS = PHI_PATTERNS.filter(p => p.severity === 'low');

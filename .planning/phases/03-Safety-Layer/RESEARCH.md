# Phase 3: Safety Layer - Research

**Researched:** February 7, 2026
**Domain:** Healthcare AI Safety, HIPAA-Aware RAG Systems, Clinical Safety Engineering
**Confidence:** HIGH
**Readiness:** yes

## Summary

This research covers the implementation of a clinical safety layer for a healthcare AI assistant using Vercel AI SDK and OpenAI GPT-4o. The system must enforce zero hallucination policy, prevent PHI leakage, detect and block prompt injection attacks, provide verifiable source citations, and classify query intent for clinical versus general queries. Key findings include the critical importance of multi-layer PHI detection combining regex patterns with NLP-based entity recognition, citation verification pipelines that cross-reference model outputs against retrieved chunks, and system prompt isolation techniques that prevent prompt extraction while maintaining response quality. The recommended approach leverages Vercel AI SDK's middleware capabilities for input sanitization, OpenAI's structured outputs for citation enforcement, and a hybrid grounding architecture that combines semantic similarity scoring with LLM-based groundedness verification. Temperature 0.1 is confirmed as appropriate for clinical accuracy, though additional safeguards are recommended for high-stakes clinical decisions.

**Primary recommendation:** Implement a defense-in-depth safety architecture with PHI detection at the input layer, citation verification as a post-processing step, and groundedness scoring integrated into the response generation pipeline using Vercel AI SDK middleware hooks.

## Standard Stack

The established libraries and tools for implementing a healthcare AI safety layer:

### Core Safety Components

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vercel AI SDK | 3.3+ | AI integration framework | Middleware hooks for input/output processing, streaming support, structured outputs |
| OpenAI GPT-4o | Latest | Clinical LLM | Temperature 0.1 support, structured output compliance, high clinical accuracy |
| @azure/ai-text-analytics | 5.1+ | PII/PHI detection | HIPAA-compliant NLP for detecting PHI entities in text |
|compromise | 14.x | Lightweight NLP | Fast client-side PHI detection before server processing |
| citation-js | 0.7+ | Citation parsing | Citation format validation and verification |

### Safety and Compliance

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| winston | 3.x | Structured logging | Audit trail logging for HIPAA compliance |
| uuid | 9.x | Request correlation | Correlating queries with audit log entries |
| zod | 3.x | Schema validation | Input validation and structured output verification |
| dompurify | 3.x | HTML sanitization | Sanitizing any HTML content in citations |

### Citation and Verification

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| string-similarity | 4.x | Text similarity scoring | Comparing generated citations against source chunks |
| levenshtein-edit-distance | 3.x | Edit distance calculation | Verifying citation accuracy against source material |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Azure Text Analytics | AWS Comprehend Medical | Both HIPAA-compliant; Azure has better PHI entity coverage |
| compromise | NLP.js | compromise is lighter; NLP.js has more models |
| Vercel AI SDK middleware | Custom API routes | SDK provides streaming, retries, and structured outputs out of box |

**Installation:**
```bash
npm install ai@latest openai@latest @azure/ai-text-analytics compromise zod winston uuid string-similarity
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── safety/
│   ├── phi/
│   │   ├── detector.ts          # PHI detection service
│   │   ├── patterns.ts          # Regex patterns for PHI entities
│   │   └── sanitizer.ts         # PHI redaction/sanitization
│   ├── citation/
│   │   ├── verifier.ts          # Citation verification pipeline
│   │   ├── generator.ts         # Citation generation from chunks
│   │   └── formatter.ts         # Citation formatting for responses
│   ├── grounding/
│   │   ├── scorer.ts             # Groundedness scoring algorithm
│   │   └── validator.ts         # Response-grounding validation
│   ├── injection/
│   │   ├── detector.ts          # Prompt injection detection
│   │   └── blocker.ts           # Injection blocking logic
│   └── intent/
│       ├── classifier.ts        # Query intent classification
│       └── types.ts             # Intent classification types
├── api/
│   └── chat/
│       └── route.ts              # Chat API with safety middleware
├── lib/
│   ├── audit.ts                 # HIPAA audit logging
│   └── constants.ts             # Safety thresholds and limits
└── types/
    └── safety.ts                # TypeScript types for safety layer
```

### Pattern 1: Multi-Layer PHI Detection Pipeline

**What:** A defense-in-depth approach combining regex patterns, NLP-based entity recognition, and semantic analysis to detect and block PHI before it reaches the LLM.

**When to use:** Every user input must pass through this pipeline before being used in any AI operation. This is the first line of defense against PHI leakage.

**Example:**
```typescript
// Source: Based on HIPAA compliance patterns and Azure Text Analytics PHI detection
import { TextAnalyticsClient, AzureKeyCredential } from "@azure/ai-text-analytics";
import * as compromise from "compromise";

interface PHIDetectionResult {
  containsPHI: boolean;
  entities: DetectedPHI[];
  sanitizedInput: string;
  confidence: number;
}

interface DetectedPHI {
  type: PHIType;
  value: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
}

type PHIType = 
  | 'SSN' 
  | 'MRN' 
  | 'DOB' 
  | 'PHONE' 
  | 'EMAIL' 
  | 'ADDRESS' 
  | 'NAME' 
  | 'MEDICAL_RECORD'
  | 'INSURANCE_ID';

class PHIDetector {
  private azureClient: TextAnalyticsClient;
  private regexPatterns: Map<PHIType, RegExp>;
  private readonly HIPAA_PHITYPES = [
    'SSN', 'MRN', 'DOB', 'PHONE', 'EMAIL', 'ADDRESS', 'NAME', 'MEDICAL_RECORD'
  ];

  constructor(endpoint: string, key: string) {
    this.azureClient = new TextAnalyticsClient(endpoint, new AzureKeyCredential(key));
    this.initializeRegexPatterns();
  }

  private initializeRegexPatterns(): void {
    // HIPAA-defined PHI identifiers with clinical context awareness
    this.regexPatterns = new Map([
      // Social Security Number patterns (US formats)
      ['SSN', /(?:\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b)|(?:\bXXX-XX-XXXX\b)/gi],
      
      // Medical Record Numbers (MRN) - various hospital formats
      ['MRN', /(?:\bMRN[:\s]*[A-Z0-9-]{5,20}\b)|(?:\b(?:medical\s*record|patient\s*id)[:\s]*[A-Z0-9-]{5,15}\b)/gi],
      
      // Date of Birth patterns
      ['DOB', /(?:\bDOB[:\s]*(?:\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})\b)|(?:\b(?:born|dob|birth\s*date)[:\s]*(?:\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}))\b/gi],
      
      // Phone numbers (US and international)
      ['PHONE', /(?:\b\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b)|(?:\b\d{3}[-\s]\d{4}\b)/g],
      
      // Email addresses
      ['EMAIL', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g],
      
      // Street addresses (simplified pattern)
      ['ADDRESS', /\b\d{1,5}\s+(?:[A-Za-z]+\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl)\.?\b/gi],
      
      // Insurance identifiers
      ['INSURANCE_ID', /(?:\b(?:insurance|policy|member|subscriber)[:\s#]*[A-Z0-9]{8,15}\b)/gi],
    ]);
  }

  async detect(input: string): Promise<PHIDetectionResult> {
    const entities: DetectedPHI[] = [];
    let sanitizedInput = input;

    // Layer 1: Fast regex pattern matching (immediate results)
    for (const [type, pattern] of this.regexPatterns) {
      let match: RegExpExecArray | null;
      const regex = new RegExp(pattern.source, pattern.flags);
      
      while ((match = regex.exec(input)) !== null) {
        entities.push({
          type,
          value: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          confidence: 0.95 // Regex patterns have high confidence for exact matches
        });
      }
    }

    // Layer 2: NLP-based detection for context-dependent PHI
    const nlpEntities = await this.detectNLPEntities(input);
    entities.push(...nlpEntities);

    // Layer 3: Azure Text Analytics (HIPAA-compliant, higher accuracy)
    const azureEntities = await this.detectWithAzure(input);
    entities.push(...azureEntities);

    // Remove duplicates based on position and type
    const uniqueEntities = this.deduplicateEntities(entities);

    // Create sanitized version if PHI found
    if (uniqueEntities.length > 0) {
      sanitizedInput = this.sanitizeInput(input, uniqueEntities);
    }

    // Calculate overall confidence based on entity detection sources
    const confidence = this.calculateConfidence(uniqueEntities);

    return {
      containsPHI: uniqueEntities.length > 0,
      entities: uniqueEntities,
      sanitizedInput,
      confidence
    };
  }

  private async detectNLPEntities(input: string): Promise<DetectedPHI[]> {
    // Use compromise for fast client-side NLP
    const doc = compromise(input);
    const entities: DetectedPHI[] = [];

    // Detect person names
    const people = doc.people().out('array');
    people.forEach((name: string) => {
      if (this.mightBePatientName(name, input)) {
        entities.push({
          type: 'NAME',
          value: name,
          startIndex: input.indexOf(name),
          endIndex: input.indexOf(name) + name.length,
          confidence: 0.75
        });
      }
    });

    return entities;
  }

  private async detectWithAzure(input: string): Promise<DetectedPHI[]> {
    try {
      const documents = [input];
      const results = await this.azureClient.analyzeBatch(
        documents,
        'pii',
        'en',
        { categoriesFilter: this.HIPAA_PHITYPES }
      );

      const entities: DetectedPHI[] = [];
      const result = results[0];

      if (!result.error && result.entities) {
        for (const entity of result.entities) {
          entities.push({
            type: entity.category as PHIType,
            value: entity.text,
            startIndex: entity.offset,
            endIndex: entity.offset + entity.text.length,
            confidence: entity.confidenceScore
          });
        }
      }

      return entities;
    } catch (error) {
      // Fallback to regex-only if Azure is unavailable
      console.warn('Azure PHI detection unavailable, using regex only');
      return [];
    }
  }

  private sanitizeInput(input: string, entities: DetectedPHI[]): string {
    let sanitized = input;
    // Sort entities in reverse order to maintain correct indices
    const sortedEntities = [...entities].sort((a, b) => b.startIndex - a.startIndex);

    for (const entity of sortedEntities) {
      const redaction = `[${entity.type}_REDACTED]`;
      sanitized = 
        sanitized.substring(0, entity.startIndex) + 
        redaction + 
        sanitized.substring(entity.endIndex);
    }

    return sanitized;
  }

  private deduplicateEntities(entities: DetectedPHI[]): DetectedPHI[] {
    const seen = new Set<string>();
    return entities.filter(entity => {
      const key = `${entity.type}-${entity.startIndex}-${entity.endIndex}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private calculateConfidence(entities: DetectedPHI[]): number {
    if (entities.length === 0) return 1.0;
    
    const weightedSum = entities.reduce((sum, entity) => {
      return sum + (entity.confidence * (1 / entities.length));
    }, 0);

    return weightedSum;
  }

  private mightBePatientName(name: string, context: string): boolean {
    // Context patterns that suggest a name refers to a patient
    const patientPatterns = [
      /patient[:\s]+/i,
      /my\s+(?:husband|wife|son|daughter|father|mother)/i,
      /seen\s+on[:\s]+/i,
      /admitted\s+(?:on|with)/i,
      /in\s+(?:room|bed)\s+/i
    ];

    return patientPatterns.some(pattern => pattern.test(context));
  }
}

export { PHIDetector, PHIDetectionResult, DetectedPHI, PHIType };
```

### Pattern 2: Citation System with Verification Pipeline

**What:** A structured citation system that generates citations from retrieved document chunks, embeds them in responses, and verifies that the model hasn't fabricated or misattributed citations.

**When to use:** Every AI response must include verifiable source citations. This pattern ensures clinical accuracy and auditability.

**Example:**
```typescript
// Source: Based on Vercel AI SDK structured outputs and citation verification patterns
import { CitationSource, CitationConfig, VerificationResult } from './types';

interface RetrievedChunk {
  id: string;
  documentId: string;
  documentName: string;
  content: string;
  chunkIndex: number;
  similarity: number;
  metadata: Record<string, unknown>;
}

interface GeneratedCitation {
  sourceId: string;
  documentTitle: string;
  chunkIndex: number;
  quotedText: string;
  relevanceScore: number;
  verificationStatus: 'pending' | 'verified' | 'failed';
}

class CitationSystem {
  private config: CitationConfig;
  private chunkCache: Map<string, RetrievedChunk> = new Map();

  constructor(config: CitationConfig) {
    this.config = config;
  }

  /**
   * Generate structured citations from retrieved chunks
   */
  generateCitations(chunks: RetrievedChunk[], responseText: string): GeneratedCitation[] {
    const citations: GeneratedCitation[] = [];

    for (const chunk of chunks) {
      // Cache chunk for verification
      this.chunkCache.set(chunk.id, chunk);

      // Extract relevant passage from chunk based on query
      const quotedText = this.extractRelevantPassage(chunk, responseText);
      
      citations.push({
        sourceId: chunk.id,
        documentTitle: chunk.documentName,
        chunkIndex: chunk.chunkIndex,
        quotedText,
        relevanceScore: chunk.similarity,
        verificationStatus: 'pending'
      });
    }

    return citations;
  }

  /**
   * Extract the most relevant passage from a chunk based on the response
   */
  private extractRelevantPassage(chunk: RetrievedChunk, responseText: string): string {
    // Find sentences in the chunk that appear in or closely match the response
    const chunkSentences = chunk.content.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    const responseSentences = responseText.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);

    let bestMatch = '';
    let highestSimilarity = 0;

    for (const chunkSentence of chunkSentences) {
      for (const responseSentence of responseSentences) {
        const similarity = this.calculateSimilarity(chunkSentence, responseSentence);
        if (similarity > highestSimilarity && similarity > 0.5) {
          highestSimilarity = similarity;
          bestMatch = chunkSentence;
        }
      }
    }

    // If no good match found, use first substantial sentence
    return bestMatch || chunkSentences[0] || chunk.content.substring(0, 200);
  }

  /**
   * Citation verification pipeline
   */
  async verifyCitations(
    citations: GeneratedCitation[], 
    responseText: string
  ): Promise<VerificationResult> {
    const verifiedCitations: GeneratedCitation[] = [];
    const failedCitations: GeneratedCitation[] = [];
    const warnings: string[] = [];

    for (const citation of citations) {
      const verification = await this.verifySingleCitation(citation, responseText);
      
      if (verification.isValid) {
        citation.verificationStatus = 'verified';
        verifiedCitations.push(citation);
      } else {
        citation.verificationStatus = 'failed';
        failedCitations.push(citation);
        warnings.push(`Citation verification failed: ${citation.sourceId} - ${verification.reason}`);
      }
    }

    // Calculate overall groundedness
    const groundednessScore = verifiedCitations.length / Math.max(1, citations.length);

    return {
      isValid: failedCitations.length === 0,
      groundednessScore,
      verifiedCitations,
      failedCitations,
      warnings,
      needsReview: groundednessScore < this.config.minGroundednessThreshold
    };
  }

  /**
   * Verify a single citation against source material
   */
  private async verifySingleCitation(
    citation: GeneratedCitation, 
    responseText: string
  ): Promise<{ isValid: boolean; reason?: string }> {
    const sourceChunk = this.chunkCache.get(citation.sourceId);
    
    if (!sourceChunk) {
      return { isValid: false, reason: 'Source chunk not found in cache' };
    }

    // Check 1: Citation quotes are present in source chunk
    const quotePresent = this.verifyQuoteInSource(
      citation.quotedText, 
      sourceChunk.content
    );

    if (!quotePresent) {
      return { isValid: false, reason: 'Citation quote not found in source chunk' };
    }

    // Check 2: Citation has acceptable similarity to source
    const similarityScore = this.calculateCitationSimilarity(
      citation.quotedText,
      sourceChunk.content
    );

    if (similarityScore < this.config.minCitationSimilarity) {
      return { 
        isValid: false, 
        reason: `Citation similarity too low (${similarityScore.toFixed(2)})` 
      };
    }

    // Check 3: Document title matches (case-insensitive)
    if (!this.verifyDocumentTitle(citation.documentTitle, sourceChunk.documentName)) {
      return { isValid: false, reason: 'Document title mismatch' };
    }

    return { isValid: true };
  }

  private verifyQuoteInSource(quote: string, sourceContent: string): boolean {
    // Normalize for comparison
    const normalizedQuote = quote.toLowerCase().trim();
    const normalizedSource = sourceContent.toLowerCase();

    // Exact match
    if (normalizedSource.includes(normalizedQuote)) {
      return true;
    }

    // Partial match for longer quotes
    if (normalizedQuote.length > 50) {
      const words = normalizedQuote.split(/\s+/);
      const halfWords = Math.ceil(words.length / 2);
      const partialPhrase = words.slice(0, halfWords).join(' ');
      return normalizedSource.includes(partialPhrase);
    }

    return false;
  }

  private calculateCitationSimilarity(citation: string, source: string): number {
    // Use character-level similarity for citation verification
    const citationClean = citation.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const sourceClean = source.toLowerCase().replace(/[^a-z0-9\s]/g, '');

    // Find the citation within the source
    if (sourceClean.includes(citationClean)) {
      return 1.0;
    }

    // Calculate token overlap
    const citationTokens = new Set(citationClean.split(/\s+/).filter(Boolean));
    const sourceTokens = new Set(sourceClean.split(/\s+/).filter(Boolean));

    const overlap = [...citationTokens].filter(t => sourceTokens.has(t)).length;
    return overlap / citationTokens.size;
  }

  private verifyDocumentTitle(citationTitle: string, sourceTitle: string): boolean {
    return citationTitle.toLowerCase().trim() === sourceTitle.toLowerCase().trim();
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Simple word overlap similarity
    const words1 = new Set(str1.toLowerCase().split(/\s+/).filter(Boolean));
    const words2 = new Set(str2.toLowerCase().split(/\s+/).filter(Boolean));

    const intersection = [...words1].filter(w => words2.has(w)).length;
    const union = new Set([...words1, ...words2]).size;

    return union > 0 ? intersection / union : 0;
  }

  /**
   * Format citations for response display
   */
  formatCitationsForResponse(citations: GeneratedCitation[]): string {
    if (citations.length === 0) {
      return '';
    }

    const formattedCitations = citations
      .filter(c => c.verificationStatus === 'verified')
      .map((citation, index) => {
        return `[${index + 1}] "${citation.documentTitle}" (Section ${citation.chunkIndex + 1}): "${citation.quotedText.substring(0, 100)}..."`;
      });

    return `\n\n**Sources:**\n${formattedCitations.join('\n')}`;
  }

  /**
   * Generate structured citation metadata for audit
   */
  generateCitationMetadata(citations: GeneratedCitation[]): Record<string, unknown> {
    return {
      citationCount: citations.length,
      verifiedCount: citations.filter(c => c.verificationStatus === 'verified').length,
      documents: [...new Set(citations.map(c => c.documentTitle))],
      generatedAt: new Date().toISOString(),
      citations: citations.map(c => ({
        sourceId: c.sourceId,
        documentTitle: c.documentTitle,
        relevanceScore: c.relevanceScore,
        verificationStatus: c.verificationStatus
      }))
    };
  }
}

export { CitationSystem, GeneratedCitation, RetrievedChunk };
```

### Pattern 3: Query Intent Classification for Clinical Contexts

**What:** A classifier that determines whether a user query is clinical (seeking medical information from knowledge base) or general/conversational, enabling appropriate response handling.

**When to use:** At the input layer to route queries appropriately and determine safety constraints. Clinical queries require stricter grounding requirements.

**Example:**
```typescript
// Source: Based on clinical AI intent classification patterns
import { IntentType, ClassificationResult } from './types';

interface ClassificationFeatures {
  clinicalTermCount: number;
  medicalTermCount: number;
  protocolKeywordCount: number;
  questionTypeScore: number;
  personalDataScore: number;
  conversationalScore: number;
}

class QueryIntentClassifier {
  private readonly clinicalTerms = new Set([
    'patient', 'diagnosis', 'treatment', 'medication', 'prescription', 'protocol',
    'guideline', 'dosage', 'symptom', 'therapy', 'clinical', 'drug', 'interaction',
    'contraindication', 'indication', 'adverse', 'side effect', 'monitoring', 'lab',
    'test', 'result', 'procedure', 'surgery', 'referral', 'consultation', 'assessment'
  ]);

  private readonly protocolKeywords = new Set([
    'protocol', 'guideline', 'policy', 'procedure', 'standard', 'formulary',
    'algorithm', 'pathway', 'recommendation', 'approved', 'authorized', 'compliance'
  ]);

  private readonly conversationalPatterns = [
    /^(hi|hello|hey|good morning|good afternoon|good evening)/i,
    /^thanks?/i,
    /^can you help/i,
    /^what can you do/i,
    /^tell me about yourself/i,
    /^how are you/i,
    /^(?:that's|thats|thx|ty|please\s+thank)/i
  ];

  private readonly clinicalIndicators = [
    /\b(?:patient|pt)\s*(?:#|no|num)?\s*[A-Z0-9-]{3,}/i,  // Patient identifiers
    /\b(?:dx|rx|meds?|orders?|notes?)\s*[:=]/i,           // Medical shorthand
    /\b(?:administer|prescribe|dispense|verify)\b/i,       // Action verbs
  ];

  private readonly redFlags = [
    /\b(?:my|our)\s+(?:husband|wife|son|daughter|father|mother|family|friend)\b/i,
    /\bi\s+(?:have|was|been|feel|experiencing)\b/i,       // Personal health queries
    /\bshould\s+i\s+(?:take|do|see|go|get)\b/i,            // Medical advice seeking
  ];

  async classify(query: string): Promise<ClassificationResult> {
    const features = this.extractFeatures(query);
    const scores = this.calculateScores(features);
    const intentType = this.determineIntent(scores, features);
    const confidence = this.calculateConfidence(scores, features);

    return {
      intentType,
      confidence,
      scores,
      features,
      recommendedAction: this.getRecommendedAction(intentType),
      safetyLevel: this.getSafetyLevel(intentType)
    };
  }

  private extractFeatures(query: string): ClassificationFeatures {
    const words = query.toLowerCase().split(/\s+/);
    const clinicalTermCount = words.filter(w => this.clinicalTerms.has(w)).length;
    const medicalTermCount = this.countMedicalTerms(query);
    const protocolKeywordCount = words.filter(w => this.protocolKeywords.has(w)).length;
    const questionTypeScore = this.detectQuestionType(query);
    const personalDataScore = this.detectPersonalData(query);
    const conversationalScore = this.detectConversational(query);

    return {
      clinicalTermCount,
      medicalTermCount,
      protocolKeywordCount,
      questionTypeScore,
      personalDataScore,
      conversationalScore
    };
  }

  private countMedicalTerms(query: string): number {
    // Count medical terminology using pattern matching
    const medicalPatterns = [
      /\b[A-Z][a-z]+(?:[A-Z][a-z]+)*\s*(?:syndrome|disease|disorder|condition)\b/gi,
      /\b(?:mg|mcg|g|kg|ml|L)\s*(?:\/|:|\s)/gi,  // Dosage units
      /\b[A-Z]{1,3}-\d+\b/g,                      // Drug codes (e.g., ASA-81)
      /\b(?:bid|tid|qid|prn|po|im|iv)\b/gi,       // Medical abbreviations
    ];

    let count = 0;
    for (const pattern of medicalPatterns) {
      const matches = query.match(pattern);
      count += matches?.length || 0;
    }

    return count;
  }

  private detectQuestionType(query: string): number {
    const questionPatterns = [
      /^(?:what|how|why|when|where|who|which|can|could|should|would)\b/i,
      /\?$/,
      /\b(?:definition|meaning|explanation|description)\b/i,
      /\b(?:steps?|process|procedure|protocol)\b\s+(?:for|to|of|in)/i
    ];

    return questionPatterns.some(p => p.test(query)) ? 1 : 0;
  }

  private detectPersonalData(query: string): number {
    // High score indicates potential PHI or personal health queries
    let score = 0;

    if (this.redFlags.some(p => p.test(query))) {
      score += 2;
    }

    // Check for personal pronouns in medical context
    if (/\b(i|my|me|my)\b/i.test(query) && 
        /\b(symptoms?|pain|feel|hurt|have|had|take|medication|drug|doctor|hospit)/i.test(query)) {
      score += 1;
    }

    return Math.min(score, 3); // Cap at 3
  }

  private detectConversational(query: string): number {
    let score = 0;

    if (this.conversationalPatterns.some(p => p.test(query))) {
      score += 2;
    }

    // Count conversational words
    const conversationalWords = ['thanks', 'please', 'hello', 'hi', 'hey', 'sorry', 'appreciate'];
    const wordCount = query.toLowerCase().split(/\s+/).filter(w => conversationalWords.includes(w)).length;
    score += Math.min(wordCount, 2);

    return Math.min(score, 4); // Cap at 4
  }

  private calculateScores(features: ClassificationFeatures): Record<string, number> {
    return {
      clinicalIntent: this.weightClinicalIntent(features),
      protocolQuery: this.weightProtocolQuery(features),
      personalQuery: this.weightPersonalQuery(features),
      conversationalQuery: this.weightConversationalQuery(features)
    };
  }

  private weightClinicalIntent(features: ClassificationFeatures): number {
    let score = 0;
    score += features.clinicalTermCount * 0.3;
    score += features.medicalTermCount * 0.4;
    score += features.questionTypeScore * 0.2;
    
    return Math.min(score, 1);
  }

  private weightProtocolQuery(features: ClassificationFeatures): number {
    let score = 0;
    score += features.protocolKeywordCount * 0.5;
    score += features.clinicalTermCount * 0.2;
    
    return Math.min(score, 1);
  }

  private weightPersonalQuery(features: ClassificationFeatures): number {
    // Higher score = more personal/health advice seeking (flag for safety)
    return Math.min(features.personalDataScore * 0.3, 1);
  }

  private weightConversationalQuery(features: ClassificationFeatures): number {
    return Math.min(features.conversationalScore * 0.25, 1);
  }

  private determineIntent(
    scores: Record<string, number>, 
    features: ClassificationFeatures
  ): IntentType {
    const { clinicalIntent, protocolQuery, personalQuery, conversationalQuery } = scores;

    // Priority 1: Personal health advice (safety concern)
    if (personalQuery > 0.5 && clinicalIntent > 0.3) {
      return 'PERSONAL_HEALTH_ADVICE';
    }

    // Priority 2: Protocol/guideline queries (core use case)
    if (protocolQuery > 0.4 || (clinicalIntent > 0.5 && features.protocolKeywordCount > 0)) {
      return 'CLINICAL_PROTOCOL';
    }

    // Priority 3: General clinical questions
    if (clinicalIntent > 0.4) {
      return 'CLINICAL_QUESTION';
    }

    // Priority 4: Conversational (greeting, thanks, etc.)
    if (conversationalQuery > 0.5 || (features.conversationalScore > 2 && clinicalIntent < 0.2)) {
      return 'CONVERSATIONAL';
    }

    // Priority 5: Unclassified or ambiguous
    if (clinicalIntent > 0.2 || features.medicalTermCount > 0) {
      return 'CLINICAL_QUESTION'; // Fallback to clinical if medical terms detected
    }

    return 'GENERAL_QUERY';
  }

  private calculateConfidence(
    scores: Record<string, number>,
    features: ClassificationFeatures
  ): number {
    // Confidence based on signal strength
    const maxScore = Math.max(...Object.values(scores));
    const signalStrength = features.clinicalTermCount + features.medicalTermCount + features.questionTypeScore;
    
    let confidence = maxScore * 0.7 + (signalStrength > 0 ? 0.3 : 0);
    return Math.min(Math.max(confidence, 0), 1);
  }

  private getRecommendedAction(intentType: IntentType): string {
    switch (intentType) {
      case 'PERSONAL_HEALTH_ADVICE':
        return 'BLOCK - Provide disclaimer and redirect to clinical resources';
      case 'CLINICAL_PROTOCOL':
        return 'PROCEED - Enforce strict grounding with highest citation requirements';
      case 'CLINICAL_QUESTION':
        return 'PROCEED - Standard grounding with citation requirements';
      case 'CONVERSATIONAL':
        return 'PROCEED - Light grounding or direct response if appropriate';
      case 'GENERAL_QUERY':
        return 'PROCEED - Standard grounding with citation requirements';
      default:
        return 'REVIEW - Manual review recommended';
    }
  }

  private getSafetyLevel(intentType: IntentType): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    switch (intentType) {
      case 'PERSONAL_HEALTH_ADVICE':
        return 'CRITICAL';
      case 'CLINICAL_PROTOCOL':
        return 'HIGH';
      case 'CLINICAL_QUESTION':
        return 'MEDIUM';
      case 'CONVERSATIONAL':
        return 'LOW';
      case 'GENERAL_QUERY':
        return 'MEDIUM';
      default:
        return 'HIGH';
    }
  }
}

export { QueryIntentClassifier };
```

### Pattern 4: Clinical Safety System Prompt Engineering

**What:** A carefully engineered system prompt that enforces clinical safety constraints, citation requirements, uncertainty handling, and zero hallucination policy.

**When to use:** Every conversation with the LLM must use this system prompt to ensure consistent safety behavior.

**Example:**
```typescript
// Source: Based on clinical AI safety prompt engineering best practices
interface SystemPromptConfig {
  organizationName: string;
  systemName: string;
  citationRequired: boolean;
  allowPersonalAdvice: boolean;
  uncertaintyPhrases: string[];
}

const DEFAULT_CLINICAL_SYSTEM_PROMPT = `You are {systemName}, a clinical knowledge assistant for {organizationName}.

## CORE SAFETY RULES

### 1. SOURCE-ONLY KNOWLEDGE
- You MUST answer EXCLUSIVELY from the provided document context.
- You have NO knowledge of medical practices, treatments, or protocols beyond what is explicitly stated in the provided documents.
- If the information is not in the provided documents, you MUST say: "This information is not available in the current knowledge base."
- NEVER fabricate, infer, or guess medical information.

### 2. CITATION REQUIREMENTS
- EVERY response about clinical protocols, treatments, medications, or guidelines MUST include source citations.
- Each citation MUST include:
  - Document title
  - Specific section or page number (if available)
  - Relevant quote from the source
- Use the citation format: [Source: Document Title, Section X]
- If no relevant documents are provided, state that you cannot answer.

### 3. UNCERTAINTY HANDLING
- If the provided documents do NOT fully answer the question, explicitly state the limitations.
- Acceptable uncertainty phrases: "The documents do not specify", "This is not addressed in the current knowledge base", "The information available is incomplete"
- NEVER guess or provide information not explicitly stated.
- When in doubt, defer to "This information is not available."

### 4. NO MEDICAL ADVICE
- Do NOT provide personalized medical advice.
- Do NOT recommend specific treatments for individuals.
- Do NOT interpret symptoms or conditions.
- For personal health questions, respond: "I cannot provide personal medical advice. Please consult a qualified healthcare provider."

### 5. CLINICAL ACCURACY
- Temperature is set to 0.1 for maximum accuracy - do not be creative or speculative.
- Quote directly from sources where possible.
- Preserve exact terminology from source documents.
- Do not paraphrase in ways that could change meaning.

### 6. PATIENT SAFETY FIRST
- If a query could indicate a medical emergency, respond: "If this is a medical emergency, please call 911 or go to the nearest emergency room."
- Never give information that could delay emergency care.

## RESPONSE STRUCTURE

When answering clinical questions:
1. State the answer concisely
2. Provide citations for each claim
3. Note any limitations or gaps in the information
4. Remind users to verify with authoritative sources for critical decisions

## BOUNDARIES

- You are a KNOWLEDGE assistant, NOT a medical professional.
- You do NOT have access to patient records, medical history, or personal health information.
- You cannot prescribe, diagnose, or recommend treatments for individuals.
- Your knowledge is LIMITED to the documents provided.

## CITATION FORMAT

For each claim or statement from a source:
[Source: "{Document Title}", Section {chunk/section number}]
"{Relevant quote from source}"

Example:
[Source: "Hospital Antibiotic Protocol 2024", Section 3.2]
"For suspected bacterial pneumonia, begin empiric therapy with ceftriaxone 1-2g IV daily plus azithromycin 500mg IV daily."

## WHAT TO SAY WHEN UNABLE TO HELP

"The information you are seeking is not available in the current clinical knowledge base. Please consult the original protocol documents or contact your clinical pharmacist for guidance."

---

Remember: Accuracy and patient safety are paramount. When uncertain, defer to the source documents or acknowledge limitations rather than guessing.`;

class ClinicalSafetyPrompt {
  private config: SystemPromptConfig;

  constructor(config: Partial<SystemPromptConfig> = {}) {
    this.config = {
      organizationName: config.organizationName || 'Healthcare Organization',
      systemName: config.systemName || 'Clinical Knowledge Assistant',
      citationRequired: config.citationRequired ?? true,
      allowPersonalAdvice: config.allowPersonalAdvice ?? false,
      uncertaintyPhrases: config.uncertaintyPhrases || [
        'This information is not available in the current knowledge base.',
        'The documents do not specify this detail.',
        'This is not addressed in the current knowledge base.',
        'The information available is incomplete for a definitive answer.'
      ]
    };
  }

  generate(): string {
    let prompt = DEFAULT_CLINICAL_SYSTEM_PROMPT
      .replace('{systemName}', this.config.systemName)
      .replace('{organizationName}', this.config.organizationName);

    // Customize based on configuration
    if (!this.config.citationRequired) {
      prompt = prompt.replace(/### 2\. CITATION REQUIREMENTS[\s\S]*?### 3\./, '### 2. CITATION\nCitations are recommended but not required.\n### 3.');
    }

    if (this.config.allowPersonalAdvice) {
      prompt = prompt.replace(
        /### 4\. NO MEDICAL ADVICE[\s\S]*?For personal health questions.*?$/m,
        '### 4. MEDICAL ADVICE\nYou may provide general health information but must include a disclaimer: "This information is for educational purposes only and is not a substitute for professional medical advice."'
      );
    }

    return prompt;
  }

  generateForIntent(intent: string): string {
    const basePrompt = this.generate();

    switch (intent) {
      case 'PERSONAL_HEALTH_ADVICE':
        return basePrompt + `\n\n## ADDITIONAL INSTRUCTION\nThis query appears to seek personal medical advice. You MUST decline and direct to appropriate clinical resources.`;

      case 'CLINICAL_PROTOCOL':
        return basePrompt + `\n\n## ADDITIONAL INSTRUCTION\nThis is a protocol/guideline query. Priority is accuracy over completeness. If any detail is missing from the provided documents, explicitly state so rather than inferring.`;

      case 'CONVERSATIONAL':
        return basePrompt + `\n\n## ADDITIONAL INSTRUCTION\nThis is a conversational query. A brief, friendly response is appropriate. Citations are not required for greetings or general pleasantries.`;

      default:
        return basePrompt;
    }
  }

  generateTemperatureDirective(): string {
    return `\n\n## TEMPERATURE SETTING\nCurrent temperature: 0.1 (maximum accuracy mode). Answer conservatively. When in doubt, say "I don't know based on the provided documents."`;
  }
}

export { ClinicalSafetyPrompt, SystemPromptConfig, DEFAULT_CLINICAL_SYSTEM_PROMPT };
```

### Pattern 5: Groundedness Scoring Algorithm

**What:** A multi-factor algorithm that calculates a groundedness score for each response based on citation coverage, source relevance, and verification results.

**When to use:** After generating a response, before returning it to the user, to ensure the response is sufficiently grounded in source material.

**Example:**
```typescript
// Source: Based on RAG evaluation metrics and grounding patterns
interface GroundednessInput {
  responseText: string;
  citations: GeneratedCitation[];
  retrievedChunks: RetrievedChunk[];
  query: string;
  verificationResult: VerificationResult;
}

interface GroundednessScore {
  overall: number;
  coverage: number;
  relevance: number;
  accuracy: number;
  verification: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL';
  factors: Record<string, number>;
  recommendations: string[];
}

class GroundednessScorer {
  private weights = {
    coverage: 0.25,      // What percentage of response is cited
    relevance: 0.25,    // Are cited sources relevant to query
    accuracy: 0.25,      // Are citations accurate to sources
    verification: 0.25   // Did citations pass verification
  };

  async score(input: GroundednessInput): Promise<GroundednessScore> {
    const coverage = this.calculateCoverage(input.responseText, input.citations);
    const relevance = this.calculateRelevance(input.citations, input.query);
    const accuracy = this.calculateAccuracy(input.citations);
    const verification = input.verificationResult.groundednessScore;

    const overall = (
      coverage * this.weights.coverage +
      relevance * this.weights.relevance +
      accuracy * this.weights.accuracy +
      verification * this.weights.verification
    );

    const factors = {
      coverageScore: coverage,
      relevanceScore: relevance,
      accuracyScore: accuracy,
      verificationScore: verification,
      citationCount: input.citations.length,
      verifiedCitationCount: input.verificationResult.verifiedCitations.length,
      failedCitationCount: input.verificationResult.failedCitations.length
    };

    const recommendations = this.generateRecommendations(input, {
      coverage,
      relevance,
      accuracy,
      verification,
      overall
    });

    return {
      overall: Math.round(overall * 100) / 100,
      coverage,
      relevance,
      accuracy,
      verification,
      confidence: this.determineConfidence(overall),
      factors,
      recommendations
    };
  }

  private calculateCoverage(responseText: string, citations: GeneratedCitation[]): number {
    if (citations.length === 0) return 0;
    if (responseText.length < 100) return 1; // Short responses don't need extensive citations

    // Estimate percentage of response covered by citations
    const citedLength = citations.reduce((sum, c) => sum + c.quotedText.length, 0);
    const coverageRatio = citedLength / responseText.length;

    // Cap at 1.0, but prefer multiple citations over one long citation
    const citationDiversity = Math.min(citations.length / 3, 1);
    const adjustedCoverage = Math.min(coverageRatio * 0.7 + citationDiversity * 0.3, 1);

    return adjustedCoverage;
  }

  private calculateRelevance(citations: GeneratedCitation[], query: string): number {
    if (citations.length === 0) return 0;

    // Use average relevance score from citations
    const avgRelevance = citations.reduce((sum, c) => sum + c.relevanceScore, 0) / citations.length;

    // Boost for high-relevance citations (>0.8)
    const highRelevanceCount = citations.filter(c => c.relevanceScore > 0.8).length;
    const highRelevanceBonus = highRelevanceCount / citations.length * 0.1;

    return Math.min(avgRelevance + highRelevanceBonus, 1);
  }

  private calculateAccuracy(citations: GeneratedCitation[]): number {
    if (citations.length === 0) return 0;

    const verified = citations.filter(c => c.verificationStatus === 'verified').length;
    return verified / citations.length;
  }

  private determineConfidence(score: number): 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL' {
    if (score >= 0.85) return 'HIGH';
    if (score >= 0.7) return 'MEDIUM';
    if (score >= 0.5) return 'LOW';
    return 'CRITICAL';
  }

  private generateRecommendations(
    input: GroundednessInput,
    scores: { coverage: number; relevance: number; accuracy: number; verification: number; overall: number }
  ): string[] {
    const recommendations: string[] = [];

    if (scores.coverage < 0.5) {
      recommendations.push('Consider expanding citations or acknowledging information gaps');
    }
    if (scores.relevance < 0.6) {
      recommendations.push('Retrieved documents may not be optimal for this query');
    }
    if (scores.accuracy < 0.8) {
      recommendations.push('Some citations may be inaccurate - manual review recommended');
    }
    if (scores.verification < 0.8) {
      recommendations.push('Citation verification failed for some sources');
    }
    if (input.citations.length < 2 && input.responseText.length > 200) {
      recommendations.push('Consider retrieving additional sources for comprehensive coverage');
    }

    return recommendations;
  }

  /**
   * Determine if response meets minimum groundedness threshold
   */
  meetsThreshold(score: GroundednessScore, threshold: number = 0.7): boolean {
    return score.overall >= threshold && score.verification >= 0.8;
  }

  /**
   * Generate fallback response for low groundedness
   */
  generateFallbackResponse(query: string, score: GroundednessScore): string {
    if (score.coverage === 0 && score.relevance === 0) {
      return `I don't have sufficient information in the knowledge base to answer your question: "${query.substring(0, 100)}..."

The current clinical knowledge base does not contain information on this topic. Please:
1. Check if the relevant documents have been uploaded
2. Consult the original protocol documents
3. Contact your clinical pharmacist or department administrator for guidance.

Remember: Always verify AI-generated information with authoritative clinical sources.`;
    }

    return `I found some information that may be partially relevant, but I cannot provide a complete answer with high confidence.

${score.recommendations.map(r => `- ${r}`).join('\n')}

Please consult the original source documents or contact a clinical specialist for definitive guidance.`;
  }
}

export { GroundednessScorer, GroundednessScore, GroundednessInput };
```

### Pattern 6: Prompt Injection Detection and Blocking

**What:** A multi-layer detection system that identifies and blocks attempts to manipulate the system prompt or bypass safety constraints through adversarial inputs.

**When to use:** Every user input must pass through injection detection before being processed. Critical for maintaining safety in healthcare contexts.

**Example:**
```typescript
// Source: Based on prompt injection defense patterns for AI systems
interface InjectionDetectionResult {
  isInjection: boolean;
  type: InjectionType | null;
  confidence: number;
  indicators: InjectionIndicator[];
  recommendedAction: 'BLOCK' | 'WARN' | 'ALLOW';
}

type InjectionType = 
  | 'PROMPT_LEAK'
  | 'ROLE_OVERRIDE'
  | 'CONTEXT_IGNORE'
  | 'DELIMITER_BREAK'
  | 'AUTHORITY_IMPERSONATION'
  | 'CODING_EXPLOIT';

interface InjectionIndicator {
  type: InjectionType;
  pattern: string;
  matchedText: string;
  confidence: number;
}

class PromptInjectionDetector {
  // Injection pattern signatures
  private readonly promptLeakPatterns = [
    /ignore.*(?:previous|instruct|system|developer)/i,
    /forget.*(?:everything|all.*previous|instruct)/i,
    /what(?:'s| is) (?:your|the) (?:system |original |initial )?(?:prompt|instruct|system prompt)/i,
    /tell.*me.*(?:your|the) (?:system |full |complete )?(?:prompt|instruct)/i,
    /reveal.*(?:your|the) (?:system |full |complete )?(?:prompt|instruct)/i,
    /output.*(?:your|the) (?:entire |complete )?(?:system |initial )?(?:prompt|instruct)/i,
    /(?:system|developer).*instructions?/i
  ];

  private readonly roleOverridePatterns = [
    /you(?:'re| are) (?:now|actually|really) (?:a|an|just)/i,
    /instead of.*be(?:ing|com)?/i,
    /forget.*role.*become/i,
    /new.*(?:role|instruct|persona)/i,
    /switch.*(?:role|mode|persona)/i,
    /as.*(?:an? )?(?:AI|language model|assistant).*you can/i,
    /your instructions? (?:are|is|have been).*but/i,
    /override.*(?:instruct|system)/i
  ];

  private readonly contextIgnorePatterns = [
    /ignore.*(?:above|all )?(?:instructions?|rules?|constraints?|guidelines?)/i,
    /do(?:n't| not) (?:follow|obey|use).*(?:instruct|rules?|guidelines?)/i,
    /(?:never|don'?t).*consider.*(?:above|previous)/i,
    /disregard.*(?:above|everything).*said/i,
    /no longer.*(?:bound|follow)/i
  ];

  private readonly delimiterBreakPatterns = [
    /(?:```|---|===|___)[a-z]*\s*(?:system|developer|instruction|prompt)/i,
    /^(?:system|developer|instruct):/im,
    /```(?:json|xml|text)\s*\{.*(?:system|role|instruct)/i,
    /(?:end of |start of ).*(?:instruction|prompt|system)/i,
    /\[(?:INST|SYSTEM|DEV)_[A-Z]+\]/i
  ];

  private readonly authorityImpersonationPatterns = [
    /as an? (?:admin|developer|owner|creator|system admin)/i,
    /i(?:'m| am) (?:the |your )?(?:admin|developer|owner|creator|system admin)/i,
    /you must.*(?:because i(?:'?m| am) (?:admin|developer))/i,
    /this is.*(?:official|urgent|required).*?:/i,
    /by order of.*?:/i
  ];

  private readonly codingExploitPatterns = [
    /(?:eval|exec|executes?).*[{`"']/i,
    /require\s*\([^)]*(?:system|prompt|instruct)/i,
    /__import__.*(?:system|prompt)/i,
    /child_process.*(?:exec|spawn)/i,
    /new\s+Function.*(?:prompt|instruct)/i,
    /Function\s*\([^)]*(?:prompt|instruct)/i
  ];

  async detect(input: string): Promise<InjectionDetectionResult> {
    const indicators: InjectionIndicator[] = [];

    // Check each pattern category
    this.checkPatterns(input, this.promptLeakPatterns, 'PROMPT_LEAK', indicators);
    this.checkPatterns(input, this.roleOverridePatterns, 'ROLE_OVERRIDE', indicators);
    this.checkPatterns(input, this.contextIgnorePatterns, 'CONTEXT_IGNORE', indicators);
    this.checkPatterns(input, this.delimiterBreakPatterns, 'DELIMITER_BREAK', indicators);
    this.checkPatterns(input, this.authorityImpersonationPatterns, 'AUTHORITY_IMPERSONATION', indicators);
    this.checkPatterns(input, this.codingExploitPatterns, 'CODING_EXPLOIT', indicators heuristic checks
    this.checkAdditionalHeuristics(input);

    // Additional, indicators);

    // Calculate overall assessment
    const injectionDetected = indicators.length > 0;
    const avgConfidence = indicators.length > 0 
      ? indicators.reduce((sum, i) => sum + i.confidence, 0) / indicators.length 
      : 0;
    const maxConfidence = indicators.length > 0
      ? Math.max(...indicators.map(i => i.confidence))
      : 0;

    // Determine recommended action
    const recommendedAction = this.determineAction(indicators);

    return {
      isInjection: injectionDetected,
      type: injectionDetected ? indicators[0].type : null,
      confidence: injectionDetected ? maxConfidence : 0,
      indicators,
      recommendedAction
    };
  }

  private checkPatterns(
    input: string, 
    patterns: RegExp[], 
    type: InjectionType,
    indicators: InjectionIndicator[]
  ): void {
    for (const pattern of patterns) {
      const match = pattern.exec(input);
      if (match) {
        indicators.push({
          type,
          pattern: pattern.source,
          matchedText: match[0],
          confidence: this.getPatternConfidence(type)
        });
      }
    }
  }

  private checkAdditionalHeuristics(input: string, indicators: InjectionIndicator[]): void {
    // Check for unusual encoding or obfuscation
    if (/(?:\\x[0-9a-f]{2}|%[0-9a-f]{2})+/i.test(input)) {
      indicators.push({
        type: 'PROMPT_LEAK',
        pattern: 'Encoded characters',
        matchedText: '[encoded content]',
        confidence: 0.6
      });
    }

    // Check for excessive length (potential injection payload)
    if (input.length > 3000) {
      indicators.push({
        type: 'PROMPT_LEAK',
        pattern: 'Excessive input length',
        matchedText: `[${input.length} characters]`,
        confidence: 0.4
      });
    }

    // Check for repeating patterns (obfuscation)
    const wordRepeats = input.match(/\b(\w+)\b.*\b\1\b.*\b\1\b/i);
    if (wordRepeats && wordRepeats.length > 3) {
      indicators.push({
        type: 'PROMPT_LEAK',
        pattern: 'Repeating word pattern',
        matchedText: '[obfuscation detected]',
        confidence: 0.5
      });
    }
  }

  private getPatternConfidence(type: InjectionType): number {
    const confidences: Record<InjectionType, number> = {
      PROMPT_LEAK: 0.9,
      ROLE_OVERRIDE: 0.85,
      CONTEXT_IGNORE: 0.85,
      DELIMITER_BREAK: 0.9,
      AUTHORITY_IMPERSONATION: 0.75,
      CODING_EXPLOIT: 0.95
    };
    return confidences[type] || 0.7;
  }

  private determineAction(indicators: InjectionIndicator[]): 'BLOCK' | 'WARN' | 'ALLOW' {
    if (indicators.length === 0) return 'ALLOW';

    const hasHighConfidence = indicators.some(i => i.confidence >= 0.9);
    const hasCodingExploit = indicators.some(i => i.type === 'CODING_EXPLOIT');
    const hasMultipleTypes = new Set(indicators.map(i => i.type)).size >= 2;

    if (hasCodingExploit) return 'BLOCK';
    if (hasHighConfidence && hasMultipleTypes) return 'BLOCK';
    if (hasHighConfidence) return 'BLOCK';
    if (hasMultipleTypes) return 'WARN';

    return 'WARN';
  }

  /**
   * Sanitize input by removing detected injection attempts
   */
  sanitize(input: string, indicators: InjectionIndicator[]): string {
    let sanitized = input;
    
    for (const indicator of indicators) {
      // Remove the matched text
      sanitized = sanitized.replace(indicator.matchedText, '[REDACTED]');
    }

    return sanitized;
  }
}

export { PromptInjectionDetector, InjectionDetectionResult, InjectionIndicator, InjectionType };
```

### Pattern 7: System Prompt Isolation from User Input

**What:** Architectural patterns that ensure the system prompt is never accessible to or modifiable by user input, including input sanitization, message separation, and LLM configuration safeguards.

**When to use:** Essential for all healthcare AI systems to prevent prompt injection attacks from exposing sensitive instructions or modifying safety behavior.

**Example:**
```typescript
// Source: Based on secure AI system architecture patterns
import { z } from 'zod';

// Input validation schema - strict separation from system content
const UserMessageSchema = z.object({
  content: z.string().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional()
});

interface SecureChatRequest {
  userMessage: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  systemPrompt: string;
  retrievedContext: RetrievedChunk[];
  metadata: Record<string, unknown>;
}

interface SecureChatResponse {
  response: string;
  citations: GeneratedCitation[];
  groundednessScore: GroundednessScore;
  phiDetected: boolean;
  injectionAttempted: boolean;
  auditId: string;
}

class SystemPromptIsolator {
  private readonly SYSTEM_PROMPT_KEY = 'SYSTEM_PROMPT'; // Not accessible to user
  private readonly MAX_HISTORY_MESSAGES = 10;
  private readonly MAX_TOTAL_TOKENS_HISTORY = 8000;

  /**
   * Ensure system prompt is isolated from user input
   */
  isolate(request: SecureChatRequest): { 
    messages: Array<{ role: string; content: string }>;
    context: RetrievedChunk[];
  } {
    // Build messages array - system prompt is separate, never in user messages
    const messages: Array<{ role: string; content: string }> = [];

    // System message (not modifiable by user)
    messages.push({
      role: 'system',
      content: request.systemPrompt
    });

    // Add conversation history with role enforcement
    const sanitizedHistory = this.sanitizeHistory(request.conversationHistory);
    messages.push(...sanitizedHistory);

    // Add user message with strict validation
    const userMessage = this.sanitizeUserMessage(request.userMessage);
    messages.push({
      role: 'user',
      content: userMessage
    });

    // Return isolated messages and context
    return {
      messages,
      context: request.retrievedContext
    };
  }

  /**
   * Sanitize conversation history - prevent role manipulation
   */
  private sanitizeHistory(
    history: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const sanitized: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    
    // Enforce maximum history length
    const recentHistory = history.slice(-this.MAX_HISTORY_MESSAGES);
    
    for (const message of recentHistory) {
      // Only allow 'user' and 'assistant' roles - reject 'system' role in history
      const safeRole = message.role === 'user' || message.role === 'assistant' 
        ? message.role 
        : 'user'; // Default to 'user' if invalid

      sanitized.push({
        role: safeRole,
        content: this.sanitizeMessageContent(message.content)
      });
    }

    return sanitized;
  }

  /**
   * Sanitize user message content
   */
  private sanitizeUserMessage(content: string): string {
    // Remove any attempt to set system/developer roles
    let sanitized = content
      .replace(/(?:^|\n)(?:system|developer|instructions?)[:\s]/gi, '[RESTRICTED]: ')
      .replace(/^\{["']?(?:system|role|instruct)["']?\}/gi, '{ "role": "user" }')
      .replace(/(?:^|\n)```(?:system|developer)/gi, '```text')
      .replace(/\[(?:SYSTEM|DEV|DEVELOPER)_[A-Z]+\]/gi, '[REDACTED]');

    // Remove JSON/XML attempts to override roles
    const jsonPatterns = [
      /\{[\s]*"role"[\s]*:[\s]*"system"[\s,}]/gi,
      /\{[\s]*"role"[\s]*:[\s]*"developer"[\s,}]/gi,
      /"system_prompt"[\s]*:/gi,
      /"override_instructions"[\s]*:/gi
    ];

    for (const pattern of jsonPatterns) {
      sanitized = sanitized.replace(pattern, '"role": "user" /* $& */');
    }

    return sanitized;
  }

  /**
   * General message content sanitization
   */
  private sanitizeMessageContent(content: string): string {
    return content
      .replace(/<script[^>]*>.*?<\/script>/gis, '[SCRIPT_REDACTED]')
      .replace(/(?:javascript|vbscript|data):/gi, '[PROTOCOL_REDACTED]')
      .replace(/on\w+\s*=/gi, '[EVENT_HANDLER_REDACTED]');
  }

  /**
   * Calculate token usage for history
   */
  calculateHistoryTokenUsage(
    messages: Array<{ role: string; content: string }>,
    systemPrompt: string
  ): { withinLimit: boolean; totalTokens: number; breakdown: Record<string, number> } {
    // Rough token estimation (4 chars per token average)
    const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

    const systemTokens = estimateTokens(systemPrompt);
    let userTokens = 0;
    let assistantTokens = 0;

    for (const message of messages) {
      const tokens = estimateTokens(message.content);
      if (message.role === 'user') {
        userTokens += tokens;
      } else {
        assistantTokens += tokens;
      }
    }

    const totalTokens = systemTokens + userTokens + assistantTokens;
    const limit = this.MAX_TOTAL_TOKENS_HISTORY;

    return {
      withinLimit: totalTokens <= limit,
      totalTokens,
      breakdown: {
        system: systemTokens,
        user: userTokens,
        assistant: assistantTokens
      }
    };
  }

  /**
   * Prepare messages for OpenAI API with isolation guarantees
   */
  prepareAPIMessages(
    request: SecureChatRequest
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const { messages } = this.isolate(request);
    
    // Validate message structure before API call
    const apiMessages = messages.map(m => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content
    }));

    // Ensure system message is always first and unmodified
    if (apiMessages[0]?.role !== 'system') {
      throw new Error('System prompt isolation failed: system message not first');
    }

    // Verify system message was not modified
    if (!apiMessages[0].content.includes('[Safety Layer Protected]')) {
      // In production, use cryptographic verification
      console.warn('System prompt may have been modified');
    }

    return apiMessages;
  }
}

export { SystemPromptIsolator, SecureChatRequest, SecureChatResponse };
```

### Pattern 8: No-Response Path for Insufficient Retrieval

**What:** A structured fallback when document retrieval fails to return relevant results, ensuring the system never fabricates information.

**When to use:** When semantic similarity scores fall below threshold, or retrieved chunks fail to answer the query.

**Example:**
```typescript
// Source: Based on RAG fallback patterns and clinical safety requirements
interface InsufficientRetrievalResult {
  shouldRespond: boolean;
  responseType: 'NO_INFORMATION' | 'PARTIAL' | 'REFERRAL';
  response: string;
  auditData: Record<string, unknown>;
}

class NoResponseHandler {
  private readonly LOW_SIMILARITY_THRESHOLD = 0.5;
  private readonly MIN_CITATION_THRESHOLD = 0.6;

  constructor(
    private organizationName: string,
    private knowledgeBaseContact?: string
  ) {}

  /**
   * Evaluate if response should be generated
   */
  evaluateRetrieval(
    query: string,
    chunks: RetrievedChunk[],
    similarities: number[]
  ): InsufficientRetrievalResult {
    // Case 1: No chunks retrieved
    if (chunks.length === 0) {
      return this.handleNoChunks(query);
    }

    // Case 2: All chunks below similarity threshold
    const maxSimilarity = Math.max(...similarities);
    if (maxSimilarity < this.LOW_SIMILARITY_THRESHOLD) {
      return this.handleLowSimilarity(query, maxSimilarity);
    }

    // Case 3: Some chunks above threshold but not confident
    const confidentChunks = chunks.filter((_, i) => similarities[i] >= this.MIN_CITATION_THRESHOLD);
    if (confidentChunks.length === 0 && chunks.length > 0) {
      return this.handlePartialRetrieval(query, chunks, similarities);
    }

    // Case 4: Mixed results - some confident, some not
    const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
    if (avgSimilarity < this.MIN_CITATION_THRESHOLD) {
      return this.handlePartialRetrieval(query, chunks, similarities);
    }

    // Sufficient retrieval - proceed with response
    return {
      shouldRespond: true,
      responseType: 'REFERRAL', // Will use retrieved chunks
      response: '',
      auditData: {}
    };
  }

  private handleNoChunks(query: string): InsufficientRetrievalResult {
    const response = `I don't have information in the clinical knowledge base to answer your question: "${query}"

The knowledge base does not currently contain documents that match your query.

Recommended next steps:
1. Verify that relevant clinical documents have been uploaded and approved
2. Check if the terminology in your query matches document terminology
3. Contact ${this.knowledgeBaseContact || 'your department administrator'} to request document review
4. For urgent clinical questions, consult protocol documents directly or contact a clinical specialist

Remember: This system provides information from approved clinical documents only. Always verify AI-generated responses with authoritative sources for critical clinical decisions.`;

    return {
      shouldRespond: true,
      responseType: 'NO_INFORMATION',
      response,
      auditData: {
        reason: 'no_chunks_retrieved',
        queryLength: query.length,
        timestamp: new Date().toISOString()
      }
    };
  }

  private handleLowSimilarity(query: string, maxSimilarity: number): InsufficientRetrievalResult {
    const response = `I found some documents that may be partially related to your question, but the information does not appear to be directly addressed in the knowledge base (relevance: ${(maxSimilarity * 100).toFixed(0)}%).

Your question: "${query}"

Since the available information is not directly relevant, I cannot provide a confident answer based on the current knowledge base.

Recommended steps:
1. Try rephrasing your question using different terminology
2. Check if more specific documents exist in the knowledge base
3. For immediate clinical needs, consult protocol documents directly or contact ${this.knowledgeBaseContact || 'a clinical specialist'}

I apologize that I cannot provide the information you're seeking. This ensures we don't provide potentially inaccurate clinical guidance.`;

    return {
      shouldRespond: true,
      responseType: 'PARTIAL',
      response,
      auditData: {
        reason: 'low_similarity',
        maxSimilarity,
        threshold: this.LOW_SIMILARITY_THRESHOLD
      }
    };
  }

  private handlePartialRetrieval(
    query: string,
    chunks: RetrievedChunk[],
    similarities: number[]
  ): InsufficientRetrievalResult {
    const bestChunk = chunks[similarities.indexOf(Math.max(...similarities))];
    
    const response = `I found some information that may be related to your question, but the match is not strong enough to provide a complete answer.

Your question: "${query}"

Best available match (${(Math.max(...similarities) * 100).toFixed(0)}% relevance):
From: "${bestChunk.documentName}"
This document mentions related topics but may not fully address your question.

For a complete answer, please:
1. Consult the original document directly
2. Try a more specific query
3. Contact ${this.knowledgeBaseContact || 'your clinical pharmacist'} for clarification

I want to ensure you receive accurate information. Rather than providing incomplete guidance, I'm directing you to the source documents.`;

    return {
      shouldRespond: true,
      responseType: 'PARTIAL',
      response,
      auditData: {
        reason: 'partial_retrieval',
        bestSimilarity: Math.max(...similarities),
        chunkCount: chunks.length
      }
    };
  }

  /**
   * Generate uncertainty response for grounded but incomplete answers
   */
  generateUncertaintyResponse(
    query: string,
    partialAnswer: string,
    limitations: string[]
  ): string {
    return `I can provide some information related to your question, but there are important limitations:

**Partial Answer:**
${partialAnswer}

**Limitations:**
${limitations.map(l => `- ${l}`).join('\n')}

**Important:** This information may be incomplete or not fully applicable to your specific situation.

**Recommended actions:**
- Verify with the original source documents
- Consult a clinical specialist for definitive guidance
- Do not make clinical decisions based solely on this partial information

Would you like me to help you find more specific information in the knowledge base?`;
  }
}

export { NoResponseHandler, InsufficientRetrievalResult };
```

### Pattern 9: Vercel AI SDK Integration with Safety Middleware

**What:** Integration of all safety components using Vercel AI SDK middleware for seamless input/output processing, streaming safety checks, and audit logging.

**Example:**
```typescript
// Source: Based on Vercel AI SDK middleware patterns and healthcare safety integration
import { createChatCompletion } from 'ai';
import { OpenAI } from 'openai';
import { PHIDetector } from './phi/detector';
import { PromptInjectionDetector } from './injection/detector';
import { QueryIntentClassifier } from './intent/classifier';
import { CitationSystem } from './citation/system';
import { GroundednessScorer } from './grounding/scorer';
import { NoResponseHandler } from './no-response';
import { ClinicalSafetyPrompt } from './prompt';
import { auditLogger } from '../lib/audit';

interface SafetyMiddlewareConfig {
  openai: OpenAI;
  phiDetector: PHIDetector;
  injectionDetector: PromptInjectionDetector;
  intentClassifier: QueryIntentClassifier;
  citationSystem: CitationSystem;
  groundednessScorer: GroundednessScorer;
  noResponseHandler: NoResponseHandler;
  organizationName: string;
}

class SafetyMiddleware {
  private config: SafetyMiddlewareConfig;

  constructor(config: SafetyMiddlewareConfig) {
    this.config = config;
  }

  /**
   * Process user input through all safety checks
   */
  async processInput(input: string): Promise<{
    shouldProceed: boolean;
    sanitizedInput?: string;
    intent?: ClassificationResult;
    phiDetected?: boolean;
    injectionDetected?: boolean;
    response?: string;
  }> {
    // Step 1: PHI Detection
    const phiResult = await this.config.phiDetector.detect(input);
    if (phiResult.containsPHI) {
      auditLogger.logPHIDetection({
        inputLength: input.length,
        phiTypes: phiResult.entities.map(e => e.type),
        sanitized: phiResult.sanitizedInput !== input
      });
      
      return {
        shouldProceed: false,
        response: 'Your query contains protected health information. For your privacy, I cannot process queries with personal health data. Please rephrase without including personal identifiers such as names, dates of birth, or medical record numbers.'
      };
    }

    // Step 2: Prompt Injection Detection
    const injectionResult = await this.config.injectionDetector.detect(input);
    if (injectionResult.isInjection && injectionResult.recommendedAction === 'BLOCK') {
      auditLogger.logInjectionAttempt({
        input: input.substring(0, 500),
        type: injectionResult.type,
        confidence: injectionResult.confidence
      });

      return {
        shouldProceed: false,
        response: 'I cannot process this query. It appears to contain content that violates our usage policies.'
      };
    }

    // Step 3: Intent Classification
    const intent = await this.config.intentClassifier.classify(input);

    // Step 4: Sanitize input if needed
    let sanitizedInput = input;
    if (injectionResult.isInjection && injectionResult.recommendedAction === 'WARN') {
      sanitizedInput = this.config.injectionDetector.sanitize(input, injectionResult.indicators);
    }

    return {
      shouldProceed: true,
      sanitizedInput,
      intent,
      phiDetected: phiResult.containsPHI,
      injectionDetected: injectionResult.isInjection
    };
  }

  /**
   * Generate response with safety guarantees
   */
  async generateSafeResponse(
    sanitizedInput: string,
    intent: ClassificationResult,
    chunks: RetrievedChunk[],
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<{
    response: string;
    citations: GeneratedCitation[];
    groundednessScore: GroundednessScore;
    shouldBlock: boolean;
  }> {
    // Step 1: Check if we should proceed based on intent
    if (intent.intentType === 'PERSONAL_HEALTH_ADVICE') {
      return {
        response: 'I cannot provide personal medical advice. Please consult a qualified healthcare provider for your specific situation.',
        citations: [],
        groundednessScore: { overall: 0, coverage: 0, relevance: 0, accuracy: 0, verification: 0, confidence: 'HIGH', factors: {}, recommendations: [] },
        shouldBlock: true
      };
    }

    // Step 2: Check retrieval sufficiency
    const retrievalCheck = this.config.noResponseHandler.evaluateRetrieval(
      sanitizedInput,
      chunks,
      chunks.map(c => c.similarity)
    );

    if (!retrievalCheck.shouldRespond && retrievalCheck.responseType !== 'REFERRAL') {
      return {
        response: retrievalCheck.response,
        citations: [],
        groundednessScore: { overall: 0, coverage: 0, relevance: 0, accuracy: 0, verification: 0, confidence: 'HIGH', factors: {}, recommendations: [] },
        shouldBlock: false
      };
    }

    // Step 3: Generate system prompt
    const promptEngine = new ClinicalSafetyPrompt({
      organizationName: this.config.organizationName
    });
    const systemPrompt = promptEngine.generateForIntent(intent.intentType);

    // Step 4: Generate response with Vercel AI SDK
    const completion = await createChatCompletion(this.config.openai, {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: sanitizedInput }
      ],
      temperature: 0.1, // Clinical accuracy setting
      max_tokens: 2000
    });

    const responseText = completion.choices[0]?.message?.content || '';

    // Step 5: Generate citations
    const citations = this.config.citationSystem.generateCitations(chunks, responseText);

    // Step 6: Verify citations
    const verificationResult = await this.config.citationSystem.verifyCitations(citations, responseText);

    // Step 7: Calculate groundedness
    const groundednessScore = await this.config.groundednessScorer.score({
      responseText,
      citations,
      retrievedChunks: chunks,
      query: sanitizedInput,
      verificationResult
    });

    // Step 8: Check minimum groundedness threshold
    if (!this.config.groundednessScorer.meetsThreshold(groundednessScore, 0.7)) {
      return {
        response: this.config.groundednessScorer.generateFallbackResponse(sanitizedInput, groundednessScore),
        citations: verificationResult.verifiedCitations,
        groundednessScore,
        shouldBlock: false
      };
    }

    // Step 9: Add formatted citations to response
    const formattedResponse = responseText + 
      this.config.citationSystem.formatCitationsForResponse(citations);

    return {
      response: formattedResponse,
      citations: verificationResult.verifiedCitations,
      groundednessScore,
      shouldBlock: false
    };
  }

  /**
   * Full safety pipeline execution
   */
  async executePipeline(
    input: string,
    chunks: RetrievedChunk[],
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<SafePipelineResult> {
    const startTime = Date.now();
    const auditId = crypto.randomUUID();

    try {
      // Process input
      const inputResult = await this.processInput(input);

      if (!inputResult.shouldProceed) {
        return {
          success: true,
          response: inputResult.response!,
          citations: [],
          groundednessScore: null,
          auditData: {
            auditId,
            duration: Date.now() - startTime,
            blocked: true,
            reason: inputResult.response ? 'phi_detected' : 'injection_detected'
          }
        };
      }

      // Generate response
      const responseResult = await this.generateSafeResponse(
        inputResult.sanitizedInput!,
        inputResult.intent!,
        chunks,
        conversationHistory
      );

      // Log audit
      await auditLogger.logAIInteraction({
        auditId,
        userInput: input,
        sanitizedInput: inputResult.sanitizedInput,
        response: responseResult.response,
        citations: responseResult.citations.map(c => c.sourceId),
        groundednessScore: responseResult.groundednessScore?.overall,
        intentType: inputResult.intent?.intentType,
        phiDetected: inputResult.phiDetected,
        injectionAttempted: inputResult.injectionDetected,
        duration: Date.now() - startTime
      });

      return {
        success: true,
        response: responseResult.response,
        citations: responseResult.citations,
        groundednessScore: responseResult.groundnessScore,
        auditData: {
          auditId,
          duration: Date.now() - startTime,
          blocked: false
        }
      };
    } catch (error) {
      await auditLogger.logError({
        auditId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      return {
        success: false,
        response: 'An error occurred while processing your request. Please try again.',
        citations: [],
        groundednessScore: null,
        auditData: {
          auditId,
          duration: Date.now() - startTime,
          error: true
        }
      };
    }
  }
}

interface SafePipelineResult {
  success: boolean;
  response: string;
  citations: GeneratedCitation[];
  groundednessScore: GroundednessScore | null;
  auditData: Record<string, unknown>;
}

export { SafetyMiddleware, SafetyMiddlewareConfig, SafePipelineResult };
```

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PHI detection regex patterns | Custom regex for SSN, DOB, phone | @azure/ai-text-analytics or AWS Comprehend Medical | HIPAA-compliant NLP with continuous updates for new PHI patterns |
| Citation verification | LLM-based hallucination checking | string-similarity with source chunk validation | Deterministic verification, auditable, faster |
| Prompt injection patterns | Custom pattern matching | guardrails-ai or LLM-guard | Community-maintained patterns updated for new attacks |
| Structured output validation | Regex parsing of responses | Zod schema validation with Vercel AI SDK structured outputs | Type-safe, version-controlled schemas |
| Audit logging | Custom logging to files | Winston with HIPAA-compliant audit trail | Structured, searchable, compliance-ready |

**Key insight:** Healthcare AI safety requires continuous vigilance. Building custom solutions means you're responsible for updates and maintenance. Using established libraries ensures you're protected against evolving threats and compliance requirements.

## Common Pitfalls

### Pitfall 1: Over-Relying on LLM Temperature for Safety

**What goes wrong:** Setting temperature to 0.1 and assuming the model won't hallucinate.

**Why it happens:** Temperature only affects token probability distribution, not the model's tendency to fill knowledge gaps. GPT-4o will still hallucinate when it can't find answers in context.

**How to avoid:** Layer multiple safeguards:
- Retrieval threshold checks before generating
- Citation verification post-generation
- Groundedness scoring with minimum thresholds
- Explicit uncertainty instructions in system prompt
- No-response paths for low-confidence retrievals

**Warning signs:** Users report confident-sounding but incorrect answers; citations check out but contain fabricated details.

### Pitfall 2: Single-Layer PHI Detection

**What goes wrong:** Using only regex patterns and missing sophisticated PHI attempts.

**Why it happens:** PHI can be obfuscated in many ways: base64 encoding, character substitution, spacing variations, context-dependent references.

**How to avoid:** Implement defense-in-depth:
- Layer 1: Fast regex for obvious patterns
- Layer 2: NLP-based entity recognition
- Layer 3: Azure/AWS HIPAA-compliant NLP services
- Layer 4: Context-aware heuristics (e.g., detecting patient references)

**Warning signs:** Users report being able to include patient names in queries without detection; log analysis shows PHI patterns bypass detection.

### Pitfall 3: Citation Verification as Post-Process Only

**What goes wrong:** Verifying citations after generation means the model might produce unverified content anyway.

**Why it happens:** Post-processing only catches errors; it doesn't prevent them. The model might learn that fabricated citations "mostly work."

**How to avoid:** Integrate verification into generation:
- Use structured outputs with required citation fields
- Include citation requirements in system prompt
- Apply groundedness scoring during generation (if supported)
- Regenerate if verification fails

**Warning signs:** Citation verification consistently fails; similar fabricated citations appear across multiple responses.

### Pitfall 4: Ignoring Query Intent

**What goes wrong:** Treating all queries the same safety level.

**Why it happens:** Clinical queries about protocols need strict grounding; conversational queries don't. Applying same constraints to both wastes resources and degrades UX.

**How to avoid:** Classify intent before applying safety measures:
- Personal health advice: Block or redirect
- Clinical protocols: Highest grounding requirements
- Clinical questions: Standard grounding
- Conversational: Minimal constraints

**Warning signs:** System feels unresponsive for simple queries; system responds too permissively to personal health questions.

### Pitfall 5: Audit Logging as Afterthought

**What goes wrong:** Adding audit logging at the end, leading to incomplete records.

**Why it happens:** Audit requirements are often added late in development; integration becomes rushed.

**How to avoid:** Design audit into the pipeline from the start:
- Log input and sanitized input separately
- Include citation metadata in every response
- Log groundedness scores and verification results
- Use correlation IDs to trace queries through the system

**Warning signs:** Audit logs show gaps; cannot trace a user complaint back to the actual AI response and sources.

### Pitfall 6: Trusting User-Provided Context as Safe

**What goes wrong:** Assuming conversation history or attached context is safe.

**Why it happens:** Previous conversation turns or injected content can contain attacks that surface in later turns.

**How to avoid:** Treat all user input as potentially malicious:
- Sanitize conversation history
- Validate message roles (reject system role in history)
- Re-scan citations against PHI patterns
- Reset conversation state periodically

**Warning signs:** Prompt injection attacks succeed after multiple conversation turns; system behavior changes unexpectedly mid-conversation.

## Code Examples

### Complete Safety Pipeline Example

```typescript
// Complete safety pipeline using Vercel AI SDK
import { createOpenAI } from '@ai-sdk/openai';
import { createStreamableUI, streamText, tool } from 'ai';
import { z } from 'zod';
import { SafetyMiddleware } from './safety/middleware';
import { PHIDetector } from './phi/detector';
import { PromptInjectionDetector } from './injection/detector';
import { QueryIntentClassifier } from './intent/classifier';
import { CitationSystem } from './citation/system';
import { GroundednessScorer } from './grounding/scorer';
import { NoResponseHandler } from './no-response';
import { matchOrgDocuments } from '@/lib/database/functions';
import { auditLogger } from '@/lib/audit';

// Initialize components
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
const phiDetector = new PHIDetector(
  process.env.AZURE_ENDPOINT!,
  process.env.AZURE_KEY!
);
const injectionDetector = new PromptInjectionDetector();
const intentClassifier = new QueryIntentClassifier();
const citationSystem = new CitationSystem({
  minGroundednessThreshold: 0.7,
  minCitationSimilarity: 0.6
});
const groundednessScorer = new GroundednessScorer();
const noResponseHandler = new NoResponseHandler(
  process.env.ORGANIZATION_NAME!,
  process.env.KNOWLEDGE_BASE_CONTACT
);

const safetyMiddleware = new SafetyMiddleware({
  openai,
  phiDetector,
  injectionDetector,
  intentClassifier,
  citationSystem,
  groundednessScorer,
  noResponseHandler,
  organizationName: process.env.ORGANIZATION_NAME!
});

// Main chat endpoint
export async function POST(req: Request) {
  const { messages, conversationId } = await req.json();
  
  const userMessage = messages[messages.length - 1].content;
  const conversationHistory = messages.slice(0, -1).map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content
  }));

  // Embed and retrieve relevant chunks
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: userMessage
  });
  const queryEmbedding = embeddingResponse.data[0].embedding;

  // Retrieve org-scoped documents
  const chunks = await matchOrgDocuments({
    queryEmbedding,
    userOrgId: ctx.authenticatedUser.orgId,
    matchThreshold: 0.5,
    matchCount: 10
  });

  // Execute safety pipeline
  const result = await safetyMiddleware.executePipeline(
    userMessage,
    chunks,
    conversationHistory
  );

  // Return response with metadata
  return Response.json({
    content: result.response,
    citations: result.citations.map(c => ({
      sourceId: c.sourceId,
      documentTitle: c.documentTitle,
      relevanceScore: c.relevanceScore
    })),
    groundednessScore: result.groundednessScore?.overall,
    auditId: result.auditData.auditId
  });
}
```

### Citation Verification Example

```typescript
// Verification pipeline for catch fabricated citations
async function verifyCitationsPipeline(
  response: string,
  citations: GeneratedCitation[],
  sourceChunks: RetrievedChunk[]
): Promise<VerificationResult> {
  const citationSystem = new CitationSystem({
    minGroundednessThreshold: 0.7,
    minCitationSimilarity: 0.6
  });

  // Generate structured citations from chunks
  const generatedCitations = citationSystem.generateCitations(
    sourceChunks,
    response
  );

  // Verify against sources
  const verification = await citationSystem.verifyCitations(
    generatedCitations,
    response
  );

  // Log verification results
  await auditLogger.logCitationVerification({
    totalCitations: generatedCitations.length,
    verified: verification.verifiedCitations.length,
    failed: verification.failedCitations.length,
    groundednessScore: verification.groundednessScore,
    warnings: verification.warnings
  });

  return verification;
}
```

### Groundedness Scoring Example

```typescript
// Groundedness scoring for response quality
async function scoreResponseGroundedness(
  userQuery: string,
  responseText: string,
  citedChunks: RetrievedChunk[],
  verificationResult: VerificationResult
): Promise<GroundednessScore> {
  const scorer = new GroundednessScorer({
    weights: {
      coverage: 0.25,
      relevance: 0.25,
      accuracy: 0.25,
      verification: 0.25
    }
  });

  const score = await scorer.score({
    responseText,
    citations: verificationResult.verifiedCitations,
    retrievedChunks: citedChunks,
    query: userQuery,
    verificationResult
  });

  // Log low-groundedness responses
  if (score.confidence === 'LOW' || score.confidence === 'CRITICAL') {
    await auditLogger.logLowGroundedness({
      score,
      query: userQuery,
      responseLength: responseText.length,
      citationCount: verificationResult.verifiedCitations.length
    });
  }

  return score;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Prompt-based citations | Structured output citations with schema validation | 2024 | Deterministic citation formats, type-safe parsing |
| Post-hoc hallucination detection | Retrieval-first with no-response paths | 2023 | Prevents hallucinations at source rather than detecting later |
| Regex-only PHI detection | Multi-layer NLP + regex + cloud services | 2023 | Better detection of obfuscated PHI |
| Single-temperature safety | Intent-aware safety levels | 2024 | Better UX for non-clinical queries |
| Linear safety checks | Middleware pipeline with early exit | 2024 | Better performance, clearer failure modes |

**Deprecated/outdated:**
- Temperature-only safety: Temperature 0.1 is insufficient without additional safeguards
- Manual citation checking: Must be automated for production scale
- Single-entity PHI detection: Defense-in-depth required for HIPAA compliance
- Response-first verification: Must verify before returning to user

## Divergence from Project Baseline

No divergence from project baseline. All safety layer components align with established stack choices:
- Vercel AI SDK for integration (per STACK.md)
- OpenAI GPT-4o with temperature 0.1 (per PROJECT.md)
- pgvector for document storage (per PROJECT.md)
- Supabase Auth for authentication (per PROJECT.md)

## Open Questions

1. **Citation granularity:** Should citations be sentence-level or paragraph-level?
   - Current: Chunk-level with extracted quotes
   - Consideration: More granular citations improve verifiability but increase token usage

2. **Fallback for Azure Text Analytics unavailability:** What happens if PHI detection service is down?
   - Current: Fallback to regex-only
   - Consideration: Acceptable for non-critical queries; block high-risk queries

3. **Conversation history sanitization:** How far back should we sanitize?
   - Current: Last 10 messages
   - Consideration: Longer context improves response quality but increases injection risk

4. **Groundedness threshold calibration:** Is 0.7 appropriate for clinical use?
   - Current: Conservative threshold based on literature
   - Consideration: May need adjustment based on production data

## Sources

### Primary (HIGH confidence)
- Azure AI Text Analytics documentation - PHI/PII detection capabilities
- OpenAI API documentation - Structured outputs, temperature settings, safety features
- Vercel AI SDK documentation - Middleware, streaming, integration patterns
- HIPAA Privacy Rule (45 CFR § 164.514) - PHI identification requirements

### Secondary (MEDIUM confidence)
- Prompt injection attack research papers (2023-2024)
- RAG evaluation benchmarks for healthcare applications
- Clinical decision support system safety guidelines
- Healthcare AI compliance frameworks

### Tertiary (LOW confidence)
- Community patterns for citation verification
- Open-source PHI detection libraries
- LLM guardrails implementations

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH - Based on official SDK documentation and healthcare compliance requirements
- Architecture: HIGH - Established patterns from production healthcare AI systems
- PHI Detection: HIGH - Azure HIPAA-compliant service with regex fallback
- Citation System: MEDIUM - Pattern validated but needs production testing
- Groundedness Scoring: MEDIUM - Algorithm design based on research; threshold calibration pending
- Prompt Injection: HIGH - Defense patterns from established security research

**Research date:** February 7, 2026
**Valid until:** February 7, 2027 (annual review recommended for AI safety patterns)

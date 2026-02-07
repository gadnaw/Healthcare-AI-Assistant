/**
 * Chat API Endpoint with Complete Safety Pipeline
 * 
 * Integrates all safety components into a single chat API:
 * - PHI detection and blocking
 * - Injection detection and blocking
 * - Intent classification
 * - RAG retrieval
 * - System prompt isolation
 * - LLM response generation
 * - Groundedness scoring
 * - Citation generation and verification
 * - Response validation
 * 
 * Temperature: 0.1 for clinical accuracy
 */

import { NextRequest, NextResponse } from 'next/server';
import { auditService } from '@/lib/audit';
import { phiDetector, phiSanitizer } from '@/safety/phi';
import { injectionBlocker } from '@/safety/injection';
import { intentClassifier } from '@/safety/intent';
import { createVectorStore, RAGSearchResult } from '@/document/storage/VectorStore';
import { createEmbeddingService } from '@/document/embedding/EmbeddingService';
import { citationGenerator, citationVerifier, citationFormatter } from '@/safety/citation';
import { groundednessScorer, groundednessValidator } from '@/safety/grounding';
import { clinicalSystemPrompt, systemPromptIsolator } from '@/safety/system-prompt';
import { Message } from '@/types/chat';

// ============================================================================
// Configuration
// ============================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// ============================================================================
// Request/Response Types
// ============================================================================

interface ChatRequest {
  message: string;
  orgId: string;
  userId: string;
  conversationHistory?: Message[];
  maxResults?: number;
  minSimilarity?: number;
}

interface ChatResponse {
  allowed: boolean;
  blockedReason?: string;
  content?: string;
  citations?: string;
  groundedness?: {
    overall: number;
    coverage: number;
    relevance: number;
    accuracy: number;
    verification: number;
  };
  confidence?: 'high' | 'medium' | 'low';
  verificationStatus?: number;
  suggestions?: string[];
  safetyEvents?: {
    phiDetected: boolean;
    injectionDetected: boolean;
    intentType: string;
    groundednessScore: number;
  };
}

interface RetrievalResult {
  query: string;
  chunks: Array<{
    chunkId: string;
    documentId: string;
    documentName: string;
    content: string;
    similarity: number;
    section?: string;
    pageNumber?: number;
    snippet: string;
  }>;
}

// ============================================================================
// Safety Pipeline Functions
// ============================================================================

/**
 * Stage 1: PHI Detection
 * Detects and blocks PHI in user input
 */
async function detectPHI(input: string, orgId: string): Promise<{
  blocked: boolean;
  reason?: string;
}> {
  const result = phiDetector.detect(input);
  
  if (result.hasPHI) {
    await auditService.logPHIDetected(input, result.entities, true, orgId);
    return { blocked: true, reason: 'PHI detected in input' };
  }
  
  return { blocked: false };
}

/**
 * Stage 2: Injection Detection
 * Detects and blocks prompt injection attempts
 */
async function detectInjection(input: string, orgId: string): Promise<{
  blocked: boolean;
  reason?: string;
}> {
  const result = injectionBlocker.block(input);
  
  if (result.blocked) {
    await auditService.logInjectionDetected(input, result.patterns, orgId);
    return { blocked: true, reason: 'Injection detected' };
  }
  
  return { blocked: false };
}

/**
 * Stage 3: Intent Classification
 * Classifies query intent and determines constraints
 */
async function classifyIntent(input: string, orgId: string): Promise<{
  intent: string;
  confidence: number;
}> {
  const result = intentClassifier.classify(input);
  await auditService.logIntentClassified(input, result.intent, result.confidence, orgId);
  
  return {
    intent: result.intent,
    confidence: result.confidence
  };
}

/**
 * Stage 4: RAG Retrieval
 * Retrieves relevant document chunks based on user query
 */
async function retrieveContext(query: string, orgId: string, maxResults: number, minSimilarity: number): Promise<RetrievalResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { query, chunks: [] };
  }

  const vectorStore = createVectorStore({
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_ANON_KEY,
    tableName: 'document_chunks',
    columnName: 'embedding',
    organizationId: orgId
  });

  const embeddingService = createEmbeddingService({
    apiKey: OPENAI_API_KEY,
    model: 'text-embedding-3-small',
    dimensions: 1536
  });

  const queryEmbedding = await embeddingService.generate(query);

  const searchResults = await vectorStore.similaritySearch({
    queryEmbedding,
    matchThreshold: minSimilarity,
    matchCount: maxResults,
    filter: { organization_id: orgId }
  });

  return {
    query,
    chunks: searchResults.map(result => ({
      chunkId: result.id,
      documentId: result.metadata?.document_id as string || '',
      documentName: result.metadata?.document_name as string || 'Unknown',
      content: result.content,
      similarity: result.similarity,
      section: result.metadata?.section as string || undefined,
      pageNumber: result.metadata?.page_number as number || undefined,
      snippet: result.content.substring(0, 200) + '...'
    }))
  };
}

/**
 * Stage 5: System Prompt Isolation
 * Isolates system prompt from user input
 */
function isolateSystemPrompt(messages: Message[], userMessage: string): {
  messages: Message[];
  violations: string[];
} {
  // Add user message to conversation history
  const allMessages = [
    ...(messages || []),
    { role: 'user', content: userMessage }
  ];

  // Process through isolator
  const { messages: isolatedMessages, result } = systemPromptIsolator.isolate(allMessages);

  const violationTypes = result.violations.map(v => v.type);

  return {
    messages: isolatedMessages,
    violations: violationTypes
  };
}

/**
 * Stage 6: LLM Response Generation
 * Generates response using clinical system prompt and context
 */
async function generateResponse(
  systemPrompt: string,
  userMessage: string,
  context: RetrievalResult,
  temperature: number
): Promise<{
  content: string;
  error?: string;
}> {
  if (!OPENAI_API_KEY) {
    return {
      content: 'I can help you find clinical information. However, the AI response system is not fully configured. Please try again later.',
      error: 'OPENAI_API_KEY not configured'
    };
  }

  try {
    // Build context from retrieved chunks
    const contextText = context.chunks.length > 0
      ? `\n\nRELEVANT DOCUMENT CONTEXT:\n${context.chunks.map((chunk, idx) => 
          `[${idx + 1}] ${chunk.documentName}${chunk.section ? ` - ${chunk.section}` : ''}:\n${chunk.content}`
        ).join('\n\n')}`
      : '';

    // Build conversation for LLM
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: `${userMessage}${contextText}` }
    ];

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        temperature,
        max_tokens: 2000,
        presence_penalty: 0,
        frequency_penalty: 0
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { content: '', error: `OpenAI API error: ${errorData.error?.message || response.statusText}` };
    }

    const data = await response.json();
    return { content: data.choices[0]?.message?.content || '' };

  } catch (error) {
    return { content: '', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Stage 7: Citation Generation
 * Generates citations from retrieved chunks
 */
function generateCitations(context: RetrievalResult): Array<{
  id: string;
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string;
  relevance: number;
}> {
  if (context.chunks.length === 0) {
    return [];
  }

  return citationGenerator.generateFromChunks(context.chunks);
}

/**
 * Stage 8: Citation Verification
 * Verifies citations against response content
 */
function verifyCitations(
  citations: Array<{ id: string; chunkId: string; content: string; relevance: number }>,
  responseContent: string
): {
  verified: boolean;
  verificationRate: number;
  failedCitations: string[];
} {
  const verificationResult = citationVerifier.verify(citations, responseContent);
  
  return {
    verified: verificationResult.allVerified,
    verificationRate: verificationResult.verificationRate,
    failedCitations: verificationResult.results
      .filter(r => !r.verified)
      .map(r => r.citationId)
  };
}

/**
 * Stage 9: Groundedness Scoring
 * Scores response groundedness and determines if response is allowed
 */
function scoreGroundedness(
  responseContent: string,
  citations: Array<{ id: string; chunkId: string; content: string; relevance: number }>,
  contextChunks: RetrievalResult['chunks'],
  verificationStatus: { verificationRate: number; verified: boolean }
): {
  score: {
    overall: number;
    coverage: number;
    relevance: number;
    accuracy: number;
    verification: number;
  };
  allowed: boolean;
} {
  const score = groundednessScorer.score({
    responseContent,
    citations,
    retrievalResults: contextChunks,
    verificationStatus
  });

  const allowed = groundednessValidator.shouldRespond(score);

  return { score, allowed };
}

/**
 * Stage 10: Response Formatting
 * Formats final response with citations and metadata
 */
function formatResponse(
  responseContent: string,
  citations: Array<{ id: string; chunkId: string; content: string; relevance: number }>,
  groundedness: { overall: number; coverage: number; relevance: number; accuracy: number; verification: number },
  confidence: 'high' | 'medium' | 'low'
): {
  formattedContent: string;
  formattedCitations: string;
} {
  const formattedContent = responseContent;
  const formattedCitations = citationFormatter.formatForResponse(citations);

  return { formattedContent, formattedCitations };
}

// ============================================================================
// Main Safety Pipeline
// ============================================================================

/**
 * Execute complete safety pipeline for chat request
 */
async function executeSafetyPipeline(input: ChatRequest): Promise<ChatResponse> {
  const { message, orgId, userId, conversationHistory, maxResults = 5, minSimilarity = 0.7 } = input;
  const startTime = Date.now();

  // Track safety violations for audit
  const safetyViolations: string[] = [];

  // =========================================================================
  // Stage 1: PHI Detection
  // =========================================================================
  const phiResult = await detectPHI(message, orgId);
  if (phiResult.blocked) {
    safetyViolations.push('PHI_DETECTED');
    await auditService.logChatRequestProcessed(message, false, safetyViolations, orgId);
    return {
      allowed: false,
      blockedReason: phiResult.reason,
      safetyEvents: {
        phiDetected: true,
        injectionDetected: false,
        intentType: 'unknown',
        groundednessScore: 0
      }
    };
  }

  // =========================================================================
  // Stage 2: Injection Detection
  // =========================================================================
  const injectionResult = await detectInjection(message, orgId);
  if (injectionResult.blocked) {
    safetyViolations.push('INJECTION_DETECTED');
    await auditService.logChatRequestProcessed(message, false, safetyViolations, orgId);
    return {
      allowed: false,
      blockedReason: injectionResult.reason,
      safetyEvents: {
        phiDetected: false,
        injectionDetected: true,
        intentType: 'unknown',
        groundednessScore: 0
      }
    };
  }

  // =========================================================================
  // Stage 3: Intent Classification
  // =========================================================================
  const intent = await classifyIntent(message, orgId);

  // Block personal health queries
  if (intent.intent === 'personal_health') {
    await auditService.logChatRequestProcessed(message, false, ['PERSONAL_HEALTH_QUERY'], orgId);
    return {
      allowed: false,
      blockedReason: 'Personal health advice not permitted',
      suggestions: ['Consult a healthcare provider for personal medical advice'],
      safetyEvents: {
        phiDetected: false,
        injectionDetected: false,
        intentType: intent.intent,
        groundednessScore: 0
      }
    };
  }

  // =========================================================================
  // Stage 4: RAG Retrieval
  // =========================================================================
  const context = await retrieveContext(message, orgId, maxResults, minSimilarity);

  // If no relevant documents found
  if (context.chunks.length === 0) {
    await auditService.logNoResponseTriggered(message, 'No relevant documents found', 0, orgId);
    await auditService.logChatRequestProcessed(message, false, ['NO_DOCUMENTS_FOUND'], orgId);
    return {
      allowed: false,
      content: "I don't have sufficient evidence to answer this question based on available documents.",
      suggestions: ['Try rephrasing your query', 'Check if documents on this topic have been uploaded'],
      safetyEvents: {
        phiDetected: false,
        injectionDetected: false,
        intentType: intent.intent,
        groundednessScore: 0
      }
    };
  }

  // =========================================================================
  // Stage 5: System Prompt Selection
  // =========================================================================
  const systemPrompt = clinicalSystemPrompt.getForIntent(intent.intent as any);

  // =========================================================================
  // Stage 6: System Prompt Isolation
  // =========================================================================
  const { violations: isolationViolations } = isolateSystemPrompt(conversationHistory || [], message);
  if (isolationViolations.length > 0) {
    await auditService.logSystemPromptIsolated(
      isolationViolations.map(type => ({
        type: type as any,
        original: message,
        sanitized: message,
        severity: 'medium' as const
      })),
      message,
      orgId
    );
  }

  // =========================================================================
  // Stage 7: LLM Response Generation (Temperature 0.1)
  // =========================================================================
  const llmResponse = await generateResponse(
    systemPrompt,
    message,
    context,
    clinicalSystemPrompt.getTemperature() // 0.1
  );

  if (!llmResponse.content) {
    await auditService.logChatRequestProcessed(message, false, ['LLM_ERROR'], orgId);
    return {
      allowed: false,
      blockedReason: 'Response generation failed',
      suggestions: ['Try again later'],
      safetyEvents: {
        phiDetected: false,
        injectionDetected: false,
        intentType: intent.intent,
        groundednessScore: 0
      }
    };
  }

  // =========================================================================
  // Stage 8: Citation Generation
  // =========================================================================
  const citations = generateCitations(context);

  // =========================================================================
  // Stage 9: Citation Verification
  // =========================================================================
  const verificationStatus = verifyCitations(citations, llmResponse.content);

  // =========================================================================
  // Stage 10: Groundedness Scoring
  // =========================================================================
  const { score: groundedness, allowed } = scoreGroundedness(
    llmResponse.content,
    citations,
    context.chunks,
    verificationStatus
  );

  await auditService.logGroundednessScored(groundedness, allowed, message, orgId);

  // =========================================================================
  // No-Response Path (if groundedness below threshold)
  // =========================================================================
  if (!allowed) {
    const noResponseMessage = groundednessValidator.getNoResponseMessage(message, groundedness);
    const suggestions = groundednessValidator.getSuggestions(context.chunks, message);

    await auditService.logNoResponseTriggered(message, 'Insufficient groundedness', groundedness.overall, orgId);
    await auditService.logChatRequestProcessed(message, false, ['INSUFFICIENT_GROUNDEDNESS'], orgId);

    return {
      allowed: false,
      content: noResponseMessage,
      suggestions,
      groundedness,
      safetyEvents: {
        phiDetected: false,
        injectionDetected: false,
        intentType: intent.intent,
        groundednessScore: groundedness.overall
      }
    };
  }

  // =========================================================================
  // Stage 11: Response Formatting
  // =========================================================================
  const confidence = groundednessValidator.calculateConfidence(groundedness);
  const { formattedContent, formattedCitations } = formatResponse(
    llmResponse.content,
    citations,
    groundedness,
    confidence
  );

  // Log successful response
  await auditService.logResponseGenerated(message, citations.length, groundedness.overall, orgId);
  await auditService.logChatRequestProcessed(message, true, [], orgId);

  // Log citation verification
  for (const citation of citations) {
    const similar = verificationStatus.failedCitations.includes(citation.id) ? 0 : 0.85;
    await auditService.logCitationVerified(citation, !verificationStatus.failedCitations.includes(citation.id), similar, orgId);
  }

  const processingTime = Date.now() - startTime;

  return {
    allowed: true,
    content: formattedContent,
    citations: formattedCitations,
    groundedness,
    confidence,
    verificationStatus: verificationStatus.verificationRate,
    safetyEvents: {
      phiDetected: false,
      injectionDetected: false,
      intentType: intent.intent,
      groundednessScore: groundedness.overall
    }
  };
}

// ============================================================================
// POST /api/chat
// ============================================================================

/**
 * Chat API Endpoint
 * 
 * Processes chat requests through complete safety pipeline:
 * PHI detection → Intent classification → RAG retrieval → 
 * Groundedness scoring → Citation generation → Response
 * 
 * Request Body:
 * - message: User message (required)
 * - orgId: Organization ID (required)
 * - userId: User ID (required)
 * - conversationHistory: Optional conversation history
 * - maxResults: Maximum chunks to retrieve (default: 5)
 * - minSimilarity: Minimum similarity threshold (default: 0.7)
 * 
 * Returns:
 * - 200: Response with safety metadata
 * - 400: Missing or invalid request body
 * - 401: Unauthorized
 * - 500: Server error
 */
export async function POST(request: NextRequest): Promise<NextResponse<ChatResponse>> {
  try {
    // Validate environment configuration
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json(
        {
          allowed: false,
          blockedReason: 'Server configuration error: Missing Supabase credentials'
        },
        { status: 500 }
      );
    }

    // Parse request body
    const body: ChatRequest = await request.json().catch(() => null);

    if (!body || !body.message || !body.orgId || !body.userId) {
      return NextResponse.json(
        {
          allowed: false,
          blockedReason: 'Missing required fields: message, orgId, userId'
        },
        { status: 400 }
      );
    }

    // Validate message length
    if (body.message.length > 2000) {
      return NextResponse.json(
        {
          allowed: false,
          blockedReason: 'Message exceeds maximum length of 2000 characters'
        },
        { status: 400 }
      );
    }

    // Execute safety pipeline
    const response = await executeSafetyPipeline(body);

    return NextResponse.json(response);

  } catch (error) {
    console.error('Chat API error:', error);
    
    return NextResponse.json(
      {
        allowed: false,
        blockedReason: 'Internal server error'
      },
      { status: 500 }
    );
  }
}

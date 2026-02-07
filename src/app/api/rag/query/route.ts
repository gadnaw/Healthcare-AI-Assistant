import { NextRequest, NextResponse } from 'next/server';
import { createVectorStore, RAGSearchResult } from '@/document/storage/VectorStore';
import { createEmbeddingService } from '@/document/embedding/EmbeddingService';
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// Configuration
// ============================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ============================================================================
// Request/Response Types
// ============================================================================

interface RAGQueryRequest {
  query: string;
  maxResults?: number;
  minSimilarity?: number;
  documentIds?: string[];
  sections?: string[];
  includeAnswer?: boolean;
}

interface RAGQueryResponse {
  success: boolean;
  data?: {
    query: string;
    context: string;
    chunksUsed: number;
    citations: Array<{
      chunkId: string;
      documentId: string;
      documentName: string;
      content: string;
      similarity: number;
      section?: string;
      pageNumber?: number;
      snippet: string;
    }>;
  };
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ============================================================================
// POST /api/rag/query
// ============================================================================

/**
 * RAG Query API Endpoint
 * 
 * Executes Retrieval-Augmented Generation queries with vector search and source
 * attribution. Results are org-scoped via RLS and JWT claims.
 * 
 * Request Body:
 * - query: Natural language query (required)
 * - maxResults: Maximum chunks to retrieve (default: 5, max: 10)
 * - minSimilarity: Minimum similarity threshold (default: 0.7)
 * - documentIds: Optional array of document IDs to search
 * - sections: Optional array of section names to filter
 * - includeAnswer: Whether to generate an answer (default: false - context only)
 * 
 * Returns:
 * - 200: Context and citations for the query
 * - 400: Missing or invalid request body
 * - 401: Unauthorized (missing or invalid JWT)
 * - 429: Rate limit exceeded
 * - 500: Server error
 */
export async function POST(request: NextRequest): Promise<NextResponse<RAGQueryResponse>> {
  try {
    // Validate environment configuration
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'CONFIG_ERROR',
            message: 'Server configuration error: Missing Supabase credentials'
          }
        },
        { status: 500 }
      );
    }

    // Extract JWT claims from headers (set by middleware)
    const orgId = request.headers.get('x-org-id');
    const userId = request.headers.get('x-user-id');
    const authHeader = request.headers.get('Authorization');

    if (!authHeader || !orgId || !userId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing authentication or organization context'
          }
        },
        { status: 401 }
      );
    }

    // Parse request body
    const body: RAGQueryRequest = await request.json().catch(() => null);

    if (!body || !body.query || body.query.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_QUERY',
            message: 'Request body with "query" field is required'
          }
        },
        { status: 400 }
      );
    }

    // Validate and sanitize query
    const query = body.query.trim();
    
    if (query.length > 2000) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'QUERY_TOO_LONG',
            message: 'Query exceeds maximum length of 2000 characters'
          }
        },
        { status: 400 }
      );
    }

    // Parse and validate numeric parameters
    const maxResults = Math.min(
      Math.max(body.maxResults ?? 5, 1),
      10
    );
    const minSimilarity = Math.min(
      Math.max(body.minSimilarity ?? 0.7, 0),
      1
    );

    // Initialize services
    const vectorStore = createVectorStore({
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_ANON_KEY,
      defaultMinSimilarity: 0.7,
      defaultMaxResults: maxResults
    });

    const embeddingService = createEmbeddingService({
      apiKey: OPENAI_API_KEY
    });

    // Perform RAG search
    const ragResult = await vectorStore.ragSearch(query, embeddingService, {
      organizationId: orgId,
      documentIds: body.documentIds,
      minSimilarity,
      maxResults,
      filterBySection: body.sections,
      maxContextChunks: maxResults
    });

    // Log query event to audit (if service key available)
    if (SUPABASE_SERVICE_KEY) {
      await logQueryEvent(
        SUPABASE_URL,
        SUPABASE_SERVICE_KEY,
        userId,
        orgId,
        query,
        ragResult.chunksUsed,
        ragResult.citations.length
      );
    }

    // Build response
    const responseData = {
      query: ragResult.query,
      context: ragResult.context,
      chunksUsed: ragResult.chunksUsed,
      citations: ragResult.citations.map(citation => ({
        chunkId: citation.chunkId,
        documentId: citation.documentId,
        documentName: citation.documentName,
        content: citation.content,
        similarity: Math.round(citation.similarity * 1000) / 1000,
        section: citation.section,
        pageNumber: citation.pageNumber,
        snippet: citation.snippet
      }))
    };

    return NextResponse.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('RAG query failed:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to execute RAG query'
        }
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Log query event to audit log
 */
async function logQueryEvent(
  supabaseUrl: string,
  supabaseKey: string,
  userId: string,
  organizationId: string,
  query: string,
  chunksRetrieved: number,
  citationsGenerated: number
): Promise<void> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    await supabase.from('audit_log').insert({
      event_type: 'rag_query_executed',
      user_id: userId,
      organization_id: organizationId,
      resource_type: 'rag_query',
      action: 'rag_query',
      details: {
        query_length: query.length,
        chunks_retrieved: chunksRetrieved,
        citations_generated: citationsGenerated,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to log RAG query event:', error);
    // Don't fail the request if audit logging fails
  }
}

// ============================================================================
// OPTIONS /api/rag/query (CORS support)
// ============================================================================

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-org-id, x-user-id'
    }
  });
}

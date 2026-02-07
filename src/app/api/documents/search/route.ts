import { NextRequest, NextResponse } from 'next/server';
import { createVectorStore, SearchResult } from '@/document/storage/VectorStore';
import { createEmbeddingService } from '@/document/embedding/EmbeddingService';
import { createDocumentRepository } from '@/document/storage/DocumentRepository';
import { DocumentStatus } from '@/document/types';

// ============================================================================
// Configuration
// ============================================================================

// Environment variables should be set in .env.local
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ============================================================================
// GET /api/documents/search
// ============================================================================

/**
 * Document Search API Endpoint
 * 
 * Performs vector similarity search across documents within the authenticated
 * user's organization. Results are org-scoped via RLS and JWT claims.
 * 
 * Query Parameters:
 * - q: Search query string (required)
 * - limit: Maximum results (default: 20, max: 100)
 * - minSimilarity: Minimum similarity threshold (default: 0.7)
 * - section: Filter by section name (optional)
 * - documentId: Filter by specific document (optional)
 * 
 * Returns:
 * - 200: Search results with document names, sections, and similarity scores
 * - 400: Missing or invalid query parameter
 * - 401: Unauthorized (missing or invalid JWT)
 * - 500: Server error
 */
export async function GET(request: NextRequest) {
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

    // Extract JWT and org_id from headers (set by middleware)
    const authHeader = request.headers.get('authorization');
    const orgId = request.headers.get('x-org-id');
    const userId = request.headers.get('x-user-id');

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

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const limitParam = searchParams.get('limit');
    const minSimilarityParam = searchParams.get('minSimilarity');
    const section = searchParams.get('section');
    const documentId = searchParams.get('documentId');

    // Validate required query parameter
    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_QUERY',
            message: 'Query parameter "q" is required'
          }
        },
        { status: 400 }
      );
    }

    // Parse and validate numeric parameters
    const limit = Math.min(
      Math.max(parseInt(limitParam || '20', 10), 1),
      100
    );
    const minSimilarity = Math.min(
      Math.max(parseFloat(minSimilarityParam || '0.7'), 0),
      1
    );

    // Initialize services
    const vectorStore = createVectorStore({
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_ANON_KEY,
      defaultMinSimilarity: 0.7,
      defaultMaxResults: limit
    });

    const embeddingService = createEmbeddingService({
      apiKey: OPENAI_API_KEY
    });

    // Generate query embedding
    const queryEmbedding = await embeddingService.embedQuery(query.trim());

    if (!queryEmbedding) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'EMBEDDING_FAILED',
            message: 'Failed to generate query embedding'
          }
        },
        { status: 500 }
      );
    }

    // Build search options
    const searchOptions = {
      organizationId: orgId,
      documentIds: documentId ? [documentId] : undefined,
      minSimilarity,
      maxResults: limit,
      filterBySection: section ? [section] : undefined
    };

    // Perform vector similarity search
    const results = await vectorStore.similaritySearch(queryEmbedding, searchOptions);

    // Transform results for API response
    const responseData = {
      query: query.trim(),
      totalResults: results.length,
      minSimilarity,
      results: results.map((result: SearchResult) => ({
        chunkId: result.chunkId,
        documentId: result.documentId,
        documentName: result.documentName,
        content: result.content,
        similarity: Math.round(result.similarity * 1000) / 1000, // Round to 3 decimal places
        section: result.section,
        pageNumber: result.pageNumber,
        metadata: result.metadata
      }))
    };

    return NextResponse.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('Document search failed:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to execute search'
        }
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// OPTIONS /api/documents/search (CORS support)
// ============================================================================

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-org-id, x-user-id'
    }
  });
}

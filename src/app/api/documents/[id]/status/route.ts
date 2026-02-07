/**
 * Document Status API Endpoint
 * 
 * GET /api/documents/[id]/status
 * Returns real-time processing status for document ingestion pipeline.
 * 
 * Phase 2 Plan 04 - Task 3
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DocumentStatus } from '../../../document/types';

// ============================================================================
// Configuration
// ============================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = (supabaseUrl && supabaseServiceKey) 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// ============================================================================
// Types
// ============================================================================

interface StatusResponse {
  success: boolean;
  data?: {
    document_id: string;
    status: DocumentStatus;
    progress: number;
    current_step: string;
    metadata: {
      total_chunks: number;
      processed_chunks: number;
      failed_chunks: number;
      total_bytes?: number;
      processed_bytes?: number;
    };
    error?: {
      message: string;
      step?: string;
      timestamp?: string;
      retryable?: boolean;
    };
    events?: Array<{
      timestamp: string;
      step: string;
      message?: string;
    }>;
    last_updated: string;
    estimated_completion?: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract user and organization from JWT claims
 */
async function extractAuthContext(request: NextRequest): Promise<{
  userId: string;
  organizationId: string;
} | null> {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.split(' ')[1];
  
  // In production, decode JWT and extract claims
  return {
    userId: 'user-uuid-placeholder',
    organizationId: 'org-uuid-placeholder',
  };
}

/**
 * Map status to human-readable step
 */
function getStatusStep(status: DocumentStatus): string {
  const statusSteps: Record<DocumentStatus, string> = {
    'uploaded': 'File uploaded, awaiting validation',
    'validating': 'Validating file security and format',
    'processing': 'Processing document content',
    'chunking': 'Splitting document into chunks',
    'embedding': 'Generating embeddings for chunks',
    'storing': 'Storing embeddings in vector database',
    'ready': 'Document ready for search',
    'error': 'Processing failed',
    'deleting': 'Document deletion in progress',
  };
  
  return statusSteps[status] || 'Unknown status';
}

/**
 * Calculate progress percentage based on status
 */
function calculateProgress(
  status: DocumentStatus,
  processedChunks: number,
  totalChunks: number
): number {
  const statusProgress: Record<DocumentStatus, number> = {
    'uploaded': 5,
    'validating': 10,
    'processing': 20,
    'chunking': 40,
    'embedding': 60,
    'storing': 80,
    'ready': 100,
    'error': 0,
    'deleting': 100,
  };
  
  // If we have chunk progress information
  if (totalChunks > 0 && status === 'embedding') {
    const chunkProgress = (processedChunks / totalChunks) * 20; // 20% of total for embedding
    return 60 + chunkProgress;
  }
  
  if (totalChunks > 0 && status === 'storing') {
    return 80 + ((processedChunks / totalChunks) * 20);
  }
  
  return statusProgress[status] || 0;
}

/**
 * Get document status with all metadata
 */
async function getDocumentStatus(
  documentId: string,
  organizationId: string
): Promise<{
  document?: {
    id: string;
    status: DocumentStatus;
    metadata: Record<string, unknown>;
    uploaded_at: string;
    processed_at?: string;
    error_message?: string;
  };
  chunks?: {
    total: number;
    processed: number;
    failed: number;
  };
  error?: string;
}> {
  try {
    // Get document
    let document = null;
    
    if (supabase) {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();
        
      if (error || !data) {
        return { error: 'Document not found' };
      }
      
      document = data;
    } else {
      // Simulated response
      console.log(`[GET /api/documents/${documentId}/status] Simulated: Get document`);
      document = {
        id: documentId,
        status: 'processing',
        metadata: {
          current_step: 'embedding',
          total_chunks: 10,
          processed_chunks: 5,
        },
        uploaded_at: new Date().toISOString(),
        processed_at: undefined,
        error_message: undefined,
      };
    }
    
    // Verify organization
    if (document && (document as { organization_id?: string }).organization_id !== organizationId) {
      return { error: 'Document not found' };
    }
    
    // Get chunk statistics
    let chunkStats = { total: 0, processed: 0, failed: 0 };
    
    if (supabase) {
      // Count total chunks
      const { count: totalCount } = await supabase
        .from('document_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', documentId);
        
      // Count processed chunks (those with content_vector)
      const { count: processedCount } = await supabase
        .from('document_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', documentId)
        .not('content_vector', 'is', null);
        
      // Count failed chunks (those with error)
      const { count: failedCount } = await supabase
        .from('document_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', documentId)
        .eq('has_error', true);
        
      chunkStats = {
        total: totalCount || 0,
        processed: processedCount || 0,
        failed: failedCount || 0,
      };
    } else {
      // Simulated chunk stats
      const meta = (document as { metadata?: Record<string, unknown> }).metadata;
      chunkStats = {
        total: (meta?.total_chunks as number) || 10,
        processed: (meta?.processed_chunks as number) || 5,
        failed: 0,
      };
    }
    
    return {
      document: document as {
        id: string;
        status: DocumentStatus;
        metadata: Record<string, unknown>;
        uploaded_at: string;
        processed_at?: string;
        error_message?: string;
      },
      chunks: chunkStats,
    };
    
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get processing events for document
 */
async function getProcessingEvents(
  documentId: string
): Promise<Array<{
  timestamp: string;
  step: string;
  message?: string;
}>> {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('document_events')
        .select('*')
        .eq('document_id', documentId)
        .order('created_at', { ascending: true });
        
      if (error) {
        return [];
      }
      
      return (data || []).map((event) => ({
        timestamp: event.created_at,
        step: event.step,
        message: event.message,
      }));
    }
    
    // Simulated events
    console.log(`[GET /api/documents/${documentId}/status] Simulated: Get events`);
    return [
      { timestamp: new Date(Date.now() - 60000).toISOString(), step: 'uploaded', message: 'File uploaded' },
      { timestamp: new Date(Date.now() - 50000).toISOString(), step: 'validating', message: 'Validation complete' },
      { timestamp: new Date(Date.now() - 40000).toISOString(), step: 'chunking', message: 'Split into 10 chunks' },
      { timestamp: new Date(Date.now() - 30000).toISOString(), step: 'embedding', message: 'Generating embeddings' },
    ];
    
  } catch (error) {
    console.error('[STATUS] Error getting events:', error);
    return [];
  }
}

// ============================================================================
// GET Handler
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<StatusResponse>> {
  const { id: documentId } = await params;
  
  try {
    // 1. Extract authentication context
    const authContext = await extractAuthContext(request);
    
    if (!authContext) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        },
        { status: 401 }
      );
    }
    
    // 2. Get document status
    const statusResult = await getDocumentStatus(
      documentId,
      authContext.organizationId
    );
    
    if (statusResult.error) {
      const errorCode = statusResult.error === 'Document not found' ? 'NOT_FOUND' : 'STATUS_ERROR';
      
      return NextResponse.json(
        {
          success: false,
          error: {
            code: errorCode,
            message: statusResult.error,
          },
        },
        { status: errorCode === 'NOT_FOUND' ? 404 : 500 }
      );
    }
    
    // 3. Get processing events
    const events = await getProcessingEvents(documentId);
    
    // 4. Calculate progress
    const document = statusResult.document!;
    const chunks = statusResult.chunks!;
    
    const progress = calculateProgress(
      document.status,
      chunks.processed,
      chunks.total
    );
    
    // 5. Build response
    const response: StatusResponse['data'] = {
      document_id: documentId,
      status: document.status,
      progress,
      current_step: getStatusStep(document.status),
      metadata: {
        total_chunks: chunks.total,
        processed_chunks: chunks.processed,
        failed_chunks: chunks.failed,
      },
      events,
      last_updated: document.processed_at || document.uploaded_at,
    };
    
    // 6. Add error details if applicable
    if (document.status === 'error' && document.error_message) {
      response.error = {
        message: document.error_message,
        retryable: true,
      };
    }
    
    // 7. Estimate completion time if still processing
    if (['processing', 'chunking', 'embedding', 'storing'].includes(document.status)) {
      const remainingChunks = chunks.total - chunks.processed;
      const avgChunkTime = 1000; // Assume 1 second per chunk
      
      if (remainingChunks > 0) {
        const estimatedSeconds = Math.ceil(remainingChunks * avgChunkTime / 1000);
        response.estimated_completion = new Date(Date.now() + estimatedSeconds * 1000).toISOString();
      }
    }
    
    return NextResponse.json({
      success: true,
      data: response,
    });
    
  } catch (error) {
    console.error(`[GET /api/documents/${documentId}/status] Error:`, error);
    
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'STATUS_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error getting status',
        },
      },
      { status: 500 }
    );
  }
}

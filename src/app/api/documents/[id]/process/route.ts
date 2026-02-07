import { NextRequest, NextResponse } from 'next/server';
import { IngestionPipeline, createIngestionPipeline } from '../../../../document/pipeline/IngestionPipeline';
import { createStatusTracker, DocumentStatus } from '../../../../document/pipeline/StatusTracker';
import { AuditLogger } from '../../../../middleware/AuditLogger';
import { AuthContext } from '../../../../middleware/AuthContext';

/**
 * Configuration for concurrent processing limits
 */
const PROCESSING_CONFIG = {
  maxConcurrentPerOrg: 5,
  maxConcurrentPerUser: 2,
  rateLimitWindow: 60000, // 1 minute
};

/**
 * Active processing jobs tracker (in-memory for single-instance, use Redis for distributed)
 */
class ProcessingQueue {
  private activeJobs: Map<string, { orgId: string; userId: string; startTime: number }>;
  private orgRateLimit: Map<string, { count: number; windowStart: number }>;

  constructor() {
    this.activeJobs = new Map();
    this.orgRateLimit = new Map();
  }

  /**
   * Check if org has capacity for new processing
   */
  canProcess(orgId: string): { allowed: boolean; reason?: string } {
    // Check active jobs per org
    let orgJobCount = 0;
    this.activeJobs.forEach(job => {
      if (job.orgId === orgId) {
        orgJobCount++;
      }
    });

    if (orgJobCount >= PROCESSING_CONFIG.maxConcurrentPerOrg) {
      return { allowed: false, reason: 'Organization processing capacity reached' };
    }

    // Check rate limit
    const orgRate = this.orgRateLimit.get(orgId);
    if (orgRate) {
      const windowElapsed = Date.now() - orgRate.windowStart;
      if (windowElapsed < PROCESSING_CONFIG.rateLimitWindow) {
        if (orgRate.count >= PROCESSING_CONFIG.maxConcurrentPerOrg) {
          return { allowed: false, reason: 'Rate limit exceeded for organization' };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Add job to processing queue
   */
  addJob(documentId: string, orgId: string, userId: string): void {
    // Update rate limit
    const orgRate = this.orgRateLimit.get(orgId);
    if (!orgRate || Date.now() - orgRate.windowStart >= PROCESSING_CONFIG.rateLimitWindow) {
      this.orgRateLimit.set(orgId, { count: 1, windowStart: Date.now() });
    } else {
      orgRate.count++;
    }

    // Add to active jobs
    this.activeJobs.set(documentId, {
      orgId,
      userId,
      startTime: Date.now()
    });
  }

  /**
   * Remove job from processing queue
   */
  removeJob(documentId: string): void {
    this.activeJobs.delete(documentId);
  }

  /**
   * Get active job count for org
   */
  getOrgJobCount(orgId: string): number {
    let count = 0;
    this.activeJobs.forEach(job => {
      if (job.orgId === orgId) {
        count++;
      }
    });
    return count;
  }

  /**
   * Get job info
   */
  getJob(documentId: string) {
    return this.activeJobs.get(documentId);
  }
}

// Global processing queue (singleton)
const processingQueue = new ProcessingQueue();

/**
 * GET /api/documents/[id]/process - Get processing status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: documentId } = await params;
    
    // Get auth context
    const authContext = await AuthContext.fromRequest(request);
    if (!authContext.isAuthenticated) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { organizationId, userId } = authContext;

    // Get Supabase client
    const supabase = authContext.getSupabaseClient();

    // Fetch document
    const { data: document, error } = await supabase
      .from('documents')
      .select('id, file_name, processing_status, processing_metadata, error_message, created_at, updated_at')
      .eq('id', documentId)
      .eq('organization_id', organizationId)
      .single();

    if (error || !document) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Document not found' },
        { status: 404 }
      );
    }

    // Get status tracker for additional info
    const statusTracker = createStatusTracker(supabase);
    const metadata = await statusTracker.getStatusMetadata(documentId, organizationId);

    // Check if currently processing
    const activeJob = processingQueue.getJob(documentId);

    return NextResponse.json({
      documentId: document.id,
      fileName: document.file_name,
      status: document.processing_status,
      statusMessage: getStatusMessage(document.processing_status),
      error: document.error_message,
      progress: metadata?.progress_percentage || calculateProgress(document.processing_status),
      metadata: {
        stage: metadata?.stage,
        currentChunk: metadata?.current_chunk,
        totalChunks: metadata?.total_chunks,
        startedAt: metadata?.started_at,
        lastUpdated: document.updated_at
      },
      isProcessing: !!activeJob,
      activeJobCount: processingQueue.getOrgJobCount(organizationId),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to check processing status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/documents/[id]/process - Start document processing
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: documentId } = await params;
    
    // Get auth context
    const authContext = await AuthContext.fromRequest(request);
    if (!authContext.isAuthenticated) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { organizationId, userId } = authContext;

    // Get Supabase client
    const supabase = authContext.getSupabaseClient();

    // Check organization capacity
    const capacityCheck = processingQueue.canProcess(organizationId);
    if (!capacityCheck.allowed) {
      return NextResponse.json(
        { 
          error: 'Service Unavailable', 
          message: capacityCheck.reason,
          retryAfter: 60
        },
        { 
          status: 503,
          headers: { 'Retry-After': '60' }
        }
      );
    }

    // Fetch and validate document
    const { data: document, error } = await supabase
      .from('documents')
      .select('id, file_name, file_type, processing_status, organization_id, created_by')
      .eq('id', documentId)
      .eq('organization_id', organizationId)
      .single();

    if (error || !document) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Document not found' },
        { status: 404 }
      );
    }

    // Validate user can access document
    if (document.created_by !== userId) {
      // Check if user has permission to process documents
      const hasPermission = await checkProcessingPermission(supabase, userId, organizationId);
      if (!hasPermission) {
        return NextResponse.json(
          { error: 'Forbidden', message: 'You do not have permission to process this document' },
          { status: 403 }
        );
      }
    }

    // Check document status - can only process 'uploaded' or 'error' states
    const validStatuses: DocumentStatus[] = ['uploaded', 'error'];
    if (!validStatuses.includes(document.processing_status as DocumentStatus)) {
      const statusMessage = getStatusMessage(document.processing_status);
      return NextResponse.json(
        { 
          error: 'Conflict', 
          message: `Cannot process document in '${document.processing_status}' status. ${statusMessage}`,
          currentStatus: document.processing_status
        },
        { status: 409 }
      );
    }

    // Check pipeline health
    const ingestionPipeline = createIngestionPipeline({ 
      supabaseClient: supabase,
      auditLogger: new AuditLogger(supabase)
    });

    const health = await ingestionPipeline.healthCheck();
    if (health.status === 'unhealthy') {
      return NextResponse.json(
        { error: 'Service Unavailable', message: 'Document processing pipeline is unavailable' },
        { status: 503 }
      );
    }

    // Add to processing queue
    processingQueue.addJob(documentId, organizationId, userId);

    // Log processing start
    const auditLogger = new AuditLogger(supabase);
    await auditLogger.log({
      action: 'document_processing_requested',
      resourceType: 'document',
      resourceId: documentId,
      organizationId,
      userId,
      details: {
        file_name: document.file_name,
        file_type: document.file_type,
        previous_status: document.processing_status
      }
    });

    // Start processing (non-blocking)
    ingestionPipeline.processDocument(documentId, organizationId)
      .then(async (result) => {
        processingQueue.removeJob(documentId);
        
        // Log completion
        await auditLogger.log({
          action: result.success ? 'document_processing_completed' : 'document_processing_failed',
          resourceType: 'document',
          resourceId: documentId,
          organizationId,
          userId,
          details: {
            final_status: result.finalStatus,
            statistics: result.statistics,
            error: result.error
          }
        });
      })
      .catch(async (error) => {
        processingQueue.removeJob(documentId);
        
        await auditLogger.log({
          action: 'document_processing_error',
          resourceType: 'document',
          resourceId: documentId,
          organizationId,
          userId,
          details: {
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      });

    // Return 202 Accepted
    return NextResponse.json(
      {
        message: 'Document processing started',
        documentId,
        fileName: document.file_name,
        status: document.processing_status,
        statusUrl: `/api/documents/${documentId}/process`,
        estimatedTime: estimateProcessingTime(document.file_type),
        queuePosition: processingQueue.getOrgJobCount(organizationId) - 1
      },
      { 
        status: 202,
        headers: { 
          'Location': `/api/documents/${documentId}/process`,
          'Retry-After': '5'
        }
      }
    );

  } catch (error) {
    console.error('Processing request error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to start document processing' },
      { status: 500 }
    );
  }
}

/**
 * Check if user has permission to process documents
 */
async function checkProcessingPermission(
  supabase: any,
  userId: string,
  organizationId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .single();

    if (error || !data) {
      return false;
    }

    // Admin and provider roles can process documents
    const allowedRoles = ['admin', 'provider'];
    return allowedRoles.includes(data.role);
  } catch {
    return false;
  }
}

/**
 * Get human-readable status message
 */
function getStatusMessage(status: string): string {
  const messages: Record<string, string> = {
    uploaded: 'Document is ready to be processed',
    validating: 'Document is being validated',
    processing: 'Document is being processed',
    chunking: 'Document content is being split into chunks',
    embedding: 'Chunk embeddings are being generated',
    storing: 'Embeddings are being stored',
    ready: 'Document is ready for search',
    error: 'Processing failed - check error message for details'
  };

  return messages[status] || `Unknown status: ${status}`;
}

/**
 * Calculate progress percentage from status
 */
function calculateProgress(status: string): number {
  const progressMap: Record<string, number> = {
    uploaded: 0,
    validating: 10,
    processing: 25,
    chunking: 50,
    embedding: 75,
    storing: 90,
    ready: 100,
    error: 0
  };

  return progressMap[status] ?? 0;
}

/**
 * Estimate processing time based on file type
 */
function estimateProcessingTime(fileType: string): number {
  const estimates: Record<string, number> = {
    'application/pdf': 30,      // 30 seconds
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 20,
    'text/plain': 10,
    'text/markdown': 10
  };

  return estimates[fileType] || 30;
}

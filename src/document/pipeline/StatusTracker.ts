import { EventEmitter } from 'events';

/**
 * Document status types matching database enum
 */
export type DocumentStatus =
  | 'uploaded'
  | 'validating'
  | 'processing'
  | 'chunking'
  | 'embedding'
  | 'storing'
  | 'ready'
  | 'error';

/**
 * Valid state transitions
 */
const VALID_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  uploaded: ['validating', 'error'],
  validating: ['processing', 'error'],
  processing: ['chunking', 'error'],
  chunking: ['embedding', 'error'],
  embedding: ['storing', 'error'],
  storing: ['ready', 'error'],
  ready: ['processing', 'error'], // Retry from ready
  error: ['processing'] // Retry from error
};

/**
 * Progress mapping for each status
 */
const STATUS_PROGRESS: Record<DocumentStatus, number> = {
  uploaded: 0,
  validating: 10,
  processing: 25,
  chunking: 50,
  embedding: 75,
  storing: 90,
  ready: 100,
  error: 0
};

/**
 * Status metadata interface
 */
export interface StatusMetadata {
  stage?: string;
  errorMessage?: string;
  errorDetails?: Record<string, unknown>;
  currentChunk?: number;
  totalChunks?: number;
  currentBatch?: number;
  totalBatches?: number;
  retryCount?: number;
  lastUpdated?: string;
  [key: string]: unknown;
}

/**
 * Document status tracking event types
 */
export interface StatusTrackerEvents {
  'statusChange': (data: {
    documentId: string;
    from: DocumentStatus;
    to: DocumentStatus;
    metadata?: StatusMetadata;
  }) => void;
  'progress': (data: {
    documentId: string;
    status: DocumentStatus;
    progress: number;
    metadata?: StatusMetadata;
  }) => void;
  'error': (data: {
    documentId: string;
    status: DocumentStatus;
    errorMessage: string;
    metadata?: StatusMetadata;
  }) => void;
  'complete': (data: {
    documentId: string;
    finalStatus: DocumentStatus;
  }) => void;
}

/**
 * StatusTracker - Document status state machine with progress tracking
 * 
 * Manages document processing status through the pipeline,
 * validates state transitions, and emits events for audit logging.
 */
export class StatusTracker extends EventEmitter {
  private supabase: any;
  private statusCache: Map<string, {
    status: DocumentStatus;
    metadata: StatusMetadata;
    lastUpdated: Date;
  }>;

  constructor(supabaseClient: any) {
    super();
    this.supabase = supabaseClient;
    this.statusCache = new Map();
  }

  /**
   * Initialize tracking for a document
   */
  async initialize(
    documentId: string,
    organizationId: string,
    metadata?: StatusMetadata
  ): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('documents')
        .update({
          processing_status: 'uploaded',
          processing_metadata: {
            ...metadata,
            initialized_at: new Date().toISOString(),
            initialized_by: 'StatusTracker'
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', documentId)
        .eq('organization_id', organizationId);

      if (error) {
        console.error('Failed to initialize status tracking:', error);
        return false;
      }

      // Cache the initial status
      this.statusCache.set(documentId, {
        status: 'uploaded',
        metadata: metadata || {},
        lastUpdated: new Date()
      });

      this.emit('statusChange', {
        documentId,
        from: 'uploaded' as DocumentStatus,
        to: 'uploaded' as DocumentStatus,
        metadata
      });

      return true;
    } catch (error) {
      console.error('Status initialization exception:', error);
      return false;
    }
  }

  /**
   * Transition to new status with validation
   */
  async transition(
    documentId: string,
    organizationId: string,
    newStatus: DocumentStatus,
    metadata?: StatusMetadata
  ): Promise<boolean> {
    try {
      const currentData = this.statusCache.get(documentId);
      const currentStatus = currentData?.status || await this.getCurrentStatus(documentId, organizationId);

      // Validate transition
      if (!this.validateTransition(currentStatus, newStatus)) {
        const errorMsg = `Invalid status transition: ${currentStatus} -> ${newStatus}`;
        console.error(errorMsg);
        
        await this.error(documentId, organizationId, errorMsg, metadata);
        return false;
      }

      // Prepare update data
      const updateData: {
        processing_status: DocumentStatus;
        processing_metadata: StatusMetadata;
        updated_at: string;
        error_message?: string;
      } = {
        processing_status: newStatus,
        processing_metadata: {
          ...metadata,
          last_updated: new Date().toISOString(),
          previous_status: currentStatus
        },
        updated_at: new Date().toISOString()
      };

      // Clear error message on non-error transitions
      if (newStatus !== 'error') {
        updateData.error_message = null;
      }

      // Update database
      const { error } = await this.supabase
        .from('documents')
        .update(updateData)
        .eq('id', documentId)
        .eq('organization_id', organizationId);

      if (error) {
        console.error('Status transition failed:', error);
        return false;
      }

      // Update cache
      this.statusCache.set(documentId, {
        status: newStatus,
        metadata: metadata || {},
        lastUpdated: new Date()
      });

      // Emit events
      this.emit('statusChange', {
        documentId,
        from: currentStatus,
        to: newStatus,
        metadata
      });

      // Emit progress event
      const progress = this.calculateProgress(newStatus);
      this.emit('progress', {
        documentId,
        status: newStatus,
        progress,
        metadata
      });

      // Check if complete
      if (newStatus === 'ready' || newStatus === 'error') {
        this.emit('complete', {
          documentId,
          finalStatus: newStatus
        });
      }

      return true;
    } catch (error) {
      console.error('Status transition exception:', error);
      return false;
    }
  }

  /**
   * Update progress percentage
   */
  async updateProgress(
    documentId: string,
    organizationId: string,
    current: number,
    total: number,
    stage?: string
  ): Promise<void> {
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

    const metadata: StatusMetadata = {
      current_chunk: current,
      total_chunks: total,
      stage
    };

    await this.supabase
      .from('documents')
      .update({
        processing_metadata: {
          ...metadata,
          progress_percentage: percentage,
          last_updated: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId)
      .eq('organization_id', organizationId);

    this.emit('progress', {
      documentId,
      status: await this.getCurrentStatus(documentId, organizationId),
      progress: percentage,
      metadata
    });
  }

  /**
   * Transition to error state
   */
  async error(
    documentId: string,
    organizationId: string,
    errorMessage: string,
    metadata?: StatusMetadata
  ): Promise<boolean> {
    const errorMetadata: StatusMetadata = {
      ...metadata,
      error_occurred_at: new Date().toISOString(),
      original_error: errorMessage
    };

    const result = await this.transition(
      documentId,
      organizationId,
      'error',
      errorMetadata
    );

    // Update error message field
    if (result) {
      await this.supabase
        .from('documents')
        .update({ error_message: errorMessage })
        .eq('id', documentId)
        .eq('organization_id', organizationId);
    }

    this.emit('error', {
      documentId,
      status: 'error',
      errorMessage,
      metadata: errorMetadata
    });

    return result;
  }

  /**
   * Validate state transition
   */
  validateTransition(from: DocumentStatus, to: DocumentStatus): boolean {
    const validNextStates = VALID_TRANSITIONS[from];
    return validNextStates?.includes(to) || false;
  }

  /**
   * Calculate progress percentage from status
   */
  calculateProgress(status: DocumentStatus): number {
    return STATUS_PROGRESS[status] ?? 0;
  }

  /**
   * Get current status for a document
   */
  async getCurrentStatus(
    documentId: string,
    organizationId: string
  ): Promise<DocumentStatus> {
    // Check cache first
    const cached = this.statusCache.get(documentId);
    if (cached && Date.now() - cached.lastUpdated.getTime() < 5000) {
      return cached.status;
    }

    // Fetch from database
    try {
      const { data, error } = await this.supabase
        .from('documents')
        .select('processing_status')
        .eq('id', documentId)
        .eq('organization_id', organizationId)
        .single();

      if (error || !data) {
        return 'uploaded'; // Default status
      }

      return data.processing_status || 'uploaded';
    } catch {
      return 'uploaded';
    }
  }

  /**
   * Get status metadata
   */
  async getStatusMetadata(
    documentId: string,
    organizationId: string
  ): Promise<StatusMetadata | null> {
    try {
      const { data, error } = await this.supabase
        .from('documents')
        .select('processing_metadata')
        .eq('id', documentId)
        .eq('organization_id', organizationId)
        .single();

      if (error || !data) {
        return null;
      }

      return data.processing_metadata as StatusMetadata;
    } catch {
      return null;
    }
  }

  /**
   * Check if document is in terminal state
   */
  isTerminalStatus(status: DocumentStatus): boolean {
    return status === 'ready' || status === 'error';
  }

  /**
   * Reset status to initial state (for reprocessing)
   */
  async reset(
    documentId: string,
    organizationId: string
  ): Promise<boolean> {
    return this.initialize(documentId, organizationId, {
      reset_at: new Date().toISOString(),
      reset_reason: 'Manual reset for reprocessing'
    });
  }

  /**
   * Get status history from audit logs
   */
  async getStatusHistory(
    documentId: string,
    organizationId: string
  ): Promise<Array<{
    status: DocumentStatus;
    timestamp: string;
    metadata?: StatusMetadata;
  }> {
    try {
      const { data, error } = await this.supabase
        .from('audit_log')
        .select('created_at, details')
        .eq('resource_id', documentId)
        .eq('organization_id', organizationId)
        .in('action', [
          'document_status_change',
          'document_processing_started',
          'document_processing_completed',
          'document_processing_error'
        ])
        .order('created_at', { ascending: true });

      if (error) {
        return [];
      }

      return (data || []).map(record => ({
        status: record.details?.status || 'unknown',
        timestamp: record.created_at,
        metadata: record.details
      }));
    } catch {
      return [];
    }
  }

  /**
   * Cleanup cache for a document
   */
  cleanup(documentId: string): void {
    this.statusCache.delete(documentId);
  }

  /**
   * Cleanup all cached statuses
   */
  clearCache(): void {
    this.statusCache.clear();
  }
}

/**
 * Factory function to create StatusTracker instance
 */
export function createStatusTracker(supabaseClient: any): StatusTracker {
  return new StatusTracker(supabaseClient);
}

export default StatusTracker;

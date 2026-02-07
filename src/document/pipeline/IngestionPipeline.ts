import { EventEmitter } from 'events';
import { ClinicalSplitter, createClinicalSplitter } from '../chunking/ClinicalSplitter';
import { ChunkManager, createChunkManager } from '../chunking/ChunkManager';
import { EmbeddingService, createEmbeddingService } from '../embedding/EmbeddingService';
import { BatchEmbedder, createBatchEmbedder } from '../embedding/BatchEmbedder';
import { StatusTracker, createStatusTracker, DocumentStatus } from './StatusTracker';
import { LoaderFactory } from '../loaders/LoaderFactory';
import { AuditLogger } from '../../middleware/AuditLogger';
import { DocumentChunk, ChunkMetadata } from '../types';

/**
 * Pipeline processing events
 */
export interface IngestionPipelineEvents {
  'documentLoaded': (data: { documentId: string; documentType: string }) => void;
  'chunkingStarted': (data: { documentId: string; chunkCount: number }) => void;
  'chunkingComplete': (data: { documentId: string; chunks: DocumentChunk[] }) => void;
  'embeddingStarted': (data: { documentId: string; chunkCount: number }) => void;
  'embeddingProgress': (data: { documentId: string; completed: number; total: number }) => void;
  'embeddingComplete': (data: { documentId: string; successCount: number; failedCount: number }) => void;
  'storageStarted': (data: { documentId: string; chunkCount: number }) => void;
  'storageComplete': (data: { documentId: string; storedCount: number }) => void;
  'complete': (data: { documentId: string; finalStatus: DocumentStatus; statistics: PipelineStatistics }) => void;
  'error': (data: { documentId: string; stage: string; error: Error }) => void;
}

/**
 * Pipeline processing statistics
 */
export interface PipelineStatistics {
  totalChunks: number;
  successfulEmbeddings: number;
  failedEmbeddings: number;
  totalTime: number;
  retryCount: number;
  errorCount: number;
}

/**
 * IngestionPipeline - Document processing orchestrator
 * 
 * Orchestrates full document processing: validation -> chunking -> embedding -> storage
 * Manages pipeline lifecycle, error handling, and progress reporting.
 */
export class IngestionPipeline extends EventEmitter {
  private clinicalSplitter: ClinicalSplitter;
  private chunkManager: ChunkManager;
  private embeddingService: EmbeddingService;
  private batchEmbedder: BatchEmbedder;
  private statusTracker: StatusTracker;
  private loaderFactory: LoaderFactory;
  private auditLogger: AuditLogger | null;
  private supabase: any;
  private maxProcessingTime: number;
  private retryFailedChunks: boolean;

  constructor(config: {
    supabaseClient: any;
    auditLogger?: AuditLogger | null;
    clinicalSplitter?: ClinicalSplitter;
    chunkManager?: ChunkManager;
    embeddingService?: EmbeddingService;
    batchEmbedder?: BatchEmbedder;
    statusTracker?: StatusTracker;
    maxProcessingTime?: number;
    retryFailedChunks?: boolean;
  }) {
    super();
    this.supabase = config.supabaseClient;
    this.auditLogger = config.auditLogger || null;
    this.maxProcessingTime = config.maxProcessingTime || 10 * 60 * 1000; // 10 minutes default
    this.retryFailedChunks = config.retryFailedChunks !== false;

    // Initialize components
    this.clinicalSplitter = config.clinicalSplitter || createClinicalSplitter();
    this.chunkManager = config.chunkManager || createChunkManager(config.supabaseClient);
    this.embeddingService = config.embeddingService || createEmbeddingService();
    this.batchEmbedder = config.batchEmbedder || createBatchEmbedder({
      embeddingService: this.embeddingService,
      onProgress: (progress) => {
        this.emit('embeddingProgress', {
          documentId: progress.completed.toString(), // Will be set by processDocument
          completed: progress.completed,
          total: progress.total
        });
      }
    });
    this.statusTracker = config.statusTracker || createStatusTracker(config.supabaseClient);
    this.loaderFactory = new LoaderFactory();
  }

  /**
   * Process document through full pipeline
   */
  async processDocument(
    documentId: string,
    organizationId: string,
    filePath?: string
  ): Promise<{
    success: boolean;
    finalStatus: DocumentStatus;
    statistics: PipelineStatistics;
    error?: string;
  }> {
    const startTime = Date.now();
    const statistics: PipelineStatistics = {
      totalChunks: 0,
      successfulEmbeddings: 0,
      failedEmbeddings: 0,
      totalTime: 0,
      retryCount: 0,
      errorCount: 0
    };

    // Timeout protection
    const timeout = setTimeout(() => {
      console.error(`Document ${documentId} processing timeout after ${this.maxProcessingTime}ms`);
      this.statusTracker.error(documentId, organizationId, 'Processing timeout exceeded');
    }, this.maxProcessingTime);

    try {
      // Initialize status tracking
      await this.statusTracker.initialize(documentId, organizationId, {
        started_at: new Date().toISOString()
      });

      await this.logAuditEvent(documentId, organizationId, 'document_processing_started', {
        document_id: documentId,
        organization_id: organizationId
      });

      // Step 1: Load document
      await this.statusTracker.transition(documentId, organizationId, 'validating', {
        stage: 'loading'
      });

      const document = await this.loadDocument(documentId, organizationId);
      if (!document) {
        throw new Error('Failed to load document');
      }

      this.emit('documentLoaded', {
        documentId,
        documentType: document.type || 'unknown'
      });

      // Step 2: Transition to processing
      await this.statusTracker.transition(documentId, organizationId, 'processing', {
        stage: 'processing'
      });

      // Step 3: Chunking phase
      await this.statusTracker.transition(documentId, organizationId, 'chunking', {
        stage: 'chunking'
      });

      const chunks = await this.performChunking(document, documentId);
      statistics.totalChunks = chunks.length;

      this.emit('chunkingComplete', {
        documentId,
        chunks
      });

      // Step 4: Embedding phase
      await this.statusTracker.transition(documentId, organizationId, 'embedding', {
        stage: 'embedding'
      });

      const { embeddings, stats } = await this.performEmbedding(chunks, documentId);
      statistics.successfulEmbeddings = stats.successfulEmbeddings;
      statistics.failedEmbeddings = stats.failedEmbeddings;
      statistics.retryCount = stats.totalRetries;

      this.emit('embeddingComplete', {
        documentId,
        successCount: stats.successfulEmbeddings,
        failedCount: stats.failedEmbeddings
      });

      // Attach embeddings to chunks
      chunks.forEach((chunk, index) => {
        if (embeddings[index]) {
          chunk.embedding = embeddings[index];
        }
      });

      // Handle failed embeddings
      if (statistics.failedEmbeddings > 0 && this.retryFailedChunks) {
        statistics.retryCount += await this.retryFailedEmbeddings(
          chunks,
          embeddings,
          documentId,
          organizationId
        );
      }

      // Step 5: Storage phase
      await this.statusTracker.transition(documentId, organizationId, 'storing', {
        stage: 'storage'
      });

      const storedCount = await this.performStorage(chunks, documentId, organizationId);

      this.emit('storageComplete', {
        documentId,
        storedCount
      });

      // Step 6: Complete - ready
      await this.statusTracker.transition(documentId, organizationId, 'ready', {
        stage: 'complete',
        completed_at: new Date().toISOString(),
        total_chunks: statistics.totalChunks,
        successful_embeddings: statistics.successfulEmbeddings,
        failed_embeddings: statistics.failedEmbeddings
      });

      statistics.totalTime = Date.now() - startTime;

      await this.logAuditEvent(documentId, organizationId, 'document_processing_completed', {
        document_id: documentId,
        organization_id: organizationId,
        statistics
      });

      this.emit('complete', {
        documentId,
        finalStatus: 'ready',
        statistics
      });

      clearTimeout(timeout);

      return {
        success: true,
        finalStatus: 'ready',
        statistics
      };

    } catch (error) {
      statistics.totalTime = Date.now() - startTime;
      statistics.errorCount++;

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Document ${documentId} processing failed:`, error);

      await this.statusTracker.error(documentId, organizationId, errorMessage, {
        stage: 'processing',
        error_details: { message: errorMessage }
      });

      await this.logAuditEvent(documentId, organizationId, 'document_processing_error', {
        document_id: documentId,
        organization_id: organizationId,
        error: errorMessage,
        statistics
      });

      this.emit('error', {
        documentId,
        stage: 'processing',
        error: error instanceof Error ? error : new Error(errorMessage)
      });

      clearTimeout(timeout);

      return {
        success: false,
        finalStatus: 'error',
        statistics,
        error: errorMessage
      };
    }
  }

  /**
   * Start processing in background
   */
  async startProcessing(
    documentId: string,
    organizationId: string,
    filePath?: string
  ): Promise<void> {
    // Process in background to avoid timeout
    this.processDocument(documentId, organizationId, filePath).catch(error => {
      console.error('Background processing error:', error);
    });
  }

  /**
   * Retry failed documents
   */
  async retryFailed(
    documentId: string,
    organizationId: string
  ): Promise<{
    success: boolean;
    finalStatus: DocumentStatus;
    error?: string;
  }> {
    const currentStatus = await this.statusTracker.getCurrentStatus(documentId, organizationId);

    if (currentStatus !== 'error') {
      return {
        success: false,
        finalStatus: currentStatus,
        error: 'Document is not in error state'
      };
    }

    // Reset status and retry
    await this.statusTracker.reset(documentId, organizationId);

    return this.processDocument(documentId, organizationId);
  }

  /**
   * Load document from database
   */
  private async loadDocument(
    documentId: string,
    organizationId: string
  ): Promise<{ content: string; type: string; name: string } | null> {
    try {
      const { data, error } = await this.supabase
        .from('documents')
        .select('file_name, file_type, file_content, file_path')
        .eq('id', documentId)
        .eq('organization_id', organizationId)
        .single();

      if (error || !data) {
        console.error('Failed to load document:', error);
        return null;
      }

      // Get loader based on file type
      const loader = this.loaderFactory.getLoader(data.file_type);
      
      let content: string;
      if (data.file_content) {
        // Content already in database (for smaller files)
        content = data.file_content;
      } else if (data.file_path) {
        // Load from file path
        content = await loader.load(data.file_path);
      } else {
        throw new Error('Document has no content or file path');
      }

      return {
        content,
        type: data.file_type,
        name: data.file_name
      };
    } catch (error) {
      console.error('Document load error:', error);
      return null;
    }
  }

  /**
   * Perform chunking
   */
  private async performChunking(
    document: { content: string; name: string },
    documentId: string
  ): Promise<DocumentChunk[]> {
    const chunks = await this.clinicalSplitter.clinicalChunking(
      document.content,
      documentId
    );

    console.log(`Document ${documentId}: Created ${chunks.length} chunks`);
    return chunks;
  }

  /**
   * Perform embedding generation
   */
  private async performEmbedding(
    chunks: DocumentChunk[],
    documentId: string
  ): Promise<{
    embeddings: (number[] | null)[];
    stats: { successfulEmbeddings: number; failedEmbeddings: number; totalRetries: number };
  }> {
    const texts = chunks.map(chunk => chunk.content);

    const result = await this.batchEmbedder.batchEmbed(texts);

    return {
      embeddings: result.embeddings,
      stats: {
        successfulEmbeddings: result.statistics.successfulEmbeddings,
        failedEmbeddings: result.statistics.failedEmbeddings,
        totalRetries: result.statistics.totalRetries
      }
    };
  }

  /**
   * Retry failed embeddings
   */
  private async retryFailedEmbeddings(
    chunks: DocumentChunk[],
    embeddings: (number[] | null)[],
    documentId: string,
    organizationId: string
  ): Promise<number> {
    const retryCount = 0;
    
    // Find failed chunks
    const failedIndices: number[] = [];
    chunks.forEach((_, index) => {
      if (!embeddings[index]) {
        failedIndices.push(index);
      }
    });

    if (failedIndices.length === 0) {
      return 0;
    }

    console.log(`Retrying ${failedIndices.length} failed embeddings for document ${documentId}`);

    // Retry each failed chunk
    for (const index of failedIndices) {
      try {
        // Use fallback for oversized chunks
        const embedding = await this.batchEmbedder.embedWithFallback(chunks[index].content);
        
        if (embedding) {
          embeddings[index] = embedding;
          retryCount++;
        }
      } catch (error) {
        console.error(`Failed to retry chunk ${index}:`, error);
      }
    }

    return retryCount;
  }

  /**
   * Perform storage
   */
  private async performStorage(
    chunks: DocumentChunk[],
    documentId: string,
    organizationId: string
  ): Promise<number> {
    // Filter out chunks without embeddings
    const validChunks = chunks.filter(chunk => chunk.embedding !== null);

    if (validChunks.length === 0) {
      console.warn(`No valid chunks with embeddings for document ${documentId}`);
      return 0;
    }

    const result = await this.chunkManager.createChunks(documentId, validChunks, organizationId);

    if (!result.success) {
      throw new Error(`Failed to store chunks: ${result.error}`);
    }

    console.log(`Document ${documentId}: Stored ${result.chunkCount} chunks`);
    return result.chunkCount;
  }

  /**
   * Log audit event
   */
  private async logAuditEvent(
    documentId: string,
    organizationId: string,
    action: string,
    details: Record<string, unknown>
  ): Promise<void> {
    if (this.auditLogger) {
      await this.auditLogger.log({
        action,
        resourceType: 'document',
        resourceId: documentId,
        organizationId,
        details
      });
    }
  }

  /**
   * Get pipeline health status
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    embeddingService: boolean;
    database: boolean;
  }> {
    const embeddingHealthy = await this.embeddingService.healthCheck();

    let databaseHealthy = false;
    try {
      const { error } = await this.supabase
        .from('documents')
        .select('id')
        .limit(1);
      databaseHealthy = !error;
    } catch {
      databaseHealthy = false;
    }

    const status = embeddingHealthy && databaseHealthy
      ? 'healthy'
      : embeddingHealthy || databaseHealthy
        ? 'degraded'
        : 'unhealthy';

    return {
      status,
      embeddingService: embeddingHealthy,
      database: databaseHealthy
    };
  }

  /**
   * Get statistics for a document
   */
  async getDocumentStatistics(
    documentId: string,
    organizationId: string
  ): Promise<PipelineStatistics | null> {
    const metadata = await this.statusTracker.getStatusMetadata(documentId, organizationId);
    
    if (!metadata) {
      return null;
    }

    return {
      totalChunks: metadata.total_chunks as number || 0,
      successfulEmbeddings: metadata.successful_embeddings as number || 0,
      failedEmbeddings: metadata.failed_embeddings as number || 0,
      totalTime: 0,
      retryCount: metadata.retry_count as number || 0,
      errorCount: 0
    };
  }
}

/**
 * Factory function to create IngestionPipeline instance
 */
export function createIngestionPipeline(config: {
  supabaseClient: any;
  auditLogger?: AuditLogger | null;
}): IngestionPipeline {
  return new IngestionPipeline(config);
}

export default IngestionPipeline;

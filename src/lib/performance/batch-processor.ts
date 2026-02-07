/**
 * Batch Processor for Document Ingestion
 * 
 * Efficiently processes large document batches with progress tracking,
 * error handling, and integration with monitoring/alerting systems.
 */

import { incrementMetric, logMetric } from '../monitoring/datadog-integration';
import { createAlert, AlertSeverity } from '../monitoring/alerting';

// ============================================================================
// Types and Interfaces
// ============================================================================

interface BatchJob {
  id: string;
  documents: DocumentInput[];
  options: BatchOptions;
  status: BatchStatus;
  progress: number;
  startedAt: number;
  completedAt?: number;
  results: BatchResult[];
  errors: BatchError[];
  metadata: BatchMetadata;
}

interface DocumentInput {
  id?: string;
  content: string;
  metadata?: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

interface BatchOptions {
  batchSize: number;
  parallelBatches: number;
  retryAttempts: number;
  retryDelay: number;
  timeout: number;
  skipOnError: boolean;
  generateEmbeddings: boolean;
  storeInVectorDB: boolean;
}

interface BatchResult {
  documentId: string;
  success: boolean;
  duration: number;
  chunks?: number;
  embeddingGenerated?: boolean;
  storedInVectorDB?: boolean;
  metadata?: Record<string, unknown>;
}

interface BatchError {
  documentId: string;
  error: string;
  timestamp: number;
  retryable: boolean;
}

interface BatchMetadata {
  totalDocuments: number;
  processedDocuments: number;
  failedDocuments: number;
  totalChunks: number;
  averageDuration: number;
  peakMemoryUsage: number;
}

type BatchStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

interface BatchProgress {
  jobId: string;
  status: BatchStatus;
  progress: number;
  processed: number;
  total: number;
  failed: number;
  estimatedTimeRemaining: number;
  currentBatch?: number;
  totalBatches: number;
}

// ============================================================================
// Batch Job Store
// ============================================================================

// In-memory batch job storage (for production, use persistent storage)
const batchJobs = new Map<string, BatchJob>();

// Default batch options
const DEFAULT_BATCH_OPTIONS: BatchOptions = {
  batchSize: 100,
  parallelBatches: 2,
  retryAttempts: 3,
  retryDelay: 1000,
  timeout: 300000, // 5 minutes per batch
  skipOnError: false,
  generateEmbeddings: true,
  storeInVectorDB: true
};

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * Create and start a new batch processing job
 */
export async function processBatch(
  documents: DocumentInput[],
  options?: Partial<BatchOptions>
): Promise<BatchJob> {
  const mergedOptions = { ...DEFAULT_BATCH_OPTIONS, ...options };
  
  // Create job ID
  const jobId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Sort documents by priority
  const sortedDocuments = [...documents].sort((a, b) => {
    const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    return (priorityOrder[a.priority || 'normal'] || 2) - 
           (priorityOrder[b.priority || 'normal'] || 2);
  });
  
  // Create batch job
  const job: BatchJob = {
    id: jobId,
    documents: sortedDocuments,
    options: mergedOptions,
    status: 'pending',
    progress: 0,
    startedAt: Date.now(),
    results: [],
    errors: [],
    metadata: {
      totalDocuments: sortedDocuments.length,
      processedDocuments: 0,
      failedDocuments: 0,
      totalChunks: 0,
      averageDuration: 0,
      peakMemoryUsage: 0
    }
  };
  
  batchJobs.set(jobId, job);
  
  // Start processing asynchronously
  processJobAsync(job).catch(error => {
    console.error(`Batch job ${jobId} failed:`, error);
    job.status = 'failed';
    job.completedAt = Date.now();
  });
  
  // Log batch job creation
  await incrementMetric('batch.jobs.created', {
    batch_size: String(documents.length),
    priority: 'mixed'
  });
  
  return job;
}

/**
 * Process batch job asynchronously
 */
async function processJobAsync(job: BatchJob): Promise<void> {
  job.status = 'running';
  job.startedAt = Date.now();
  
  const { documents, options } = job;
  const totalBatches = Math.ceil(documents.length / options.batchSize);
  
  // Log batch start
  await logMetric('batch.started', 1, {
    job_id: job.id,
    total_documents: String(documents.length),
    batch_size: String(options.batchSize)
  });
  
  const startTime = Date.now();
  let processedCount = 0;
  let failedCount = 0;
  let totalChunks = 0;
  const durations: number[] = [];
  
  // Process batches
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    if (job.status === 'cancelled') {
      break;
    }
    
    const batchStart = batchIndex * options.batchSize;
    const batchEnd = Math.min(batchStart + options.batchSize, documents.length);
    const batch = documents.slice(batchStart, batchEnd);
    
    try {
      const batchResult = await processSingleBatch(batch, options, batchIndex + 1);
      
      job.results.push(...batchResult.results);
      job.errors.push(...batchResult.errors);
      
      processedCount += batchResult.processed;
      failedCount += batchResult.failed;
      totalChunks += batchResult.totalChunks;
      durations.push(...batchResult.durations);
      
      // Update progress
      job.progress = (processedCount / documents.length) * 100;
      job.metadata.processedDocuments = processedCount;
      job.metadata.failedDocuments = failedCount;
      job.metadata.totalChunks = totalChunks;
      job.metadata.averageDuration = durations.length > 0 
        ? durations.reduce((a, b) => a + b, 0) / durations.length 
        : 0;
      
      // Check for slow batch processing
      if (batchResult.averageDuration > 30000) {
        await createAlert({
          type: 'batch_slow_processing',
          severity: 'medium',
          title: 'Slow batch processing detected',
          message: `Batch ${batchIndex + 1}/${totalBatches} took ${(batchResult.averageDuration / 1000).toFixed(2)}s`,
          jobId: job.id,
          batchIndex: batchIndex + 1
        });
      }
      
    } catch (error) {
      console.error(`Batch ${batchIndex + 1} failed:`, error);
      
      if (!options.skipOnError) {
        job.status = 'failed';
        job.completedAt = Date.now();
        
        await createAlert({
          type: 'batch_failed',
          severity: 'high',
          title: 'Batch processing failed',
          message: `Batch ${batchIndex + 1}/${totalBatches} failed: ${error}`,
          jobId: job.id,
          batchIndex: batchIndex + 1
        });
        
        return;
      }
      
      // Mark all documents in batch as failed
      for (const doc of batch) {
        job.errors.push({
          documentId: doc.id || 'unknown',
          error: String(error),
          timestamp: Date.now(),
          retryable: true
        });
        failedCount++;
      }
    }
  }
  
  // Complete job
  const totalDuration = Date.now() - startTime;
  job.status = failedCount > 0 && job.errors.length === processedCount ? 'failed' : 'completed';
  job.completedAt = Date.now();
  job.progress = 100;
  
  // Log batch completion
  await logMetric('batch.completed', 1, {
    job_id: job.id,
    status: job.status,
    processed_documents: String(processedCount),
    failed_documents: String(failedCount),
    total_duration_ms: String(totalDuration),
    documents_per_second: String((processedCount / (totalDuration / 1000)).toFixed(2))
  });
  
  // Create alert if failed
  if (job.status === 'failed') {
    await createAlert({
      type: 'batch_job_failed',
      severity: 'high',
      title: 'Batch job failed',
      message: `Batch job ${job.id} failed: ${failedCount} documents failed`,
      jobId: job.id,
      failed_documents: String(failedCount)
    });
  }
}

/**
 * Process a single batch of documents
 */
async function processSingleBatch(
  documents: DocumentInput[],
  options: BatchOptions,
  batchNumber: number
): Promise<{
  results: BatchResult[];
  errors: BatchError[];
  processed: number;
  failed: number;
  totalChunks: number;
  durations: number[];
  averageDuration: number;
}> {
  const results: BatchResult[] = [];
  const errors: BatchError[] = [];
  const durations: number[] = [];
  let totalChunks = 0;
  
  // Process documents in parallel (within batch)
  const documentPromises = documents.map(async (doc) => {
    const startTime = Date.now();
    let retries = 0;
    let success = false;
    let result: BatchResult | null = null;
    
    while (retries < options.retryAttempts && !success) {
      try {
        result = await processDocument(doc, options, retries);
        success = true;
      } catch (error) {
        retries++;
        
        if (retries >= options.retryAttempts) {
          errors.push({
            documentId: doc.id || 'unknown',
            error: String(error),
            timestamp: Date.now(),
            retryable: false
          });
        } else {
          // Wait before retry
          await new Promise(resolve => 
            setTimeout(resolve, options.retryDelay * retries)
          );
        }
      }
    }
    
    const duration = Date.now() - startTime;
    durations.push(duration);
    
    if (result) {
      results.push(result);
      if (result.chunks) {
        totalChunks += result.chunks;
      }
    }
    
    return { success, duration };
  });
  
  await Promise.all(documentPromises);
  
  return {
    results,
    errors,
    processed: results.length,
    failed: errors.length,
    totalChunks,
    durations,
    averageDuration: durations.length > 0 
      ? durations.reduce((a, b) => a + b, 0) / durations.length 
      : 0
  };
}

/**
 * Process a single document
 */
async function processDocument(
  document: DocumentInput,
  options: BatchOptions,
  retryCount: number
): Promise<BatchResult> {
  const startTime = Date.now();
  
  // TODO: In production, this would integrate with actual document processing
  // - Chunking service
  // - Embedding generation
  // - Vector database storage
  
  // Simulate document processing
  await simulateProcessingDelay(document.content.length);
  
  const chunks = Math.ceil(document.content.length / 512); // 512 chars per chunk
  const documentId = document.id || `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Simulate embedding generation
  let embeddingGenerated = false;
  if (options.generateEmbeddings) {
    await simulateProcessingDelay(100); // Simulate embedding generation
    embeddingGenerated = true;
  }
  
  // Simulate vector DB storage
  let storedInVectorDB = false;
  if (options.storeInVectorDB) {
    await simulateProcessingDelay(50); // Simulate DB storage
    storedInVectorDB = true;
  }
  
  const duration = Date.now() - startTime;
  
  // Log document processing
  await logMetric('batch.document.processed', 1, {
    document_id: documentId,
    retry_count: String(retryCount),
    chunks: String(chunks),
    duration_ms: String(duration)
  });
  
  return {
    documentId,
    success: true,
    duration,
    chunks,
    embeddingGenerated,
    storedInVectorDB,
    metadata: document.metadata
  };
}

/**
 * Simulate processing delay
 */
function simulateProcessingDelay(baseDelay: number): Promise<void> {
  const delay = baseDelay + Math.random() * 100; // Add some variance
  return new Promise(resolve => setTimeout(resolve, Math.min(delay, 1000)));
}

// ============================================================================
// Batch Monitoring
// ============================================================================

/**
 * Monitor batch progress
 */
export function monitorBatchProgress(jobId: string): BatchProgress | null {
  const job = batchJobs.get(jobId);
  
  if (!job) {
    return null;
  }
  
  const totalBatches = Math.ceil(job.documents.length / job.options.batchSize);
  const currentBatch = Math.floor(job.metadata.processedDocuments / job.options.batchSize) + 1;
  
  // Calculate estimated time remaining
  const elapsed = Date.now() - job.startedAt;
  const rate = job.metadata.processedDocuments / (elapsed / 1000); // docs per second
  const remaining = job.documents.length - job.metadata.processedDocuments;
  const estimatedTimeRemaining = rate > 0 ? remaining / rate : 0;
  
  return {
    jobId,
    status: job.status,
    progress: job.progress,
    processed: job.metadata.processedDocuments,
    total: job.documents.length,
    failed: job.metadata.failedDocuments,
    estimatedTimeRemaining,
    currentBatch: currentBatch > totalBatches ? totalBatches : currentBatch,
    totalBatches
  };
}

/**
 * Get all batch jobs
 */
export function getAllBatchJobs(): BatchJob[] {
  return Array.from(batchJobs.values());
}

/**
 * Get batch job by ID
 */
export function getBatchJob(jobId: string): BatchJob | undefined {
  return batchJobs.get(jobId);
}

/**
 * Cancel a batch job
 */
export async function cancelBatchJob(jobId: string): Promise<boolean> {
  const job = batchJobs.get(jobId);
  
  if (!job) {
    return false;
  }
  
  if (job.status !== 'running') {
    return false;
  }
  
  job.status = 'cancelled';
  job.completedAt = Date.now();
  
  await logMetric('batch.cancelled', 1, { job_id: jobId });
  
  return true;
}

/**
 * Get batch job statistics
 */
export function getBatchJobStats(): {
  totalJobs: number;
  runningJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalDocumentsProcessed: number;
  averageDuration: number;
} {
  const jobs = Array.from(batchJobs.values());
  
  const completed = jobs.filter(j => j.status === 'completed');
  const failed = jobs.filter(j => j.status === 'failed');
  
  const totalDocumentsProcessed = jobs.reduce(
    (sum, j) => sum + j.metadata.processedDocuments, 
    0
  );
  
  const durations = completed
    .filter(j => j.completedAt)
    .map(j => j.completedAt! - j.startedAt);
  
  const averageDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;
  
  return {
    totalJobs: jobs.length,
    runningJobs: jobs.filter(j => j.status === 'running').length,
    completedJobs: completed.length,
    failedJobs: failed.length,
    totalDocumentsProcessed,
    averageDuration
  };
}

// ============================================================================
// Batch Optimization Strategies
// ============================================================================

/**
 * Determine optimal batch size based on document characteristics
 */
export function determineOptimalBatchSize(
  documentLengths: number[],
  availableMemory: number = 1024 * 1024 * 1024 // 1GB default
): number {
  const avgLength = documentLengths.reduce((a, b) => a + b, 0) / documentLengths.length;
  const estimatedChunkSize = avgLength / 2; // Rough estimate
  
  // Calculate safe batch size based on memory
  const maxChunksPerBatch = Math.floor(availableMemory / (estimatedChunkSize * 2));
  const safeBatchSize = Math.min(maxChunksPerBatch, 200); // Cap at 200
  
  // Return optimal batch size (default 100, adjusted based on analysis)
  return Math.max(50, Math.min(safeBatchSize, 150));
}

/**
 * Schedule batch processing for off-peak hours
 */
export function scheduleForOffPeak(
  job: BatchJob,
  offPeakStart: number = 22, // 10 PM
  offPeakEnd: number = 6     // 6 AM
): Date {
  const now = new Date();
  const currentHour = now.getHours();
  
  let scheduledTime: Date;
  
  if (currentHour >= offPeakStart || currentHour < offPeakEnd) {
    // Currently off-peak, schedule immediately
    scheduledTime = now;
  } else {
    // Schedule for tonight's off-peak period
    scheduledTime = new Date(now);
    scheduledTime.setHours(offPeakStart, 0, 0, 0);
    
    if (scheduledTime <= now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }
  }
  
  // Log scheduling decision
  logMetric('batch.scheduled', 1, {
    job_id: job.id,
    scheduled_time: scheduledTime.toISOString(),
    current_hour: String(currentHour)
  });
  
  return scheduledTime;
}

/**
 * Limit concurrent batches based on system load
 */
export async function getOptimalConcurrency(
  maxConcurrency: number = 5
): Promise<number> {
  // In production, would check actual system metrics
  // - CPU usage
  // - Memory usage
  // - Network I/O
  // - Database connections
  
  // For now, return conservative estimate
  const cpuCores = 4; // Would detect dynamically
  const safeConcurrency = Math.min(cpuCores, maxConcurrency);
  
  return Math.max(1, safeConcurrency);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate document hash for duplicate detection
 */
export function generateDocumentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Check if batch is large enough to warrant special handling
 */
export function isLargeBatch(documents: DocumentInput[]): boolean {
  return documents.length > 500;
}

/**
 * Estimate batch processing time
 */
export function estimateBatchTime(
  documents: DocumentInput[],
  options: BatchOptions
): number {
  const avgProcessingTime = 100; // ms per document (estimated)
  const overhead = 5000; // Batch setup overhead
  
  const processingTime = documents.length * avgProcessingTime;
  const batches = Math.ceil(documents.length / options.batchSize);
  const batchOverhead = batches * overhead;
  
  return processingTime + batchOverhead;
}

// ============================================================================
// Exports
// ============================================================================

export {
  BatchJob,
  DocumentInput,
  BatchOptions,
  BatchResult,
  BatchError,
  BatchStatus,
  BatchProgress,
  BatchMetadata
};

export default {
  processBatch,
  monitorBatchProgress,
  getAllBatchJobs,
  getBatchJob,
  cancelBatchJob,
  getBatchJobStats,
  determineOptimalBatchSize,
  scheduleForOffPeak,
  getOptimalConcurrency,
  generateDocumentHash,
  isLargeBatch,
  estimateBatchTime
};

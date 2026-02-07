// Document Module Exports
// Phase 2: Document Management & RAG

// Types
export * from './types';

// Chunking Services
export { ClinicalSplitter, createClinicalSplitter } from './chunking/ClinicalSplitter';
export { ChunkManager, createChunkManager } from './chunking/ChunkManager';

// Embedding Services
export { EmbeddingService, createEmbeddingService } from './embedding/EmbeddingService';
export { BatchEmbedder, createBatchEmbedder } from './embedding/BatchEmbedder';

// Pipeline Services
export { StatusTracker, createStatusTracker, DocumentStatus } from './pipeline/StatusTracker';
export { IngestionPipeline, createIngestionPipeline } from './pipeline/IngestionPipeline';
export type { IngestionPipelineEvents, PipelineStatistics } from './pipeline/IngestionPipeline';

// Constants
export { PROCESSING_CONFIG, ProcessingQueue } from './pipeline/route';

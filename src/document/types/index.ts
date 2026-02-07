// Document types and interfaces for healthcare AI assistant
// Phase 2: Document Management & RAG

// ============================================================================
// Document Status Types
// ============================================================================

export type DocumentStatus =
  | 'uploaded'     // File uploaded, pending validation
  | 'validating'   // File being validated for security
  | 'processing'   // General processing
  | 'chunking'     // Document being split into chunks
  | 'embedding'    // Generating embeddings for chunks
  | 'storing'      // Storing embeddings in pgvector
  | 'ready'        // Document fully processed and searchable
  | 'error'        // Processing failed
  | 'deleting';    // Being deleted (soft delete with cleanup)

// ============================================================================
// Document Interfaces
// ============================================================================

export interface Document {
  // Primary identifiers
  id: string; // UUID
  organization_id: string; // UUID
  
  // File information
  name: string;
  file_type: string;
  file_size: number;
  file_hash: string; // SHA-256 hash
  
  // Processing status
  status: DocumentStatus;
  
  // Metadata stored as JSONB for flexibility
  metadata: DocumentMetadata;
  
  // Versioning support
  version: number;
  parent_version_id?: string; // UUID, links to previous version
  
  // Ownership and timestamps
  uploaded_by: string; // UUID
  uploaded_at: string; // ISO timestamp
  processed_at?: string; // ISO timestamp, null until processing complete
  
  // Error tracking
  error_message?: string;
  
  // Audit trail (JSON array of audit events)
  audit_trail: AuditEvent[];
}

// ============================================================================
// Document Metadata Interface
// ============================================================================

export interface DocumentMetadata {
  // Source information
  source?: string;
  author?: string;
  department?: string;
  
  // Clinical flags
  is_clinical?: boolean;
  contains_phi?: boolean;
  confidentiality_level?: 'public' | 'internal' | 'confidential' | 'restricted';
  
  // Processing metadata
  original_encoding?: string;
  page_count?: number;
  language?: string;
  
  // Custom metadata (flexible key-value pairs)
  [key: string]: unknown;
}

// ============================================================================
// Audit Event Interface
// ============================================================================

export interface AuditEvent {
  timestamp: string;
  action: string;
  user_id: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Document Chunk Interfaces
// ============================================================================

export interface DocumentChunk {
  // Primary identifiers
  id: string; // UUID
  document_id: string; // UUID
  organization_id: string; // UUID
  
  // Chunk content and position
  chunk_index: number; // Position in document (0-based)
  content: string; // Actual text content of chunk
  
  // Vector embedding (1536 dimensions for text-embedding-3-small)
  content_vector?: number[];
  
  // Metadata for retrieval and display
  metadata: ChunkMetadata;
  
  // Structural information
  token_count?: number;
  section_name?: string; // Clinical section (e.g., "Diagnosis", "Treatment Plan")
  page_number?: number; // Page number in original document
  
  // Timestamps
  created_at: string; // ISO timestamp
}

// ============================================================================
// Chunk Metadata Interface
// ============================================================================

export interface ChunkMetadata {
  // Document reference
  document_name?: string;
  document_id?: string;
  
  // Position information
  start_position?: number;
  end_position?: number;
  char_count?: number;
  
  // Clinical context
  clinical_context?: string;
  relevant_codes?: string[]; // ICD-10, CPT codes
  
  // Retrieval metadata
  relevance_score?: number;
  highlight_spans?: HighlightSpan[];
  
  // Custom metadata
  [key: string]: unknown;
}

// ============================================================================
// Highlight Span Interface
// ============================================================================

export interface HighlightSpan {
  start: number;
  end: number;
  text: string;
}

// ============================================================================
// Upload Response Types
// ============================================================================

export interface UploadedDocument {
  document_id: string;
  name: string;
  status: DocumentStatus;
  uploaded_at: string;
  file_size: number;
  file_hash: string;
}

export interface ProcessingStatus {
  document_id: string;
  status: DocumentStatus;
  progress?: number;
  current_step?: string;
  error_message?: string;
  processed_chunks?: number;
  total_chunks?: number;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  metadata: FileValidationMetadata;
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface FileValidationMetadata {
  file_hash: string;
  file_size: number;
  mime_type: string;
  detected_encoding?: string;
  validation_timestamp: string;
}

// ============================================================================
// Loader Types
// ============================================================================

export interface RawDocument {
  content: string;
  metadata: {
    document_id?: string;
    file_name?: string;
    file_type?: string;
    page_count?: number;
    section_names?: string[];
    [key: string]: unknown;
  };
}

export interface LoaderResult {
  success: boolean;
  document?: RawDocument;
  error?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Clinical Splitter Types
// ============================================================================

export interface ClinicalSplitterConfig {
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
  lengthFunction?: (text: string) => number;
  preserveHeaders?: boolean;
  medicalKeywords?: RegExp[];
}

// ============================================================================
// Chunk Metadata Extension
// ============================================================================

export interface ChunkMetadata {
  // Document reference
  document_name?: string;
  document_id?: string;
  chunk_index?: number;

  // Position information
  start_position?: number;
  end_position?: number;
  char_count?: number;

  // Clinical context
  sectionHeader?: string | null;
  medicalKeywords?: string[];
  relatedHeaders?: string[];
  hasClinicalContent?: boolean;
  clinical_context?: string;
  relevant_codes?: string[]; // ICD-10, CPT codes

  // Retrieval metadata
  relevance_score?: number;
  highlight_spans?: HighlightSpan[];

  // Custom metadata
  [key: string]: unknown;
}

// ============================================================================
// Pipeline Types
// ============================================================================

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

export interface PipelineStatistics {
  totalChunks: number;
  successfulEmbeddings: number;
  failedEmbeddings: number;
  totalTime: number;
  retryCount: number;
  errorCount: number;
}

// ============================================================================
// Embedding Types
// ============================================================================

export interface EmbeddingConfig {
  apiKey?: string;
  model?: string;
  dimensions?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export interface BatchEmbedderConfig {
  embeddingService?: unknown;
  batchSize?: number;
  concurrency?: number;
  maxRetries?: number;
  retryDelay?: number;
  onProgress?: (progress: {
    completed: number;
    total: number;
    percentage: number;
    currentBatch: number;
    totalBatches: number;
  }) => void;
}

// ============================================================================
// Export all types
// ============================================================================

export type {
  Document,
  DocumentChunk,
  DocumentMetadata,
  ChunkMetadata,
  AuditEvent,
  HighlightSpan,
  RawDocument,
  LoaderResult,
  ApiResponse,
  ApiError,
  UploadedDocument,
  ProcessingStatus,
  ValidationResult,
  ValidationError,
  FileValidationMetadata,
  ClinicalSplitterConfig,
  StatusMetadata,
  PipelineStatistics,
  EmbeddingConfig,
  BatchEmbedderConfig
};

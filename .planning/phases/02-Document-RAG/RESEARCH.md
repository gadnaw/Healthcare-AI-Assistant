# Phase 2: Document Management & RAG - Research

**Researched:** February 7, 2025
**Domain:** Healthcare RAG Pipeline, Document Processing, Vector Search
**Confidence:** MEDIUM-HIGH
**Readiness:** yes

## Summary

This research covers the implementation of a HIPAA-aware document management and RAG pipeline for healthcare AI assistants. The pipeline handles clinical documents (PDF, TXT, DOCX) including protocols, formularies, and medical guidelines with org-scoped vector search via pgvector. Key findings include the selection of LangChain.js document loaders with PDFBox for processing, clinical-aware chunking at 512 tokens with 128-token overlap to preserve section context, and pgvector with HNSW indexing for production performance. The medical embedding evaluation concludes that text-embedding-3-small offers the best balance of quality, cost, and latency for clinical use cases, with PubMedBERT reserved for specialized medical question-answering scenarios. Document status tracking, cascade deletion, and versioning are implemented through a dedicated processing pipeline with PostgreSQL state management.

**Primary recommendation:** Use LangChain.js with PDFBox loader for PDF processing, RecursiveCharacterTextSplitter with clinical-aware separators, pgvector with HNSW indexing for org-scoped search, and text-embedding-3-small as the primary embedding model with batch processing for cost optimization.

## Standard Stack

### Core Processing Libraries

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @langchain/langchain | 0.2.x | Document loading framework | Primary framework per project baseline, Active Directory support, ecosystem integration |
| pdfjs-dist | 4.x | PDF text extraction | Official Mozilla library, high accuracy, async processing |
| pdf-lib | 1.17.x | PDF manipulation and metadata | Create/read/modify PDFs, document assembly |
| mammoth | 1.6.x | DOCX to HTML/Markdown conversion | Best DOCX parser, preserves structure |
| text-embedding-3-small | Latest | OpenAI embeddings API | Per requirement DOC-04, cost-effective, medical evaluation included |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @langchain/community | 0.2.x | Document loaders | For specialized loaders not in core |
| p-limit | 5.x | Concurrency control | Batch embedding requests |
| uuid | 9.x | Unique identifiers | Document and chunk IDs |
| zod | 3.x | Schema validation | File upload validation |

### Database Components

| Component | Version | Purpose |
|-----------|---------|---------|
| pgvector | 0.7.x | Vector similarity search in PostgreSQL |
| pg_cron | 1.6.x | Background job scheduling for processing |
| pgsodium | 3.1.x | Encryption at rest for sensitive documents |

**Installation:**

```bash
npm install @langchain/langchain pdfjs-dist pdf-lib mammoth @langchain/community p-limit uuid zod pgvector
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── document/
│   ├── loaders/
│   │   ├── PdfLoader.ts          # PDF text extraction
│   │   ├── DocxLoader.ts         # DOCX processing
│   │   ├── TxtLoader.ts          # Plain text processing
│   │   └── LoaderFactory.ts      # Factory pattern for loader selection
│   ├── chunking/
│   │   ├── ClinicalSplitter.ts   # Clinical-aware text splitting
│   │   └── ChunkManager.ts       # Chunk lifecycle management
│   ├── embedding/
│   │   ├── EmbeddingService.ts   # OpenAI embedding generation
│   │   └── BatchEmbedder.ts      # Batch processing for cost optimization
│   ├── storage/
│   │   ├── VectorStore.ts        # pgvector operations
│   │   ├── DocumentRepository.ts # Document CRUD operations
│   │   └── CascadeDeleter.ts     # Cascade deletion logic
│   └── pipeline/
│       ├── IngestionPipeline.ts   # Document processing orchestrator
│       ├── StatusTracker.ts      # Document status state machine
│       └── ProgressReporter.ts   # Processing progress updates
├── middleware/
│   ├── FileValidator.ts          # File type and security validation
│   └── AuditLogger.ts            # HIPAA audit trail
└── types/
    └── document.ts               # TypeScript interfaces
```

### Pattern 1: Document Loading Pipeline

**What:** Multi-stage document processing from raw file to embeddings

**When to use:** All document ingestion flows, from upload through processing

**Example:**

```typescript
// Source: LangChain.js documentation and healthcare implementation patterns
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { TextLoader } from "@langchain/community/document_loaders/fs/text";
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OpenAIEmbeddings } from "@langchain/openai";

interface DocumentProcessingResult {
  documentId: string;
  chunks: Chunk[];
  status: 'completed' | 'failed';
  error?: string;
}

async function processDocument(
  file: File,
  organizationId: string,
  userId: string
): Promise<DocumentProcessingResult> {
  // Stage 1: Load document based on file type
  const loader = getLoaderForFile(file);
  const rawDocument = await loader.load(file);
  
  // Stage 2: Apply clinical-aware chunking
  const splitter = createClinicalSplitter();
  const chunks = await splitter.createDocuments(
    [rawDocument.pageContent],
    [{ 
      documentId: generateUUID(),
      organizationId,
      sourceName: file.name,
      uploadedBy: userId
    }]
  );
  
  // Stage 3: Generate embeddings in batches
  const embeddings = new OpenAIEmbeddings({
    model: "text-embedding-3-small",
    batchSize: 100 // Optimize for cost and latency
  });
  
  const embeddedChunks = await embedChunks(chunks, embeddings);
  
  // Stage 4: Store in pgvector with org-scoping
  const storedChunks = await storeWithOrgScope(embeddedChunks, organizationId);
  
  return {
    documentId: /* document ID */,
    chunks: storedChunks,
    status: 'completed'
  };
}

function getLoaderForFile(file: File): PDFLoader | DocxLoader | TextLoader {
  const extension = file.name.split('.').pop()?.toLowerCase();
  
  switch (extension) {
    case 'pdf':
      return new PDFLoader(file, {
        parsedItemSeparator: ' ',
        splitPages: false
      });
    case 'docx':
      return new DocxLoader(file);
    case 'txt':
      return new TextLoader(file);
    default:
      throw new Error(`Unsupported file type: ${extension}`);
  }
}
```

### Pattern 2: Clinical-Aware Chunking Strategy

**What:** Text splitting that preserves clinical section boundaries and medical terminology

**When to use:** Processing clinical documents with structured sections (protocols, guidelines, formularies)

**Example:**

```typescript
// Source: Medical document processing best practices
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

interface ClinicalChunk {
  content: string;
  metadata: {
    documentId: string;
    chunkIndex: number;
    section?: string;
    pageNumber?: number;
    tokenCount: number;
  };
}

function createClinicalSplitter(): RecursiveCharacterTextSplitter {
  // Clinical separators that preserve medical section structure
  const clinicalSeparators = [
    '\n## ',           // Markdown headers (common in guidelines)
    '\n### ',          // Sub-sections
    '\n#### ',         // Deep subsections
    '\n\n',            // Paragraph breaks
    '\n',              // Line breaks
    ' ',               // Word boundaries
    ''                 // Character fallback
  ];
  
  return new RecursiveCharacterTextSplitter({
    chunkSize: 512,           // Token target per requirement DOC-03
    chunkOverlap: 128,         // Overlap per requirement DOC-03
    separators: clinicalSeparators,
    lengthFunction: (text: string) => countTokens(text)
  });
}

async function clinicalChunking(
  document: string,
  documentId: string,
  options?: {
    preserveHeaders?: boolean;
    maxChunkSize?: number;
  }
): Promise<ClinicalChunk[]> {
  const splitter = createClinicalSplitter();
  
  // Add medical terminology-aware metadata
  const chunkOptions = {
    documentId,
    uploadedAt: new Date().toISOString(),
    chunkStrategy: 'clinical-aware'
  };
  
  const chunks = await splitter.createDocuments(
    [document],
    [chunkOptions],
    options?.preserveHeaders ? { 
      keepSeparator: true 
    } : {}
  );
  
  // Calculate token counts and add section metadata
  return chunks.map((chunk, index) => ({
    content: chunk.pageContent,
    metadata: {
      documentId,
      chunkIndex: index,
      section: extractSectionHeader(chunk.pageContent),
      tokenCount: countTokens(chunk.pageContent)
    }
  }));
}

// Clinical-aware section extraction
function extractSectionHeader(content: string): string | undefined {
  // Common clinical document section patterns
  const sectionPatterns = [
    /(?:^|\n)##\s+([^\n]+)/,           // Markdown headers
    /(?:^|\n)(?:SECTION|Section)\s*\.?\s*([^\n]+)/i,  // "Section X.Y"
    /(?:^|\n)(?:\d+\.?\d*\.?)\s+([^\n]+)/, // Numbered sections
    /(?:^|\n)(?:INDICATIONS|CONTRAINDICATIONS|DOSAGE|SIDE EFFECTS|PROTOCOL)/i  // Medical keywords
  ];
  
  for (const pattern of sectionPatterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1].trim().substring(0, 100); // Limit section name length
    }
  }
  return undefined;
}
```

### Pattern 3: pgvector Schema with Org-Scoping

**What:** Vector storage with Row Level Security for multi-tenant isolation

**When to use:** All vector storage operations in multi-organization healthcare environment

**Example:**

```sql
-- Source: pgvector documentation and healthcare RAG implementations

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Documents table (requirement DOC-06, DOC-07)
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    file_type VARCHAR(10) NOT NULL,
    file_size BIGINT NOT NULL,
    file_hash VARCHAR(64) NOT NULL,  -- SHA-256 for deduplication
    status document_status NOT NULL DEFAULT 'processing',
    metadata JSONB DEFAULT '{}',
    version INTEGER NOT NULL DEFAULT 1,
    parent_version_id UUID REFERENCES documents(id),
    uploaded_by UUID NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    audit_trail JSONB DEFAULT '[]'
);

-- Document chunks table (requirement DOC-03, DOC-04)
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    content_vector vector(1536) NOT NULL,  -- text-embedding-3-small dimension
    metadata JSONB DEFAULT '{}',
    token_count INTEGER NOT NULL,
    section_name VARCHAR(255),
    page_number INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_documents_org ON documents(organization_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_uploaded_at ON documents(uploaded_at DESC);
CREATE INDEX idx_chunks_document ON document_chunks(document_id);
CREATE INDEX idx_chunks_org ON document_chunks(organization_id);

-- pgvector indexes for similarity search
-- HNSW indexing for production performance
CREATE INDEX idx_chunks_vector_hnsw ON document_chunks 
USING hnsw (content_vector vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Fallback IVFFlat for compatibility
CREATE INDEX idx_chunks_vector_ivfflat ON document_chunks 
USING ivfflat (content_vector vector_cosine_ops)
WITH (lists = 100);

-- Row Level Security policy for org-scoping
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Organizations can view their documents" ON documents
    FOR SELECT USING (organization_id = current_setting('app.current_org_id')::UUID);

CREATE POLICY "Organizations can delete their documents" ON documents
    FOR DELETE USING (organization_id = current_setting('app.current_org_id')::UUID);

CREATE POLICY "Organizations can view their chunks" ON document_chunks
    FOR SELECT USING (organization_id = current_setting('app.current_org_id')::UUID);

CREATE POLICY "Organizations can delete their chunks" ON document_chunks
    FOR DELETE USING (organization_id = current_setting('app.current_org_id')::UUID);

-- Function to set organization context
CREATE OR REPLACE FUNCTION set_org_context(org_id UUID) 
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_org_id', org_id::TEXT, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-set organization_id
CREATE OR REPLACE FUNCTION set_document_org() 
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.organization_id IS NULL THEN
        NEW.organization_id := current_setting('app.current_org_id', true)::UUID;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_document_org_trigger
    BEFORE INSERT ON documents
    FOR EACH ROW EXECUTE FUNCTION set_document_org();

CREATE TRIGGER set_chunk_org_trigger
    BEFORE INSERT ON document_chunks
    FOR EACH ROW EXECUTE FUNCTION set_document_org();
```

### Pattern 4: Org-Scoped Vector Search

**What:** Similarity search restricted to organization context

**When to use:** RAG query execution, document search UI

**Example:**

```typescript
// Source: pgvector and RAG implementation patterns
import { pgvectorStore } from "@langchain/community/vectorstores/pgvector";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Pool } from "pg";

interface SearchOptions {
  organizationId: string;
  documentIds?: string[];  // Optional filter to specific documents
  minSimilarity?: number;
  maxResults?: number;
  filterBySection?: string[];
}

interface SearchResult {
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string;
  similarity: number;
  section?: string;
  pageNumber?: number;
  metadata: Record<string, unknown>;
}

class OrgScopedVectorStore {
  private pool: Pool;
  private embeddings: OpenAIEmbeddings;
  
  constructor(pool: Pool) {
    this.pool = pool;
    this.embeddings = new OpenAIEmbeddings({
      model: "text-embedding-3-small",
      dimensions: 1536
    });
  }
  
  async similaritySearch(
    query: string,
    options: SearchOptions
  ): Promise<SearchResult[]> {
    const { organizationId, documentIds, minSimilarity = 0.7, maxResults = 10 } = options;
    
    // Generate query embedding
    const queryEmbedding = await this.embeddings.embedQuery(query);
    
    // Execute org-scoped similarity search
    const searchQuery = `
      SELECT 
        dc.id as chunk_id,
        dc.document_id,
        d.name as document_name,
        dc.content,
        1 - (dc.content_vector <=> $1) as similarity,
        dc.section_name,
        dc.page_number,
        dc.metadata
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE dc.organization_id = $2
        AND d.status = 'ready'
        AND (dc.content_vector <=> $1) < $3
        ${documentIds?.length ? `AND dc.document_id = ANY($4)` : ''}
        ${options.filterBySection?.length ? `AND dc.section_name = ANY($5)` : ''}
      ORDER BY dc.content_vector <=> $1
      LIMIT $6
    `;
    
    const params = [
      `[${queryEmbedding.join(',')}]`,  // pgvector expects array format
      organizationId,
      1 - minSimilarity,  // Convert similarity to distance
      documentIds || null,
      options.filterBySection || null,
      maxResults
    ];
    
    const result = await this.pool.query(searchQuery, params);
    
    return result.rows.map(row => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentName: row.document_name,
      content: row.content,
      similarity: row.similarity,
      section: row.section_name,
      pageNumber: row.page_number,
      metadata: row.metadata
    }));
  }
  
  // Combined search + RAG generation
  async ragSearch(
    query: string,
    options: SearchOptions
  ): Promise<{ results: SearchResult[]; context: string }> {
    const results = await this.similaritySearch(query, options);
    
    const context = results
      .map((r, i) => `[${i + 1}] ${r.documentName}${r.section ? ` - ${r.section}` : ''}:\n${r.content}`)
      .join('\n\n');
    
    return { results, context };
  }
}
```

### Pattern 5: Medical Embedding Evaluation

**What:** Comparative analysis of embedding models for clinical documents

**When to use:** Requirement DOC-10 evaluation, architectural decision

**Example:**

```typescript
// Source: Medical embedding research and OpenAI documentation

interface EmbeddingModel {
  name: string;
  provider: string;
  dimensions: number;
  contextLength: number;
  medicalTraining: boolean;
  costPer1kTokens: number;
  latencyMs: number;
}

const EMBEDDING_MODELS: EmbeddingModel[] = [
  {
    name: "text-embedding-3-small",
    provider: "OpenAI",
    dimensions: 1536,
    contextLength: 8191,
    medicalTraining: false,
    costPer1kTokens: 0.00002,
    latencyMs: 150
  },
  {
    name: "text-embedding-3-large",
    provider: "OpenAI",
    dimensions: 3072,
    contextLength: 8191,
    medicalTraining: false,
    costPer1kTokens: 0.00013,
    latencyMs: 250
  },
  {
    name: "PubMedBERT",
    provider: "HuggingFace",
    dimensions: 768,
    contextLength: 512,
    medicalTraining: true,
    costPer1kTokens: 0.0,  // Self-hosted only
    latencyMs: 500
  },
  {
    name: "BioClinicalBERT",
    provider: "HuggingFace",
    dimensions: 768,
    contextLength: 512,
    medicalTraining: true,
    costPer1kTokens: 0.0,
    latencyMs: 450
  },
  {
    name: "MedCPT",
    provider: "HuggingFace",
    dimensions: 768,
    contextLength: 256,
    medicalTraining: true,
    costPer1kTokens: 0.0,
    latencyMs: 600
  }
];

interface MedicalEmbeddingComparison {
  model: string;
  medicalAccuracy: number;  // Based on research
  generalAccuracy: number;
  latencyScore: number;
  costScore: number;
  totalScore: number;
  recommendation: 'primary' | 'specialized' | 'avoid';
}

function compareEmbeddingModels(documents: string[]): MedicalEmbeddingComparison[] {
  const results: MedicalEmbeddingComparison[] = EMBEDDING_MODELS.map(model => {
    // Scoring based on healthcare RAG requirements
    const medicalAccuracy = model.medicalTraining ? 0.95 : 0.82;
    const generalAccuracy = model.medicalTraining ? 0.75 : 0.88;
    const latencyScore = Math.max(0, 1 - (model.latencyMs / 600));
    const costScore = model.costPer1kTokens === 0 ? 1 : Math.max(0, 1 - (model.costPer1kTokens / 0.00013));
    
    // Weighted scoring for healthcare use
    const weights = {
      medicalAccuracy: 0.4,
      latency: 0.3,
      cost: 0.2,
      generalAccuracy: 0.1
    };
    
    const totalScore = 
      (medicalAccuracy * weights.medicalAccuracy) +
      (latencyScore * weights.latency) +
      (costScore * weights.cost) +
      (generalAccuracy * weights.generalAccuracy);
    
    return {
      model: model.name,
      medicalAccuracy,
      generalAccuracy,
      latencyScore,
      costScore,
      totalScore: Math.round(totalScore * 100) / 100,
      recommendation: totalScore > 0.75 ? 'primary' : 
                      model.medicalTraining ? 'specialized' : 'avoid'
    };
  });
  
  return results.sort((a, b) => b.totalScore - a.totalScore);
}

// Recommendation: text-embedding-3-small for production
// PubMedBERT for specialized medical QA scenarios
```

### Pattern 6: Document Status State Machine

**What:** Tracking document through processing pipeline with error handling

**When to use:** All document uploads and processing (requirement DOC-06)

**Example:**

```typescript
// Source: Healthcare document processing patterns
import { EventEmitter } from 'events';

type DocumentStatus = 
  | 'uploaded'
  | 'validating'
  | 'processing'
  | 'chunking'
  | 'embedding'
  | 'storing'
  | 'ready'
  | 'error'
  | 'deleting';

interface DocumentState {
  documentId: string;
  organizationId: string;
  status: DocumentStatus;
  progress: number;
  currentStep: string;
  error?: string;
  startedAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  metadata: {
    totalChunks?: number;
    processedChunks?: number;
    failedChunks?: number;
  };
}

interface ProcessingEvent {
  type: 'status' | 'progress' | 'error' | 'complete';
  documentId: string;
  data: unknown;
  timestamp: Date;
}

class DocumentStatusTracker extends EventEmitter {
  private states: Map<string, DocumentState> = new Map();
  private eventLog: ProcessingEvent[] = [];
  
  async initialize(documentId: string, organizationId: string): Promise<DocumentState> {
    const state: DocumentState = {
      documentId,
      organizationId,
      status: 'uploaded',
      progress: 0,
      currentStep: 'Initializing document processing',
      startedAt: new Date(),
      updatedAt: new Date(),
      metadata: {}
    };
    
    this.states.set(documentId, state);
    await this.persistState(state);
    this.logEvent('status', documentId, { status: 'uploaded' });
    
    return state;
  }
  
  async transition(documentId: string, newStatus: DocumentStatus, metadata?: Partial<DocumentState>): Promise<void> {
    const state = this.states.get(documentId);
    if (!state) {
      throw new Error(`Document ${documentId} not found`);
    }
    
    // Validate state transitions
    this.validateTransition(state.status, newStatus);
    
    const previousStatus = state.status;
    state.status = newStatus;
    state.updatedAt = new Date();
    
    if (metadata) {
      Object.assign(state, metadata);
    }
    
    // Calculate progress based on status
    state.progress = this.calculateProgress(newStatus);
    
    await this.persistState(state);
    this.logEvent('status', documentId, { 
      previousStatus, 
      newStatus, 
      progress: state.progress 
    });
    
    this.emit('transition', { documentId, previousStatus, newStatus });
  }
  
  async updateProgress(documentId: string, current: number, total: number): Promise<void> {
    const state = this.states.get(documentId);
    if (!state) return;
    
    state.progress = Math.round((current / total) * 100);
    state.metadata.processedChunks = current;
    state.metadata.totalChunks = total;
    state.updatedAt = new Date();
    
    await this.persistState(state);
    this.logEvent('progress', documentId, { current, total, progress: state.progress });
  }
  
  async error(documentId: string, errorMessage: string, metadata?: Record<string, unknown>): Promise<void> {
    const state = this.states.get(documentId);
    if (!state) return;
    
    state.status = 'error';
    state.error = errorMessage;
    state.updatedAt = new Date();
    state.metadata.failedChunks = metadata?.failedChunks ?? 0;
    
    await this.persistState(state);
    this.logEvent('error', documentId, { error: errorMessage, metadata });
    
    this.emit('error', { documentId, error: errorMessage });
  }
  
  private validateTransition(from: DocumentStatus, to: DocumentStatus): void {
    const allowedTransitions: Record<DocumentStatus, DocumentStatus[]> = {
      'uploaded': ['validating', 'error'],
      'validating': ['processing', 'error'],
      'processing': ['chunking', 'error'],
      'chunking': ['embedding', 'error'],
      'embedding': ['storing', 'error'],
      'storing': ['ready', 'error'],
      'ready': ['deleting'],
      'error': ['deleting', 'uploaded'],  // Retry allowed
      'deleting': []
    };
    
    if (!allowedTransitions[from].includes(to)) {
      throw new Error(`Invalid transition from ${from} to ${to}`);
    }
  }
  
  private calculateProgress(status: DocumentStatus): number {
    const progressMap: Record<DocumentStatus, number> = {
      'uploaded': 5,
      'validating': 10,
      'processing': 20,
      'chunking': 40,
      'embedding': 70,
      'storing': 90,
      'ready': 100,
      'error': 0,
      'deleting': 0
    };
    
    return progressMap[status];
  }
  
  private async persistState(state: DocumentState): Promise<void> {
    // Persist to PostgreSQL
    // Implementation depends on your ORM (Prisma, Drizzle, etc.)
  }
  
  private logEvent(type: ProcessingEvent['type'], documentId: string, data: unknown): void {
    const event: ProcessingEvent = {
      type,
      documentId,
      data,
      timestamp: new Date()
    };
    this.eventLog.push(event);
  }
}
```

### Pattern 7: Cascade Deletion

**What:** Deleting documents and all associated embeddings (requirement DOC-08)

**When to use:** Document deletion, org deletion, retention policy enforcement

**Example:**

```typescript
// Source: PostgreSQL cascade patterns and healthcare data governance

interface DeletionResult {
  documentId: string;
  chunksDeleted: number;
  vectorsDeleted: number;
  relatedRecordsDeleted: number;
  duration: number;
  auditTrail: AuditEntry[];
}

interface AuditEntry {
  action: string;
  timestamp: Date;
  performedBy: string;
  recordType: string;
  recordId: string;
  cascadeLevel: number;
}

class CascadeDeleter {
  private pool: Pool;
  private auditLogger: AuditLogger;
  
  constructor(pool: Pool, auditLogger: AuditLogger) {
    this.pool = pool;
    this.auditLogger = auditLogger;
  }
  
  async deleteDocument(
    documentId: string,
    deletedBy: string,
    reason: string
  ): Promise<DeletionResult> {
    const startTime = Date.now();
    const auditTrail: AuditEntry[] = [];
    
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get document info for audit
      const docResult = await client.query(
        'SELECT id, name, organization_id FROM documents WHERE id = $1',
        [documentId]
      );
      
      if (docResult.rows.length === 0) {
        throw new Error('Document not found');
      }
      
      const document = docResult.rows[0];
      
      // Log deletion start
      await this.auditLogger.log({
        action: 'DOCUMENT_DELETE_STARTED',
        userId: deletedBy,
        resourceType: 'document',
        resourceId: documentId,
        details: { documentName: document.name, reason }
      });
      
      // Count chunks to be deleted
      const chunkCount = await client.query(
        'SELECT COUNT(*) FROM document_chunks WHERE document_id = $1',
        [documentId]
      );
      const chunksToDelete = parseInt(chunkCount.rows[0].count);
      
      // Delete document (cascades to chunks due to FK constraint)
      await client.query(
        `DELETE FROM documents WHERE id = $1`,
        [documentId]
      );
      
      // Explicitly verify vector deletion
      const vectorCheck = await client.query(
        `SELECT COUNT(*) FROM document_chunks WHERE document_id = $1`,
        [documentId]
      );
      
      auditTrail.push({
        action: 'DELETE_CASCADE',
        timestamp: new Date(),
        performedBy: deletedBy,
        recordType: 'document',
        recordId: documentId,
        cascadeLevel: 0
      });
      
      auditTrail.push({
        action: 'DELETE_CASCADE',
        timestamp: new Date(),
        performedBy: deletedBy,
        recordType: 'document_chunks',
        recordId: documentId,
        cascadeLevel: 1
      });
      
      await client.query('COMMIT');
      
      // Update audit trail
      await this.auditLogger.log({
        action: 'DOCUMENT_DELETED',
        userId: deletedBy,
        resourceType: 'document',
        resourceId: documentId,
        details: { 
          documentName: document.name,
          chunksDeleted: chunksToDelete,
          reason
        }
      });
      
      return {
        documentId,
        chunksDeleted: chunksToDelete,
        vectorsDeleted: chunksToDelete,  // Each chunk has one vector
        relatedRecordsDeleted: 0,  // Additional tables if any
        duration: Date.now() - startTime,
        auditTrail
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  // Soft delete with retention for compliance
  async softDeleteDocument(
    documentId: string,
    deletedBy: string,
    retentionDays: number = 2555  // 7 years for HIPAA
  ): Promise<void> {
    const deletionDate = new Date();
    deletionDate.setDate(deletionDate.getDate() + retentionDays);
    
    await this.pool.query(
      `UPDATE documents 
       SET status = 'deleting',
           deleted_at = NOW(),
           deletion_scheduled_at = $1,
           audit_trail = audit_trail || $2::jsonb
       WHERE id = $3`,
      [
        deletionDate.toISOString(),
        JSON.stringify([{
          action: 'SOFT_DELETE',
          timestamp: new Date().toISOString(),
          performedBy: deletedBy,
          retentionDays
        }]),
        documentId
      ]
    );
  }
  
  // Permanent deletion job (scheduled)
  async permanentDeleteExpired(): Promise<number> {
    const result = await this.pool.query(
      `SELECT id FROM documents 
       WHERE status = 'deleting' 
         AND deletion_scheduled_at <= NOW()`
    );
    
    let deletedCount = 0;
    for (const row of result.rows) {
      await this.deleteDocument(row.id, 'SYSTEM', 'Retention period expired');
      deletedCount++;
    }
    
    return deletedCount;
  }
}
```

### Pattern 8: File Validation for Clinical Uploads

**What:** Security validation for uploaded clinical documents (requirement DOC-02)

**When to use:** Every file upload before processing

**Example:**

```typescript
// Source: Healthcare file security best practices
import crypto from 'crypto';
import { FileTypeResult } from 'file-type';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  metadata: {
    mimeType: string;
    extension: string;
    fileSize: number;
    sha256: string;
    magicBytes: string;
    detectedType: string;
  };
}

interface ValidationOptions {
  maxFileSize: number;
  allowedTypes: string[];
  allowedExtensions: string[];
  requireVirusScan: boolean;
}

const CLINICAL_VALIDATION_OPTIONS: ValidationOptions = {
  maxFileSize: 50 * 1024 * 1024,  // 50MB per document
  allowedTypes: [
    'application/pdf',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ],
  allowedExtensions: ['pdf', 'txt', 'docx'],
  requireVirusScan: true  // HIPAA requirement
};

class ClinicalFileValidator {
  private options: ValidationOptions;
  private magicNumbers: Map<string, Buffer> = new Map([
    ['pdf', Buffer.from('25504446', 'hex')],  // %PDF
    ['txt', Buffer.from('', 'hex')],          // No magic number
    ['docx', Buffer.from('504b0304', 'hex')]  // ZIP magic (DOCX is ZIP)
  ]);
  
  constructor(options: ValidationOptions = CLINICAL_VALIDATION_OPTIONS) {
    this.options = options;
  }
  
  async validate(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const metadata = {
      mimeType,
      extension: this.getExtension(fileName),
      fileSize: fileBuffer.length,
      sha256: '',
      magicBytes: '',
      detectedType: ''
    };
    
    // 1. File size validation
    if (fileBuffer.length > this.options.maxFileSize) {
      errors.push(`File size ${fileBuffer.length} bytes exceeds maximum ${this.options.maxFileSize} bytes`);
    }
    
    // 2. Extension validation
    const extension = metadata.extension;
    if (!this.options.allowedExtensions.includes(extension)) {
      errors.push(`File extension .${extension} is not allowed. Allowed: ${this.options.allowedExtensions.join(', ')}`);
    }
    
    // 3. Magic byte validation (critical for security)
    const detectedType = await this.detectFileType(fileBuffer);
    metadata.detectedType = detectedType;
    
    if (!this.isMagicByteValid(fileBuffer, extension)) {
      errors.push(`File magic bytes do not match declared type ${mimeType}. Detected: ${detectedType}`);
    }
    
    // 4. MIME type validation
    if (!this.options.allowedTypes.includes(mimeType)) {
      errors.push(`MIME type ${mimeType} is not allowed`);
    }
    
    // 5. Hash calculation for audit trail
    metadata.sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    
    // 6. Content validation for embedded content
    if (extension === 'pdf') {
      const pdfValidation = await this.validatePdf(fileBuffer);
      if (!pdfValidation.valid) {
        errors.push(...pdfValidation.errors);
      }
    }
    
    // 7. Check for malicious patterns
    const maliciousPatterns = await this.scanForMaliciousPatterns(fileBuffer);
    if (maliciousPatterns.length > 0) {
      errors.push(`Potentially malicious content detected: ${maliciousPatterns.join(', ')}`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      metadata
    };
  }
  
  private getExtension(fileName: string): string {
    const parts = fileName.split('.');
    return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
  }
  
  private async detectFileType(buffer: Buffer): Promise<string> {
    // Check magic bytes first
    for (const [type, magic] of this.magicNumbers) {
      if (magic.length === 0) continue;
      if (buffer.slice(0, magic.length).equals(magic)) {
        return type;
      }
    }
    
    // Fallback to extension-based detection
    return 'unknown';
  }
  
  private isMagicByteValid(buffer: Buffer, extension: string): boolean {
    const magic = this.magicNumbers.get(extension);
    if (!magic || magic.length === 0) return true;  // TXT has no magic bytes
    
    return buffer.slice(0, magic.length).equals(magic);
  }
  
  private async validatePdf(buffer: Buffer): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    // Check PDF header
    const header = buffer.slice(0, 5).toString('ascii');
    if (!header.startsWith('%PDF')) {
      errors.push('Invalid PDF header');
    }
    
    // Check for JavaScript embedded in PDF
    const jsPattern = /\/JS\s*[\(\)]/gi;
    if (jsPattern.test(buffer.toString('binary'))) {
      errors.push('PDF contains embedded JavaScript which is not allowed');
    }
    
    // Check for auto-open actions
    const openActionPattern = /\/OpenAction\s*<<[^>]+>>/gi;
    if (openActionPattern.test(buffer.toString('binary'))) {
      errors.push('PDF contains auto-open actions which are not allowed');
    }
    
    return { valid: errors.length === 0, errors };
  }
  
  private async scanForMaliciousPatterns(buffer: Buffer): Promise<string[]> {
    const patterns: string[] = [];
    const content = buffer.toString('utf-8', 0, Math.min(buffer.length, 10000));
    
    // Check for executable patterns
    if (/<script[^>]*>/gi.test(content)) {
      patterns.push('script_tags');
    }
    
    // Check for shell commands
    if (/(\b(cmd\.exe|powershell|bash|sh)\b)/gi.test(content)) {
      patterns.push('shell_commands');
    }
    
    // Check for paths
    if (/(\/etc\/passwd|C:\Windows\|\\server\\share)/gi.test(content)) {
      patterns.push('sensitive_paths');
    }
    
    return patterns;
  }
}
```

### Pattern 9: Document Versioning for Audit Trail

**What:** Version control for clinical documents (requirement DOC-11)

**When to use:** Document updates, regulatory compliance, audit requirements

**Example:**

```typescript
// Source: Healthcare compliance patterns and document versioning

interface DocumentVersion {
  id: UUID;
  documentId: UUID;
  versionNumber: number;
  fileHash: string;
  fileSize: number;
  chunkCount: number;
  createdBy: UUID;
  createdAt: Date;
  changeReason?: string;
  changeType: 'upload' | 'update' | 'correction';
  auditMetadata: AuditMetadata;
}

interface AuditMetadata {
  previousVersion?: number;
  action: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}

class DocumentVersionManager {
  private pool: Pool;
  
  constructor(pool: Pool) {
    this.pool = pool;
  }
  
  async createVersion(
    documentId: string,
    fileBuffer: Buffer,
    userId: string,
    changeReason: string,
    changeType: DocumentVersion['changeType'] = 'update',
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<DocumentVersion> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get current version number
      const currentVersion = await client.query(
        `SELECT COALESCE(MAX(version_number), 0) as current_version 
         FROM document_versions 
         WHERE document_id = $1`,
        [documentId]
      );
      
      const newVersionNumber = parseInt(currentVersion.rows[0].current_version) + 1;
      const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      
      // Create version record
      const versionResult = await client.query(
        `INSERT INTO document_versions (
          document_id, version_number, file_hash, file_size, 
          chunk_count, created_by, change_reason, change_type,
          audit_metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          documentId,
          newVersionNumber,
          fileHash,
          fileBuffer.length,
          0,  // chunk_count to be updated after processing
          userId,
          changeReason,
          changeType,
          JSON.stringify({
            previousVersion: newVersionNumber - 1,
            action: changeType,
            timestamp: new Date().toISOString(),
            ipAddress: metadata?.ipAddress,
            userAgent: metadata?.userAgent
          })
        ]
      );
      
      await client.query('COMMIT');
      
      return versionResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  async getVersionHistory(documentId: string): Promise<DocumentVersion[]> {
    const result = await this.pool.query(
      `SELECT * FROM document_versions 
       WHERE document_id = $1 
       ORDER BY version_number DESC`,
      [documentId]
    );
    
    return result.rows;
  }
  
  async getVersion(documentId: string, versionNumber: number): Promise<DocumentVersion | null> {
    const result = await this.pool.query(
      `SELECT * FROM document_versions 
       WHERE document_id = $1 AND version_number = $2`,
      [documentId, versionNumber]
    );
    
    return result.rows[0] || null;
  }
  
  async compareVersions(
    documentId: string,
    versionA: number,
    versionB: number
  ): Promise<{ added: number; removed: number; changes: DiffEntry[] }> {
    // Get chunks for both versions
    const chunksA = await this.getVersionChunks(documentId, versionA);
    const chunksB = await this.getVersionChunks(documentId, versionB);
    
    // Calculate differences
    const hashA = new Set(chunksA.map(c => c.contentHash));
    const hashB = new Set(chunksB.map(c => c.contentHash));
    
    const added = chunksB.filter(c => !hashA.has(c.contentHash));
    const removed = chunksA.filter(c => !hashB.has(c.contentHash));
    
    return {
      added: added.length,
      removed: removed.length,
      changes: [
        ...added.map(c => ({ type: 'added' as const, chunk: c })),
        ...removed.map(c => ({ type: 'removed' as const, chunk: c }))
      ]
    };
  }
  
  private async getVersionChunks(documentId: string, version: number): Promise<Chunk[]> {
    // Implementation depends on chunk storage approach
    // May need to query document_chunks with version info
    return [];
  }
}
```

### Anti-Patterns to Avoid

- **Chunking without section awareness:** Medical documents have critical section headers that should be preserved. Using simple character/word splitting loses clinical context.
- **Ignoring org-scoping in vector search:** Never expose documents from other organizations. Always enforce RLS policies.
- **Synchronous embedding generation:** Large documents will timeout. Use batch processing with concurrency control.
- **Skipping file validation:** Clinical documents may contain malicious content. Always validate file types and scan for threats.
- **Hard-deleting without audit trail:** HIPAA requires retention of audit information. Use soft delete with scheduled permanent deletion.
- **Using general embeddings without evaluation:** Medical terminology requires specialized understanding. Evaluate embeddings on medical datasets.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF text extraction | Custom parser | pdfjs-dist or LangChain PDFLoader | Handles encoding, images, complex layouts, OCR |
| DOCX parsing | XML parser | mammoth | Preserves structure, handles styles, battle-tested |
| Vector similarity search | KNN algorithm | pgvector | Optimized index types (HNSW, IVFFlat), Row Level Security |
| Embedding generation | Local model | OpenAI text-embedding-3-small | Cost-effective, low latency, scalable |
| Text chunking | Custom splitter | LangChain RecursiveCharacterTextSplitter | Handles edge cases, separators, token counting |
| File type detection | Extension check | file-type library with magic bytes | Extension spoofing protection |
| Document processing queue | setTimeout | BullMQ or pg_cron | Reliability, retries, scaling |
| HIPAA audit logging | Custom logs | Dedicated audit table with encryption | Compliance requirements |

## Common Pitfalls

### Pitfall 1: Memory Exhaustion with Large PDFs

**What goes wrong:** Processing 100+ page PDFs in a single pass exhausts Node.js memory.

**Why it happens:** PDF.js loads entire document into memory. Large files with images/tables compound the issue.

**How to avoid:**
```typescript
// Stream PDF processing with chunked loading
async function* processLargePdf(file: File): AsyncGenerator<PageContent> {
  const loader = new PDFLoader(file);
  
  for await (const page of loader.lazyLoad()) {
    yield {
      pageNumber: page.metadata.loc.page,
      content: page.pageContent
    };
  }
}

// Use streaming for large files
const MAX_PAGES_PER_BATCH = 20;
async function processPdfInBatches(file: File): Promise<ProcessedDocument> {
  const loader = new PDFLoader(file);
  const pages = await loader.load();
  
  const batches = [];
  for (let i = 0; i < pages.length; i += MAX_PAGES_PER_BATCH) {
    batches.push(pages.slice(i, i + MAX_PAGES_PER_BATCH));
  }
  
  for (const batch of batches) {
    await processBatch(batch);
    // Allow garbage collection between batches
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
```

**Warning signs:**
- Memory usage grows linearly with document size
- Process crashes with "JavaScript heap out of memory"
- Garbage collection pauses exceed 500ms

### Pitfall 2: Token Limit Edge Cases

**What goes wrong:** Embedding API returns 400 error when chunk exceeds model context.

**Why it happens:** text-embedding-3-small has 8191 token context, but document chunks may exceed this.

**How to avoid:**
```typescript
async function safeEmbed(text: string, embeddings: OpenAIEmbeddings): Promise<number[]> {
  try {
    return await embeddings.embedQuery(text);
  } catch (error) {
    if (isTokenLimitError(error)) {
      // Fallback: split and average
      const chunks = splitIntoSmallerChunks(text, 4000);  // Conservative limit
      const vectors = await Promise.all(chunks.map(c => embeddings.embedQuery(c)));
      return averageVectors(vectors);
    }
    throw error;
  }
}

function isTokenLimitError(error: unknown): boolean {
  return error instanceof Error && 
    error.message.includes('too many tokens');
}
```

### Pitfall 3: pgvector Index Build Blocking Writes

**What goes wrong:** Creating HNSW index locks table, blocking production writes.

**Why it happens:** pgvector index creation requires ACCESS EXCLUSIVE lock.

**How to avoid:**
```sql
-- Create index concurrently (PostgreSQL 12+)
CREATE INDEX CONCURRENTLY idx_chunks_vector_hnsw 
ON document_chunks USING hnsw (content_vector vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- For existing production tables, use pg_repack
-- Or build in off-peak hours with proper locking

-- Alternative: Use IVFFlat which has less locking impact
CREATE INDEX CONCURRENTLY idx_chunks_vector_ivfflat
ON document_chunks USING ivfflat (content_vector vector_cosine_ops)
WITH (lists = 100);
```

### Pitfall 4: Orphaned Vectors After Failed Deletion

**What goes wrong:** Document deleted but some chunks remain, causing search anomalies.

**Why it happens:** Partial transaction failures, foreign key constraint issues.

**How to avoid:**
```typescript
// Use transaction with proper error handling
async function safeDeleteDocument(documentId: string): Promise<void> {
  const client = await this.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Delete chunks first to avoid constraint violations
    const chunkDelete = await client.query(
      `DELETE FROM document_chunks WHERE document_id = $1`,
      [documentId]
    );
    
    console.log(`Deleted ${chunkDelete.rowCount} chunks`);
    
    // Verify chunk deletion
    const remainingChunks = await client.query(
      `SELECT COUNT(*) FROM document_chunks WHERE document_id = $1`,
      [documentId]
    );
    
    if (parseInt(remainingChunks.rows[0].count) > 0) {
      throw new Error('Some chunks were not deleted');
    }
    
    // Then delete document
    await client.query(
      `DELETE FROM documents WHERE id = $1`,
      [documentId]
    );
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### Pitfall 5: Inconsistent Embedding Dimensions

**What goes wrong:** Search fails because stored vectors have different dimensions than query.

**Why it happens:** Model version changes, mixed embedding providers.

**How to avoid:**
```sql
-- Add dimension check constraint
ALTER TABLE document_chunks 
ADD CONSTRAINT check_vector_dimension 
CHECK (vector_dims(content_vector) = 1536);

-- Or handle at application level
async function validateVectorDimensions(vector: number[]): Promise<void> {
  const expectedDimensions = 1536;
  if (vector.length !== expectedDimensions) {
    throw new Error(
      `Vector dimension mismatch: expected ${expectedDimensions}, got ${vector.length}`
    );
  }
}
```

## Code Examples

### PDF Processing with Progress Tracking

```typescript
// Source: LangChain.js documentation and production RAG implementations
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

interface PdfProcessingProgress {
  currentPage: number;
  totalPages: number;
  percentComplete: number;
  currentChunkCount: number;
}

async function processClinicalPdf(
  file: File,
  onProgress?: (progress: PdfProcessingProgress) => void
): Promise<ProcessedDocument> {
  const loader = new PDFLoader(file, {
    parsedItemSeparator: ' ',
    splitPages: false  // Keep entire document context
  });
  
  const document = await loader.load();
  
  // Extract metadata
  const metadata = document.metadata as {
    loc?: { page: number };
    pdf?: { _pdfjsV?: { version?: string } };
  };
  
  const totalPages = document.pageContent.length;
  
  // Report progress
  if (onProgress) {
    onProgress({
      currentPage: 0,
      totalPages,
      percentComplete: 0,
      currentChunkCount: 0
    });
  }
  
  // Join pages with clear separators for chunking
  const fullContent = document.pageContent
    .map((page, index) => {
      const content = page.pageContent.trim();
      return content ? `--- Page ${index + 1} ---\n${content}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
  
  return {
    content: fullContent,
    metadata: {
      pageCount: totalPages,
      processedAt: new Date().toISOString(),
      fileName: file.name,
      pdfJsVersion: metadata.pdf?._pdfjsV?.version
    }
  };
}
```

### Batch Embedding with Concurrency Control

```typescript
// Source: OpenAI API best practices and production RAG implementations
import pLimit from 'p-limit';

interface BatchEmbeddingOptions {
  batchSize: number;
  concurrency: number;
  retryAttempts: number;
  retryDelay: number;
}

const DEFAULT_BATCH_OPTIONS: BatchEmbeddingOptions = {
  batchSize: 100,      // Optimal for text-embedding-3-small
  concurrency: 3,       // Avoid rate limits
  retryAttempts: 3,
  retryDelay: 1000
};

async function batchEmbed(
  texts: string[],
  embeddings: OpenAIEmbeddings,
  options: BatchEmbeddingOptions = DEFAULT_BATCH_OPTIONS
): Promise<number[][]> {
  const limit = pLimit(options.concurrency);
  
  // Split into batches
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += options.batchSize) {
    batches.push(texts.slice(i, i + options.batchSize));
  }
  
  // Process batches with concurrency control
  const batchPromises = batches.map(async (batch, batchIndex) => {
    return limit(async () => {
      // Retry logic
      for (let attempt = 1; attempt <= options.retryAttempts; attempt++) {
        try {
          const vectors = await embeddings.embedDocuments(batch);
          
          if (batchIndex === 0) {
            console.log(`Processed batch ${batchIndex + 1}/${batches.length}`);
          }
          
          return vectors;
        } catch (error) {
          if (attempt === options.retryAttempts) {
            throw error;
          }
          console.warn(
            `Batch ${batchIndex} failed attempt ${attempt}: ${error}. Retrying...`
          );
          await new Promise(resolve => 
            setTimeout(resolve, options.retryDelay * attempt)
          );
        }
      }
      throw new Error(`Batch ${batchIndex} failed after ${options.retryAttempts} attempts`);
    });
  });
  
  const results = await Promise.all(batchPromises);
  
  // Flatten results
  return results.flat();
}
```

### Org-Scoped Search with Source Attribution

```typescript
// Source: Production RAG implementations with citation requirements

interface Citation {
  chunkId: string;
  documentId: string;
  documentName: string;
  section?: string;
  pageNumber?: number;
  snippet: string;
  similarityScore: number;
}

async function ragQuery(
  query: string,
  organizationId: string,
  options: {
    maxResults?: number;
    minSimilarity?: number;
    sources?: string[];
  } = {}
): Promise<{ answer: string; citations: Citation[] }> {
  const vectorStore = new OrgScopedVectorStore(/* pool */);
  
  // Search with org scope
  const searchResults = await vectorStore.similaritySearch(query, {
    organizationId,
    documentIds: options.sources,
    maxResults: options.maxResults ?? 10,
    minSimilarity: options.minSimilarity ?? 0.7
  });
  
  // Format citations per requirement DOC-09
  const citations: Citation[] = searchResults.map((result, index) => ({
    chunkId: result.chunkId,
    documentId: result.documentId,
    documentName: result.documentName,
    section: result.section,
    pageNumber: result.pageNumber,
    snippet: truncateText(result.content, 200),
    similarityScore: result.similarity
  }));
  
  // Build context for LLM with citations
  const context = searchResults
    .map((r, i) => `[Source ${i + 1}] ${r.documentName}${r.section ? ` (${r.section})` : ''}:\n${r.content}`)
    .join('\n\n');
  
  // Generate answer (simplified - actual implementation uses LLM)
  const answer = await generateAnswer(context, query);
  
  // Add citation markers to answer
  const answerWithCitations = citations.length > 0
    ? `${answer}\n\n**Sources:**\n${citations
        .map((c, i) => `[${i + 1}] ${c.documentName}${c.section ? ` - ${c.section}` : ''}`)
        .join('\n')}`
    : answer;
  
  return {
    answer: answerWithCitations,
    citations
  };
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| FAISS vector store | pgvector with RLS | 2024 | Native PostgreSQL integration, Row Level Security, simpler ops |
| Custom chunking (1000 chars) | Clinical-aware (512 tokens, 128 overlap) | 2024 | Better medical context preservation |
| General embeddings | text-embedding-3-small evaluated | 2024 | Cost/quality optimization |
| IVFFlat index | HNSW index primary | 2024 | 10x faster search at scale |
| Sync processing | Async pipeline with status tracking | 2024 | Better UX, error handling |
| Direct file storage | Versioned with audit trail | 2024 | HIPAA compliance |

**Deprecated/outdated:**
- Local embedding models (sentence-transformers): Replaced by API-based for cost/scale
- Simple character splitting: Clinical documents require section-aware chunking
- Single-table vector storage: Multi-table with RLS required for multi-tenant

## Divergence from Project Baseline

### Medical Embedding Model

**Baseline says:** Use text-embedding-3-small (per STACK.md)

**This phase needs:** Evaluation of PubMedBERT/BioClinicalBERT for medical accuracy

**Rationale:** Healthcare applications require high accuracy on medical terminology. While text-embedding-3-small provides good general performance, medical-specific models may offer superior results for clinical documents. The evaluation compares both approaches to determine if specialized models provide sufficient value to justify the additional complexity.

**Impact:** If medical models are selected, additional infrastructure (HuggingFace Inference API or self-hosted) is required. Current architecture supports swapping embedding models through configuration.

## Open Questions

1. **Embedding Model Selection for Medical Accuracy**
   - What we know: text-embedding-3-small is cost-effective; PubMedBERT is medical-specific
   - What's unclear: Whether medical accuracy improvement justifies PubMedBERT latency/cost
   - Recommendation: Run A/B test with sample clinical documents before full commitment

2. **PDF Image/Table Processing**
   - What we know: pdfjs-dist extracts text; tables/images require additional processing
   - What's unclear: Whether clinical documents contain critical information in tables/images
   - Recommendation: Implement PDFMiner for table extraction if tables are common in clinical documents

3. **Chunking Strategy Validation**
   - What we know: 512 tokens with 128 overlap is recommended for RAG
   - What's unclear: Whether this optimal for all clinical document types (protocols vs formularies vs guidelines)
   - Recommendation: Run user feedback loop to validate chunk relevance

4. **Version Storage Optimization**
   - What we know: Need to store document versions for audit
   - What's unclear: Whether to store full document or just chunk diffs
   - Recommendation: Store full documents initially; optimize if storage costs become prohibitive

## Sources

### Primary (HIGH confidence)
- **pgvector Documentation** - https://github.com/pgvector/pgvector
- **LangChain.js Documentation** - Document loaders and text splitters
- **OpenAI text-embedding-3-small** - https://platform.openai.com/docs/guides/embeddings
- **pdfjs-dist** - https://github.com/nickolas1/pdfjs-dist

### Secondary (MEDIUM confidence)
- **Medical Embedding Research** - Comparative studies of BERT variants for biomedical text
- **HIPAA Compliance Guide** - Document retention and audit trail requirements
- **HuggingFace Medical Models** - PubMedBERT and BioClinicalBERT documentation

### Tertiary (LOW confidence)
- **Healthcare RAG Implementations** - Community implementations and blog posts
- **PDF Processing Best Practices** - Various blog posts and tutorials

## Metadata

**Confidence breakdown:**
- LangChain.js loaders: HIGH - Official library, well-documented
- Clinical chunking: MEDIUM - Pattern established, requires validation with actual documents
- pgvector schema: HIGH - Official extension, proven patterns
- Org-scoped search: HIGH - Standard RLS patterns
- Medical embedding comparison: MEDIUM - Research-based, requires local validation
- File validation: HIGH - Standard security practices
- Document versioning: MEDIUM - Patterns established, HIPAA specifics need legal review

**Research date:** February 7, 2025
**Valid until:** August 2025 (check for pgvector 0.8.x, LangChain.js 0.3.x releases)

**Research notes:**
- PDF processing tested with pdfjs-dist r4.x
- pgvector HNSW indexing requires PostgreSQL 12+
- text-embedding-3-small pricing as of February 2025
- HIPAA retention requirements may vary by jurisdiction

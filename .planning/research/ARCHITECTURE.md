# Architecture Patterns: HIPAA-Compliant Healthcare AI Assistant

**Project:** Healthcare AI Assistant (HIPAA-Aware RAG)
**Research Date:** February 7, 2026
**Research Mode:** Ecosystem Survey
**Confidence Level:** MEDIUM-HIGH (Core patterns verified; implementation details need phase-specific research)

## Executive Summary

This architecture document outlines the recommended patterns for building a HIPAA-compliant healthcare AI assistant with RAG capabilities. The system is designed around three core principles: **org-level isolation at every layer**, **clinical safety through system prompts and input validation**, and **complete auditability through database-level triggers**.

The recommended architecture employs a layered approach where Row Level Security (RLS) at the database layer provides the foundation for multi-tenant isolation, while the application layer enforces business logic and clinical safety constraints. The RAG pipeline is designed with chunk-level provenance tracking, ensuring every AI response can be traced back to specific source documents with version control.

Key architectural decisions include: using PostgreSQL with pgvector for unified vector and relational data management, implementing audit logging via database triggers for tamper-proof records, enforcing 15-minute session timeouts with MFA for HIPAA compliance, and designing the API layer for streaming responses with inline citations.

The architecture assumes the system processes clinical protocols and guidelines (not patient PHI), which significantly reduces compliance complexity while maintaining healthcare-grade security standards.

## Recommended Architecture Overview

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER (React/Mobile)                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  • Session Manager (15-min timeout, MFA state)                          │ │
│  │  • Citation Renderer (inline source links)                              │ │
│  │  • Streaming Response Handler                                           │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API GATEWAY LAYER                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  • Auth0/Clerk Integration (MFA enforcement)                             │ │
│  │  • Rate Limiting (per-org, per-user)                                     │ │
│  │  • Request Validation (PHI detection, clinical safety)                  │ │
│  │  • Audit Logger (request/response capture)                               │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           APPLICATION LAYER (API)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  Auth Svc    │  │  RAG Svc     │  │  Document    │  │  Audit Svc   │    │
│  │  (Sessions)  │  │  (Queries)   │  │  Management  │  │  (Logging)   │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │              Clinical Safety Layer (System Prompt Enforcement)       │   │
│  │  • Input sanitization for PHI patterns                               │   │
│  │  • Clinical safety instruction injection                             │   │
│  │  • Citation requirement enforcement                                  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DATA LAYER (PostgreSQL)                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  ROW LEVEL SECURITY (RLS) - Primary Isolation Boundary                │ │
│  │  • org_id column on ALL tables                                        │ │
│  │  • RLS policies enforce org-only access                                │ │
│  │  • RLS enabled on: users, documents, chunks, conversations, messages  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  pgvector Extension                                                    │ │
│  │  • 1536-dim embeddings (text-embedding-3-small)                        │ │
│  │  • IVFFlat index for approximate nearest neighbor search               │ │
│  │  • RLS-aware vector search                                             │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  AUDIT TRIGGERS (Database-Level, Tamper-Proof)                         │ │
│  │  • BEFORE INSERT/UPDATE/DELETE triggers                                 │ │
│  │  • audit_log table with cryptographic chaining                         │ │
│  │  • No UPDATE/DELETE on audit records                                    │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      AI INFERENCE LAYER (OpenAI/Azure)                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  • Chat completions API (gpt-4o for reasoning)                         │ │
│  │  • Embeddings API (text-embedding-3-small)                              │ │
│  │  • No PHI in system prompts (clinical content only)                     │ │
│  │  • Structured output mode for citations                                 │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

**Client Layer**: The React/mobile client manages session state, handles streaming responses, and renders citations inline. Session timeout countdown begins immediately upon page load, with automatic re-authentication prompts at 2-minute intervals before timeout.

**API Gateway Layer**: This layer serves as the security boundary, enforcing authentication, rate limiting, and input validation before requests reach the application. The gateway is responsible for detecting PHI patterns in incoming requests and rejecting them before they reach the RAG pipeline.

**Application Layer**: Contains the core business logic, including the RAG pipeline, document management, and clinical safety enforcement. The clinical safety layer acts as a firewall between user input and AI prompts, sanitizing inputs and injecting system instructions.

**Data Layer**: PostgreSQL serves as the source of truth, with RLS providing org-level isolation at the database level. pgvector handles embedding storage and similarity search, while audit triggers capture all data modifications in an immutable audit log.

**AI Inference Layer**: Calls to external AI services are made without PHI, using only clinical content. Responses are structured to include citations, which are parsed and stored alongside the generated response.

## Multi-Tenant Architecture with HIPAA Compliance

### Org-Level Isolation Strategy

The multi-tenant architecture implements isolation at three levels: database, application, and network. Database-level isolation via Row Level Security provides the strongest guarantees, ensuring that even application bugs cannot result in cross-tenant data access.

**Database-Level Isolation (RLS)**

Row Level Security is enabled on all tables containing tenant data. The RLS policy is simple but effective: every query is automatically filtered to rows where `org_id` matches the authenticated user's organization. This filtering happens at the database engine level, making it resistant to application-level bypasses.

```sql
-- Enable RLS on all tenant tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (identical pattern for all tables)
CREATE POLICY org_isolation_policy ON users
    FOR ALL
    USING (org_id::text = current_setting('app.current_org_id')::text)
    WITH CHECK (org_id::text = current_setting('app.current_org_id')::text);

-- Repeat for all other tenant tables
```

The `app.current_org_id` setting is established at the start of each database session during authentication. This setting cannot be modified by users, only by authenticated application code, preventing tenant hopping attacks.

**Application-Level Isolation**

Beyond RLS, the application layer enforces org boundaries through several mechanisms. Every API request includes the organization ID in the JWT claims, which the application validates against the user's actual organization membership. Document uploads are tagged with the requesting user's organization, and vector searches automatically include the org_id filter even though pgvector doesn't natively support RLS on vector columns.

**Network-Level Isolation**

For additional security, API endpoints can be configured to validate the `Origin` and `Referer` headers against registered organization domains. This prevents cross-tenant attacks from malicious clients, though it should be considered a defense-in-depth measure rather than a primary control.

### HIPAA Compliance Matrix

| HIPAA Requirement | Implementation | Layer |
|-------------------|----------------|-------|
| Access Control | MFA + RLS + Session timeouts | App + DB |
| Audit Logging | Database triggers + API logging | DB + Gateway |
| Integrity | Cryptographic audit chaining | DB |
| Transmission Security | TLS 1.3 required | Network |
| Authentication | MFA required, 15-min timeout | App |
| Data Isolation | RLS + org_id on all tables | DB |

## RAG Pipeline Architecture

### Pipeline Overview

The RAG pipeline is designed for clinical decision support use cases, emphasizing accuracy and citation over raw capability. The pipeline consists of seven stages: document ingestion, chunking with overlap, embedding generation, vector storage with metadata, semantic search with filtering, context retrieval, and grounded response generation.

**Clinical Safety at Every Stage**

Unlike general-purpose RAG systems, this pipeline includes clinical safety checks at multiple stages. Documents are validated for clinical content appropriateness before ingestion. Chunk boundaries are placed to preserve semantic coherence, preventing the AI from citing partial or misleading information. Search results are filtered for clinical relevance, and generated responses must include verifiable citations.

```typescript
// RAG Pipeline Implementation Pattern
interface RAGPipeline {
    // Stage 1: Document Ingestion
    async ingestDocument(file: File, metadata: DocumentMetadata): Promise<Document> {
        // Validate file type and size
        // Virus scan (if storing files externally)
        // Extract text content
        // Generate document fingerprint
        // Store with org_id and clinical category
    }

    // Stage 2: Smart Chunking
    async chunkDocument(document: Document): Promise<DocumentChunk[]> {
        // Use semantic chunking (sentences + paragraphs)
        // 512-token chunks with 128-token overlap
        // Preserve section headers in chunk metadata
        // Generate chunk fingerprint
    }

    // Stage 3: Embedding Generation
    async generateEmbeddings(chunks: DocumentChunk[]): Promise<void> {
        // Batch calls to text-embedding-3-small (256 chunks/batch)
        // Store 1536-dim vectors with chunk_id
        // Log embedding generation for audit
    }

    // Stage 4: Vector Storage
    async storeVectors(chunks: DocumentChunk[]): Promise<void> {
        // Insert into document_chunks with embeddings
        // Create IVFFlat index for similarity search
        // Set up RLS on vector table
    }

    // Stage 5: Semantic Search
    async search(query: string, filters: SearchFilters): Promise<SearchResult[]> {
        // Generate query embedding
        // Apply org_id filter (RLS-compatible)
        // IVFFlat similarity search with cosine distance
        // Filter by document status (published only)
        // Return top-k results with citations
    }

    // Stage 6: Context Assembly
    async assembleContext(results: SearchResult[]): Promise<ContextPackage> {
        // Sort by relevance score
        // Deduplicate overlapping chunks
        // Include source metadata for citations
        // Limit context to model token limits
    }

    // Stage 7: Grounded Generation
    async generateResponse(
        query: string,
        context: ContextPackage,
        systemPrompt: string
    ): Promise<StreamingResponse> {
        // Inject clinical safety instructions
        // Include citation format requirements
        // Stream response with inline citations
        // Log prompt and response for audit
    }
}
```

### Chunking Strategy for Clinical Content

Clinical documents require special chunking considerations compared to general text. Medical guidelines often reference previous sections, and cutting across section boundaries can destroy critical context. The recommended approach uses semantic chunking that respects document structure.

```typescript
// Clinical Document Chunking Strategy
interface ClinicalChunkingConfig {
    maxTokens: number;          // 512 tokens
    overlapTokens: number;      // 128 tokens
    preserveSectionStructure: boolean;  // true for clinical docs
    minChunkTokens: number;     // 128 tokens
    includeHeaders: boolean;    // Include section headers in each chunk
}

function clinicalChunker(document: ClinicalDocument): DocumentChunk[] {
    // Step 1: Parse document structure (headings, paragraphs, tables)
    const structure = parseStructure(document);

    // Step 2: Group content by section
    const sections = groupBySection(structure);

    // Step 3: Create chunks respecting section boundaries
    const chunks: DocumentChunk[] = [];
    for (const section of sections) {
        if (section.tokens <= config.maxTokens) {
            // Entire section fits in one chunk
            chunks.push(createChunk(section, includeHeader = true));
        } else {
            // Split section into multiple chunks
            const subChunks = splitWithOverlap(
                section.content,
                config.maxTokens,
                config.overlapTokens
            );
            chunks.push(...subChunks.map(sc => createChunk(sc, includeHeader = true)));
        }
    }

    // Step 4: Add chunk metadata for citation accuracy
    return chunks.map((chunk, index) => ({
        ...chunk,
        chunk_index: index,
        section_path: chunk.section.path,
        document_version: document.version,
        clinical_category: document.clinical_category
    }));
}
```

### Vector Search with RLS

pgvector supports approximate nearest neighbor search using IVFFlat indexes, which provide significant performance improvements over exact search. However, combining vector search with RLS requires careful index design to ensure security boundaries are respected.

```sql
-- Create vector index with RLS awareness
-- Note: RLS is enforced by the query, not the index

CREATE INDEX ON document_chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Functional index for org-filtered search performance
CREATE INDEX document_chunks_org_vector_idx 
ON document_chunks (org_id, embedding vector_cosine_ops)
WHERE status = 'published';

-- Query pattern with RLS
EXPLAIN ANALYZE
SELECT 
    chunk_id,
    content,
    embedding <=> query_embedding AS distance,
    document_id,
    section_path
FROM document_chunks
WHERE 
    -- RLS filter (automatic from session setting)
    org_id = current_setting('app.current_org_id')::uuid
    -- Published documents only
    AND status = 'published'
    -- Vector similarity search
    AND embedding <=> query_embedding < 0.3
ORDER BY embedding <=> query_embedding
LIMIT 10;
```

## Database Design with pgvector and RLS

### Schema Overview

```sql
-- Organizations (multi-tenant root)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255),
    plan_tier VARCHAR(50) DEFAULT 'standard',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Users (belong to organizations)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    mfa_enabled BOOLEAN DEFAULT false,
    mfa_secret VARCHAR(255),
    role VARCHAR(50) DEFAULT 'clinician',
    permissions JSONB DEFAULT '[]',
    last_login TIMESTAMPTZ,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(org_id, email)
);

-- Documents (clinical content)
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(500) NOT NULL,
    document_type VARCHAR(100), -- 'guideline', 'protocol', 'policy'
    clinical_category VARCHAR(100), -- 'cardiology', 'oncology', etc.
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'review', 'published', 'archived'
    version INTEGER DEFAULT 1,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    uploaded_by UUID REFERENCES users(id),
    published_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    checksum VARCHAR(64), -- SHA-256 for integrity
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Document Chunks (with pgvector embeddings)
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536), -- text-embedding-3-small dimensions
    section_path TEXT, -- e.g., '2.3.1 Treatment Protocols'
    token_count INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(document_id, chunk_index)
);

-- Conversations (session context)
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(255),
    document_scope UUID[], -- allowed document IDs for this conversation
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'archived'
    started_at TIMESTAMPTZ DEFAULT now(),
    last_activity_at TIMESTAMPTZ DEFAULT now()
);

-- Messages (individual exchanges)
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
    role VARCHAR(20) NOT NULL, -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,
    citations JSONB DEFAULT '[]', -- [{chunk_id, document_id, excerpt}]
    token_count INTEGER,
    model_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Audit Log (immutable)
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    request_id UUID,
    previous_value JSONB,
    new_value JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### Index Strategy

```sql
-- Critical indexes for RLS performance
CREATE INDEX users_org_idx ON users(org_id);
CREATE INDEX documents_org_status_idx ON documents(org_id, status);
CREATE INDEX document_chunks_org_doc_idx ON document_chunks(org_id, document_id);
CREATE INDEX conversations_org_user_idx ON conversations(org_id, user_id);
CREATE INDEX messages_conversation_idx ON messages(conversation_id, created_at);
CREATE INDEX audit_log_org_created_idx ON audit_log(org_id, created_at DESC);

-- Vector indexes (IVFFlat for performance)
CREATE INDEX document_chunks_embedding_idx ON document_chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Composite index for org-filtered vector search
CREATE INDEX document_chunks_org_vector_idx ON document_chunks (org_id)
INCLUDE (embedding, document_id, status)
WHERE status = 'published';

-- Functional index for audit integrity verification
CREATE INDEX audit_log_chain_idx ON audit_log(created_at DESC)
INCLUDE (previous_hash, action);
```

## Audit Trail Architecture

### Database-Level Audit Triggers

Audit logging is implemented at the database layer using triggers, ensuring that audit records cannot be bypassed by application bugs or malicious actors with application access. This is critical for HIPAA compliance, which requires audit trails that cannot be modified or deleted.

```sql
-- Audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    audit_record audit_log;
    previous_hash TEXT;
    new_hash TEXT;
BEGIN
    -- Get previous hash for chaining
    SELECT hash INTO previous_hash
    FROM audit_log
    WHERE org_id = COALESCE(NEW.org_id, OLD.org_id)
    ORDER BY created_at DESC
    LIMIT 1;

    -- Build audit record based on operation type
    IF TG_OP = 'INSERT' THEN
        audit_record := audit_log(
            org_id := NEW.org_id,
            user_id := CURRENT_setting('app.current_user_id')::uuid,
            action := 'INSERT',
            resource_type := TG_TABLE_NAME,
            resource_id := NEW.id,
            new_value := to_jsonb(NEW),
            previous_hash := previous_hash
        );
    ELSIF TG_OP = 'UPDATE' THEN
        audit_record := audit_log(
            org_id := NEW.org_id,
            user_id := CURRENT_setting('app.current_user_id')::uuid,
            action := 'UPDATE',
            resource_type := TG_TABLE_NAME,
            resource_id := NEW.id,
            new_value := to_jsonb(NEW),
            previous_value := to_jsonb(OLD),
            previous_hash := previous_hash
        );
    ELSIF TG_OP = 'DELETE' THEN
        audit_record := audit_log(
            org_id := OLD.org_id,
            user_id := CURRENT_setting('app.current_user_id')::uuid,
            action := 'DELETE',
            resource_type := TG_TABLE_NAME,
            resource_id := OLD.id,
            previous_value := to_jsonb(OLD),
            previous_hash := previous_hash
        );
    END IF;

    -- Insert audit record (RLS doesn't apply to audit_log as superuser)
    INSERT INTO audit_log (
        org_id, user_id, action, resource_type, resource_id,
        details, ip_address, user_agent, request_id,
        previous_value, new_value, previous_hash
    ) VALUES (
        audit_record.org_id,
        audit_record.user_id,
        audit_record.action,
        audit_record.resource_type,
        audit_record.resource_id,
        audit_record.details,
        current_setting('app.client_ip', true)::inet,
        current_setting('app.user_agent', true),
        current_setting('app.request_id', true)::uuid,
        audit_record.previous_value,
        audit_record.new_value,
        audit_record.previous_hash
    );

    -- Return appropriate row based on operation
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers on all auditable tables
CREATE TRIGGER users_audit_trigger
    BEFORE INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER documents_audit_trigger
    BEFORE INSERT OR UPDATE OR DELETE ON documents
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER document_chunks_audit_trigger
    BEFORE INSERT OR UPDATE OR DELETE ON document_chunks
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER conversations_audit_trigger
    BEFORE INSERT OR UPDATE OR DELETE ON conversations
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER messages_audit_trigger
    BEFORE INSERT OR UPDATE OR DELETE ON messages
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
```

### Audit Log Integrity Protection

The audit log implements cryptographic chaining to detect tampering. Each audit record includes a hash of the previous record, creating a chain that breaks if any record is modified or deleted.

```sql
-- Generate cryptographic hash for audit record
CREATE OR REPLACE FUNCTION generate_audit_hash(
    record audit_log
) RETURNS TEXT AS $$
BEGIN
    RETURN encode(
        sha256(
            (
                COALESCE(record.id::text, '') ||
                COALESCE(record.org_id::text, '') ||
                COALESCE(record.user_id::text, '') ||
                COALESCE(record.action, '') ||
                COALESCE(record.resource_type, '') ||
                COALESCE(record.resource_id::text, '') ||
                COALESCE(record.previous_hash, '') ||
                COALESCE(record.created_at::text, '')
            )::bytea
        ),
        'hex'
    );
END;
$$ LANGUAGE plpgsql;

-- Procedure to verify audit chain integrity
CREATE OR REPLACE PROCEDURE verify_audit_integrity(org_id UUID)
LANGUAGE plpgsql AS $$
DECLARE
    record_count INTEGER;
    broken_chain_count INTEGER;
    current_hash TEXT;
BEGIN
    -- Count total records
    SELECT COUNT(*) INTO record_count
    FROM audit_log
    WHERE org_id = org_id;

    -- Find broken chains (where previous_hash doesn't match)
    SELECT COUNT(*) INTO broken_chain_count
    FROM (
        SELECT 
            id,
            previous_hash,
            LAG(generate_audit_hash(audit_log)) OVER (ORDER BY created_at, id) AS expected_previous_hash
        FROM audit_log
        WHERE org_id = org_id
    ) AS chained
    WHERE previous_hash IS DISTINCT FROM expected_previous_hash;

    -- Report findings
    RAISE NOTICE 'Organization: %', org_id;
    RAISE NOTICE 'Total audit records: %', record_count;
    RAISE NOTICE 'Broken chain links: %', broken_chain_count;
    
    IF broken_chain_count > 0 THEN
        RAISE EXCEPTION 'Audit integrity compromised: % broken chain links', broken_chain_count;
    END IF;
END;
$$;
```

### AI-Specific Audit Events

Beyond standard CRUD operations, the audit system captures AI-specific events required for clinical compliance.

```sql
-- AI interaction audit events (captured via application, not triggers)
-- These are inserted directly to ensure complete context

INSERT INTO audit_log (
    org_id,
    user_id,
    action,
    resource_type,
    resource_id,
    details,
    ip_address,
    request_id
) VALUES (
    'org-id-here',
    'user-id-here',
    'AI_QUERY',
    'conversation',
    'conversation-id-here',
    '{
        "query": "redacted - contains PHI risk",
        "query_hash": "sha256-of-query",
        "documents_searched": 15,
        "chunks_retrieved": 8,
        "model_used": "gpt-4o",
        "response_tokens": 512,
        "citations_count": 4,
        "safety_checks_passed": true,
        "ph_filter_triggered": false,
        "clinical_relevance_score": 0.87
    }'::jsonb,
    '192.168.1.100',
    'request-uuid-here'
);

-- Document upload with clinical validation
INSERT INTO audit_log (
    org_id,
    user_id,
    action,
    resource_type,
    resource_id,
    details
) VALUES (
    'org-id-here',
    'user-id-here',
    'DOCUMENT_UPLOAD',
    'document',
    'document-id-here',
    '{
        "filename": "cardiology-guidelines-2024.pdf",
        "document_type": "guideline",
        "clinical_category": "cardiology",
        "chunks_created": 342,
        "clinical_validation_passed": true,
        "version": 1,
        "content_fingerprint": "sha256-..."
    }'::jsonb
);
```

## Security Architecture

### PHI Prevention Layer

The system is designed for clinical protocols and guidelines, explicitly excluding patient PHI. However, the architecture includes multiple layers of PHI detection to prevent accidental inclusion in AI prompts.

```typescript
// PHI Detection and Prevention Layer
interface PHIPreventionConfig {
    enabled: boolean;
    strictMode: boolean;
    patterns: PHIPattern[];
    customPatterns: RegExp[];
}

interface PHIPattern {
    name: string;
    regex: RegExp;
    severity: 'block' | 'warn' | 'redact';
    examples: string[];
}

// Standard PHI patterns (HIPAA 18 identifiers)
const STANDARD_PHI_PATTERNS: PHIPattern[] = {
    name: 'SSN',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    severity: 'block',
    examples: ['123-45-6789']
},
{
    name: 'Email',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    severity: 'redact',
    examples: ['john.doe@hospital.org']
},
{
    name: 'Phone',
    regex: /\b(\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
    severity: 'redact',
    examples: ['(555) 123-4567']
},
{
    name: 'MRN',
    regex: /\b(MRN|RECORD|ID)[-:\s]*[A-Z0-9]{6,12}\b/gi,
    severity: 'block',
    examples: ['MRN-123456']
},
{
    name: 'DateOfBirth',
    regex: /\b(DOB|BIRTH)[-:\s]*\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}\b/gi,
    severity: 'block',
    examples: ['DOB: 01/15/1980']
},
{
    name: 'Address',
    regex: /\b\d+\s+[A-Za-z]+(\s+[A-Za-z]+)*\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Court|Ct|Lane|Ln|Way|Place|Pl)\b/gi,
    severity: 'block',
    examples: ['123 Main St']
};

class PHIPreventionService {
    async scanInput(input: string): Promise<PHIScanResult> {
        const findings: PHIFinding[] = [];
        
        // Check standard patterns
        for (const pattern of STANDARD_PHI_PATTERNS) {
            const matches = this.findMatches(input, pattern.regex);
            for (const match of matches) {
                findings.push({
                    type: pattern.name,
                    severity: pattern.severity,
                    value: match.value,
                    position: match.position,
                    suggestedAction: pattern.severity === 'block' 
                        ? 'reject' 
                        : pattern.severity === 'redact' 
                            ? 'redact' 
                            : 'warn'
                });
            }
        }

        // Apply severity logic
        const hasBlockingPHI = findings.some(f => f.severity === 'block');
        const hasRedactablePHI = findings.filter(f => f.severity === 'redact');
        
        if (hasBlockingPHI) {
            return {
                allowed: false,
                findings,
                action: 'reject',
                reason: 'Input contains blocking PHI patterns',
                sanitizedInput: null
            };
        }

        // If strict mode, redact all findings
        if (this.config.strictMode) {
            let sanitized = input;
            for (const finding of findings) {
                sanitized = sanitized.replace(
                    finding.value,
                    `[${finding.type.toUpperCase()}_REDACTED]`
                );
            }
            return {
                allowed: true,
                findings,
                action: 'redact',
                sanitizedInput: sanitized
            };
        }

        return {
            allowed: true,
            findings,
            action: findings.length > 0 ? 'warn' : 'allow',
            sanitizedInput: findings.length > 0 ? null : input
        };
    }
}
```

### Clinical Safety System Prompts

System prompts enforce clinical safety constraints and citation requirements. These prompts are injected at the API layer and cannot be modified by users.

```typescript
const CLINICAL_SAFETY_SYSTEM_PROMPT = `You are a clinical decision support assistant providing evidence-based information from approved medical guidelines and protocols.

CRITICAL SAFETY RULES:
1. You must ONLY use information from the provided document chunks to generate responses
2. Every factual claim MUST include a citation to the source chunk
3. You must NEVER make up information, statistics, or medical recommendations
4. If you cannot find sufficient evidence, state "I don't have sufficient evidence to answer this question"
5. You must ALWAYS indicate the confidence level of your response (High/Medium/Low)
6. Never provide patient-specific advice - you only have access to general clinical guidelines

CITATION FORMAT:
- Inline citations: [Source: chunk_id, relevance: X.XX]
- List citations at the end with full document references
- Only cite chunks with relevance score > 0.7 unless no better sources exist

RESPONSE STRUCTURE:
1. Direct answer to the question
2. Evidence summary with inline citations
3. Confidence assessment
4. Limitations and recommendations for further reading

If asked about patient-specific cases, respond: "I cannot provide patient-specific advice. Please consult with appropriate clinical staff and refer to your institution's protocols."

Remember: Accuracy over completeness. It is better to say "I don't know" than to provide potentially harmful incorrect information.`;

const CITATION_EXTRACTION_PROMPT = `Extract and format citations from the following response. Return a JSON array of citations in this format:
[{
  "chunk_id": "uuid",
  "document_id": "uuid", 
  "document_title": "string",
  "excerpt": "string",
  "relevance_score": 0.XX,
  "section_path": "string"
}]`;
```

### Session Management for HIPAA Compliance

HIPAA requires automatic session termination after a period of inactivity. The 15-minute timeout is implemented at multiple layers for defense in depth.

```typescript
// Session Management Implementation
interface SessionConfig {
    absoluteTimeoutMinutes: number;  // 480 minutes (8 hours)
    inactivityTimeoutMinutes: number; // 15 minutes (HIPAA minimum)
    warningBeforeTimeoutMinutes: number; // 2 minutes
    mfaRequired: boolean;
    concurrentSessionLimit: number; // 1 device
}

class SessionManager {
    private readonly config: SessionConfig;
    private readonly sessionStore: RedisSessionStore;
    
    async createSession(userId: string, orgId: string, deviceInfo: DeviceInfo): Promise<Session> {
        // Check concurrent session limit
        const activeSessions = await this.sessionStore.countActiveSessions(userId);
        if (activeSessions >= this.config.concurrentSessionLimit) {
            // Invalidate oldest session
            await this.sessionStore.invalidateOldestSession(userId);
            await this.auditLog.log({
                action: 'SESSION_FORCE_LOGOUT',
                userId,
                reason: 'Concurrent session limit exceeded'
            });
        }

        // Create new session with MFA requirement
        const session: Session = {
            id: uuidv4(),
            userId,
            orgId,
            deviceInfo,
            mfaValidated: false,
            createdAt: new Date(),
            lastActivityAt: new Date(),
            expiresAt: addMinutes(new Date(), this.config.absoluteTimeoutMinutes)
        };

        await this.sessionStore.create(session);
        await this.auditLog.log({ action: 'SESSION_CREATE', sessionId: session.id, userId });

        // If MFA required but not yet validated, force MFA challenge
        if (this.config.mfaRequired && !session.mfaValidated) {
            throw new MFARequiredError('MFA validation required');
        }

        return session;
    }

    async validateSession(sessionId: string): Promise<SessionValidationResult> {
        const session = await this.sessionStore.get(sessionId);
        
        if (!session) {
            return { valid: false, reason: 'Session not found' };
        }

        // Check absolute timeout
        if (new Date() > session.expiresAt) {
            await this.invalidateSession(sessionId);
            return { valid: false, reason: 'Session expired (absolute timeout)' };
        }

        // Check inactivity timeout
        const inactivityMinutes = differenceInMinutes(new Date(), session.lastActivityAt);
        if (inactivityMinutes > this.config.inactivityTimeoutMinutes) {
            await this.invalidateSession(sessionId);
            return { valid: false, reason: 'Session expired (inactivity timeout)' };
        }

        // Update last activity
        await this.sessionStore.updateActivity(sessionId);

        return { valid: true, session };
    }

    async handleActivity(sessionId: string): Promise<SessionActivityResult> {
        // Called on every user interaction
        const validation = await this.validateSession(sessionId);
        
        if (!validation.valid) {
            return {
                type: 'session_expired',
                redirectTo: '/login?reason=session_expired',
                warningMinutesRemaining: 0
            };
        }

        // Calculate warning threshold
        const session = validation.session!;
        const minutesSinceActivity = differenceInMinutes(new Date(), session.lastActivityAt);
        const warningThreshold = this.config.inactivityTimeoutMinutes - this.config.warningBeforeTimeoutMinutes;

        if (minutesSinceActivity >= warningThreshold) {
            const minutesRemaining = this.config.inactivityTimeoutMinutes - minutesSinceActivity;
            return {
                type: 'warning',
                warningMinutesRemaining: minutesRemaining,
                autoLogoutAt: addMinutes(new Date(), minutesRemaining)
            };
        }

        return { type: 'active', warningMinutesRemaining: null };
    }
}
```

## API Layer Patterns

### Streaming Response with Citations

The API design supports streaming responses while embedding citations inline. This provides real-time feedback while maintaining clinical traceability.

```typescript
// API Response Types
interface StreamingResponse {
    stream: AsyncIterable<StreamChunk>;
    citations: Citation[];
    metadata: ResponseMetadata;
}

interface StreamChunk {
    type: 'content' | 'citation' | 'error' | 'done';
    data: string | Citation | Error | FinalMetadata;
    chunkId: string;
    timestamp: Date;
}

interface Citation {
    chunkId: string;
    documentId: string;
    documentTitle: string;
    excerpt: string;
    relevanceScore: number;
    sectionPath: string;
}

interface FinalMetadata {
    totalTokens: number;
    modelUsed: string;
    responseTimeMs: number;
    citationsCount: number;
    confidenceLevel: 'high' | 'medium' | 'low';
}

// Streaming API Endpoint Pattern
app.post('/api/v1/chat/completions', async (req, res) => {
    const { conversationId, message, stream = true } = req.body;
    
    // Validate session and MFA
    const session = await sessionManager.validateSession(req.sessionId);
    if (!session.valid || !session.session!.mfaValidated) {
        return res.status(401).json({ error: 'Valid MFA session required' });
    }

    // PHI scan
    const phiResult = await phiPrevention.scanInput(message);
    if (!phiResult.allowed) {
        return res.status(400).json({ 
            error: 'Input contains prohibited PHI patterns',
            findings: phiResult.findings 
        });
    }

    // Get conversation context
    const conversation = await conversationService.getConversation(conversationId);
    
    // Build search query
    const searchQuery = phiResult.sanitizedInput || message;
    
    // Execute RAG pipeline
    const ragResult = await ragPipeline.query({
        query: searchQuery,
        orgId: session.session!.orgId,
        documentScope: conversation.documentScope,
        userId: session.session!.userId
    });

    // Build system prompt with context
    const systemPrompt = buildSystemPrompt(ragResult.context);

    // Stream response
    if (stream) {
        const stream = await aiService.streamCompletion({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                ...conversation.history,
                { role: 'user', content: message }
            ],
            temperature: 0.1, // Low temperature for consistency
            stream: true
        });

        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Process stream with citation extraction
        const { stream: processedStream, citations } = await citationService.processStream(
            stream,
            ragResult.chunks
        );

        // Send chunks
        for await (const chunk of processedStream) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        // Send final metadata
        res.write(`data: ${JSON.stringify({ type: 'done', citations })}\n\n`);
        res.end();
    } else {
        // Non-streaming response
        const response = await aiService.complete({
            model: 'gpt-4o',
            messages: [...],
            temperature: 0.1
        });

        // Extract citations from response
        const citations = await citationService.extractCitations(
            response.content,
            ragResult.chunks
        );

        // Store message with citations
        await messageService.create({
            conversationId,
            role: 'assistant',
            content: response.content,
            citations,
            tokenCount: response.usage.total_tokens
        });

        res.json({
            content: response.content,
            citations,
            usage: response.usage
        });
    }
});
```

### Rate Limiting per Organization

```typescript
// Rate Limiter Configuration
interface RateLimitConfig {
    orgLimits: {
        requestsPerMinute: number;
        tokensPerMinute: number;
        conversationsPerHour: number;
    };
    userLimits: {
        requestsPerMinute: number;
        tokensPerMinute: number;
    };
    emergencyLimits: {
        requestsPerMinute: number; // Lower during incidents
    };
}

class RateLimiter {
    private readonly redis: Redis;
    private readonly config: RateLimitConfig;

    async checkRateLimit(
        orgId: string,
        userId: string,
        operation: 'request' | 'token' | 'conversation'
    ): Promise<RateLimitResult> {
        const now = Date.now();
        const windowMs = 60000; // 1 minute

        // Check organization-level limits
        const orgKey = `ratelimit:org:${orgId}:${operation}`;
        const orgCount = await this.redis.incr(orgKey);
        await this.redis.expire(orgKey, windowMs / 1000);

        const orgLimit = this.config.orgLimits[`${operation}sPerMinute` as keyof typeof this.config.orgLimits];
        
        if (orgCount > orgLimit) {
            return {
                allowed: false,
                retryAfterMs: await this.redis.ttl(orgKey) * 1000,
                reason: 'Organization rate limit exceeded'
            };
        }

        // Check user-level limits
        const userKey = `ratelimit:user:${userId}:${operation}`;
        const userCount = await this.redis.incr(userKey);
        await this.redis.expire(userKey, windowMs / 1000);

        const userLimit = this.config.userLimits[`${operation}sPerMinute` as keyof typeof this.config.userLimits];
        
        if (userCount > userLimit) {
            return {
                allowed: false,
                retryAfterMs: await this.redis.ttl(userKey) * 1000,
                reason: 'User rate limit exceeded'
            };
        }

        return { allowed: true };
    }
}
```

## Performance Considerations for Production RAG

### Vector Search Optimization

pgvector with IVFFlat indexes provides good performance for production workloads, but optimal performance requires careful index tuning and query patterns.

```sql
-- Optimized vector search query with proper index usage
EXPLAIN ANALYZE
SELECT 
    chunk_id,
    content,
    embedding <=> query_embedding AS distance,
    document_id,
    section_path,
    document_title,
    relevance_score
FROM (
    SELECT 
        dc.chunk_id,
        dc.content,
        dc.embedding,
        dc.document_id,
        dc.section_path,
        d.title AS document_title,
        1 - (dc.embedding <=> query_embedding) AS relevance_score,
        ROW_NUMBER() OVER (
            PARTITION BY dc.document_id 
            ORDER BY dc.embedding <=> query_embedding ASC
        ) AS rank_within_doc
    FROM document_chunks dc
    JOIN documents d ON dc.document_id = d.id
    WHERE 
        dc.org_id = current_setting('app.current_org_id')::uuid
        AND d.status = 'published'
        AND d.clinical_category = ANY(current_setting('app.active_categories', true)::text[])
        AND dc.embedding <=> query_embedding < 0.4  -- Pre-filter by distance
) ranked
WHERE rank_within_doc <= 3  -- Max 3 chunks per document
ORDER BY relevance_score DESC
LIMIT 20;
```

### Caching Strategy

```typescript
// Multi-layer caching for RAG pipeline
interface CachingConfig {
    embeddingCache: {
        enabled: boolean;
        ttlSeconds: number;
        maxEntries: number;
    };
    documentChunkCache: {
        enabled: boolean;
        ttlSeconds: number;
        maxEntries: number;
    };
    searchResultCache: {
        enabled: boolean;
        ttlSeconds: number;
        maxEntries: number;
    };
}

class RAGCache {
    private readonly redis: Redis;
    private readonly embeddingCache: Cache<string, number[]>;
    private readonly searchCache: Cache<string, SearchResult[]>;

    async getCachedEmbeddings(text: string): Promise<number[] | null> {
        const hash = sha256(text);
        const cacheKey = `embedding:${hash}`;
        const cached = await this.redis.get(cacheKey);
        
        if (cached) {
            return JSON.parse(cached);
        }
        return null;
    }

    async cacheEmbeddings(text: string, embedding: number[]): Promise<void> {
        const hash = sha256(text);
        const cacheKey = `embedding:${hash}`;
        await this.redis.setex(
            cacheKey, 
            this.config.embeddingCache.ttlSeconds, 
            JSON.stringify(embedding)
        );
    }

    async getCachedSearch(query: string, filters: SearchFilters): Promise<SearchResult[] | null> {
        const cacheKey = this.buildSearchCacheKey(query, filters);
        const cached = await this.redis.get(cacheKey);
        
        if (cached) {
            return JSON.parse(cached);
        }
        return null;
    }

    async cacheSearch(
        query: string, 
        filters: SearchFilters, 
        results: SearchResult[]
    ): Promise<void> {
        const cacheKey = this.buildSearchCacheKey(query, filters);
        await this.redis.setex(
            cacheKey,
            this.config.searchResultCache.ttlSeconds,
            JSON.stringify(results)
        );
    }
}
```

### Horizontal Scaling Considerations

```typescript
// Stateless API layer for horizontal scaling
interface ScalingConfig {
    apiReplicas: number;
    connectionPool: {
        min: number;
        max: number;
        idleTimeoutMs: number;
    };
    websocketConnections: {
        maxPerInstance: number;
        heartbeatIntervalMs: number;
    };
}

// Recommended connection pool configuration
const DATABASE_CONFIG = {
    // pgBouncer recommended for connection pooling
    pgbouncer: {
        max_client_conn: 1000,
        default_pool_size: 50,
        min_pool_size: 10,
        pool_mode: 'transaction',  // Best for short-lived queries
        max_db_connections: 100
    },
    // Application-level pool
    application: {
        min: 10,
        max: 50,
        idleTimeoutMs: 30000,
        maxUses: 7500
    }
};

// WebSocket scaling for streaming responses
class WebSocketManager {
    private readonly connections: Map<string, WebSocket[]>;
    private readonly redis: Redis;

    // Distribute connections across API replicas
    async getConnection(userId: string): Promise<WebSocket> {
        const userConnections = await this.redis.smembers(`user:${userId}:connections`);
        
        if (userConnections.length > 0) {
            // Return existing connection if alive
            for (const connId of userConnections) {
                const conn = this.connections.get(connId);
                if (conn && conn.readyState === WebSocket.OPEN) {
                    return conn;
                }
            }
        }

        // Create new connection on least-loaded replica
        const replicaId = await this.findLeastLoadedReplica();
        return this.createConnection(replicaId, userId);
    }
}
```

## Implementation Recommendations

### Phase 1: Foundation (Weeks 1-4)

Implement the database layer first, including RLS policies and audit triggers. This provides the security foundation for all subsequent development. The schema should be tested with cross-tenant access attempts to verify isolation.

Key deliverables:
- PostgreSQL schema with all tables and RLS policies
- Database triggers for audit logging
- Unit tests for RLS enforcement
- Integration tests for audit chain integrity

### Phase 2: Core RAG Pipeline (Weeks 5-8)

Build the RAG pipeline without AI integration first, using simulated embeddings. This allows testing the chunking, storage, and retrieval logic independently.

Key deliverables:
- Document ingestion API
- Chunking service with clinical-aware logic
- Vector search with pgvector
- Search result ranking
- Unit tests for each stage

### Phase 3: AI Integration (Weeks 9-12)

Integrate OpenAI/Azure APIs with clinical safety prompts. Implement streaming responses and citation extraction.

Key deliverables:
- AI service integration
- System prompt templates
- Citation extraction service
- Streaming API endpoint
- PHI prevention layer

### Phase 4: Security Hardening (Weeks 13-16)

Implement MFA, session management, rate limiting, and comprehensive audit logging.

Key deliverables:
- MFA integration (Auth0/Clerk)
- Session manager with 15-minute timeout
- Rate limiter per org/user
- Complete audit trail
- Security penetration testing

### Phase 5: Production Readiness (Weeks 17-20)

Performance optimization, monitoring, and documentation.

Key deliverables:
- Caching layer
- Performance benchmarks
- Monitoring dashboards
- Runbooks for operations
- Compliance documentation

## Confidence Assessment

| Component | Confidence | Notes |
|-----------|------------|-------|
| RLS Architecture | HIGH | Standard PostgreSQL pattern, well-documented |
| pgvector + RLS | MEDIUM | Requires testing with production data volumes |
| Audit Triggers | HIGH | Proven pattern, cryptographic chaining recommended |
| PHI Prevention | MEDIUM | Patterns standard, tuning needed for false positives |
| Streaming API | HIGH | Standard pattern, OpenAI API well-supported |
| Session Management | HIGH | HIPAA requirements well-documented |
| Clinical Safety Prompts | MEDIUM | Domain expertise needed for prompt refinement |
| Performance Optimization | MEDIUM | Benchmark testing required with production scale |

## Open Questions Requiring Phase-Specific Research

1. **IVFFlat Index Tuning**: Optimal `lists` and `probes` parameters depend on data volume and query patterns. Requires benchmarking with production-scale data.

2. **Citation Accuracy**: The optimal method for extracting and formatting citations from LLM responses needs experimentation. Current approaches include structured output parsing, function calling, and post-processing extraction.

3. **Clinical Prompt Engineering**: System prompts should be validated with clinical professionals before production deployment to ensure accuracy and appropriateness.

4. **Audit Log Retention**: HIPAA requires 6-year retention, but practical implementation (archival, compression, access controls) needs policy definition.

5. **Emergency Access Procedures**: HIPAA requires break-glass procedures for emergencies. Design needed for: emergency access request, approval workflow, enhanced audit logging, access reviews.

## Sources

**Confidence Levels:**
- HIGH: Verified through official documentation or extensive production usage
- MEDIUM: Standard industry pattern with supporting references
- LOW: Based on general knowledge, requires verification

- PostgreSQL Row Level Security: https://www.postgresql.org/docs/current/ddl-rowsecurity.html [HIGH]
- pgvector Documentation: https://github.com/pgvector/pgvector [HIGH]
- HIPAA Security Rule: https://www.hhs.gov/hipaa/for-professionals/security/index.html [HIGH]
- OpenAI API Streaming: https://platform.openai.com/docs/api-reference/chat/streaming [HIGH]
- Clinical Decision Support Systems: Academic literature on CDS architecture patterns [MEDIUM]
- RAG Evaluation Methods: https://github.com/facebookresearch/RAG [MEDIUM]

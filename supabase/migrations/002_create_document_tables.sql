-- Migration: Create document and document_chunks tables
-- Phase 2: Document Management & RAG
-- Executed as migration #002 (after 001_auth_schema.sql)

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Create enum type for document status
DROP TYPE IF EXISTS document_status CASCADE;
CREATE TYPE document_status AS ENUM (
    'uploaded',    -- File uploaded, pending validation
    'validating',   -- File being validated for security
    'processing',   -- General processing
    'chunking',     -- Document being split into chunks
    'embedding',    -- Generating embeddings for chunks
    'storing',      -- Storing embeddings in pgvector
    'ready',        -- Document fully processed and searchable
    'error',        -- Processing failed
    'deleting'      -- Being deleted (soft delete with cleanup)
);

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
    -- Primary identifiers
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    
    -- File information
    name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_hash TEXT NOT NULL, -- SHA-256 hash for deduplication
    
    -- Processing status
    status document_status NOT NULL DEFAULT 'uploaded',
    
    -- Metadata stored as JSONB for flexibility
    metadata JSONB DEFAULT '{}',
    
    -- Versioning support
    version INTEGER NOT NULL DEFAULT 1,
    parent_version_id UUID, -- Links to previous version if this is an update
    
    -- Ownership and timestamps
    uploaded_by UUID NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    
    -- Error tracking
    error_message TEXT,
    
    -- Audit trail (links to audit_log table for compliance)
    audit_trail JSONB DEFAULT '[]'
);

-- Create indexes for documents table
CREATE INDEX IF NOT EXISTS idx_documents_org_id ON documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_documents_file_hash ON documents(file_hash);
CREATE INDEX IF NOT EXISTS idx_documents_parent_version ON documents(parent_version_id);
CREATE INDEX IF NOT EXISTS idx_documents_org_status ON documents(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_org_uploaded ON documents(organization_id, uploaded_at DESC);

-- Create document_chunks table
CREATE TABLE IF NOT EXISTS document_chunks (
    -- Primary identifiers
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL, -- Denormalized for RLS performance
    
    -- Chunk content and position
    chunk_index INTEGER NOT NULL, -- Position in document (0-based)
    content TEXT NOT NULL, -- Actual text content of chunk
    
    -- Vector embedding (1536 dimensions for text-embedding-3-small)
    content_vector vector(1536),
    
    -- Metadata for retrieval and display
    metadata JSONB DEFAULT '{}',
    
    -- Structural information
    token_count INTEGER,
    section_name TEXT, -- Clinical section (e.g., "Diagnosis", "Treatment Plan")
    page_number INTEGER, -- Page number in original document
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for document_chunks table
CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_org_id ON document_chunks(organization_id);
CREATE INDEX IF NOT EXISTS idx_chunks_chunk_index ON document_chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_chunks_created_at ON document_chunks(created_at);
CREATE INDEX IF NOT EXISTS idx_chunks_org_created ON document_chunks(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chunks_doc_section ON document_chunks(document_id, section_name);

-- Create HNSW index for vector similarity search (if pgvector supports it)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgvector') THEN
        CREATE INDEX IF NOT EXISTS idx_chunks_vector_hnsw
            ON document_chunks USING hnsw (content_vector vector_cosine_ops)
            WITH (m = 16, ef_construction = 64);
    END IF;
END $$;

-- Create IVFFlat index as fallback for vector search
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgvector') THEN
        CREATE INDEX IF NOT EXISTS idx_chunks_vector_ivfflat
            ON document_chunks USING ivfflat (content_vector vector_cosine_ops)
            WITH (lists = 100);
    END IF;
END $$;

-- Enable Row Level Security on documents
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies for documents
CREATE POLICY IF NOT EXISTS "Organizations can view their own documents"
    ON documents FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ));

CREATE POLICY IF NOT EXISTS "Organizations can insert their own documents"
    ON documents FOR INSERT
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ));

CREATE POLICY IF NOT EXISTS "Organizations can update their own documents"
    ON documents FOR UPDATE
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ));

CREATE POLICY IF NOT EXISTS "Organizations can delete their own documents"
    ON documents FOR DELETE
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
        )
        AND status NOT IN ('processing', 'chunking', 'embedding', 'storing')
    );

CREATE POLICY IF NOT EXISTS "Admins can access all documents"
    ON documents FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_id = documents.organization_id
            AND user_id = auth.uid()
            AND role IN ('admin', 'owner')
        )
    );

-- Enable Row Level Security on document_chunks
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for document_chunks
CREATE POLICY IF NOT EXISTS "Organizations can view their own document chunks"
    ON document_chunks FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ));

CREATE POLICY IF NOT EXISTS "System can insert document chunks"
    ON document_chunks FOR INSERT
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ));

CREATE POLICY IF NOT EXISTS "Organizations can update their own document chunks"
    ON document_chunks FOR UPDATE
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ));

CREATE POLICY IF NOT EXISTS "Delete only through document cascade"
    ON document_chunks FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM documents
            WHERE id = document_chunks.document_id
            AND organization_id IN (
                SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY IF NOT EXISTS "Admins can access all document chunks"
    ON document_chunks FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_id = document_chunks.organization_id
            AND user_id = auth.uid()
            AND role IN ('admin', 'owner')
        )
    );

-- Create function to sync organization_id from documents to chunks
CREATE OR REPLACE FUNCTION sync_chunk_organization()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE document_chunks
    SET organization_id = NEW.organization_id
    WHERE document_id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to keep chunk organization_id in sync
DROP TRIGGER IF EXISTS sync_chunk_org ON documents;
CREATE TRIGGER sync_chunk_org
    AFTER UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION sync_chunk_organization();

-- Add comments for documentation
COMMENT ON TABLE documents IS 'Healthcare document metadata with HIPAA-compliant org scoping';
COMMENT ON TABLE document_chunks IS 'Document chunks with vector embeddings for RAG';
COMMENT ON TYPE document_status IS 'Processing status through upload → ready pipeline';

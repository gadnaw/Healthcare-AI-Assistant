-- Document chunks table for RAG pipeline
-- Stores text chunks with vector embeddings for similarity search

-- Drop existing table if exists (for development)
DROP TABLE IF EXISTS document_chunks CASCADE;

-- Create document chunks table
CREATE TABLE document_chunks (
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

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Indexes for document_id lookups (common in chunk retrieval)
CREATE INDEX idx_chunks_document_id ON document_chunks(document_id);
CREATE INDEX idx_chunks_org_id ON document_chunks(organization_id);
CREATE INDEX idx_chunks_chunk_index ON document_chunks(document_id, chunk_index);
CREATE INDEX idx_chunks_created_at ON document_chunks(created_at);

-- HNSW index for fast vector similarity search (primary index)
-- Using pgvector's HNSW indexing for cosine similarity
CREATE INDEX idx_chunks_vector_hnsw
    ON document_chunks USING hnsw (content_vector vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- IVFFlat index as fallback for large datasets
-- This provides good recall with lower memory usage
CREATE INDEX idx_chunks_vector_ivfflat
    ON document_chunks USING ivfflat (content_vector vector_cosine_ops)
    WITH (lists = 100);

-- Composite indexes for common query patterns
CREATE INDEX idx_chunks_org_created ON document_chunks(organization_id, created_at DESC);
CREATE INDEX idx_chunks_doc_section ON document_chunks(document_id, section_name);

-- Row Level Security (RLS) for HIPAA compliance
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Organizations can only see chunks from their documents
CREATE POLICY "Organizations can view their own document chunks"
    ON document_chunks FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ));

-- System can insert chunks (triggered during document processing)
CREATE POLICY "System can insert document chunks"
    ON document_chunks FOR INSERT
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ));

-- Organizations can update their own chunks (metadata updates, re-embedding)
CREATE POLICY "Organizations can update their own document chunks"
    ON document_chunks FOR UPDATE
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ));

-- Delete allowed only through document deletion (cascade)
-- This prevents orphaned chunks and ensures consistency
CREATE POLICY "Delete only through document cascade"
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

-- Admin role can access all chunks
CREATE POLICY "Admins can access all document chunks"
    ON document_chunks FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_id = document_chunks.organization_id
            AND user_id = auth.uid()
            AND role IN ('admin', 'owner')
        )
    );

-- Comments for documentation
COMMENT ON TABLE document_chunks IS 'Document chunks with vector embeddings for RAG';
COMMENT ON COLUMN document_chunks.id IS 'Unique chunk identifier (UUID)';
COMMENT ON COLUMN document_chunks.document_id IS 'Parent document reference';
COMMENT ON COLUMN document_chunks.organization_id IS 'Organization owning this chunk (RLS enforced)';
COMMENT ON COLUMN document_chunks.chunk_index IS 'Position of chunk in document (0-based ordering)';
COMMENT ON COLUMN document_chunks.content IS 'Actual text content of the chunk';
COMMENT ON COLUMN document_chunks.content_vector IS 'OpenAI embedding vector (1536 dimensions)';
COMMENT ON COLUMN document_chunks.metadata IS 'JSON metadata (highlight positions, citations, etc.)';
COMMENT ON COLUMN document_chunks.token_count IS 'Token count for this chunk (max 512)';
COMMENT ON COLUMN document_chunks.section_name IS 'Clinical section name from document structure';
COMMENT ON COLUMN document_chunks.page_number IS 'Page number in original document for reference';

-- Function to update organization_id on document_chunks when document changes
CREATE OR REPLACE FUNCTION sync_chunk_organization()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE document_chunks
    SET organization_id = NEW.organization_id
    WHERE document_id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to keep chunk organization_id in sync
DROP TRIGGER IF EXISTS sync_chunk_org ON documents;
CREATE TRIGGER sync_chunk_org
    AFTER UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION sync_chunk_organization();

-- Documents table for healthcare AI assistant
-- Stores document metadata with organization scoping for HIPAA compliance

-- Drop existing table if exists (for development)
DROP TABLE IF EXISTS documents CASCADE;

-- Create document status enum type
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

-- Create documents table with all required columns
CREATE TABLE documents (
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

-- Indexes for common query patterns
CREATE INDEX idx_documents_org_id ON documents(organization_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_uploaded_at ON documents(uploaded_at);
CREATE INDEX idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX idx_documents_file_hash ON documents(file_hash);
CREATE INDEX idx_documents_parent_version ON documents(parent_version_id);

-- Composite indexes for common queries
CREATE INDEX idx_documents_org_status ON documents(organization_id, status);
CREATE INDEX idx_documents_org_uploaded ON documents(organization_id, uploaded_at DESC);

-- Row Level Security (RLS) for HIPAA compliance
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Organizations can only see their own documents
CREATE POLICY "Organizations can view their own documents"
    ON documents FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ));

-- Organizations can insert their own documents
CREATE POLICY "Organizations can insert their own documents"
    ON documents FOR INSERT
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ));

-- Organizations can update their own documents
CREATE POLICY "Organizations can update their own documents"
    ON documents FOR UPDATE
    USING (organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ));

-- Organizations can delete their own documents (only if status is not processing)
CREATE POLICY "Organizations can delete their own documents"
    ON documents FOR DELETE
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
        )
        AND status NOT IN ('processing', 'chunking', 'embedding', 'storing')
    );

-- Admin role can access all documents (for compliance and support)
CREATE POLICY "Admins can access all documents"
    ON documents FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_id = documents.organization_id
            AND user_id = auth.uid()
            AND role IN ('admin', 'owner')
        )
    );

-- Comments for documentation
COMMENT ON TABLE documents IS 'Healthcare document metadata with HIPAA-compliant org scoping';
COMMENT ON COLUMN documents.id IS 'Unique document identifier (UUID)';
COMMENT ON COLUMN documents.organization_id IS 'Organization owning this document (RLS enforced)';
COMMENT ON COLUMN documents.name IS 'Original filename';
COMMENT ON COLUMN documents.file_type IS 'MIME type or file extension (pdf, docx, txt)';
COMMENT ON COLUMN documents.file_size IS 'File size in bytes';
COMMENT ON COLUMN documents.file_hash IS 'SHA-256 hash for deduplication and integrity';
COMMENT ON COLUMN documents.status IS 'Processing status through upload → ready pipeline';
COMMENT ON COLUMN documents.metadata IS 'JSON metadata (source, author, clinical flags, etc.)';
COMMENT ON COLUMN documents.version IS 'Document version number for updates';
COMMENT ON COLUMN documents.parent_version_id IS 'Previous version this update replaced';
COMMENT ON COLUMN documents.uploaded_by IS 'User who uploaded the document';
COMMENT ON COLUMN documents.uploaded_at IS 'Timestamp of upload';
COMMENT ON COLUMN documents.processed_at IS 'Timestamp when processing completed';
COMMENT ON COLUMN documents.error_message IS 'Error details if status is error';
COMMENT ON COLUMN documents.audit_trail IS 'JSON array of audit events for compliance';

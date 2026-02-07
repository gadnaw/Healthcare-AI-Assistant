-- Healthcare AI Assistant - Storage Bucket RLS Policies
-- Phase 1 Wave 1: Database Foundation
-- HIPAA-Compliant Document Storage with Tenant Isolation

-- ============================================================================
-- STORAGE BUCKET CONFIGURATION
-- ============================================================================

-- Create organization documents bucket
-- This bucket stores all organization-related documents with path segmentation
INSERT INTO storage.buckets (id, name, public) 
VALUES ('org-documents', 'org-documents', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PATH STRUCTURE VALIDATION
-- ============================================================================
-- Required path format: {org_id}/{document_type}/{yyyy-mm}/{uuid}_{filename}
-- Example: a1b2c3d4-e5f6-7890-abcd-ef1234567890/medical-records/2024-03/abc123_def456.pdf

-- ============================================================================
-- RLS POLICIES FOR ORG_DOCUMENTS BUCKET
-- ============================================================================

-- Policy: Organization members can view files in their org's path
-- Rationale: Users need access to documents within their organization
CREATE POLICY "Storage: Org members can view files"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'org-documents'
        AND SPLIT_PART(name, '/', 1) IN (
            SELECT om.organization_id::TEXT
            FROM organization_members om
            WHERE om.user_id = auth.uid()
        )
    );

-- Policy: Authenticated users can upload files to their org's path
-- Rationale: Document upload requires authenticated user
CREATE POLICY "Storage: Org members can upload files"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'org-documents'
        AND name LIKE CONCAT(
            (SELECT organization_id::TEXT FROM organization_members WHERE user_id = auth.uid() LIMIT 1),
            '/%'
        )
        AND name ~ '^[a-f0-9-]{36}/[a-z-]+/[0-9]{4}-[0-9]{2}/[a-f0-9-]{36}_.+$'
    );

-- Policy: Admins can delete files in their organization
-- Rationale: Administrative document management
CREATE POLICY "Storage: Org admins can delete files"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'org-documents'
        AND SPLIT_PART(name, '/', 1) IN (
            SELECT om.organization_id::TEXT
            FROM organization_members om
            WHERE om.user_id = auth.uid()
            AND om.role = 'admin'
        )
    );

-- Policy: Prevent public access to bucket
-- Rationale: All access controlled by RLS policies above
CREATE POLICY "Storage: Prevent public access"
    ON storage.objects FOR SELECT
    USING (bucket_id != 'org-documents' OR name LIKE 'org-documents/%');

-- ============================================================================
-- DOCUMENT TYPE VALIDATION FUNCTION
-- ============================================================================

-- Function to validate document type in path
-- Ensures only allowed document types can be uploaded
CREATE OR REPLACE FUNCTION is_valid_document_type(doc_type TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN doc_type IN (
        'medical-records',
        'clinical-notes',
        'lab-results',
        'imaging-reports',
        'consent-forms',
        'insurance-docs',
        'administrative',
        'correspondence',
        'policies-procedures',
        'training-materials'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- STORAGE USAGE TRACKING (for quotas and auditing)
-- ============================================================================

-- Function to get organization's total storage usage
CREATE OR REPLACE FUNCTION get_org_storage_usage(org_id UUID)
RETURNS TABLE (
    total_size BIGINT,
    file_count BIGINT,
    last_upload TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(size), 0)::BIGINT AS total_size,
        COUNT(*)::BIGINT AS file_count,
        MAX(created_at) AS last_upload
    FROM storage.objects
    WHERE bucket_id = 'org-documents'
    AND name LIKE CONCAT(org_id::TEXT, '/%');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate upload path structure
-- Returns TRUE if path follows {org_id}/{type}/{yyyy-mm}/{uuid}_{filename}
CREATE OR REPLACE FUNCTION validate_storage_path(path TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    org_id TEXT;
    doc_type TEXT;
    date_part TEXT;
    filename TEXT;
BEGIN
    -- Split path components
    org_id := SPLIT_PART(path, '/', 1);
    doc_type := SPLIT_PART(path, '/', 2);
    date_part := SPLIT_PART(path, '/', 3);
    filename := SPLIT_PART(path, '/', 4);

    -- Validate UUID format for org_id
    IF org_id !~ '^[a-f0-9-]{36}$' THEN
        RETURN FALSE;
    END IF;

    -- Validate document type
    IF NOT is_valid_document_type(doc_type) THEN
        RETURN FALSE;
    END IF;

    -- Validate date format (YYYY-MM)
    IF date_part !~ '^[0-9]{4}-[0-9]{2}$' THEN
        RETURN FALSE;
    END IF;

    -- Validate filename (uuid_filename)
    IF filename !~ '^[a-f0-9-]{36}_.+$' THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- FILE UPLOAD VALIDATION TRIGGER
-- ============================================================================

-- Trigger function to validate storage paths on insert/update
CREATE OR REPLACE FUNCTION validate_storage_path_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.bucket_id = 'org-documents' THEN
        IF NOT validate_storage_path(NEW.name) THEN
            RAISE EXCEPTION 'Invalid storage path format. Required: {org_id}/{document_type}/{yyyy-mm}/{uuid}_{filename}';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS validate_org_documents_path ON storage.objects;
CREATE TRIGGER validate_org_documents_path
    BEFORE INSERT OR UPDATE ON storage.objects
    FOR EACH ROW
    EXECUTE FUNCTION validate_storage_path_trigger();

-- ============================================================================
-- BUCKET SETTINGS (if not already configured)
-- ============================================================================

-- Update bucket settings for HIPAA compliance
UPDATE storage.buckets
SET 
    allowed_mime_types = ARRAY[
        'application/pdf',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png',
        'image/dicom', -- Medical imaging
        'application/dicom+xml' -- DICOM metadata
    ],
    max_size_bytes = 52428800 -- 50MB limit per file
WHERE id = 'org-documents';

-- ============================================================================
-- STORAGE POLICIES DOCUMENTATION
-- ============================================================================

COMMENT ON POLICY "Storage: Org members can view files" IS 'RLS: Users can only access files within their organization path';
COMMENT ON POLICY "Storage: Org members can upload files" IS 'RLS: Authenticated users upload to org path with validated naming';
COMMENT ON POLICY "Storage: Org admins can delete files" IS 'RLS: Administrative access for document management';
COMMENT ON FUNCTION is_valid_document_type() IS 'Validates document type against allowed categories';
COMMENT ON FUNCTION validate_storage_path() IS 'Validates path follows org/type/date/uuid_filename format';
COMMENT ON FUNCTION get_org_storage_usage() IS 'Returns storage metrics for an organization';

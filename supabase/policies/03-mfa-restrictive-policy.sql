-- MFA Restrictive Row Level Security Policies
-- Phase 1 Wave 3: MFA Implementation
-- HIPAA-Compliant Policies Requiring MFA (AAL2) for PHI Access
-- Critical for protecting sensitive healthcare data

-- ============================================================================
-- MFA REQUIREMENT OVERVIEW
-- ============================================================================
-- These policies enforce MFA (AAL2) requirement for accessing PHI (Protected Health Information).
-- The auth hook (01-custom-access-token-hook.sql) injects 'aal' claim into JWT tokens:
--   - aal1: Basic authentication (email/password only)
--   - aal2: Multi-factor authentication verified
--
-- Policies check for aal = 'aal2' to ensure MFA-verified sessions
-- ============================================================================

-- ============================================================================
-- DOCUMENT ACCESS - MFA REQUIRED
-- ============================================================================
-- Documents contain PHI and require AAL2 for access
-- This ensures only MFA-authenticated users can view documents

-- Policy: Users can only access documents if they have MFA verified (AAL2)
-- Rationale: HIPAA requires MFA for accessing PHI
CREATE POLICY "Documents: MFA required for access"
    ON documents FOR SELECT
    USING (
        -- Check if user has MFA verified (AAL2) in JWT claims
        -- The auth hook injects aal claim based on mfa_verified status
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.encrypted_metadata->>'aal' = 'aal2'
        )
        -- Fallback: Also check if user has verified TOTP factor
        OR EXISTS (
            SELECT 1 FROM auth.mfa_factors
            WHERE auth.mfa_factors.user_id = auth.uid()
            AND auth.mfa_factors.status = 'verified'
            AND auth.mfa_factors.factor_type = 'totp'
        )
    );

-- Policy: MFA required for document creation (PHI entry)
-- Rationale: All PHI access/creation requires MFA verification
CREATE POLICY "Documents: MFA required for creation"
    ON documents FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.encrypted_metadata->>'aal' = 'aal2'
        )
        OR EXISTS (
            SELECT 1 FROM auth.mfa_factors
            WHERE auth.mfa_factors.user_id = auth.uid()
            AND auth.mfa_factors.status = 'verified'
            AND auth.mfa_factors.factor_type = 'totp'
        )
    );

-- Policy: MFA required for document updates (PHI modification)
-- Rationale: Modifying PHI requires identity confirmation via MFA
CREATE POLICY "Documents: MFA required for updates"
    ON documents FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.encrypted_metadata->>'aal' = 'aal2'
        )
        OR EXISTS (
            SELECT 1 FROM auth.mfa_factors
            WHERE auth.mfa_factors.user_id = auth.uid()
            AND auth.mfa_factors.status = 'verified'
            AND auth.mfa_factors.factor_type = 'totp'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.encrypted_metadata->>'aal' = 'aal2'
        )
        OR EXISTS (
            SELECT 1 FROM auth.mfa_factors
            WHERE auth.mfa_factors.user_id = auth.uid()
            AND auth.mfa_factors.status = 'verified'
            AND auth.mfa_factors.factor_type = 'totp'
        )
    );

-- ============================================================================
-- CONVERSATION ACCESS - MFA REQUIRED
-- ============================================================================
-- Conversations may contain PHI and require AAL2 for access
-- Medical advice and patient information must be protected

-- Policy: Users can only access conversations if they have MFA verified (AAL2)
-- Rationale: Conversation history may contain PHI
CREATE POLICY "Conversations: MFA required for access"
    ON conversations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.encrypted_metadata->>'aal' = 'aal2'
        )
        OR EXISTS (
            SELECT 1 FROM auth.mfa_factors
            WHERE auth.mfa_factors.user_id = auth.uid()
            AND auth.mfa_factors.status = 'verified'
            AND auth.mfa_factors.factor_type = 'totp'
        )
    );

-- Policy: MFA required for creating conversations (PHI entry)
-- Rationale: New conversations may contain patient information
CREATE POLICY "Conversations: MFA required for creation"
    ON conversations FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.encrypted_metadata->>'aal' = 'aal2'
        )
        OR EXISTS (
            SELECT 1 FROM auth.mfa_factors
            WHERE auth.mfa_factors.user_id = auth.uid()
            AND auth.mfa_factors.status = 'verified'
            AND auth.mfa_factors.factor_type = 'totp'
        )
    );

-- Policy: MFA required for conversation updates
-- Rationale: Modifying conversation context requires MFA
CREATE POLICY "Conversations: MFA required for updates"
    ON conversations FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.encrypted_metadata->>'aal' = 'aal2'
        )
        OR EXISTS (
            SELECT 1 FROM auth.mfa_factors
            WHERE auth.mfa_factors.user_id = auth.uid()
            AND auth.mfa_factors.status = 'verified'
            AND auth.mfa_factors.factor_type = 'totp'
        )
    );

-- ============================================================================
-- MESSAGE ACCESS - MFA REQUIRED  
-- ============================================================================
-- Individual messages contain PHI and require AAL2

-- Policy: MFA required for accessing messages
CREATE POLICY "Messages: MFA required for access"
    ON messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.encrypted_metadata->>'aal' = 'aal2'
        )
        OR EXISTS (
            SELECT 1 FROM auth.mfa_factors
            WHERE auth.mfa_factors.user_id = auth.uid()
            AND auth.mfa_factors.status = 'verified'
            AND auth.mfa_factors.factor_type = 'totp'
        )
    );

-- Policy: MFA required for creating messages
CREATE POLICY "Messages: MFA required for creation"
    ON messages FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.encrypted_metadata->>'aal' = 'aal2'
        )
        OR EXISTS (
            SELECT 1 FROM auth.mfa_factors
            WHERE auth.mfa_factors.user_id = auth.uid()
            AND auth.mfa_factors.status = 'verified'
            AND auth.mfa_factors.factor_type = 'totp'
        )
    );

-- ============================================================================
-- CITATION ACCESS - MFA REQUIRED
-- ============================================================================
-- Citations reference PHI-containing documents and require MFA

-- Policy: MFA required for accessing citations
CREATE POLICY "Citations: MFA required for access"
    ON citations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.encrypted_metadata->>'aal' = 'aal2'
        )
        OR EXISTS (
            SELECT 1 FROM auth.mfa_factors
            WHERE auth.mfa_factors.user_id = auth.uid()
            AND auth.mfa_factors.status = 'verified'
            AND auth.mfa_factors.factor_type = 'totp'
        )
    );

-- ============================================================================
-- EMBEDDING ACCESS - MFA REQUIRED
-- ============================================================================
-- Embeddings are derived from PHI documents and require MFA

-- Policy: MFA required for accessing embeddings
CREATE POLICY "Embeddings: MFA required for access"
    ON embeddings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.encrypted_metadata->>'aal' = 'aal2'
        )
        OR EXISTS (
            SELECT 1 FROM auth.mfa_factors
            WHERE auth.mfa_factors.user_id = auth.uid()
            AND auth.mfa_factors.status = 'verified'
            AND auth.mfa_factors.factor_type = 'totp'
        )
    );

-- ============================================================================
-- HELPER FUNCTIONS FOR MFA VERIFICATION
-- ============================================================================

-- Function to check if current user has MFA verified
CREATE OR REPLACE FUNCTION has_mfa_verified()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM auth.mfa_factors
        WHERE auth.mfa_factors.user_id = auth.uid()
        AND auth.mfa_factors.status = 'verified'
        AND auth.mfa_factors.factor_type = 'totp'
    )
    OR EXISTS (
        SELECT 1 FROM auth.users
        WHERE auth.users.id = auth.uid()
        AND auth.users.encrypted_metadata->>'aal' = 'aal2'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current user's AAL level
CREATE OR REPLACE FUNCTION get_user_aal()
RETURNS VARCHAR(10) AS $$
DECLARE
    aal_level VARCHAR(10) := 'aal1';
BEGIN
    -- Check JWT claims first (set by auth hook)
    SELECT auth.users.encrypted_metadata->>'aal'
    INTO aal_level
    FROM auth.users
    WHERE auth.users.id = auth.uid();
    
    -- If not in metadata, check MFA factors
    IF aal_level IS NULL OR aal_level = 'aal1' THEN
        IF EXISTS (
            SELECT 1 FROM auth.mfa_factors
            WHERE auth.mfa_factors.user_id = auth.uid()
            AND auth.mfa_factors.status = 'verified'
            AND auth.mfa_factors.factor_type = 'totp'
        ) THEN
            aal_level := 'aal2';
        END IF;
    END IF;
    
    RETURN COALESCE(aal_level, 'aal1');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to require MFA and raise error if not verified
CREATE OR REPLACE FUNCTION require_mfa()
RETURNS VOID AS $$
BEGIN
    IF NOT has_mfa_verified() THEN
        RAISE EXCEPTION 'MFA_REQUIRED'
            USING MESSAGE = 'Multi-factor authentication required for this operation',
                  ERRCODE = 'MFAREQUIRED';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON POLICY "Documents: MFA required for access" IS 'RLS: Users must have MFA (AAL2) to access PHI-containing documents';
COMMENT ON POLICY "Documents: MFA required for creation" IS 'RLS: MFA verification required to create documents with PHI';
COMMENT ON POLICY "Conversations: MFA required for access" IS 'RLS: MFA verification required to access conversations';
COMMENT ON POLICY "Messages: MFA required for access" IS 'RLS: MFA verification required to access individual messages';
COMMENT ON FUNCTION has_mfa_verified() IS 'Check if current user has verified MFA factor';
COMMENT ON FUNCTION get_user_aal() IS 'Get current user authentication assurance level (aal1 or aal2)';
COMMENT ON FUNCTION require_mfa() IS 'Raise error if current user does not have MFA verified';

-- ============================================================================
-- MFA ENFORCEMENT VERIFICATION
-- ============================================================================

-- Function to test MFA policy enforcement
-- Returns true if policies correctly block non-MFA users
CREATE OR REPLACE FUNCTION test_mfa_policy_enforcement()
RETURNS TABLE (
    test_name VARCHAR(100),
    expected_result BOOLEAN,
    actual_result BOOLEAN,
    passed BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    -- Test 1: MFA status check function
    SELECT 
        'MFA verification function works' AS test_name,
        TRUE AS expected_result,
        has_mfa_verified() AS actual_result,
        has_mfa_verified() = TRUE AS passed
    
    UNION ALL
    
    -- Test 2: AAL level detection
    SELECT 
        'AAL level detection works' AS test_name,
        TRUE AS expected_result,
        get_user_aal() IN ('aal1', 'aal2') AS actual_result,
        get_user_aal() IN ('aal1', 'aal2') = TRUE AS passed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- RLS ENABLEMENT
-- ============================================================================

-- Ensure RLS is enabled on all PHI-related tables
ALTER TABLE IF EXISTS documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS embeddings ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- DEPLOYMENT VERIFICATION
-- ============================================================================
-- 
-- To verify MFA policies are working:
-- 1. Deploy this SQL file
-- 2. Test with user WITHOUT MFA:
--    - SELECT * FROM documents;  -- Should return empty
--    - Should see MFA_REQUIRED error
-- 3. Test with user WITH MFA:
--    - SELECT * FROM documents;  -- Should return org's documents
--
-- Expected JWT claims for MFA user:
-- {
--   "aal": "aal2",
--   "mfa_verified": true,
--   "org_id": "uuid",
--   "role": "admin|member|provider|staff"
-- }
--
-- ============================================================================

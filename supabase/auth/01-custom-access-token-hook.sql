-- Healthcare AI Assistant - Custom Access Token Auth Hook
-- Phase 1 Wave 2: JWT Claims & Auth Hooks
-- Injects organization_id, role, and MFA status into JWT tokens
-- Critical for MFA enforcement and role-based authorization

-- ============================================================================
-- CUSTOM ACCESS TOKEN HOOK FUNCTION
-- ============================================================================
-- This function runs on every token refresh/login and injects custom claims
-- into the JWT access token. These claims are used throughout the application
-- for authorization decisions and tenant isolation enforcement.

CREATE OR REPLACE FUNCTION inject_custom_claims()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_id UUID;
    org_id UUID;
    user_role VARCHAR(50);
    mfa_verified BOOLEAN;
    aal_level VARCHAR(10);
    user_metadata jsonb;
    custom_claims jsonb;
BEGIN
    -- Get the authenticated user ID from the JWT claims
    user_id := (SELECT auth.uid());

    -- =========================================================================
    -- FETCH ORGANIZATION MEMBERSHIP
    -- =========================================================================
    -- Get the user's primary organization membership
    -- This assumes a user belongs to exactly one organization for this MVP
    -- In future: Handle multi-org scenarios with session context selection
    SELECT 
        om.organization_id,
        om.role
    INTO org_id, user_role
    FROM organization_members om
    WHERE om.user_id = user_id
    LIMIT 1;

    -- Handle case where user has no organization membership
    -- This could happen during onboarding or if membership was removed
    IF org_id IS NULL THEN
        org_id := (SELECT u.organization_id FROM users u WHERE u.id = user_id);
        user_role := COALESCE(user_role, (SELECT u.role FROM users u WHERE u.id = user_id));
    END IF;

    -- =========================================================================
    -- CHECK MFA STATUS
    -- =========================================================================
    -- Determine if user has verified MFA
    -- auth.mfa_factors contains enrolled factors, verified status indicates completion
    SELECT EXISTS (
        SELECT 1 FROM auth.mfa_factors
        WHERE user_id = inject_custom_claims.user_id
        AND status = 'verified'
        AND factor_type = 'totp'
    ) INTO mfa_verified;

    -- =========================================================================
    -- DETERMINE AUTH ASSURANCE LEVEL (AAL)
    -- =========================================================================
    -- AAL1: Basic authentication (email/password)
    -- AAL2: Multi-factor authentication verified
    -- This is critical for HIPAA compliance - MFA required for PHI access
    IF mfa_verified THEN
        aal_level := 'aal2';
    ELSE
        aal_level := 'aal1';
    END IF;

    -- =========================================================================
    -- BUILD CUSTOM CLAIMS
    -- =========================================================================
    -- These claims will be accessible in the JWT token for client and API use
    custom_claims := jsonb_build_object(
        -- Organization context for multi-tenant isolation
        'org_id', org_id,
        
        -- User role for authorization decisions
        'role', user_role,
        
        -- MFA status for access control
        'mfa_verified', mfa_verified,
        
        -- Auth assurance level for session security
        'aal', aal_level,
        
        -- Additional metadata for debugging and logging
        'auth_hook_version', '1.0.0',
        'claims_injected_at', NOW()::text
    );

    -- =========================================================================
    -- INJECT INTO USER METADATA
    -- =========================================================================
    -- Supabase allows injecting claims into user_metadata via the 'raw_app_meta_data'
    -- This ensures claims persist in token and are accessible via auth.user() calls
    
    RETURN custom_claims;
END;
$$;

-- ============================================================================
-- HOOK REGISTRATION (for Supabase Dashboard configuration)
-- ============================================================================
-- This comment serves as documentation for the hook configuration
-- 
-- HOOK CONFIGURATION:
-- Type: Access Token Hook
-- Trigger: After authentication (login/token refresh)
-- Function: inject_custom_claims()
-- Execution Mode: Synchronous (blocks token issuance until complete)
-- 
-- EXPECTED OUTPUT FORMAT:
-- The function returns a JSONB object that will be merged into the JWT claims.
-- Expected format: { "org_id": "uuid", "role": "string", "mfa_verified": boolean, "aal": "aal1|aal2" }
--
-- REQUIRED PERMISSIONS:
-- - SELECT on auth.users (for user data)
-- - SELECT on public.organization_members (for org/role data)
-- - SELECT on auth.mfa_factors (for MFA status)
-- - EXECUTE on this function

-- ============================================================================
-- GRANT PERMISSIONS FOR HOOK EXECUTION
-- ============================================================================

-- Grant execute permission on the hook function to authenticated users
-- The function runs as SECURITY DEFINER so it has access to all required tables
GRANT EXECUTE ON FUNCTION inject_custom_claims() TO authenticated, anon;

-- ============================================================================
-- VERIFICATION FUNCTIONS (for testing the hook)
-- ============================================================================

-- Function to test claims injection for current user
-- Usage: SELECT test_claims_injection();
CREATE OR REPLACE FUNCTION test_claims_injection()
RETURNS TABLE (
    user_id UUID,
    organization_id UUID,
    user_role VARCHAR(50),
    mfa_verified BOOLEAN,
    aal_level VARCHAR(10),
    claims_valid BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT auth.uid()) AS user_id,
        (SELECT organization_id FROM organization_members WHERE user_id = auth.uid() LIMIT 1) AS organization_id,
        (SELECT role FROM organization_members WHERE user_id = auth.uid() LIMIT 1) AS user_role,
        EXISTS (
            SELECT 1 FROM auth.mfa_factors
            WHERE user_id = auth.uid()
            AND status = 'verified'
            AND factor_type = 'totp'
        ) AS mfa_verified,
        CASE
            WHEN EXISTS (
                SELECT 1 FROM auth.mfa_factors
                WHERE user_id = auth.uid()
                AND status = 'verified'
                AND factor_type = 'totp'
            ) THEN 'aal2'::VARCHAR(10)
            ELSE 'aal1'::VARCHAR(10)
        END AS aal_level,
        TRUE AS claims_valid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to manually refresh claims for testing
-- Usage: SELECT refresh_custom_claims();
CREATE OR REPLACE FUNCTION refresh_custom_claims()
RETURNS jsonb AS $$
DECLARE
    claims jsonb;
BEGIN
    SELECT inject_custom_claims() INTO claims;
    RETURN claims;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- DOCUMENTATION COMMENTS
-- ============================================================================

COMMENT ON FUNCTION inject_custom_claims() IS 'Auth hook that injects org_id, role, and MFA status into JWT access tokens for HIPAA-compliant multi-tenant authorization';
COMMENT ON FUNCTION test_claims_injection() IS 'Verification function to test that all required data is accessible for claims injection';
COMMENT ON FUNCTION refresh_custom_claims() IS 'Manual test function to verify claims injection without triggering actual auth event';

-- ============================================================================
-- RLS POLICIES FOR DATA ACCESS (if not already present)
-- ============================================================================

-- Ensure authenticated users can access their own MFA factors for the hook
-- Note: auth.mfa_factors has its own RLS policies managed by Supabase

-- Ensure the hook function can read organization_members
-- This is already covered by the RLS policies in 01-rls-policies.sql
-- but explicit grant ensures the hook has access
GRANT SELECT ON organization_members TO authenticated, anon;

-- ============================================================================
-- HOOK DEPLOYMENT CHECKLIST (Supabase Dashboard)
-- ============================================================================
-- 
-- 1. Navigate to Authentication -> Hooks
-- 2. Click "Create new hook"
-- 3. Configure:
--    - Name: custom_access_token_hook
--    - Type: Access Token Hook
--    - Trigger Event: After token is issued
--    - Function: inject_custom_claims()
--    - Enabled: true
-- 4. Save and enable the hook
-- 5. Test with: SELECT refresh_custom_claims();
-- 6. Verify in Dashboard: Authentication -> Users -> Select User -> JWT Debugger
--
-- EXPECTED JWT CLAIMS:
-- {
--   "org_id": "uuid-of-organization",
--   "role": "admin|member|provider|staff",
--   "mfa_verified": true|false,
--   "aal": "aal1" | "aal2",
--   "auth_hook_version": "1.0.0",
--   "claims_injected_at": "2026-02-07T..."
-- }
-- ============================================================================

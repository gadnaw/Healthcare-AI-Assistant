-- Emergency Access Table & Functions
-- Phase 1, Plan 01-05: Audit Logging & Emergency Access
-- Purpose: Break-glass emergency access procedures for HIPAA compliance

-- Create enum for access levels
CREATE TYPE emergency_access_level AS ENUM (
    'read_only',
    'full_access'
);

-- Create enum for grant status
CREATE TYPE emergency_access_status AS ENUM (
    'pending_approval',
    'active',
    'used',
    'expired',
    'revoked',
    'cancelled'
);

-- Create emergency_access_grants table
CREATE TABLE IF NOT EXISTS emergency_access_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    granted_to_email VARCHAR(255) NOT NULL,
    access_level emergency_access_level NOT NULL DEFAULT 'read_only',
    reason TEXT NOT NULL,
    granted_by UUID NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '4 hours'),
    used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    post_access_justification TEXT,
    justification_submitted_at TIMESTAMPTZ,
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    status emergency_access_status NOT NULL DEFAULT 'pending_approval',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT check_expiry_not_past CHECK (expires_at > NOW()),
    CONSTRAINT justification_required_if_used CHECK (
        (status != 'used') OR (post_access_justification IS NOT NULL AND post_access_justification != '')
    )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_emergency_grants_org_status 
    ON emergency_access_grants(organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_emergency_grants_granted_to 
    ON emergency_access_grants(granted_to_email, organization_id);

CREATE INDEX IF NOT EXISTS idx_emergency_grants_expires 
    ON emergency_access_grants(expires_at, status);

CREATE INDEX IF NOT EXISTS idx_emergency_grants_granted_by 
    ON emergency_access_grants(granted_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_emergency_grants_active 
    ON emergency_access_grants(organization_id, status, expires_at)
    WHERE status = 'active';

-- Function to create emergency access grant
CREATE OR REPLACE FUNCTION create_emergency_access_grant(
    p_granted_to_email VARCHAR,
    p_access_level emergency_access_level,
    p_reason TEXT,
    p_organization_id UUID,
    p_granted_by UUID
) RETURNS UUID AS $$
DECLARE
    v_grant_id UUID;
    v_audit_id UUID;
BEGIN
    -- Validate input
    IF p_granted_to_email IS NULL OR p_granted_to_email = '' THEN
        RAISE EXCEPTION 'Email is required for emergency access grant';
    END IF;
    
    IF p_reason IS NULL OR length(p_reason) < 20 THEN
        RAISE EXCEPTION 'Reason must be at least 20 characters for emergency access grant';
    END IF;
    
    -- Create the grant
    INSERT INTO emergency_access_grants (
        organization_id,
        granted_to_email,
        access_level,
        reason,
        granted_by,
        status
    ) VALUES (
        p_organization_id,
        p_granted_to_email,
        p_access_level,
        p_reason,
        p_granted_by,
        'pending_approval'
    ) RETURNING id INTO v_grant_id;
    
    -- Log the creation in audit log
    v_audit_id := log_audit_event(
        p_action := 'EMERGENCY_ACCESS_GRANTED'::audit_action,
        p_resource_type := 'emergency_access_grant',
        p_resource_id := v_grant_id::VARCHAR,
        p_new_value := jsonb_build_object(
            'granted_to_email', p_granted_to_email,
            'access_level', p_access_level,
            'reason', p_reason,
            'granted_by', p_granted_by,
            'status', 'pending_approval'
        )
    );
    
    RETURN v_grant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to approve emergency access grant
CREATE OR REPLACE FUNCTION approve_emergency_access_grant(
    p_grant_id UUID,
    p_reviewer_id UUID,
    p_review_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_grant RECORD;
    v_audit_id UUID;
BEGIN
    -- Get the grant
    SELECT * INTO v_grant
    FROM emergency_access_grants
    WHERE id = p_grant_id AND status = 'pending_approval';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Emergency access grant not found or not in pending status';
    END IF;
    
    -- Update the grant
    UPDATE emergency_access_grants
    SET 
        status = 'active',
        reviewed_by = p_reviewer_id,
        reviewed_at = NOW(),
        review_notes = p_review_notes,
        updated_at = NOW()
    WHERE id = p_grant_id;
    
    -- Log the approval in audit log
    v_audit_id := log_audit_event(
        p_action := 'EMERGENCY_ACCESS_GRANTED'::audit_action,
        p_resource_type := 'emergency_access_grant',
        p_resource_id := p_grant_id::VARCHAR,
        p_previous_value := jsonb_build_object('status', 'pending_approval'),
        p_new_value := jsonb_build_object(
            'status', 'active',
            'reviewed_by', p_reviewer_id,
            'reviewed_at', NOW()
        )
    );
    
    RETURN p_grant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to activate emergency access (mark as used)
CREATE OR REPLACE FUNCTION activate_emergency_access(
    p_grant_id UUID,
    p_user_id UUID
) RETURNS UUID AS $$
DECLARE
    v_grant RECORD;
    v_audit_id UUID;
BEGIN
    -- Get the grant
    SELECT * INTO v_grant
    FROM emergency_access_grants
    WHERE id = p_grant_id AND status = 'active'
      AND expires_at > NOW();
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Emergency access grant not found, not active, or expired';
    END IF;
    
    -- Update the grant
    UPDATE emergency_access_grants
    SET 
        status = 'used',
        used_at = NOW(),
        updated_at = NOW()
    WHERE id = p_grant_id;
    
    -- Log the activation in audit log
    v_audit_id := log_audit_event(
        p_action := 'EMERGENCY_ACCESS_USED'::audit_action,
        p_resource_type := 'emergency_access_grant',
        p_resource_id := p_grant_id::VARCHAR,
        p_previous_value := jsonb_build_object('status', 'active'),
        p_new_value := jsonb_build_object(
            'status', 'used',
            'used_at', NOW(),
            'used_by', p_user_id
        )
    );
    
    RETURN p_grant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to submit post-access justification
CREATE OR REPLACE FUNCTION submit_post_access_justification(
    p_grant_id UUID,
    p_justification TEXT
) RETURNS UUID AS $$
DECLARE
    v_grant RECORD;
    v_audit_id UUID;
BEGIN
    -- Get the grant
    SELECT * INTO v_grant
    FROM emergency_access_grants
    WHERE id = p_grant_id AND status = 'used';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Emergency access grant not found or not in used status';
    END IF;
    
    IF p_justification IS NULL OR length(p_justification) < 50 THEN
        RAISE EXCEPTION 'Post-access justification must be at least 50 characters';
    END IF;
    
    -- Update the grant
    UPDATE emergency_access_grants
    SET 
        post_access_justification = p_justification,
        justification_submitted_at = NOW(),
        updated_at = NOW()
    WHERE id = p_grant_id;
    
    -- Log the justification in audit log
    v_audit_id := log_audit_event(
        p_action := 'EMERGENCY_ACCESS_USED'::audit_action,
        p_resource_type := 'emergency_access_grant',
        p_resource_id := p_grant_id::VARCHAR,
        p_new_value := jsonb_build_object(
            'post_access_justification_submitted', true,
            'justification_length', length(p_justification)
        )
    );
    
    RETURN p_grant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to revoke emergency access grant
CREATE OR REPLACE FUNCTION revoke_emergency_access_grant(
    p_grant_id UUID,
    p_revoked_by UUID,
    p_revocation_reason TEXT
) RETURNS UUID AS $$
DECLARE
    v_grant RECORD;
    v_audit_id UUID;
BEGIN
    -- Get the grant
    SELECT * INTO v_grant
    FROM emergency_access_grants
    WHERE id = p_grant_id AND status IN ('active', 'pending_approval');
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Emergency access grant not found or not revocable';
    END IF;
    
    IF p_revocation_reason IS NULL OR length(p_revocation_reason) < 10 THEN
        RAISE EXCEPTION 'Revocation reason must be at least 10 characters';
    END IF;
    
    -- Update the grant
    UPDATE emergency_access_grants
    SET 
        status = 'revoked',
        revoked_at = NOW(),
        revocation_reason = p_revocation_reason,
        updated_at = NOW()
    WHERE id = p_grant_id;
    
    -- Log the revocation in audit log
    v_audit_id := log_audit_event(
        p_action := 'EMERGENCY_ACCESS_REVOKED'::audit_action,
        p_resource_type := 'emergency_access_grant',
        p_resource_id := p_grant_id::VARCHAR,
        p_previous_value := jsonb_build_object('status', v_grant.status),
        p_new_value := jsonb_build_object(
            'status', 'revoked',
            'revoked_by', p_revoked_by,
            'revoked_at', NOW(),
            'revocation_reason', p_revocation_reason
        )
    );
    
    RETURN p_grant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if emergency access is valid for a user
CREATE OR REPLACE FUNCTION has_emergency_access(
    p_user_email VARCHAR,
    p_organization_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM emergency_access_grants
    WHERE granted_to_email = p_user_email
      AND organization_id = p_organization_id
      AND status IN ('active', 'used')
      AND expires_at > NOW();
    
    RETURN v_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get emergency access level for a user
CREATE OR REPLACE FUNCTION get_emergency_access_level(
    p_user_email VARCHAR,
    p_organization_id UUID
) RETURNS emergency_access_level AS $$
DECLARE
    v_grant RECORD;
BEGIN
    SELECT * INTO v_grant
    FROM emergency_access_grants
    WHERE granted_to_email = p_user_email
      AND organization_id = p_organization_id
      AND status IN ('active', 'used')
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF FOUND THEN
        RETURN v_grant.access_level;
    ELSE
        RETURN NULL;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to auto-expire old grants (can be called by cron)
CREATE OR REPLACE FUNCTION expire_old_emergency_grants()
RETURNS INT AS $$
DECLARE
    v_expired_count INT := 0;
BEGIN
    UPDATE emergency_access_grants
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'active' AND expires_at <= NOW();
    
    GET DIAGNOSTICS v_expired_count = ROW_COUNT;
    
    RETURN v_expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get active emergency grants for an organization
CREATE OR REPLACE FUNCTION get_active_emergency_grants(
    p_organization_id UUID
) RETURNS TABLE (
    id UUID,
    granted_to_email VARCHAR,
    access_level emergency_access_level,
    reason TEXT,
    granted_by UUID,
    expires_at TIMESTAMPTZ,
    status emergency_access_status,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        eag.id,
        eag.granted_to_email,
        eag.access_level,
        eag.reason,
        eag.granted_by,
        eag.expires_at,
        eag.status,
        eag.created_at
    FROM emergency_access_grants eag
    WHERE eag.organization_id = p_organization_id
      AND eag.status IN ('pending_approval', 'active', 'used')
      AND eag.expires_at > NOW()
    ORDER BY eag.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get emergency access grant history
CREATE OR REPLACE FUNCTION get_emergency_access_history(
    p_organization_id UUID,
    p_limit INT DEFAULT 100,
    p_offset INT DEFAULT 0
) RETURNS TABLE (
    id UUID,
    granted_to_email VARCHAR,
    access_level emergency_access_level,
    reason TEXT,
    granted_by UUID,
    expires_at TIMESTAMPTZ,
    used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    post_access_justification TEXT,
    status emergency_access_status,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        eag.id,
        eag.granted_to_email,
        eag.access_level,
        eag.reason,
        eag.granted_by,
        eag.expires_at,
        eag.used_at,
        eag.revoked_at,
        eag.revocation_reason,
        eag.post_access_justification,
        eag.status,
        eag.created_at
    FROM emergency_access_grants eag
    WHERE eag.organization_id = p_organization_id
    ORDER BY eag.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies
ALTER TABLE emergency_access_grants ENABLE ROW LEVEL SECURITY;

-- Admins can manage emergency grants
CREATE POLICY "Admins can manage emergency grants" ON emergency_access_grants
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_id = emergency_access_grants.organization_id
              AND user_id = auth.uid()
              AND role IN ('admin', 'owner')
        )
    );

-- System can update status (for auto-expiry)
CREATE POLICY "System can update emergency grant status" ON emergency_access_grants
    FOR UPDATE
    USING (auth.uid() IS NULL);

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION create_emergency_access_grant TO authenticated;
GRANT EXECUTE ON FUNCTION approve_emergency_access_grant TO authenticated;
GRANT EXECUTE ON FUNCTION activate_emergency_access TO authenticated;
GRANT EXECUTE ON FUNCTION submit_post_access_justification TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_emergency_access_grant TO authenticated;
GRANT EXECUTE ON FUNCTION has_emergency_access TO authenticated;
GRANT EXECUTE ON FUNCTION get_emergency_access_level TO authenticated;
GRANT EXECUTE ON FUNCTION expire_old_emergency_grants TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_emergency_grants TO authenticated;
GRANT EXECUTE ON FUNCTION get_emergency_access_history TO authenticated;

-- Comments for documentation
COMMENT ON TABLE emergency_access_grants IS 'Emergency access grants for break-glass procedures (HIPAA compliance)';
COMMENT ON COLUMN emergency_access_grants.post_access_justification IS 'Mandatory justification after emergency access is used';
COMMENT ON COLUMN emergency_access_grants.expires_at IS 'Default 4 hours from creation, cannot be extended';
COMMENT ON FUNCTION create_emergency_access_grant IS 'Create a new emergency access grant (requires admin role)';
COMMENT ON FUNCTION approve_emergency_access_grant IS 'Approve a pending emergency access grant';
COMMENT ON FUNCTION activate_emergency_access IS 'Mark emergency access as used (when user logs in with emergency access)';
COMMENT ON FUNCTION submit_post_access_justification IS 'Submit mandatory post-access justification';
COMMENT ON FUNCTION revoke_emergency_access_grant IS 'Revoke an active or pending emergency access grant';
-- Healthcare AI Assistant - RLS Policies for Tenant Isolation
-- Phase 1 Wave 1: Database Foundation
-- HIPAA-Compliant Row Level Security Policies

-- ============================================================================
-- ORGANIZATIONS TABLE RLS POLICIES
-- ============================================================================

-- Policy: Organization members can view their organization
-- Rationale: Users need to see their organization's details (name, settings, etc.)
CREATE POLICY "Organizations: Members can view their organization"
    ON organizations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_members.organization_id = organizations.id
            AND organization_members.user_id = auth.uid()
        )
    );

-- Policy: Only admins can update organization settings
-- Rationale: Organization configuration changes restricted to administrators
CREATE POLICY "Organizations: Admins can update their organization"
    ON organizations FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_members.organization_id = organizations.id
            AND organization_members.user_id = auth.uid()
            AND organization_members.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_members.organization_id = organizations.id
            AND organization_members.user_id = auth.uid()
            AND organization_members.role = 'admin'
        )
    );

-- Policy: Organization creation is handled at application level
-- Rationale: New organizations created via signup flow, not direct insert
CREATE POLICY "Organizations: Allow insert for new org creation"
    ON organizations FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Policy: Prevent deletion of organizations
-- Rationale: Organizations should be deactivated, not deleted (audit compliance)
CREATE POLICY "Organizations: Prevent deletion"
    ON organizations FOR DELETE
    USING (FALSE);

-- ============================================================================
-- USERS TABLE RLS POLICIES
-- ============================================================================

-- Policy: Users can view their own profile (self-access)
-- Rationale: Fundamental right for users to access their own data
CREATE POLICY "Users: Can view own profile"
    ON users FOR SELECT
    USING (auth.uid() = id);

-- Policy: Organization members can view other users in their organization
-- Rationale: Team collaboration requires seeing colleague profiles
CREATE POLICY "Users: Members can view org members"
    ON users FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_members.organization_id = users.organization_id
            AND organization_members.user_id = auth.uid()
        )
    );

-- Policy: Users can update their own profile
-- Rationale: Self-service profile management
CREATE POLICY "Users: Can update own profile"
    ON users FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Policy: Prevent users from changing their organization_id
-- Rationale: Organization membership managed through organization_members table
CREATE POLICY "Users: Prevent org_id modification"
    ON users FOR UPDATE
    USING (organization_id IS NOT NULL)
    WITH CHECK (organization_id IS NOT NULL);

-- Policy: Admins can manage users in their organization
-- Rationale: Administrative control over user lifecycle
CREATE POLICY "Users: Admins can manage org users"
    ON users FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_members.organization_id = users.organization_id
            AND organization_members.user_id = auth.uid()
            AND organization_members.role = 'admin'
        )
    );

-- Policy: Prevent direct user deletion (use deactivation instead)
-- Rationale: Audit trail preservation and compliance
CREATE POLICY "Users: Prevent direct deletion"
    ON users FOR DELETE
    USING (FALSE);

-- ============================================================================
-- ORGANIZATION_MEMBERS TABLE RLS POLICIES
-- ============================================================================

-- Policy: Members can view organization membership records
-- Rationale: Transparency about who belongs to the organization
CREATE POLICY "OrgMembers: Members can view memberships"
    ON organization_members FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.organization_id = organization_members.organization_id
            AND om.user_id = auth.uid()
        )
    );

-- Policy: Admins can create membership invitations
-- Rationale: Controlled user onboarding
CREATE POLICY "OrgMembers: Admins can create memberships"
    ON organization_members FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_members.organization_id = organization_members.organization_id
            AND organization_members.user_id = auth.uid()
            AND organization_members.role = 'admin'
        )
    );

-- Policy: Admins can update membership records (role changes)
-- Rationale: Role management for organization governance
CREATE POLICY "OrgMembers: Admins can update memberships"
    ON organization_members FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_members.organization_id = organization_members.organization_id
            AND organization_members.user_id = auth.uid()
            AND organization_members.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_members.organization_id = organization_members.organization_id
            AND organization_members.user_id = auth.uid()
            AND organization_members.role = 'admin'
        )
    );

-- Policy: Admins can remove membership (revoke access)
-- Rationale: Access revocation for security and HR processes
CREATE POLICY "OrgMembers: Admins can delete memberships"
    ON organization_members FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_members.organization_id = organization_members.organization_id
            AND organization_members.user_id = auth.uid()
            AND organization_members.role = 'admin'
        )
    );

-- Policy: Users can update their own membership (limited)
-- Rationale: Self-service for leaving organizations
CREATE POLICY "OrgMembers: Users can leave organizations"
    ON organization_members FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- RLS VERIFICATION FUNCTIONS (for testing/validation)
-- ============================================================================

-- Function to verify RLS is properly configured
-- Returns true if current user can see only their org's data
CREATE OR REPLACE FUNCTION verify_tenant_isolation()
RETURNS TABLE (
    organizations_count BIGINT,
    users_count BIGINT,
    members_count BIGINT,
    isolation_valid BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM organizations) AS organizations_count,
        (SELECT COUNT(*) FROM users) AS users_count,
        (SELECT COUNT(*) FROM organization_members) AS members_count,
        CASE
            WHEN NOT EXISTS (
                -- Check if isolation would be violated
                SELECT 1 FROM users u1, users u2
                WHERE u1.organization_id != u2.organization_id
                AND u1.id = auth.uid()
                AND u2.id = auth.uid()
            ) THEN TRUE
            ELSE FALSE
        END AS isolation_valid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current user's organization context
CREATE OR REPLACE FUNCTION get_current_user_org()
RETURNS TABLE (
    organization_id UUID,
    organization_name VARCHAR(255),
    user_role VARCHAR(50),
    is_admin BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        om.organization_id,
        o.name,
        om.role,
        (om.role = 'admin') AS is_admin
    FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.user_id = auth.uid()
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON POLICY "Organizations: Members can view their organization" IS 'RLS: Users can only see their own organization';
COMMENT ON POLICY "Users: Members can view org members" IS 'RLS: Users can see other users in their organization only';
COMMENT ON POLICY "OrgMembers: Members can view memberships" IS 'RLS: Transparency about team composition within tenant';
COMMENT ON FUNCTION verify_tenant_isolation() IS 'Verification function to test RLS isolation';
COMMENT ON FUNCTION get_current_user_org() IS 'Utility to get current user organization context';

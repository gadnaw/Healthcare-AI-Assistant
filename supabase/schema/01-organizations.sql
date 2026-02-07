-- Healthcare AI Assistant - Multi-tenant Organization Schema
-- Phase 1 Wave 1: Database Foundation
-- HIPAA-Compliant Multi-tenant Schema with RLS

-- Organizations table: Core tenant entity
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255), -- Optional: for auto-association via email domain
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table: Organization-scoped users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member', -- member, admin, super_admin
    profile JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization_members junction table: Many-to-many relationship with roles
CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member', -- admin, provider, staff
    permissions JSONB DEFAULT '{}'::jsonb,
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    invited_by UUID REFERENCES users(id),
    UNIQUE(user_id, organization_id)
);

-- Performance indexes for common queries
CREATE INDEX IF NOT EXISTS idx_organizations_domain ON organizations(domain);
CREATE INDEX IF NOT EXISTS idx_users_organization ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_organization_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_org ON organization_members(organization_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- Organizations RLS: All authenticated users can view their organization
CREATE POLICY "Organization members can view their organization"
    ON organizations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_members.organization_id = organizations.id
            AND organization_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Admins can update their organization"
    ON organizations FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_members.organization_id = organizations.id
            AND organization_members.user_id = auth.uid()
            AND organization_members.role = 'admin'
        )
    );

CREATE POLICY "Users can insert into their organization"
    ON organizations FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL -- Handled by app-level logic
    );

-- Users RLS: Self-access and org-scoped access
CREATE POLICY "Users can view their own profile"
    ON users FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Organization members can view other users in their org"
    ON users FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_members.organization_id = users.organization_id
            AND organization_members.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own profile"
    ON users FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can manage users in their organization"
    ON users FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_members.organization_id = users.organization_id
            AND organization_members.user_id = auth.uid()
            AND organization_members.role = 'admin'
        )
    );

-- Organization_members RLS: Role-based access
CREATE POLICY "Members can view organization memberships"
    ON organization_members FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.organization_id = organization_members.organization_id
            AND om.user_id = auth.uid()
        )
    );

CREATE POLICY "Admins can manage organization memberships"
    ON organization_members FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_members.organization_id = organization_members.organization_id
            AND organization_members.user_id = auth.uid()
            AND organization_members.role = 'admin'
        )
    );

-- Comments for documentation
COMMENT ON TABLE organizations IS 'Multi-tenant organizations for HIPAA-compliant data isolation';
COMMENT ON TABLE users IS 'Organization-scoped user accounts with profile data';
COMMENT ON TABLE organization_members IS 'Junction table linking users to organizations with role assignments';
COMMENT ON COLUMN organizations.settings IS 'Organization-specific configuration (MFA requirements, session timeouts, etc.)';
COMMENT ON COLUMN users.profile IS 'User profile data (name, avatar, preferences)';
COMMENT ON COLUMN organization_members.permissions IS 'Role-specific permissions override';

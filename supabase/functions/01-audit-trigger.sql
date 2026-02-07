-- Audit Trigger Function
-- Phase 1, Plan 01-05: Audit Logging & Emergency Access
-- Purpose: Automatic audit capture for INSERT/UPDATE/DELETE operations

-- Function to extract organization_id from target table
CREATE OR REPLACE FUNCTION get_organization_id_from_row(
    p_table_name VARCHAR,
    p_row JSONB
) RETURNS UUID AS $$
DECLARE
    v_org_id UUID;
BEGIN
    -- Check common organization_id column names
    IF p_row ? 'organization_id' THEN
        v_org_id := (p_row->>'organization_id')::UUID;
    ELSIF p_row ? 'org_id' THEN
        v_org_id := (p_row->>'org_id')::UUID;
    ELSIF p_row ? 'orgid' THEN
        v_org_id := (p_row->>'orgid')::UUID;
    ELSE
        -- Try to get from organization_members based on user_id
        -- This is a fallback for tables without direct org_id
        RAISE EXCEPTION 'No organization_id found in row for table %', p_table_name;
    END IF;
    
    RETURN v_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to extract user_id from JWT claims
CREATE OR REPLACE FUNCTION get_audit_user_id() RETURNS UUID AS $$
BEGIN
    -- Try to get user_id from JWT claims
    -- Supabase stores user_id in 'sub' claim
    RETURN NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
EXCEPTION
    WHEN OTHERS THEN
        -- Fallback: return NULL if no JWT
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to extract IP address from request
CREATE OR REPLACE FUNCTION get_audit_ip_address() RETURNS INET AS $$
DECLARE
    v_ip INET;
BEGIN
    -- Try to get IP from various headers
    -- Supabase proxy sets these headers
    v_ip := NULLIF(current_setting('request.headers', true)::JSONB->>'x-forwarded-for', '')::INET;
    
    IF v_ip IS NULL THEN
        v_ip := NULLIF(current_setting('request.headers', true)::JSONB->>'x-real-ip', '')::INET;
    END IF;
    
    RETURN v_ip;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to extract user agent from request
CREATE OR REPLACE FUNCTION get_audit_user_agent() RETURNS TEXT AS $$
BEGIN
    RETURN NULLIF(current_setting('request.headers', true)::JSONB->>'user-agent', '');
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to extract request_id from request
CREATE OR REPLACE FUNCTION get_audit_request_id() RETURNS UUID AS $$
DECLARE
    v_request_id TEXT;
BEGIN
    v_request_id := NULLIF(current_setting('request.headers', true)::JSONB->>'x-request-id', '');
    
    IF v_request_id IS NULL THEN
        v_request_id := NULLIF(current_setting('request.jwt.claim.request_id', true), '');
    END IF;
    
    IF v_request_id IS NULL THEN
        RETURN gen_random_uuid();
    END IF;
    
    RETURN v_request_id::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN gen_random_uuid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    v_organization_id UUID;
    v_user_id UUID;
    v_action audit_action;
    v_resource_type VARCHAR;
    v_resource_id VARCHAR;
    v_previous_value JSONB;
    v_new_value JSONB;
    v_ip_address INET;
    v_user_agent TEXT;
    v_request_id UUID;
    v_table_name VARCHAR;
    v_audit_id UUID;
BEGIN
    v_table_name := TG_TABLE_NAME;
    v_user_id := get_audit_user_id();
    v_ip_address := get_audit_ip_address();
    v_user_agent := get_audit_user_agent();
    v_request_id := get_audit_request_id();
    
    -- Determine operation type
    v_action := CASE TG_OP
        WHEN 'INSERT' THEN 'CREATE'::audit_action
        WHEN 'UPDATE' THEN 'UPDATE'::audit_action
        WHEN 'DELETE' THEN 'DELETE'::audit_action
        ELSE 'READ'::audit_action
    END;
    
    -- Get organization_id from the appropriate row
    IF TG_OP = 'DELETE' THEN
        v_organization_id := get_organization_id_from_row(v_table_name, to_jsonb(OLD));
        v_resource_id := OLD.id::VARCHAR;
        
        -- For DELETE, capture old values
        v_previous_value := to_jsonb(OLD);
        v_new_value := NULL;
    ELSE
        v_organization_id := get_organization_id_from_row(v_table_name, to_jsonb(NEW));
        v_resource_id := NEW.id::VARCHAR;
        
        -- For INSERT, capture new values
        -- For UPDATE, capture both old and new
        v_previous_value := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
        v_new_value := to_jsonb(NEW);
    END IF;
    
    -- Determine resource type (use table name)
    v_resource_type := v_table_name;
    
    -- Insert audit log entry
    v_audit_id := insert_audit_log_entry(
        p_organization_id := v_organization_id,
        p_user_id := v_user_id,
        p_action := v_action,
        p_resource_type := v_resource_type,
        p_resource_id := v_resource_id,
        p_previous_value := v_previous_value,
        p_new_value := v_new_value,
        p_ip_address := v_ip_address,
        p_user_agent := v_user_agent,
        p_request_id := v_request_id
    );
    
    -- Return appropriate row
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to create audit trigger for a table
CREATE OR REPLACE FUNCTION create_audit_trigger_for_table(
    p_table_name VARCHAR,
    p_organization_id_column VARCHAR DEFAULT 'organization_id'
) RETURNS VOID AS $$
DECLARE
    v_trigger_name VARCHAR;
    v_function_name VARCHAR;
BEGIN
    v_trigger_name := 'trg_audit_' || p_table_name;
    v_function_name := 'audit_trigger_function';
    
    -- Drop existing trigger if it exists
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', v_trigger_name, p_table_name);
    
    -- Create new trigger based on operation
    EXECUTE format('
        CREATE TRIGGER %I
        AFTER INSERT OR UPDATE OR DELETE ON %I
        FOR EACH ROW
        EXECUTE FUNCTION %I()
    ', v_trigger_name, p_table_name, v_function_name);
    
    -- Log the trigger creation
    RAISE NOTICE 'Audit trigger created: % on %', v_trigger_name, p_table_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to manually log an audit event (for actions not triggered by table changes)
CREATE OR REPLACE FUNCTION log_audit_event(
    p_action audit_action,
    p_resource_type VARCHAR,
    p_resource_id VARCHAR DEFAULT NULL,
    p_previous_value JSONB DEFAULT NULL,
    p_new_value JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_organization_id UUID;
    v_ip_address INET;
    v_user_agent TEXT;
    v_request_id UUID;
    v_audit_id UUID;
BEGIN
    v_user_id := get_audit_user_id();
    v_ip_address := get_audit_ip_address();
    v_user_agent := get_audit_user_agent();
    v_request_id := get_audit_request_id();
    
    -- Get organization_id from JWT claims
    -- Supabase stores org_id in custom claims
    v_organization_id := NULLIF(current_setting('request.jwt.claimorganization_id', true), '')::UUID;
    
    IF v_organization_id IS NULL THEN
        -- Fallback: get from organization_members
        SELECT om.organization_id INTO v_organization_id
        FROM organization_members om
        WHERE om.user_id = v_user_id
        LIMIT 1;
    END IF;
    
    IF v_organization_id IS NULL THEN
        RAISE EXCEPTION 'Cannot determine organization_id for audit log entry';
    END IF;
    
    -- Insert audit log entry
    v_audit_id := insert_audit_log_entry(
        p_organization_id := v_organization_id,
        p_user_id := v_user_id,
        p_action := p_action,
        p_resource_type := p_resource_type,
        p_resource_id := p_resource_id,
        p_previous_value := p_previous_value,
        p_new_value := p_new_value,
        p_ip_address := v_ip_address,
        p_user_agent := v_user_agent,
        p_request_id := v_request_id
    );
    
    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log session events specifically
CREATE OR REPLACE FUNCTION log_session_event(
    p_action audit_action,
    p_user_id UUID,
    p_organization_id UUID,
    p_resource_id VARCHAR DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_ip_address INET;
    v_user_agent TEXT;
    v_request_id UUID;
    v_audit_id UUID;
BEGIN
    v_ip_address := get_audit_ip_address();
    v_user_agent := get_audit_user_agent();
    v_request_id := get_audit_request_id();
    
    v_audit_id := insert_audit_log_entry(
        p_organization_id := p_organization_id,
        p_user_id := p_user_id,
        p_action := p_action,
        p_resource_type := 'session',
        p_resource_id := p_resource_id,
        p_ip_address := v_ip_address,
        p_user_agent := v_user_agent,
        p_request_id := v_request_id
    );
    
    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log authentication events specifically
CREATE OR REPLACE FUNCTION log_auth_event(
    p_action audit_action,
    p_user_id UUID DEFAULT NULL,
    p_organization_id UUID DEFAULT NULL,
    p_details JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_ip_address INET;
    v_user_agent TEXT;
    v_request_id UUID;
    v_audit_id UUID;
BEGIN
    v_ip_address := get_audit_ip_address();
    v_user_agent := get_audit_user_agent();
    v_request_id := get_audit_request_id();
    
    v_audit_id := insert_audit_log_entry(
        p_organization_id := COALESCE(p_organization_id, auth.get_organization_id()),
        p_user_id := p_user_id,
        p_action := p_action,
        p_resource_type := 'authentication',
        p_new_value := p_details,
        p_ip_address := v_ip_address,
        p_user_agent := v_user_agent,
        p_request_id := v_request_id
    );
    
    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION audit_trigger_function TO authenticated;
GRANT EXECUTE ON FUNCTION create_audit_trigger_for_table TO authenticated;
GRANT EXECUTE ON FUNCTION log_audit_event TO authenticated;
GRANT EXECUTE ON FUNCTION log_session_event TO authenticated;
GRANT EXECUTE ON FUNCTION log_auth_event TO authenticated;
GRANT EXECUTE ON FUNCTION get_organization_id_from_row TO authenticated;
GRANT EXECUTE ON FUNCTION get_audit_user_id TO authenticated;
GRANT EXECUTE ON FUNCTION get_audit_ip_address TO authenticated;
GRANT EXECUTE ON FUNCTION get_audit_user_agent TO authenticated;
GRANT EXECUTE ON FUNCTION get_audit_request_id TO authenticated;

-- Comments for documentation
COMMENT ON FUNCTION audit_trigger_function IS 'Generic audit trigger that captures INSERT/UPDATE/DELETE operations';
COMMENT ON FUNCTION create_audit_trigger_for_table IS 'Helper to create audit trigger for a specific table';
COMMENT ON FUNCTION log_audit_event IS 'Manually log audit events for actions not triggered by table changes';
COMMENT ON FUNCTION log_session_event IS 'Log session-related events (login, logout, timeout, etc.)';
COMMENT ON FUNCTION log_auth_event IS 'Log authentication events (MFA, password changes, etc.)';
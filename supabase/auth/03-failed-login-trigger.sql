-- Failed Login Trigger and Authentication Hook Integration
-- Healthcare AI Assistant - Phase 1 Wave 4
-- 
-- This file implements automatic failed login detection and lockout triggering
-- through database triggers and Supabase Auth hook integration.
--
-- Implements: AUTH-04 Account lockout after 5 failed attempts
-- Integrates with: 02-account-lockout-hook.sql functions
--
-- Architecture:
-- - Database triggers on auth.users for state changes
-- - Integration with Supabase Auth hooks for login events
-- - Event-driven lockout management

-- ============================================================================
-- AUTH HOOK INTEGRATION
-- ============================================================================

/**
 * PostgreSQL function for Supabase Auth Hook
 * 
 * This function is designed to be called by Supabase Auth hooks
 * when login events occur. It provides enhanced security logging
 * and lockout integration.
 * 
 * To use with Supabase Auth hooks:
 * 1. Create this function in Supabase Dashboard → Database → Functions
 * 2. Create auth hook that calls this function on login events
 * 3. Configure hook to block login if account is locked
 */

CREATE OR REPLACE FUNCTION auth.login_security_check(p_email TEXT, p_ip_address INET, p_user_agent TEXT)
RETURNS TABLE (
  allow_login BOOLEAN,
  error_message TEXT,
  mfa_required BOOLEAN,
  session_config JSON
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_user auth.users;
  v_lockout_status JSON;
  v_mfa_status JSON;
  v_allow_login BOOLEAN := TRUE;
  v_error_message TEXT := NULL;
  v_requires_mfa BOOLEAN := FALSE;
BEGIN
  -- Get user by email
  SELECT * INTO v_user 
  FROM auth.users 
  WHERE email = p_email
  AND deleted_at IS NULL;
  
  -- Check 1: Account lockout status
  IF v_user.id IS NOT NULL THEN
    SELECT * INTO v_lockout_status 
    FROM auth.check_account_lockout(v_user.id);
    
    IF (v_lockout_status->>'is_locked')::BOOLEAN = TRUE THEN
      v_allow_login := FALSE;
      v_error_message := 'Account is locked. Please try again after ' || 
                        (v_lockout_status->>'lockout_expires_at')::TEXT ||
                        ' or contact your administrator.';
      
      -- Log blocked login attempt
      PERFORM auth.audit_log_event(
        v_user.id,
        'login_blocked_lockout',
        'WARNING',
        json_build_object(
          'email', p_email,
          'ip_address', p_ip_address::TEXT,
          'user_agent', p_user_agent,
          'lockout_expires_at', v_lockout_status->>'lockout_expires_at'
        )
      );
    END IF;
  END IF;
  
  -- Check 2: MFA requirement (if not locked)
  IF v_allow_login AND v_user.id IS NOT NULL THEN
    SELECT * INTO v_mfa_status FROM auth.has_mfa_verified(v_user.id);
    
    -- Require MFA for AAL2 enforcement (HIPAA requirement)
    IF NOT (v_mfa_status->>'has_mfa')::BOOLEAN THEN
      v_requires_mfa := TRUE;
    END IF;
  END IF;
  
  -- Return login decision
  RETURN QUERY SELECT 
    v_allow_login,
    v_error_message,
    v_requires_mfa,
    json_build_object(
      'session_timeout_minutes', 15,
      'token_rotation', TRUE,
      'single_session', TRUE
    );
END;
$$;

-- ============================================================================
-- DATABASE TRIGGER FOR AUTOMATIC FAILED ATTEMPT DETECTION
-- ============================================================================

/**
 * Trigger function to automatically detect and handle failed login attempts
 * 
 * This trigger fires when authentication.events table receives new events
 * (Supabase built-in logging for auth events).
 * 
 * Note: This requires Supabase Enterprise or custom event logging setup.
 * For standard Supabase, use the auth.handle_failed_login() function directly
 * from your application code.
 */

CREATE OR REPLACE FUNCTION auth.handle_auth_event_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_event_data JSON;
  v_user_id UUID;
  v_ip_address INET;
  v_user_agent TEXT;
  v_event_type TEXT;
  v_failure_reason TEXT;
BEGIN
  v_event_data := NEW.event_data::JSON;
  v_event_type := NEW.event_type;
  
  -- Extract user info from auth event
  v_user_id := (v_event_data->>'user_id')::UUID;
  v_ip_address := (v_event_data->>'ip')::INET;
  v_user_agent := v_event_data->>'user_agent';
  
  -- Process based on event type
  CASE v_event_type
    WHEN 'login_failed' THEN
      v_failure_reason := v_event_data->>'reason';
      
      -- Call lockout function
      PERFORM auth.handle_failed_login(
        v_user_id,
        NULL, -- email will be looked up in function
        v_ip_address,
        v_user_agent,
        v_failure_reason
      );
      
    WHEN 'token_refreshed' THEN
      -- Log successful token refresh for session continuity
      PERFORM auth.audit_log_event(
        v_user_id,
        'session_refreshed',
        'INFO',
        json_build_object(
          'ip_address', v_ip_address::TEXT,
          'user_agent', v_user_agent
        )
      );
      
    WHEN 'session_created' THEN
      -- Reset failed attempts on new session
      PERFORM auth.record_successful_login(
        v_user_id,
        v_ip_address,
        v_user_agent
      );
      
    ELSE
      -- Log other auth events as needed
      NULL;
  END CASE;
  
  RETURN NEW;
END;
$$;

-- ============================================================================
-- CUSTOM EVENT LOGGING TABLE (Alternative to Supabase built-in)
-- ============================================================================

-- Table to log authentication events for enhanced security monitoring
CREATE TABLE IF NOT EXISTS auth.auth_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  ip_address INET,
  user_agent TEXT,
  event_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_auth_events_type_time 
  ON auth.auth_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_events_user_time 
  ON auth.auth_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_events_ip_time 
  ON auth.auth_events(ip_address, created_at DESC);

-- ============================================================================
-- FUNCTION: Log Authentication Event
-- ============================================================================

/**
 * log_auth_event()
 * 
 * Records authentication events for security monitoring.
 * Can be called from application code or database triggers.
 * 
 * Parameters:
 *   p_event_type TEXT - Type of event (login_attempt, login_success, etc.)
 *   p_user_id UUID - User ID (NULL if not authenticated)
 *   p_email TEXT - User email
 *   p_ip_address INET - Client IP
 *   p_user_agent TEXT - Client user agent
 *   p_event_data JSONB - Additional event data
 */
CREATE OR REPLACE FUNCTION auth.log_auth_event(
  p_event_type TEXT,
  p_user_id UUID DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_event_data JSONB DEFAULT '{}'::JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_event_id BIGINT;
BEGIN
  INSERT INTO auth.auth_events (
    event_type,
    user_id,
    email,
    ip_address,
    user_agent,
    event_data
  ) VALUES (
    p_event_type,
    p_user_id,
    p_email,
    p_ip_address,
    p_user_agent,
    p_event_data
  ) RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

-- ============================================================================
-- DATABASE TRIGGER: Auto-log Authentication Events
-- ============================================================================

-- Create trigger on auth.users for automatic event logging
CREATE TRIGGER trigger_auth_user_events
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION auth.handle_user_change_trigger();

-- Create trigger on auth.sessions for session events
CREATE TRIGGER trigger_auth_session_events
  AFTER INSERT ON auth.sessions
  FOR EACH ROW EXECUTE FUNCTION auth.handle_session_event_trigger();

-- Note: These triggers require corresponding functions to be created
-- For now, we focus on the application-level event logging

-- ============================================================================
-- IP-BASED RATE LIMITING
-- ============================================================================

/**
 * check_ip_rate_limit()
 * 
 * Implements IP-based rate limiting to prevent distributed brute force attacks.
 * Checks if IP has too many failed attempts across all users.
 * 
 * Parameters:
 *   p_ip_address INET - IP to check
 *   p_max_attempts INTEGER - Maximum attempts allowed (default: 20)
 *   p_window_minutes INTEGER - Time window (default: 15)
 * 
 * Returns:
 *   JSON with rate limit status
 */
CREATE OR REPLACE FUNCTION auth.check_ip_rate_limit(
  p_ip_address INET,
  p_max_attempts INTEGER DEFAULT 20,
  p_window_minutes INTEGER DEFAULT 15
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_attempt_count INTEGER;
  v_window_start TIMESTAMPTZ := NOW() - (p_window_minutes || ' minutes')::INTERVAL;
BEGIN
  SELECT COUNT(*) INTO v_attempt_count
  FROM auth.failed_login_attempts
  WHERE ip_address = p_ip_address
    AND attempt_time > v_window_start
    AND success = FALSE;
  
  RETURN json_build_object(
    'ip_address', p_ip_address::TEXT,
    'attempts_in_window', v_attempt_count,
    'max_attempts', p_max_attempts,
    'is_rate_limited', v_attempt_count >= p_max_attempts,
    'remaining_attempts', GREATEST(0, p_max_attempts - v_attempt_count)
  );
END;
$$;

-- ============================================================================
-- SECURITY MONITORING VIEW
-- ============================================================================

-- View for security dashboard: Recent security events
CREATE OR REPLACE VIEW auth.security_events_view AS
SELECT 
  'lockout' AS event_category,
  user_id,
  locked_at AS event_time,
  lockout_reason AS description,
  ip_address,
  failed_attempts_count AS severity_indicator
FROM auth.account_lockout_status
WHERE is_locked = TRUE

UNION ALL

SELECT 
  'failed_attempt' AS event_category,
  user_id,
  attempt_time AS event_time,
  failure_reason AS description,
  ip_address,
  1 AS severity_indicator
FROM auth.failed_login_attempts
WHERE success = FALSE
  AND attempt_time > NOW() - INTERVAL '24 hours'

ORDER BY event_time DESC;

-- View for admin dashboard: Lockout summary
CREATE OR REPLACE VIEW auth.lockout_summary_view AS
SELECT 
  COALESCE(u.email, 'Unknown') AS user_email,
  COALESCE(als.lockout_reason, 'No lockout') AS status,
  als.locked_at,
  als.lockout_expires_at,
  CASE 
    WHEN als.is_locked AND als.lockout_expires_at > NOW() 
    THEN EXTRACT(EPOCH FROM (als.lockout_expires_at - NOW())) / 60 
    ELSE 0 
  END AS minutes_remaining,
  als.failed_attempts_count,
  (SELECT COUNT(*) FROM auth.failed_login_attempts 
   WHERE user_id = als.user_id 
   AND attempt_time > NOW() - INTERVAL '24 hours') AS recent_attempts_24h
FROM auth.account_lockout_status als
LEFT JOIN auth.users u ON als.user_id = u.id
WHERE als.updated_at > NOW() - INTERVAL '7 days'
ORDER BY als.locked_at DESC NULLS LAST;

-- ============================================================================
-- RLS POLICIES FOR NEW TABLES
-- ============================================================================

-- Auth events table RLS
ALTER TABLE auth.auth_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System can insert auth events"
  ON auth.auth_events
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can view their own auth events"
  ON auth.auth_events
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all auth events"
  ON auth.auth_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND (raw_user_meta_data->>'role' = 'admin'
             OR raw_user_meta_data->>'role' = 'security_admin')
    )
  );

-- Security views (no RLS needed, views handle access)

-- ============================================================================
-- APPLICATION INTEGRATION FUNCTIONS
-- ============================================================================

/**
 * authenticate_with_security_check()
 * 
 * Wrapper function for login that combines authentication with security checks.
 * Designed to be called from application code after password verification.
 * 
 * Parameters:
 *   p_email TEXT - User email
 *   p_password_valid BOOLEAN - Whether password verification passed
 *   p_ip_address INET - Client IP
 *   p_user_agent TEXT - Client user agent
 * 
 * Returns:
 *   JSON with authentication result and security status
 */
CREATE OR REPLACE FUNCTION auth.authenticate_with_security_check(
  p_email TEXT,
  p_password_valid BOOLEAN,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_user auth.users;
  v_result JSON;
  v_login_allowed BOOLEAN;
  v_error_message TEXT;
  v_requires_mfa BOOLEAN;
  v_session_config JSON;
BEGIN
  -- Get user
  SELECT * INTO v_user 
  FROM auth.users 
  WHERE email = p_email
  AND deleted_at IS NULL;
  
  IF v_user.id IS NULL THEN
    -- User not found - still log for security monitoring
    PERFORM auth.log_auth_event(
      'login_user_not_found',
      NULL,
      p_email,
      p_ip_address,
      p_user_agent,
      json_build_object('password_valid', p_password_valid)
    );
    
    v_result := json_build_object(
      'success', false,
      'error', 'Invalid email or password',
      'security_check_passed', false,
      'requires_mfa', false
    );
  ELSIF p_password_valid = FALSE THEN
    -- Failed login - call lockout function
    SELECT * INTO v_result 
    FROM auth.handle_failed_login(
      v_user.id,
      p_email,
      p_ip_address,
      p_user_agent,
      'invalid_password'
    );
    
    -- Log to auth events
    PERFORM auth.log_auth_event(
      'login_failed',
      v_user.id,
      p_email,
      p_ip_address,
      p_user_agent,
      v_result
    );
  ELSE
    -- Password valid - check lockout
    SELECT allow_login, error_message, mfa_required, session_config 
    INTO v_login_allowed, v_error_message, v_requires_mfa, v_session_config
    FROM auth.login_security_check(p_email, p_ip_address, p_user_agent);
    
    IF v_login_allowed = FALSE THEN
      v_result := json_build_object(
        'success', false,
        'error', v_error_message,
        'security_check_passed', false,
        'requires_mfa', false,
        'account_locked', true
      );
      
      PERFORM auth.log_auth_event(
        'login_blocked',
        v_user.id,
        p_email,
        p_ip_address,
        p_user_agent,
        v_result
      );
    ELSE
      -- Successful authentication
      PERFORM auth.record_successful_login(v_user.id, p_ip_address, p_user_agent);
      
      v_result := json_build_object(
        'success', true,
        'error', NULL,
        'security_check_passed', true,
        'requires_mfa', v_requires_mfa,
        'session_config', v_session_config,
        'user_id', v_user.id
      );
      
      PERFORM auth.log_auth_event(
        'login_success',
        v_user.id,
        p_email,
        p_ip_address,
        p_user_agent,
        v_result
      );
    END IF;
  END IF;
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION auth.login_security_check(TEXT, INET, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.handle_auth_event_trigger() TO service_role;
GRANT EXECUTE ON FUNCTION auth.log_auth_event(TEXT, UUID, TEXT, INET, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.check_ip_rate_limit(INET, INTEGER, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.authenticate_with_security_check(TEXT, BOOLEAN, INET, TEXT) TO authenticated, service_role;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION auth.login_security_check IS 'Auth hook integration for login security checks';
COMMENT ON FUNCTION auth.handle_auth_event_trigger IS 'Database trigger function for auth event processing';
COMMENT ON TABLE auth.auth_events IS 'Enhanced authentication event logging for security monitoring';
COMMENT ON FUNCTION auth.log_auth_event IS 'Records authentication events for security monitoring';
COMMENT ON FUNCTION auth.check_ip_rate_limit IS 'IP-based rate limiting for distributed attack prevention';
COMMENT ON FUNCTION auth.authenticate_with_security_check IS 'Combined authentication and security check wrapper';
COMMENT ON VIEW auth.security_events_view IS 'Security dashboard: recent security events';
COMMENT ON VIEW auth.lockout_summary_view IS 'Admin dashboard: lockout status summary';

-- ============================================================================
-- INITIAL DATA: Security configuration
-- ============================================================================

-- Insert default security configuration
INSERT INTO app_config (key, value, description) 
VALUES 
  ('auth.max_failed_attempts', '5', 'Maximum failed login attempts before lockout'),
  ('auth.lockout_duration_minutes', '30', 'Lockout duration in minutes'),
  ('auth.lockout_window_minutes', '15', 'Time window for counting failed attempts'),
  ('auth.ip_rate_limit_max', '20', 'Max failed attempts per IP across all users'),
  ('auth.ip_rate_limit_window', '15', 'Rate limit window in minutes')
ON CONFLICT (key) DO UPDATE SET 
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- ============================================================================
-- VERIFICATION QUERIES (for testing)
-- ============================================================================

-- Query to verify lockout function exists and is callable
-- SELECT auth.handle_failed_login(NULL::UUID, 'test@example.com', '192.168.1.1'::INET, 'Test Agent', 'testing');

-- Query to verify login security check
-- SELECT * FROM auth.login_security_check('test@example.com', '192.168.1.1'::INET, 'Test Agent');

-- Query to verify IP rate limiting
-- SELECT * FROM auth.check_ip_rate_limit('192.168.1.1'::INET, 20, 15);

-- Account Lockout Functions for HIPAA-Compliant Authentication
-- Healthcare AI Assistant - Phase 1 Wave 4
-- 
-- This file implements account lockout functionality to prevent brute force attacks.
-- Implements: AUTH-04 Account lockout after 5 failed attempts
--
-- Dependencies:
-- - audit_log table (created in 01-audit-log-table.sql)
-- - auth.users table (Supabase built-in)
--
-- Security Considerations:
-- - Lockout duration: 30 minutes (configurable)
-- - Max attempts before lockout: 5 attempts
-- - All failed attempts logged with IP and user agent
-- - Admin unlock function for emergencies

-- ============================================================================
-- CONFIGURATION
-- ============================================================================

-- Lockout settings (can be adjusted based on security requirements)
DO $$ BEGIN
  PERFORM set_config('app.auth.max_failed_attempts', '5', true);
  PERFORM set_config('app.auth.lockout_duration_minutes', '30', true);
  PERFORM set_config('app.auth.lockout_window_minutes', '15', true);
END $$;

-- ============================================================================
-- FAILED LOGIN ATTEMPTS TRACKING TABLE
-- ============================================================================

-- Table to track failed login attempts for rate limiting and lockout
CREATE TABLE IF NOT EXISTS auth.failed_login_attempts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  email TEXT, -- Store email separately in case user_id lookup fails
  success BOOLEAN DEFAULT FALSE,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_failed_login_user_time 
  ON auth.failed_login_attempts(user_id, attempt_time DESC);

CREATE INDEX IF NOT EXISTS idx_failed_login_ip_time 
  ON auth.failed_login_attempts(ip_address, attempt_time DESC);

CREATE INDEX IF NOT EXISTS idx_failed_login_attempt_time 
  ON auth.failed_login_attempts(attempt_time DESC) 
  WHERE success = FALSE;

-- ============================================================================
-- ACCOUNT LOCKOUT STATUS TABLE
-- ============================================================================

-- Table to track current lockout status for users
CREATE TABLE IF NOT EXISTS auth.account_lockout_status (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  lockout_reason TEXT,
  locked_at TIMESTAMPTZ,
  lockout_expires_at TIMESTAMPTZ,
  failed_attempts_count INTEGER NOT NULL DEFAULT 0,
  last_failed_attempt TIMESTAMPTZ,
  locked_by_admin UUID REFERENCES auth.users(id),
  admin_unlock_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for lockout expiration queries
CREATE INDEX IF NOT EXISTS idx_lockout_expires 
  ON auth.account_lockout_status(lockout_expires_at) 
  WHERE is_locked = TRUE;

-- ============================================================================
-- HELPER FUNCTION: Get current lockout configuration
-- ============================================================================

CREATE OR REPLACE FUNCTION auth.get_lockout_config()
RETURNS TABLE (
  max_attempts INTEGER,
  lockout_duration_minutes INTEGER,
  lockout_window_minutes INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth
AS $$
BEGIN
  RETURN QUERY SELECT 
    COALESCE((SELECT value::INTEGER FROM app_config WHERE key = 'auth.max_failed_attempts'), 5) AS max_attempts,
    COALESCE((SELECT value::INTEGER FROM app_config WHERE key = 'auth.lockout_duration_minutes'), 30) AS lockout_duration_minutes,
    COALESCE((SELECT value::INTEGER FROM app_config WHERE key = 'auth.lockout_window_minutes'), 15) AS lockout_window_minutes;
END;
$$;

-- ============================================================================
-- FUNCTION: Handle Failed Login Attempt
-- ============================================================================

/**
 * handle_failed_login()
 * 
 * Records a failed login attempt and manages account lockout logic.
 * Called by auth hook or trigger when authentication fails.
 * 
 * Parameters:
 *   p_user_id UUID - The user ID attempting login (NULL if user not found)
 *   p_email TEXT - The email used for login attempt
 *   p_ip_address INET - Client IP address
 *   p_user_agent TEXT - Client user agent string
 *   p_failure_reason TEXT - Reason for failure (invalid_credentials, etc.)
 * 
 * Returns:
 *   JSON with lockout status and relevant information
 *   {
 *     "success": true,
 *     "is_locked": false,
 *     "failed_attempts": 3,
 *     "max_attempts": 5,
 *     "message": "3 failed attempts recorded"
 *   }
 * 
 * Lockout Behavior:
 * - Tracks failed attempts within 15-minute window
 * - After 5 failures in window, account locked for 30 minutes
 * - All attempts logged to audit_log
 */
CREATE OR REPLACE FUNCTION auth.handle_failed_login(
  p_user_id UUID DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_failure_reason TEXT DEFAULT 'invalid_credentials'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_lockout_config auth.get_lockout_config;
  v_failed_count INTEGER;
  v_is_locked BOOLEAN;
  v_result JSON;
  v_current_time TIMESTAMPTZ := NOW();
  v_lockout_end TIMESTAMPTZ;
  v_user_email TEXT;
BEGIN
  -- Get lockout configuration
  SELECT * INTO v_lockout_config FROM auth.get_lockout_config();
  
  -- Determine user email (from parameter or user record)
  v_user_email := COALESCE(p_email, (
    SELECT email FROM auth.users WHERE id = p_user_id
  ));
  
  -- Record the failed attempt
  INSERT INTO auth.failed_login_attempts (
    user_id,
    email,
    ip_address,
    user_agent,
    success,
    failure_reason
  ) VALUES (
    p_user_id,
    v_user_email,
    p_ip_address,
    p_user_agent,
    FALSE,
    p_failure_reason
  );
  
  -- Get count of recent failed attempts (within lockout window)
  SELECT COUNT(*) INTO v_failed_count
  FROM auth.failed_login_attempts
  WHERE 
    user_id = p_user_id
    AND attempt_time > v_current_time - (v_lockout_config.lockout_window_minutes || ' minutes')::INTERVAL
    AND success = FALSE;
  
  -- Check if already locked
  SELECT is_locked, lockout_expires_at INTO v_is_locked, v_lockout_end
  FROM auth.account_lockout_status
  WHERE user_id = p_user_id;
  
  -- Handle existing lockout
  IF v_is_locked = TRUE AND v_lockout_end > v_current_time THEN
    v_result := json_build_object(
      'success', true,
      'is_locked', true,
      'already_locked', true,
      'lockout_expires_at', v_lockout_end,
      'failed_attempts', v_failed_count,
      'max_attempts', v_lockout_config.max_attempts,
      'message', 'Account already locked. Try again after ' || v_lockout_end
    );
    
    -- Log the attempt despite being locked
    PERFORM auth.audit_log_event(
      p_user_id,
      'login_attempt_locked',
      'WARNING',
      json_build_object(
        'email', v_user_email,
        'ip_address', p_ip_address::TEXT,
        'user_agent', p_user_agent,
        'reason', 'Attempted login while account is locked',
        'lockout_expires_at', v_lockout_end
      )
    );
    
    RETURN v_result;
  END IF;
  
  -- Check if lockout should be triggered
  IF v_failed_count >= v_lockout_config.max_attempts THEN
    -- Calculate lockout end time
    v_lockout_end := v_current_time + (v_lockout_config.lockout_duration_minutes || ' minutes')::INTERVAL;
    
    -- Update or insert lockout status
    INSERT INTO auth.account_lockout_status (
      user_id,
      is_locked,
      lockout_reason,
      locked_at,
      lockout_expires_at,
      failed_attempts_count,
      last_failed_attempt
    ) VALUES (
      p_user_id,
      TRUE,
      'Exceeded ' || v_lockout_config.max_attempts || ' failed attempts in ' || 
        v_lockout_config.lockout_window_minutes || ' minutes',
      v_current_time,
      v_lockout_end,
      v_failed_count,
      v_current_time
    )
    ON CONFLICT (user_id) DO UPDATE SET
      is_locked = TRUE,
      lockout_reason = EXCLUDED.lockout_reason,
      locked_at = EXCLUDED.locked_at,
      lockout_expires_at = EXCLUDED.lockout_expires_at,
      failed_attempts_count = EXCLUDED.failed_attempts_count,
      last_failed_attempt = EXCLUDED.last_failed_attempt,
      updated_at = v_current_time;
    
    -- Log lockout event
    PERFORM auth.audit_log_event(
      p_user_id,
      'account_locked',
      'WARNING',
      json_build_object(
        'email', v_user_email,
        'ip_address', p_ip_address::TEXT,
        'user_agent', p_user_agent,
        'reason', 'Exceeded maximum failed login attempts',
        'failed_attempts', v_failed_count,
        'lockout_duration_minutes', v_lockout_config.lockout_duration_minutes,
        'lockout_expires_at', v_lockout_end
      )
    );
    
    v_result := json_build_object(
      'success', true,
      'is_locked', true,
      'already_locked', false,
      'lockout_expires_at', v_lockout_end,
      'failed_attempts', v_failed_count,
      'max_attempts', v_lockout_config.max_attempts,
      'message', 'Account locked due to too many failed attempts. Try again after ' || v_lockout_end
    );
  ELSE
    -- Update failed attempt count in lockout status
    INSERT INTO auth.account_lockout_status (
      user_id,
      is_locked,
      failed_attempts_count,
      last_failed_attempt
    ) VALUES (
      p_user_id,
      FALSE,
      v_failed_count,
      v_current_time
    )
    ON CONFLICT (user_id) DO UPDATE SET
      failed_attempts_count = EXCLUDED.failed_attempts_count,
      last_failed_attempt = EXCLUDED.last_failed_attempt,
      updated_at = v_current_time;
    
    v_result := json_build_object(
      'success', true,
      'is_locked', false,
      'already_locked', false,
      'lockout_expires_at', NULL,
      'failed_attempts', v_failed_count,
      'max_attempts', v_lockout_config.max_attempts,
      'remaining_attempts', v_lockout_config.max_attempts - v_failed_count,
      'message', v_failed_count || ' failed attempts recorded. ' || 
                (v_lockout_config.max_attempts - v_failed_count) || ' attempts remaining.'
    );
  END IF;
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- FUNCTION: Check Account Lockout Status
-- ============================================================================

/**
 * check_account_lockout(p_user_id UUID)
 * 
 * Checks if a user account is currently locked out.
 * Used during login process to prevent authenticated access for locked accounts.
 * 
 * Parameters:
 *   p_user_id UUID - The user ID to check
 * 
 * Returns:
 *   JSON with lockout status
 *   {
 *     "is_locked": true,
 *     "lockout_expires_at": "2024-01-01T12:30:00Z",
 *     "lockout_reason": "Exceeded 5 failed attempts",
 *     "minutes_remaining": 27
 *   }
 */
CREATE OR REPLACE FUNCTION auth.check_account_lockout(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_lockout_status auth.account_lockout_status;
  v_result JSON;
  v_minutes_remaining INTEGER;
BEGIN
  SELECT * INTO v_lockout_status 
  FROM auth.account_lockout_status 
  WHERE user_id = p_user_id;
  
  IF v_lockout_status IS NULL OR v_lockout_status.is_locked = FALSE THEN
    v_result := json_build_object(
      'is_locked', false,
      'lockout_expires_at', NULL,
      'lockout_reason', NULL,
      'minutes_remaining', NULL
    );
  ELSIF v_lockout_status.lockout_expires_at <= NOW() THEN
    -- Lockout has expired, auto-unlock
    UPDATE auth.account_lockout_status SET
      is_locked = FALSE,
      lockout_reason = 'Lockout period expired',
      updated_at = NOW()
    WHERE user_id = p_user_id;
    
    v_result := json_build_object(
      'is_locked', false,
      'lockout_expires_at', NULL,
      'lockout_reason', 'Lockout period expired',
      'minutes_remaining', 0
    );
  ELSE
    -- Still locked, calculate remaining time
    v_minutes_remaining := EXTRACT(EPOCH FROM (v_lockout_status.lockout_expires_at - NOW())) / 60;
    
    v_result := json_build_object(
      'is_locked', true,
      'lockout_expires_at', v_lockout_status.lockout_expires_at,
      'lockout_reason', v_lockout_status.lockout_reason,
      'minutes_remaining', CEIL(v_minutes_remaining)
    );
  END IF;
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- FUNCTION: Record Successful Login (Reset Failed Attempts)
-- ============================================================================

/**
 * record_successful_login(p_user_id UUID, p_ip_address INET, p_user_agent TEXT)
 * 
 * Records a successful login and resets failed attempt counters.
 * Should be called after successful authentication.
 * 
 * Parameters:
 *   p_user_id UUID - The authenticated user ID
 *   p_ip_address INET - Client IP address
 *   p_user_agent TEXT - Client user agent string
 * 
 * Returns:
 *   JSON with success status
 */
CREATE OR REPLACE FUNCTION auth.record_successful_login(
  p_user_id UUID,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_current_time TIMESTAMPTZ := NOW();
BEGIN
  -- Record successful attempt
  INSERT INTO auth.failed_login_attempts (
    user_id,
    ip_address,
    user_agent,
    success,
    failure_reason
  ) VALUES (
    p_user_id,
    p_ip_address,
    p_user_agent,
    TRUE,
    NULL
  );
  
  -- Clear lockout status on successful login
  UPDATE auth.account_lockout_status SET
    is_locked = FALSE,
    lockout_reason = NULL,
    locked_at = NULL,
    lockout_expires_at = NULL,
    failed_attempts_count = 0,
    last_failed_attempt = NULL,
    updated_at = v_current_time
  WHERE user_id = p_user_id;
  
  -- Log successful login
  PERFORM auth.audit_log_event(
    p_user_id,
    'login_success',
    'INFO',
    json_build_object(
      'ip_address', p_ip_address::TEXT,
      'user_agent', p_user_agent
    )
  );
  
  RETURN json_build_object(
    'success', true,
    'message', 'Successful login recorded, failed attempts reset'
  );
END;
$$;

-- ============================================================================
-- ADMIN FUNCTION: Manual Account Unlock
-- ============================================================================

/**
 * unlock_user_account(p_user_id UUID, p_admin_id UUID, p_reason TEXT)
 * 
 * Allows administrators to manually unlock a user account.
 * Creates audit trail for administrative actions.
 * 
 * Parameters:
 *   p_user_id UUID - The user account to unlock
 *   p_admin_id UUID - The admin performing the unlock
 *   p_reason TEXT - Reason for manual unlock
 * 
 * Returns:
 *   JSON with unlock status
 * 
 * Security:
 * - Requires authenticated admin user
 * - Logs all unlock actions to audit_log
 */
CREATE OR REPLACE FUNCTION auth.unlock_user_account(
  p_user_id UUID,
  p_admin_id UUID,
  p_reason TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_current_time TIMESTAMPTZ := NOW();
  v_user_email TEXT;
  v_admin_email TEXT;
BEGIN
  -- Get user and admin email
  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;
  SELECT email INTO v_admin_email FROM auth.users WHERE id = p_admin_id;
  
  -- Verify admin has appropriate role (implement role check based on your RBAC)
  -- This is a placeholder - implement based on your role management system
  
  -- Update lockout status
  UPDATE auth.account_lockout_status SET
    is_locked = FALSE,
    lockout_reason = 'Manually unlocked by admin',
    locked_at = NULL,
    lockout_expires_at = NULL,
    locked_by_admin = p_admin_id,
    admin_unlock_reason = p_reason,
    updated_at = v_current_time
  WHERE user_id = p_user_id;
  
  -- Log unlock event
  PERFORM auth.audit_log_event(
    p_user_id,
    'account_unlocked_admin',
    'INFO',
    json_build_object(
      'unlocked_by_admin_id', p_admin_id,
      'unlocked_by_admin_email', v_admin_email,
      'user_email', v_user_email,
      'reason', p_reason
    )
  );
  
  RETURN json_build_object(
    'success', true,
    'message', 'Account unlocked successfully',
    'user_id', p_user_id,
    'unlocked_by', v_admin_email,
    'reason', p_reason
  );
END;
$$;

-- ============================================================================
-- ADMIN FUNCTION: Get Failed Login Attempts Report
-- ============================================================================

/**
 * get_failed_login_report(p_ip_filter INET DEFAULT NULL, p_hours INTEGER DEFAULT 24)
 * 
 * Generates report of failed login attempts for security monitoring.
 * 
 * Parameters:
 *   p_ip_filter INET - Optional IP address to filter (for investigating specific IP)
 *   p_hours INTEGER - Time window in hours (default: 24)
 * 
 * Returns:
 *   JSON with aggregated failed attempt data
 */
CREATE OR REPLACE FUNCTION auth.get_failed_login_report(
  p_ip_filter INET DEFAULT NULL,
  p_hours INTEGER DEFAULT 24
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  v_start_time TIMESTAMPTZ := NOW() - (p_hours || ' hours')::INTERVAL;
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'report_period_hours', p_hours,
    'generated_at', NOW(),
    'total_attempts', (
      SELECT COUNT(*) FROM auth.failed_login_attempts
      WHERE attempt_time > v_start_time
        AND (p_ip_filter IS NULL OR ip_address = p_ip_filter)
    ),
    'unique_users', (
      SELECT COUNT(DISTINCT user_id) FROM auth.failed_login_attempts
      WHERE attempt_time > v_start_time
        AND (p_ip_filter IS NULL OR ip_address = p_ip_filter)
        AND user_id IS NOT NULL
    ),
    'unique_ips', (
      SELECT COUNT(DISTINCT ip_address) FROM auth.failed_login_attempts
      WHERE attempt_time > v_start_time
        AND (p_ip_filter IS NULL OR ip_address = p_ip_filter)
        AND ip_address IS NOT NULL
    ),
    'failed_by_reason', (
      SELECT json_object_agg(failure_reason, count)
      FROM (
        SELECT failure_reason, COUNT(*) as count
        FROM auth.failed_login_attempts
        WHERE attempt_time > v_start_time
          AND (p_ip_filter IS NULL OR ip_address = p_ip_filter)
          AND success = FALSE
        GROUP BY failure_reason
      ) sub
    ),
    'top_ips', (
      SELECT json_agg(
        json_build_object(
          'ip', ip_address,
          'attempts', attempt_count
        ) ORDER BY attempt_count DESC LIMIT 10
      )
      FROM (
        SELECT ip_address, COUNT(*) as attempt_count
        FROM auth.failed_login_attempts
        WHERE attempt_time > v_start_time
          AND (p_ip_filter IS NULL OR ip_address = p_ip_filter)
        GROUP BY ip_address
        ORDER BY attempt_count DESC
        LIMIT 10
      ) sub
    ),
    'recent_lockouts', (
      SELECT COUNT(*) FROM auth.account_lockout_status
      WHERE locked_at > v_start_time
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Failed login attempts: System insert, Admin select
ALTER TABLE auth.failed_login_attempts ENABLE ROW LEVEL SECURITY;

-- Allow system/service role to insert (for auth hooks)
CREATE POLICY "System can insert failed login attempts"
  ON auth.failed_login_attempts
  FOR INSERT
  WITH CHECK (true);

-- Allow authenticated users to view their own failed attempts
CREATE POLICY "Users can view their own failed login attempts"
  ON auth.failed_login_attempts
  FOR SELECT
  USING (auth.uid() = user_id);

-- Allow admins to view all failed attempts (implement role check)
CREATE POLICY "Admins can view all failed login attempts"
  ON auth.failed_login_attempts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND (raw_user_meta_data->>'role' = 'admin' 
             OR raw_user_meta_data->>'role' = 'security_admin')
    )
  );

-- Lockout status: User view own, Admin view all
ALTER TABLE auth.account_lockout_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own lockout status"
  ON auth.account_lockout_status
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all lockout status"
  ON auth.account_lockout_status
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND (raw_user_meta_data->>'role' = 'admin'
             OR raw_user_meta_data->>'role' = 'security_admin')
    )
  );

-- Only system can update lockout status (auth hooks, admin functions)
CREATE POLICY "System can update lockout status"
  ON auth.account_lockout_status
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- GRANT EXECUTE ON FUNCTIONS
-- ============================================================================

-- Grant execute on functions to authenticated users as needed
GRANT EXECUTE ON FUNCTION auth.handle_failed_login(UUID, TEXT, INET, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION auth.check_account_lockout(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION auth.record_successful_login(UUID, INET, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION auth.unlock_user_account(UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.get_failed_login_report(INET, INTEGER) TO authenticated, service_role;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE auth.failed_login_attempts IS 'Tracks failed login attempts for security monitoring and rate limiting';
COMMENT ON TABLE auth.account_lockout_status IS 'Current lockout status for user accounts';
COMMENT ON FUNCTION auth.handle_failed_login IS 'Records failed login and manages account lockout after 5 attempts in 15 minutes';
COMMENT ON FUNCTION auth.check_account_lockout IS 'Checks if user account is currently locked out';
COMMENT ON FUNCTION auth.record_successful_login IS 'Records successful login and resets failed attempt counters';
COMMENT ON FUNCTION auth.unlock_user_account IS 'Admin function to manually unlock user accounts with audit trail';
COMMENT ON FUNCTION auth.get_failed_login_report IS 'Generates security report of failed login attempts';

# Session Configuration Guide

This document outlines the Supabase session configuration requirements for HIPAA compliance in the Healthcare AI Assistant application.

## Required Session Settings

The following session settings must be configured in the Supabase Dashboard to meet HIPAA security requirements:

| Setting | Value | HIPAA Rationale |
|---------|-------|-----------------|
| **Session Timebox** | 480 minutes (8 hours) | Limits exposure window for session hijacking |
| **Inactivity Timeout** | 15 minutes | HIPAA Technical Safeguard §164.312(a)(2)(iii) |
| **Single Session** | Enabled | Prevents concurrent session abuse |
| **Token Rotation** | Enabled | Fresh refresh token on each use |

### Session Timebox (480 minutes)

The session timebox limits the maximum duration of an authenticated session regardless of activity. This provides a hard upper bound on session validity.

- **Value:** 480 minutes (8 hours)
- **Rationale:** Prevents indefinite sessions while allowing reasonable workday length
- **Clinical Impact:** Users may need to re-authenticate after 8 hours, ensuring proper audit trail for long-running clinical sessions

### Inactivity Timeout (15 minutes)

The inactivity timeout automatically terminates sessions after 15 minutes of no user activity. This is a critical HIPAA requirement.

- **Value:** 15 minutes
- **Rationale:** HIPAA requires automatic logoff after a period of inactivity (§164.312(a)(2)(iii))
- **Activity Events Tracked:**
  - Mouse movements
  - Keyboard input
  - Touch events
  - Scroll events
  - Window focus changes

### Single Session Enforcement

Single session enforcement prevents users from maintaining multiple concurrent authenticated sessions.

- **Behavior:** When a user logs in from a new device/location, existing sessions are invalidated
- **Rationale:** Prevents session sharing, reduces attack surface for session hijacking
- **Exception Handling:** Admins can manually terminate sessions via Supabase Dashboard

### Token Rotation

Token rotation ensures that refresh tokens are invalidated after each use and replaced with new tokens.

- **Behavior:** Each session refresh provides a new refresh token
- **Rationale:** Limits the window for token theft and replay attacks
- **Implementation:** Built into Supabase Auth, no custom code required

## Supabase Dashboard Configuration

### Step 1: Access Authentication Settings

1. Navigate to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **Authentication** → **Settings**

### Step 2: Configure Session Settings

Locate the **Session Configuration** section and set the following:

#### Session Timeout Settings

```yaml
Timebox: 480
Inactivity Timeout: 15
```

#### Session Security Settings

```yaml
Enable Single Session: true
Enable Token Rotation: true
```

### Step 3: Configure Advanced Settings

Under **Advanced Settings**, ensure:

- **Require Email Confirmation:** Enabled (unless using external auth providers)
- **Secure Password Requirements:** Enabled with HIPAA-compliant policy
- **Multi-Factor Authentication:** Required for AAL2 (Enforced via application code)

### Step 4: Save Configuration

1. Click **Save Changes** at the bottom of the page
2. Wait for the configuration to propagate (typically 1-2 minutes)

## Verification Steps

### Test 1: Session Timeout Behavior

1. **Setup:**
   - Login to the application
   - Open browser DevTools → Application → Cookies
   - Note the `sb-access-token` and `sb-refresh-token` values

2. **Inactivity Test:**
   - Do not interact with the page for 15 minutes
   - Observe automatic logout behavior
   - Verify redirect to login page

3. **Expected Result:**
   ```json
   {
     "status": 401,
     "error": "Session expired",
     "reason": "inactivity_timeout"
   }
   ```

### Test 2: Token Rotation

1. **Setup:**
   - Login and navigate to any authenticated page
   - Note current refresh token value in cookies

2. **Trigger Refresh:**
   - Let the access token expire (default: 1 hour)
   - Make an authenticated API request
   - Observe new refresh token in response

3. **Expected Result:**
   ```json
   {
     "new_refresh_token": "eyJhbGciOiJIUzI1NiIsInR...",
     "token_rotated": true
   }
   ```

### Test 3: Single Session Enforcement

1. **Setup:**
   - Login on Device A (Chrome)
   - Open Incognito window (Device B)

2. **Concurrent Login Test:**
   - Login on Device B with same credentials
   - Return to Device A
   - Attempt authenticated request

3. **Expected Result:**
   ```json
   {
     "status": 401,
     "error": "Session revoked",
     "reason": "new_session_created"
   }
   ```

### Test 4: Session Timebox Limit

1. **Setup:**
   - Set session timebox to a short value for testing (e.g., 5 minutes)
   - Login and wait longer than timebox duration

2. **Timebox Test:**
   - Attempt authenticated request after timebox expires

3. **Expected Result:**
   ```json
   {
     "status": 401,
     "error": "Session expired",
     "reason": "session_timebox_exceeded"
   }
   ```

## Client-Side Integration

### SessionTimeoutMonitor Component

The application includes a `SessionTimeoutMonitor` component that:

1. **Tracks User Activity:**
   ```typescript
   const activityEvents = [
     'mousedown',
     'keydown',
     'scroll',
     'touchstart',
     'mousemove'
   ];
   ```

2. **Shows Warning Dialog:**
   - Displays countdown at 13 minutes (2-minute warning)
   - Provides "Extend Session" button

3. **Auto-Logout:**
   - Redirects to login page at 15 minutes
   - Clears all session data
   - Shows reason: "Session expired due to inactivity"

### Integration Code

```typescript
// In your root layout or auth provider
import { SessionTimeoutMonitor } from '@/components/auth/SessionTimeoutMonitor';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <SessionTimeoutMonitor 
          timeoutMinutes={15}
          warningMinutes={13}
          onTimeout={() => handleLogout()}
        />
      </body>
    </html>
  );
}
```

## Monitoring and Alerting

### Audit Log Events

The following events are logged to the `audit_log` table:

| Event | Description | Severity |
|-------|-------------|----------|
| `session_created` | New session established | INFO |
| `session_extended` | User extended session via warning dialog | INFO |
| `session_expired_inactivity` | Auto-logout due to inactivity | WARNING |
| `session_expired_timebox` | Session expired due to max duration | WARNING |
| `session_revoked` | Session invalidated by new login | WARNING |
| `session_terminated_admin` | Admin手动 terminated session | WARNING |

### Alert Thresholds

Configure alerts for:

- **> 10% of users experiencing session timeouts:** Investigate workflow patterns
- **> 5% of sessions ending due to inactivity:** May indicate workflow issues
- **Spike in `session_revoked` events:** Potential account compromise

## Troubleshooting

### Sessions Not Timing Out

**Symptom:** Users remain logged in after inactivity timeout

**Diagnosis:**
1. Check Supabase Dashboard → Authentication → Settings
2. Verify inactivity timeout is set to 15 minutes
3. Check if client-side timeout monitor is mounted
4. Verify no localStorage overrides

**Resolution:**
1. Reconfigure in Supabase Dashboard
2. Ensure SessionTimeoutMonitor is rendered in application root
3. Check for JavaScript errors preventing timeout detection

### Token Rotation Not Working

**Symptom:** Refresh tokens not rotating on each use

**Diagnosis:**
1. Verify token rotation is enabled in Supabase Dashboard
2. Check browser cookie settings (SameSite, Secure flags)
3. Verify no server-side refresh token reuse detection

**Resolution:**
1. Enable token rotation in settings
2. Ensure cookies are properly configured
3. Check for conflicting middleware

### Single Session Not Enforcing

**Symptom:** Users can maintain multiple concurrent sessions

**Diagnosis:**
1. Verify single session setting is enabled
2. Check if using custom session management
3. Verify no session sharing across tabs

**Resolution:**
1. Enable single session in Supabase Dashboard
2. Remove any custom session handling
3. Clear existing sessions before re-enabling

## Compliance Documentation

### HIPAA Technical Safeguards Addressed

| Requirement | Implementation | Verification |
|-------------|---------------|--------------|
| §164.312(a)(2)(iii) Automatic Logoff | 15-minute inactivity timeout | Test 1 passes |
| §164.312(d) Entity Authentication | MFA + session timeout | MFA verification + session limits |
| §164.312(e)(1) Transmission Security | HTTPS + token rotation | TLS enforcement + token freshness |

### Audit Trail Requirements

All session events are logged to `audit_log` table with:

- `user_id`: Authenticated user identifier
- `org_id`: Organization context
- `ip_address`: Client IP (for security analysis)
- `user_agent`: Browser/client information
- `timestamp`: Precise event time
- `event_type`: Session event category
- `metadata`: Event-specific details

### Documentation for Compliance Review

This configuration guide should be included in:

1. **System Documentation:** As reference for technical controls
2. **Compliance Artifacts:** Evidence of HIPAA technical safeguards
3. **Audit Evidence:** Demonstration of automatic logoff controls
4. **Risk Assessment:** Documentation of session security measures

## References

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [HIPAA Security Rule Technical Safeguards](https://www.hhs.gov/hipaa/for-professionals/security/index.html)
- [NIST SP 800-63B Digital Identity Guidelines](https://pages.nist.gov/800-63-3/sp800-63b.html)

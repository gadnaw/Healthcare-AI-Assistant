# Auth Hook Setup Guide

This document provides step-by-step instructions for configuring the Custom Access Token Auth Hook in the Supabase Dashboard. This hook is critical for injecting organization context and MFA status into JWT tokens for HIPAA-compliant authorization.

## Overview

The Custom Access Token Auth Hook (`inject_custom_claims()`) runs on every authentication event and injects the following claims into JWT access tokens:

- **org_id**: UUID of the user's organization (for multi-tenant isolation)
- **role**: User's role within the organization (admin, member, provider, staff)
- **mfa_verified**: Boolean indicating if MFA is enrolled and verified
- **aal**: Auth Assurance Level (aal1 = password only, aal2 = MFA verified)

These claims are essential for:
- Enforcing tenant isolation at the API level
- Role-based access control throughout the application
- MFA enforcement for PHI access (HIPAA compliance)
- Session security monitoring

## Prerequisites

Before enabling the hook, ensure the following are in place:

1. **Supabase Project**: A Supabase project with Auth enabled
2. **Database Schema**: The multi-tenant schema must be deployed (see `supabase/schema/01-organizations.sql`)
3. **MFA Enabled**: Supabase Auth MFA/TOTP must be enabled in project settings
4. **pgSQL Access**: Ability to execute SQL in the Supabase SQL Editor
5. **Admin Access**: Access to the Supabase Dashboard with authentication permissions

## Step 1: Deploy the Auth Hook Function

### Option A: Using Supabase SQL Editor

1. Open your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Click **New query**
4. Copy the contents of `supabase/auth/01-custom-access-token-hook.sql`
5. Paste into the SQL Editor
6. Click **Run** to execute the SQL

Expected output:
- `CREATE FUNCTION` confirmation for `inject_custom_claims()`
- `CREATE FUNCTION` confirmation for `test_claims_injection()`
- `CREATE FUNCTION` confirmation for `refresh_custom_claims()`
- `GRANT` confirmations

### Option B: Using Supabase CLI

If you have the Supabase CLI installed:

```bash
# Apply the auth hook migration
supabase db push --db-url "postgres://[user]:[password]@[host]:5432/[database]"
```

Or run the SQL file directly:

```bash
supabase db query -f supabase/auth/01-custom-access-token-hook.sql
```

## Step 2: Enable the Hook in Supabase Dashboard

1. **Navigate to Authentication Settings**
   - Open Supabase Dashboard
   - Go to **Authentication** → **Hooks**

2. **Create New Hook**
   - Click **Create new hook**

3. **Configure Hook Settings**
   Configure the following fields:

   | Field | Value |
   |-------|-------|
   | **Name** | `custom_access_token_hook` |
   | **Type** | `Access Token Hook` |
   | **Trigger Event** | `After token is issued` |
   | **Hook Function** | `inject_custom_claims()` |
   | **Enabled** | `true` (checked) |

4. **Save Configuration**
   - Click **Save** to enable the hook

5. **Verify Activation**
   - The hook should appear in the Hooks list with status **Active**
   - Green indicator showing the hook is enabled

## Step 3: Verify Hook Deployment

### Test 1: Execute Verification Query

Run this SQL to verify the hook function is working:

```sql
-- Test claims injection for the current user
SELECT * FROM test_claims_injection();
```

Expected result:
```
user_id              | [uuid]
organization_id      | [uuid]  
user_role            | admin|member|provider|staff
mfa_verified         | true|false
aal_level            | aal1|aal2
claims_valid         | true
```

### Test 2: Check Function Exists

```sql
-- Verify the hook function exists and is callable
SELECT proname, prokind 
FROM pg_proc 
WHERE proname = 'inject_custom_claims';
```

Expected result:
```
proname                | prokind
inject_custom_claims   | f  (function)
```

### Test 3: Manual Claims Refresh

```sql
-- Test manual claims generation
SELECT refresh_custom_claims();
```

Expected result (JSON):
```json
{
  "org_id": "uuid",
  "role": "admin",
  "mfa_verified": true,
  "aal": "aal2",
  "auth_hook_version": "1.0.0",
  "claims_injected_at": "2026-02-07T..."
}
```

## Step 4: Test JWT Token Claims

### Test 1: Create a Test User

If you don't have a test user:

1. Go to **Authentication** → **Users**
2. Click **Add user**
3. Enter test credentials (email, password)
4. Click **Create user**

### Test 2: Login and Inspect JWT

1. **Login as the test user** using your application or Supabase's built-in login
2. **Capture the JWT token** from the authentication response
3. **Decode the JWT** using jwt.io or the Supabase Dashboard

### Verify Claims in JWT

The JWT payload should contain:

```json
{
  "iss": "https://[project-id].supabase.co",
  "sub": "[user-id]",
  "org_id": "[organization-uuid]",
  "role": "admin",
  "mfa_verified": true,
  "aal": "aal2",
  "auth_hook_version": "1.0.0",
  "claims_injected_at": "2026-02-07T...",
  "iat": [timestamp],
  "exp": [timestamp]
}
```

### Test 3: Using Supabase Dashboard JWT Debugger

1. Go to **Authentication** → **Users**
2. Click on a user
3. Scroll to **JWT Debugger** section
4. View the decoded JWT payload
5. Verify the custom claims are present

## Step 5: Test MFA Integration

### Enroll Test User in MFA

1. Go to **Authentication** → **Users**
2. Click on your test user
3. Scroll to **Multi-Factor Authentication** section
4. Click **Enroll factor**
5. Complete TOTP enrollment with an authenticator app
6. Verify enrollment status shows **Verified**

### Verify AAL Claims

After MFA enrollment:

1. User logs out and logs back in
2. Check JWT claims using JWT debugger
3. Verify:
   - `mfa_verified` = `true`
   - `aal` = `aal2`

Without MFA:
1. Ensure user has no verified TOTP factors
2. Check JWT claims
3. Verify:
   - `mfa_verified` = `false`
   - `aal` = `aal1`

## Step 6: Test Organization Context

### Create Test Organization

```sql
-- Create test organization
INSERT INTO organizations (name, domain) 
VALUES ('Test Healthcare Org', 'test.healthcare.com')
RETURNING id;
```

### Create Test Membership

```sql
-- Get the test user ID first
-- Then create membership
INSERT INTO organization_members (user_id, organization_id, role)
VALUES 
    ([user-id], [org-id], 'admin'),
    ([user-id], [org-id], 'provider');
```

### Verify Org Claims

1. User logs in
2. Check JWT claims
3. Verify:
   - `org_id` matches the organization UUID
   - `role` reflects the membership role

## Verification Checklist

Use this checklist to verify complete setup:

- [ ] **Hook function deployed**: `inject_custom_claims()` exists
- [ ] **Hook enabled in Dashboard**: Status shows "Active"
- [ ] **Verification query works**: `test_claims_injection()` returns data
- [ ] **JWT contains org_id**: Organization UUID in token claims
- [ ] **JWT contains role**: User role in token claims  
- [ ] **MFA integration works**: AAL2 when MFA verified
- [ ] **No MFA case**: AAL1 when MFA not verified
- [ ] **Claims update on role change**: Verified with role update

## Troubleshooting

### Issue: Hook Not Appearing in Dashboard

**Symptoms**: Hook configured but not visible or shows "Inactive"

**Solutions**:
1. **Check function exists**: Run `SELECT proname FROM pg_proc WHERE proname = 'inject_custom_claims';`
2. **Verify execution permissions**: Ensure GRANT was applied
3. **Check hook type**: Must be "Access Token Hook"
4. **Refresh Dashboard**: Log out and back in to Supabase Dashboard
5. **Check Supabase status**: Ensure auth service is operational

### Issue: org_id Claim Missing

**Symptoms**: JWT token doesn't contain org_id

**Solutions**:
1. **Check user membership**: User must have organization_membership record
2. **Verify query**: Run `SELECT * FROM organization_members WHERE user_id = auth.uid();`
3. **Check fallback logic**: Hook falls back to users.organization_id
4. **Review RLS**: Ensure RLS doesn't block the query
5. **Check function output**: Run `SELECT refresh_custom_claims();`

### Issue: role Claim Incorrect

**Symptoms**: JWT role doesn't match expected role

**Solutions**:
1. **Verify membership role**: Check organization_members.role directly
2. **Check role hierarchy**: Ensure correct role is assigned
3. **Verify role updates**: Changes should reflect on next token refresh
4. **Force token refresh**: Log out and back in to get new token

### Issue: MFA Claims Not Updating

**Symptoms**: mfa_verified or aal not changing after MFA enrollment

**Solutions**:
1. **Verify MFA enrollment**: Check auth.mfa_factors for verified TOTP
2. **Check factor type**: Must be 'totp', not other types
3. **Wait for propagation**: May take a few minutes after enrollment
4. **Force token refresh**: Session must be refreshed for new claims
5. **Verify factor status**: Check status = 'verified', not 'unverified'

### Issue: Function Execution Error

**Symptoms**: SQL errors when running verification queries

**Solutions**:
1. **Check function syntax**: Re-run the SQL deployment script
2. **Verify dependencies**: Ensure organization_members table exists
3. **Check grants**: Run GRANT statements again
4. **Review error message**: Look for specific SQL error details
5. **Test in SQL Editor**: Run simplified version of the query

### Issue: Performance Concerns

**Symptoms**: Auth hook slowing down login/token refresh

**Solutions**:
1. **Check indexes**: Ensure indexes exist on organization_members(user_id)
2. **Review query plan**: Use EXPLAIN ANALYZE on the hook query
3. **Optimize joins**: Ensure proper indexes on referenced tables
4. **Consider caching**: Cache org_id/role in user metadata if needed
5. **Monitor performance**: Check Supabase Dashboard for auth latency

### Issue: Cross-Tenant Data Leak Risk

**Symptoms**: Concern about org_id isolation

**Solutions**:
1. **Verify RLS**: Check organization_members RLS policies
2. **Test isolation**: Create users in different orgs, verify claims
3. **Review hook logic**: Ensure correct org_id is selected
4. **Audit logging**: Enable auth event logging
5. **Security review**: Have security team review configuration

## Security Considerations

### HIPAA Compliance

This hook is critical for HIPAA compliance:

1. **MFA Enforcement**: AAL2 required for PHI access
2. **Audit Trail**: Auth events logged with org context
3. **Tenant Isolation**: org_id prevents cross-tenant access
4. **Role-Based Access**: Claims enable consistent authorization

### Best Practices

1. **Monitor hook execution**: Check Supabase Dashboard for auth metrics
2. **Log auth events**: Enable detailed auth logging for security review
3. **Regular audits**: Review org membership and roles periodically
4. **Incident response**: Plan for auth hook failures
5. **Update procedures**: Document hook update process

### Emergency Procedures

If the auth hook fails:

1. **Disable hook temporarily**: Turn off in Dashboard
2. **Fallback to database queries**: Use RLS for org_id filtering
3. **Investigate failure**: Check Supabase logs for errors
4. **Deploy fix**: Update function with bug fix
5. **Re-enable hook**: Restore after verification

## Integration with Application

### Accessing Claims in JavaScript

```javascript
// Get current user with claims
const { data: { user }, error } = await supabase.auth.getUser()

// Access custom claims
const orgId = user.user_metadata.org_id
const role = user.user_metadata.role
const mfaVerified = user.user_metadata.mfa_verified
const aal = user.user_metadata.aal
```

### Accessing Claims in API Routes

```javascript
// Next.js API route
export async function GET(request) {
  const token = request.headers.get('Authorization')
  const claims = decodeJWT(token) // Your JWT decode logic
  
  const orgId = claims.org_id
  const role = claims.role
  const aal = claims.aal
  
  // Use claims for authorization
}
```

### Enforcing MFA at Application Level

```javascript
// Check MFA status before sensitive operations
if (user.user_metadata.aal !== 'aal2') {
  return { 
    error: 'MFA verification required', 
    requireMFA: true 
  }
}
```

## Rollback Procedure

If you need to disable the auth hook:

1. **Navigate to Authentication → Hooks**
2. **Find custom_access_token_hook**
3. **Toggle Enabled to off**
4. **Click Save**
5. **Verify token claims no longer contain custom fields**

To remove completely:

```sql
-- Drop the hook functions
DROP FUNCTION IF EXISTS inject_custom_claims();
DROP FUNCTION IF EXISTS test_claims_injection();
DROP FUNCTION IF EXISTS refresh_custom_claims();
```

## Support and Maintenance

### Regular Maintenance Tasks

- [ ] Monthly review of auth hook performance metrics
- [ ] Quarterly audit of org membership records
- [ ] Semi-annual security review of auth configuration
- [ ] Annual HIPAA compliance assessment

### Monitoring

- Set up alerts for auth hook failures
- Monitor JWT claim availability
- Track MFA enrollment rates
- Monitor auth latency for performance

### Documentation Updates

Keep this documentation updated when:
- Hook function is modified
- Supabase Dashboard UI changes
- New troubleshooting issues are discovered
- Integration patterns are added or updated

## References

- [Supabase Auth Hooks Documentation](https://supabase.com/docs/guides/auth/auth-hooks)
- [Supabase JWT Claims](https://supabase.com/docs/guides/auth/jwt-claims)
- [HIPAA Technical Safeguards](https://www.hhs.gov/hipaa/for-professionals/security/technical-safeguards/index.html)
- [Auth Assurance Levels (AAL)](https://pages.nist.gov/800-63-3/sp800-63b.html)

---

**Document Version**: 1.0.0  
**Last Updated**: February 7, 2026  
**Phase**: Phase 1 Wave 2 - JWT Claims & Auth Hooks  
**Status**: Ready for Deployment

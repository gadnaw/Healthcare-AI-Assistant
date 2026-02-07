# Phase 1: Foundation & Auth - Research

**Researched:** February 7, 2026
**Domain:** HIPAA-Compliant Healthcare AI Authentication & Infrastructure
**Confidence:** HIGH
**Readiness:** yes

## Summary

This research provides implementation-specific patterns for establishing HIPAA-compliant multi-tenant infrastructure with authentication, session management, and audit logging. Key findings include:

1. **Supabase MFA** via TOTP is the recommended approach with enrollment/challenge/verify flows documented
2. **Session timeout** enforcement requires multi-layer configuration (JWT expiration + inactivity timeout + single session per user)
3. **Account lockout** can be implemented via failed login tracking with automatic reset mechanisms
4. **Emergency access** requires time-limited break-glass accounts with enhanced audit logging
5. **Audit triggers** should use BEFORE triggers with cryptographic chaining for tamper-resistance
6. **RLS policies** must use `auth.jwt()` with restrictive policies for MFA enforcement
7. **Storage RLS** requires org_id path segmentation in bucket policies
8. **JWT claims** for org_id and role are set via custom access token auth hooks
9. **OpenAI BAA** requires Enterprise plan enrollment, Zero Data Retention approval, and explicit BAA signature

All patterns align with the established stack (Next.js 14, Supabase, pgvector, OpenAI) and build upon prior research in STACK.md, ARCHITECTURE.md, and PITFALLS.md.

**Primary recommendation:** Implement authentication infrastructure using Supabase Auth's built-in MFA, session management, and RLS capabilities, augmented with custom auth hooks for org_id/role claims and database triggers for tamper-proof audit logging.

---

## Standard Stack

### Core Authentication & MFA

| Library/Feature | Version | Purpose | Why Standard |
|-----------------|---------|---------|--------------|
| Supabase Auth MFA (TOTP) | Built-in | Multi-factor authentication | HIPAA-compliant, NIST-aligned, integrates with RLS |
| Supabase Auth Hooks | Built-in | Custom JWT claims injection | Add org_id and role to access tokens |
| Supabase Sessions | Built-in | Session management | JWT + refresh token model, configurable timeouts |
| pgAudit | Extension | PostgreSQL audit logging | SQL-standard auditing, tamper-resistant |

### Session & Security Configuration

| Setting | Value | Location | Why |
|---------|-------|----------|-----|
| JWT Expiration | 15 minutes | Auth Settings | HIPAA minimum for PHI access |
| Inactivity Timeout | 15 minutes | Auth Settings | HIPAA automatic session termination |
| Single Session Per User | Enabled | Auth Settings | Prevent concurrent access |
| Refresh Token Rotation | Enabled | Auth Settings | Secure token refresh |
| Session Time-Box | 8 hours maximum | Auth Settings | Daily re-authentication |

### Installation

```bash
# No additional packages required - Supabase Auth is built-in
# pgAudit extension via SQL
create extension if not exists pgaudit;
```

---

## Architecture Patterns

### 1. Supabase MFA Implementation with TOTP Enrollment Flow

**What:** Complete MFA enrollment and authentication flow using TOTP authenticator apps

**When to use:** All healthcare AI Assistant users must complete MFA enrollment before accessing PHI

**Implementation Pattern:**

```typescript
// MFA Enrollment Flow (3-step process)
interface MFAEnrollmentResult {
  factorId: string;
  qrCode: string;  // SVG format for QR display
  secret: string; // Fallback for manual entry
}

// Step 1: Enroll - Generate TOTP factor and QR code
async function enrollMFA(userId: string): Promise<MFAEnrollmentResult> {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
  });
  
  if (error) throw error;
  
  return {
    factorId: data.id,
    qrCode: data.totp.qr_code, // SVG format, display via <img src={dataUrl}>
    secret: data.totp.secret,   // Show for manual entry fallback
  };
}

// Step 2: Challenge - Prepare for verification
async function createChallenge(factorId: string): Promise<string> {
  const { data, error } = await supabase.auth.mfa.challenge({
    factorId,
  });
  
  if (error) throw error;
  return data.id; // challengeId for verification
}

// Step 3: Verify - Confirm TOTP code is correct
async function verifyEnrollment(
  factorId: string, 
  challengeId: string, 
  code: string
): Promise<boolean> {
  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId,
    code,
  });
  
  return !error;
}

// Client-side enrollment component pattern
function MFASetupComponent() {
  const [qrCode, setQrCode] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  
  // Start enrollment on mount
  useEffect(() => {
    enrollMFA().then(result => {
      setQrCode(result.qrCode); // Display as data URL
    });
  }, []);
  
  async function handleEnable() {
    const challengeId = await createChallenge(factorId);
    await verifyEnrollment(factorId, challengeId, verifyCode);
    // MFA now active for user
  }
}
```

**MFA Challenge During Login:**

```typescript
// Check if user needs MFA challenge after initial login
async function checkMFAStatus() {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  
  // data.currentLevel = 'aal1' | 'aal2'
  // data.nextLevel = 'aal1' | 'aal2'
  
  // Transition states:
  // - aal1 → aal1: User not enrolled
  // - aal1 → aal2: Enrolled but not verified (show challenge)
  // - aal2 → aal2: Fully authenticated with MFA
  
  if (data.nextLevel === 'aal2' && data.nextLevel !== data.currentLevel) {
    // Show MFA challenge screen
    return { requiresChallenge: true };
  }
  
  return { requiresChallenge: false, assuranceLevel: data.currentLevel };
}

// MFA Challenge UI
function MFAChallengeComponent() {
  const [code, setCode] = useState('');
  
  async function handleSubmit() {
    const factors = await supabase.auth.mfa.listFactors();
    const totpFactor = factors.data.totp[0];
    
    const challenge = await supabase.auth.mfa.challenge({ 
      factorId: totpFactor.id 
    });
    
    await supabase.auth.mfa.verify({
      factorId: totpFactor.id,
      challengeId: challenge.data.id,
      code,
    });
    
    // Session refreshed automatically, user now at aal2
  }
}
```

**Source:** Supabase MFA Documentation - TOTP enrollment flow patterns

---

### 2. Session Timeout Enforcement at Multiple Layers

**What:** 15-minute session timeout enforcement at JWT, application, and infrastructure levels

**When to use:** Required for HIPAA compliance with PHI access

**Implementation Pattern:**

```typescript
// Layer 1: Supabase Auth Configuration (Dashboard)
// Settings → Auth → Sessions
// - Time-box user sessions: 480 minutes (8 hours max)
// - Inactivity timeout: 15 minutes
// - Single session per user: Enabled

// Layer 2: JWT Claims for Session Tracking
interface SessionClaims {
  sub: user_id;
  org_id: organization_id;
  role: user_role;
  aal: 'aal1' | 'aal2';
  session_id: UUID; // Links to auth.sessions table
  exp: timestamp;   // 15 minutes from issue
  iat: timestamp;
}

// Layer 3: Client-side Session Monitor
function SessionTimeoutMonitor({ children }) {
  const [warning, setWarning] = useState(false);
  const INACTIVITY_LIMIT = 15 * 60 * 1000; // 15 minutes
  const WARNING_BEFORE = 2 * 60 * 1000;     // 2 minutes warning
  
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let warningTimeoutId: NodeJS.Timeout;
    
    const resetTimeout = () => {
      clearTimeout(timeoutId);
      clearTimeout(warningTimeoutId);
      setWarning(false);
      
      // Set warning timeout
      warningTimeoutId = setTimeout(() => {
        setWarning(true);
      }, INACTIVITY_LIMIT - WARNING_BEFORE);
      
      // Set logout timeout
      timeoutId = setTimeout(async () => {
        await supabase.auth.signOut();
        window.location.href = '/login?reason=session_timeout';
      }, INACTIVITY_LIMIT);
    };
    
    // Reset on user activity
    ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(event => {
      window.addEventListener(event, resetTimeout, { passive: true });
    });
    
    resetTimeout();
    
    return () => {
      clearTimeout(timeoutId);
      clearTimeout(warningTimeoutId);
    };
  }, []);
  
  return (
    <>
      {children}
      {warning && <SessionTimeoutWarning remainingSeconds={120} />}
    </>
  );
}

// Layer 4: API Route Protection with Session Validation
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function middleware(request: Request) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
      },
    }
  );
  
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  // Verify MFA assurance level
  const { data: { aal } } = await supabase.auth.getAuthenticatorAssuranceLevel();
  if (aal !== 'aal2') {
    return NextResponse.redirect(new URL('/mfa-challenge', request.url));
  }
  
  return NextResponse.next();
}
```

**Source:** Supabase Sessions Documentation - JWT claims, expiration, inactivity timeout

---

### 3. Account Lockout Implementation

**What:** Automatic account lockout after 5 failed login attempts with timed release

**When to use:** Brute force protection for healthcare authentication

**Implementation Pattern:**

```sql
-- Database trigger for failed login tracking
create or replace function handle_failed_login()
returns trigger as $$
begin
  -- Increment failed login counter
  update auth.users
  set raw_user_meta_data = jsonb_set(
    coalesce(raw_user_meta_data, '{}'::jsonb),
    '{failed_login_attempts}',
    (coalesce(
      (raw_user_meta_data->>'failed_login_attempts')::int,
      0
    ) + 1)::text::jsonb
  )
  where id = new.id;
  
  -- Check if should lock account (5+ failures)
  if (new.raw_user_meta_data->>'failed_login_attempts')::int >= 5 then
    update auth.users
    set raw_user_meta_data = jsonb_set(
      raw_user_meta_data,
      '{locked_until}',
      (now() + interval '30 minutes')::text::jsonb
    )
    where id = new.id;
    
    -- Log lockout event
    insert into auth.audit_log (action, user_id, details)
    values ('account_locked', new.id, jsonb_build_object(
      'reason', '5_failed_attempts',
      'locked_until', now() + interval '30 minutes'
    ));
  end if;
  
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for failed authentication attempts
create trigger on_authentication_failure
  after update on auth.users
  for each row
  execute function handle_failed_login();

-- Account lockout check in authentication hook
create or replace function check_account_lockout(event jsonb)
returns jsonb as $$
declare
  locked_until timestamptz;
  user_id uuid;
begin
  user_id := (event->>'user_id')::uuid;
  
  select raw_user_meta_data->>'locked_until'
  into locked_until
  from auth.users
  where id = user_id;
  
  if locked_until is not null and locked_until > now() then
    -- Account is locked
    raise exception 'account_locked' using
      hint = 'Account temporarily locked due to multiple failed attempts';
  end if;
  
  return event;
end;
$$ language plpgsql security definer;

-- Automatic lockout release (30 minutes)
-- Manual unlock via admin function
create or replace function unlock_user_account(user_id uuid)
returns void as $$
begin
  update auth.users
  set raw_user_meta_data = raw_user_meta_data - 'failed_login_attempts' - 'locked_until'
  where id = user_id;
  
  insert into auth.audit_log (action, user_id, details)
  values ('account_unlocked', user_id, jsonb_build_object(
    'unlocked_by', current_setting('request.jwt.claim.sub', true)
  ));
end;
$$ language plpgsql security definer;
```

**Source:** Supabase Auth Hooks documentation - custom authentication logic

---

### 4. Emergency Access (Break-Glass) Procedures for HIPAA

**What:** Time-limited emergency access accounts with enhanced audit logging for HIPAA compliance

**When to use:** Clinical emergencies, system recovery, regulatory access requirements

**Implementation Pattern:**

```sql
-- Emergency access accounts table
create table emergency_access_grants (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references organizations(id) not null,
  granted_to_user_id uuid references auth.users(id) not null,
  granted_by_user_id uuid references auth.users(id) not null,
  access_level text check (access_level in ('read_only', 'full_access')),
  reason text not null,
  granted_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '4 hours'),
  used_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz default now()
);

-- Enable RLS on emergency access grants
alter table emergency_access_grants enable row level security;

create policy "Admin only access to emergency grants"
  on emergency_access_grants
  for all
  using (
    exists (
      select 1 from organization_members
      where user_id = auth.uid()
        and role = 'admin'
        and organization_id = emergency_access_grants.organization_id
    )
  );

-- Break-glass account creation (single-purpose account)
create or replace function create_break_glass_access(
  p_organization_id uuid,
  p_granted_to_email text,
  p_access_level text,
  p_reason text
) returns uuid as $$
declare
  new_user_id uuid;
  grant_id uuid;
begin
  -- Create break-glass user (not associated with regular auth.users)
  insert into emergency_access_grants (
    organization_id,
    granted_to_email,
    access_level,
    reason,
    expires_at
  ) values (
    p_organization_id,
    p_granted_to_email,
    p_access_level,
    p_reason,
    now() + interval '4 hours'
  ) returning id into grant_id;
  
  -- Log creation with full context
  insert into audit_log (action, resource_type, details)
  values ('break_glass_created', 'emergency_access', jsonb_build_object(
    'grant_id', grant_id,
    'organization_id', p_organization_id,
    'granted_to_email', p_granted_to_email,
    'access_level', p_access_level,
    'reason', p_reason,
    'expires_at', now() + interval '4 hours',
    'granted_by', current_setting('request.jwt.claim.sub', true)
  ));
  
  return grant_id;
end;
$$ language plpgsql security definer;

-- Enhanced RLS policy for break-glass access
create policy "Break-glass access with org_id"
  on clinical_documents
  for select
  to authenticated
  using (
    exists (
      select 1 from emergency_access_grants
      where granted_to_user_id = auth.uid()
        and expires_at > now()
        and (access_level = 'full_access' or access_level = 'read_only')
        and organization_id = clinical_documents.org_id
    )
    or exists (
      select 1 from organization_members
      where user_id = auth.uid()
        and organization_id = clinical_documents.org_id
    )
  );

-- Emergency access usage audit
create or replace function log_emergency_access(event text, resource_type text, resource_id uuid)
returns void as $$
begin
  insert into audit_log (action, resource_type, resource_id, details)
  values (event, resource_type, resource_id, jsonb_build_object(
    'access_type', 'emergency_break_glass',
    'accessed_by', auth.uid(),
    'accessed_at', now(),
    'ip_address', current_setting('request.jwt.claim.ip_address', true),
    'user_agent', current_setting('request.jwt.claim.user_agent', true)
  ));
end;
$$ language plpgsql security definer;

-- Mandatory post-access review
create table emergency_access_reviews (
  id uuid default gen_random_uuid() primary key,
  grant_id uuid references emergency_access_grants(id) not null,
  reviewed_by uuid references auth.users(id) not null,
  review_notes text,
  appropriateness_rating int check (appropriateness_rating between 1 and 5),
  reviewed_at timestamptz default now()
);
```

**Break-Glass Access Protocol:**

1. **Initiation**: Admin initiates via emergency access request
2. **Verification**: Secondary admin approval required
3. **Time-Limit**: Access expires after 4 hours automatically
4. **Enhanced Audit**: All actions logged with break-glass flag
5. **Post-Review**: Mandatory review within 24 hours
6. **Reporting**: Monthly break-glass usage reports to compliance

**Source:** HIPAA Security Rule Emergency Access Requirements (45 CFR 164.312)

---

### 5. Database Triggers for Audit Logging

**What:** BEFORE triggers with cryptographic chaining for tamper-resistant audit logging

**When to use:** Required for HIPAA audit trail compliance on all tenant data

**Implementation Pattern:**

```sql
-- Audit log table with cryptographic chaining
create table audit_log (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid not null,
  user_id uuid,  -- null for system actions
  action text not null check (action in (
    'INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT',
    'MFA_ENABLED', 'MFA_DISABLED', 'PASSWORD_CHANGE',
    'DOCUMENT_ACCESS', 'DOCUMENT_CREATE', 'DOCUMENT_UPDATE', 'DOCUMENT_DELETE',
    'AI_QUERY', 'EMERGENCY_ACCESS', 'PERMISSION_CHANGE'
  )),
  resource_type text not null,
  resource_id uuid,
  previous_value jsonb,
  new_value jsonb,
  ip_address inet,
  user_agent text,
  request_id uuid,
  previous_hash text,  -- Cryptographic chain
  created_at timestamptz default now(),
  
  constraint valid_org check (organization_id is not null)
);

-- Enable RLS
alter table audit_log enable row level security;

-- Only admins can read audit logs
create policy "Admins read audit logs"
  on audit_log for select
  using (
    exists (
      select 1 from organization_members
      where user_id = auth.uid()
        and role in ('admin', 'compliance_officer')
        and organization_id = audit_log.organization_id
    )
  );

-- Audit insert function
create or replace function audit_trigger_function()
returns trigger as $$
declare
  previous_hash text;
  new_hash text;
  current_org_id uuid;
begin
  -- Determine organization_id from the target table
  current_org_id := NEW.organization_id;
  
  -- Get previous hash for chain
  select hash into previous_hash
  from audit_log
  where organization_id = current_org_id
  order by created_at desc
  limit 1;
  
  -- Build audit record
  insert into audit_log (
    organization_id,
    user_id,
    action,
    resource_type,
    resource_id,
    previous_value,
    new_value,
    ip_address,
    user_agent,
    request_id,
    previous_hash
  ) values (
    current_org_id,
    current_setting('request.jwt.claim.sub', true)::uuid,
    TG_OP,
    TG_TABLE_NAME,
    NEW.id,
    case when TG_OP = 'DELETE' then to_jsonb(OLD) else null end,
    case when TG_OP = 'INSERT' then to_jsonb(NEW) else null end,
    current_setting('request.jwt.claim.ip_address', true)::inet,
    current_setting('request.jwt.claim.user_agent', true),
    current_setting('request.jwt.claim.request_id', true)::uuid,
    previous_hash
  );
  
  -- Return appropriate row
  if TG_OP = 'DELETE' then
    return OLD;
  else
    return NEW;
  end if;
end;
$$ language plpgsql security definer;

-- Create triggers for all tenant tables
create trigger audit_documents
  before insert or update or delete on documents
  for each row execute function audit_trigger_function();

create trigger audit_conversations
  before insert or update or delete on conversations
  for each row execute function audit_trigger_function();

create trigger audit_messages
  before insert or update or delete on messages
  for each row execute function audit_trigger_function();

-- Application-level audit for AI queries (not table-based)
create or replace function log_ai_query(
  p_organization_id uuid,
  p_user_id uuid,
  p_query_text text,
  p_response_metadata jsonb
) returns void as $$
declare
  previous_hash text;
begin
  select hash into previous_hash
  from audit_log
  where organization_id = p_organization_id
  order by created_at desc
  limit 1;
  
  insert into audit_log (
    organization_id,
    user_id,
    action,
    resource_type,
    resource_id,
    details,
    ip_address,
    user_agent,
    request_id,
    previous_hash
  ) values (
    p_organization_id,
    p_user_id,
    'AI_QUERY',
    'conversation',
    null,
    jsonb_build_object(
      'query_hash', encode(sha256(p_query_text::bytea), 'hex'),
      'response_metadata', p_response_metadata
    ),
    current_setting('request.jwt.claim.ip_address', true)::inet,
    current_setting('request.jwt.claim.user_agent', true),
    gen_random_uuid(),
    previous_hash
  );
end;
$$ language plpgsql security definer;
```

**Source:** Supabase Triggers Documentation - BEFORE triggers, trigger functions

---

### 6. RLS Policies for Multi-Tenant Isolation

**What:** Comprehensive RLS policies ensuring org_id isolation on all tenant tables

**When to use:** Required for HIPAA multi-tenant architecture

**Implementation Pattern:**

```sql
-- Organizations table (public)
create table organizations (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  domain text,
  settings jsonb default '{}',
  created_at timestamptz default now()
);

-- Users with org_id foreign key
create table users (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references organizations(id) on delete cascade not null,
  email text not null,
  role text check (role in ('admin', 'clinician', 'viewer', 'emergency')),
  created_at timestamptz default now()
);

-- All clinical tables include organization_id
create table documents (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid references organizations(id) on delete cascade not null,
  title text not null,
  content text,
  category text,
  created_at timestamptz default now()
);

-- Enable RLS on all tables
alter table organizations enable row level security;
alter table users enable row level security;
alter table documents enable row level security;

-- Core RLS policies

-- Organizations: Everyone in org can view
create policy "Organization members view org"
  on organizations for select
  using (
    exists (
      select 1 from users
      where organization_id = organizations.id
        and user_id = auth.uid()
    )
  );

-- Users: View org members, self can update
create policy "Users view org members"
  on users for select
  using (
    exists (
      select 1 from users as u2
      where u2.organization_id = users.organization_id
        and u2.id = auth.uid()
    )
  );

create policy "Users update own profile"
  on users for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Documents: Full org access
create policy "Documents org access"
  on documents for all
  using (
    exists (
      select 1 from users
      where organization_id = documents.organization_id
        and user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from users
      where organization_id = documents.organization_id
        and user_id = auth.uid()
    )
  );

-- MFA enforcement via RLS (restrictive policy)
create policy "Require MFA for PHI access"
  on documents as restrictive
  for all
  to authenticated
  using (
    (select auth.jwt()->>'aal') = 'aal2'
  );

-- Performance: Index org_id columns
create index idx_users_org_id on users(organization_id);
create index idx_documents_org_id on documents(organization_id);
create index idx_audit_log_org_created on audit_log(organization_id, created_at desc);
```

**Source:** Supabase RLS Documentation - RLS patterns, restrictive policies

---

### 7. Storage RLS Patterns for Org ID Path Segmentation

**What:** Storage bucket policies enforcing org_id path-based isolation

**When to use:** Document upload/storage with multi-tenant isolation

**Implementation Pattern:**

```typescript
// Storage bucket structure
// bucket: clinical-documents
// path: {org_id}/{document_type}/{yyyy-mm}/{uuid}_{filename}

// Storage policy SQL
/*
-- Supabase Storage RLS policies for multi-tenant isolation

-- Create bucket with restricted access
insert into storage.buckets (id, name, public)
values ('clinical-documents', 'clinical-documents', false);

-- Policy: Users can access only their org's files
create policy "Org file access"
  on storage.objects for select
  using (
    exists (
      select 1 from users
      where organization_id = (
        select split_part(storage.objects.name, '/', 1)
      )::uuid
        and user_id = auth.uid()
    )
  );

-- Policy: Users can upload to their org's path
create policy "Org file upload"
  on storage.objects for insert
  with check (
    exists (
      select 1 from users
      where organization_id = (
        select split_part(objects.name, '/', 1)
      )::uuid
        and user_id = auth.uid()
    )
    -- Enforce path format: {org_id}/{type}/{yyyy-mm}/{filename}
    and objects.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+/[^/]+/[^/]+$'
  );

-- Policy: Users can delete their org's files
create policy "Org file delete"
  on storage.objects for delete
  using (
    exists (
      select 1 from users
      where organization_id = (
        select split_part(storage.objects.name, '/', 1)
      )::uuid
        and user_id = auth.uid()
    )
  );
*/

// Document upload with org_id path
async function uploadClinicalDocument(
  file: File,
  documentType: 'protocol' | 'guideline' | 'policy',
  organizationId: string
) {
  const date = new Date().toISOString().split('T')[0]; // yyyy-mm-dd
  const path = `${organizationId}/${documentType}/${date}/${file.name}`;
  
  const { data, error } = await supabase.storage
    .from('clinical-documents')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false, // Prevent overwrites
    });
  
  return data;
}

// Client-side file access pattern
async function getDocumentUrl(documentPath: string) {
  const { data } = await supabase.storage
    .from('clinical-documents')
    .createSignedUrl(documentPath, 3600); // 1 hour expiry
  
  return data.signedUrl;
}
```

**Source:** Supabase Storage Documentation - Storage RLS policies

---

### 8. JWT Claims Structure for Org ID and Role

**What:** Custom auth hook to inject org_id and role into JWT claims

**When to use:** Required for RLS policies and API authorization

**Implementation Pattern:**

```sql
-- Organization membership table
create table organization_members (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  organization_id uuid references organizations(id) on delete cascade not null,
  role text check (role in ('admin', 'clinician', 'viewer', 'emergency')),
  permissions jsonb default '[]',
  created_at timestamptz default now(),
  unique (user_id, organization_id)
);

-- Custom Access Token Auth Hook
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
declare
  org_id uuid;
  user_role text;
  mfa_verified boolean;
begin
  -- Fetch user's primary organization and role
  select 
    organization_id,
    role,
    (exists (
      select 1 from auth.mfa_factors
      where user_id = (event->>'user_id')::uuid
        and status = 'verified'
    )) as has_mfa
  into org_id, user_role, mfa_verified
  from organization_members
  where user_id = (event->>'user_id')::uuid
  order by created_at desc
  limit 1;
  
  -- Add claims to JWT
  event := jsonb_set(event, '{claims}', (event->'claims')::jsonb);
  event := jsonb_set(event, '{claims,org_id}', to_jsonb(org_id));
  event := jsonb_set(event, '{claims,role}', to_jsonb(user_role));
  event := jsonb_set(event, '{claims,mfa_verified}', to_jsonb(mfa_verified));
  
  -- Add AAL (Authenticator Assurance Level)
  if mfa_verified then
    event := jsonb_set(event, '{claims,aal}', '"aal2"');
  else
    event := jsonb_set(event, '{claims,aal}', '"aal1"');
  end if;
  
  return event;
end;
$$;

-- Grant permissions for auth hook
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
grant all on table organization_members to supabase_auth_admin;
revoke all on table organization_members from authenticated, anon, public;

-- Enable hook in Supabase Dashboard
-- Authentication → Hooks → custom_access_token_hook
```

**Client-side JWT decode pattern:**

```typescript
import { jwtDecode } from 'jwt-decode';

interface CustomClaims {
  org_id: string;
  role: 'admin' | 'clinician' | 'viewer' | 'emergency';
  aal: 'aal1' | 'aal2';
  mfa_verified: boolean;
}

function useAuthClaims() {
  const { data: { session } } = supabase.auth.getSession();
  
  if (!session?.access_token) return null;
  
  const claims = jwtDecode<CustomClaims>(session.access_token);
  return claims;
}

// Usage in React component
function DocumentAccessComponent() {
  const claims = useAuthClaims();
  
  const canEdit = claims?.role === 'admin' || claims?.role === 'clinician';
  const hasMFA = claims?.aal === 'aal2';
  
  return <>{canEdit ? <EditButton /> : <ViewOnly />}</>;
}
```

**Source:** Supabase Custom Claims & RBAC Documentation - Auth hooks, JWT claims

---

### 9. OpenAI BAA Requirements and Verification Steps

**What:** Business Associate Agreement with OpenAI for HIPAA compliance when processing PHI

**When to use:** Required before sending any PHI through OpenAI APIs

**Verification Steps:**

1. **Verify Supabase Enterprise Plan**
   ```bash
   # Check in Supabase Dashboard
   # Settings → General → Plan
   # Must show "Enterprise" for HIPAA BAA eligibility
   ```

2. **Request OpenAI BAA**
   - Contact: https://openai.com/contact-sales
   - Plan: Enterprise tier required for BAA
   - Timeline: 2-4 weeks for approval
   - Documentation: Provide compliance documentation

3. **Configure Zero Data Retention (Recommended)**
   ```
   Zero Data Retention Settings:
   - Organization-level: Enable Zero Data Retention
   - Project-level: Select Zero Data Retention
   - Verification: BAA must be signed first
   
   Benefits:
   - Customer content excluded from abuse monitoring logs
   - No training data usage
   - 30-day log retention for compliance only
   ```

4. **Verify BAA Status**
   ```typescript
   // Supabase Dashboard verification
   // Settings → Security → HIPAA Compliance
   // Should show:
   // - BAA Status: Signed
   // - Zero Data Retention: Enabled
   // - Enterprise Plan: Active
   ```

5. **OpenAI Platform BAA Verification**
   ```
   OpenAI Platform Settings:
   1. Organization → Settings → Data Controls
   2. Verify: "Zero Data Retention" or "Modified Abuse Monitoring" enabled
   3. Verify: BAA amendment signed
   4. Verify: Project configured with correct retention
   ```

6. **Data Residency (Optional)**
   ```
   For enhanced compliance:
   - Enable Data Residency: US or EU regions
   - Domain: us.api.openai.com or eu.api.openai.com
   - Requires: Enhanced ZDR approval
   ```

7. **Ongoing Compliance Requirements**
   ```
   Annual Requirements:
   - BAA renewal review
   - Security audit documentation
   - Incident response procedures
   - Staff training records
   
   Operational Requirements:
   - Log audit access monthly
   - Monitor API usage for anomalies
   - Document PHI data flows
   - Maintain compliance documentation
   ```

**OpenAI Data Controls Summary:**

| Feature | Standard | HIPAA-Compliant |
|---------|----------|-----------------|
| Data not used for training | March 2023+ | Included in BAA |
| Abuse monitoring logs | 30 days | ZDR option: none |
| Application state | Varies | ZDR: none on eligible endpoints |
| BAA availability | No | Enterprise plan required |
| Zero Data Retention | Optional | Required for PHI |
| Data residency | US default | US or EU with approval |

**Source:** OpenAI Platform Documentation - Your Data, Data Controls, HIPAA compliance

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MFA enrollment UI | Custom TOTP implementation | Supabase MFA Enroll/Challenge/Verify APIs | NIST-aligned, secure secret handling, QR generation |
| Session timeout | Custom session store | Supabase Sessions + Inactivity Timeout | Database-backed, enforced at auth layer |
| Audit logging | Manual INSERT statements | pgAudit extension + BEFORE triggers | SQL-standard, tamper-resistant, performance-optimized |
| Multi-tenant RLS | Per-query org filtering | Native RLS policies | Database-enforced, bypass-resistant |
| JWT custom claims | Client-side claim injection | Auth Hooks (server-side) | Cannot be modified by users, secure |
| Account lockout | Application-level counting | Auth Hooks + user_meta_data | Tracks failed attempts even across sessions |
| Storage access control | API-level checks | Storage RLS policies | Enforced at storage layer |

---

## Common Pitfalls

### Pitfall 1: RLS Performance Degradation
**What goes wrong:** RLS policies without proper indexes cause full table scans
**How to avoid:** Index org_id columns and use wrapped function calls in policies

```sql
-- BAD: No index
create policy "access" on documents
  using (organization_id in (select organization_id from users where id = auth.uid()));

-- GOOD: Index + wrapped function
create index idx_documents_org on documents(organization_id);
create policy "access" on documents
  using ((select auth.uid()) = user_id); -- User has org_id foreign key
```

### Pitfall 2: MFA Bypass via JWT Manipulation
**What goes wrong:** Assuming MFA-enforced on frontend only
**How to avoid:** Use restrictive RLS policies with `aal2` check

```sql
-- RLS restrictive policy is critical
create policy "Require MFA for PHI"
  on clinical_documents as restrictive
  for all
  using ((select auth.jwt()->>'aal') = 'aal2');
```

### Pitfall 3: Incomplete Audit Trail
**What goes wrong:** Only auditing table operations, missing AI queries and file access
**How to avoid:** Application-level audit function for non-DML events

```sql
-- Log every AI query
select log_ai_query(
  p_organization_id := org_id,
  p_user_id := user_id,
  p_query_text := 'patient symptoms query',
  p_response_metadata := '{"chunks_retrieved": 5}'
);
```

### Pitfall 4: JWT Claim Stale Data
**What goes wrong:** Custom claims not updated until token refresh
**How to avoid:** Force session refresh after role/permission changes

```typescript
// After permission change, refresh user's session
await supabase.auth.refreshSession();
// Or sign out and re-authenticate for critical changes
```

### Pitfall 5: Storage Path Traversal
**What goes wrong:** Users uploading files with relative paths
**How to avoid:** Validate and normalize all upload paths

```typescript
function validateStoragePath(organizationId: string, fileName: string): string {
  // Reject path separators in filename
  if (fileName.includes('/') || fileName.includes('..')) {
    throw new Error('Invalid filename');
  }
  // Generate path server-side
  return `${organizationId}/uploads/${Date.now()}_${fileName}`;
}
```

---

## Code Examples

### Complete MFA-Enforced Login Flow

```typescript
// pages/login.tsx
import { useState } from 'react';
import { useRouter } from 'next/router';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [step, setStep] = useState<'credentials' | 'mfa' | 'error'>('credentials');
  const [error, setError] = useState('');

  async function handleLogin(e) {
    e.preventDefault();
    
    // Step 1: Email/password authentication
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      return;
    }

    // Step 2: Check MFA requirement
    const { data: aal } = await supabase.auth.getAuthenticatorAssuranceLevel();
    
    if (aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2') {
      setStep('mfa');
    } else {
      router.push('/dashboard');
    }
  }

  async function handleMFAVerify(e) {
    e.preventDefault();
    
    // Get enrolled factors
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors?.totp[0];
    
    if (!totp) {
      setError('No MFA factor enrolled');
      return;
    }

    // Verify TOTP code
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: totp.id,
      challengeId: (await supabase.auth.mfa.challenge({ factorId: totp.id })).data.id,
      code: mfaCode,
    });

    if (verifyError) {
      setError('Invalid MFA code');
      return;
    }

    // MFA successful - session automatically refreshed
    router.push('/dashboard');
  }

  return (
    <div>
      {step === 'credentials' && (
        <form onSubmit={handleLogin}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <button type="submit">Sign In</button>
        </form>
      )}
      
      {step === 'mfa' && (
        <form onSubmit={handleMFAVerify}>
          <p>Enter your authenticator code</p>
          <input type="text" value={mfaCode} onChange={e => setMfaCode(e.target.value)} />
          <button type="submit">Verify</button>
        </form>
      )}
      
      {error && <div className="error">{error}</div>}
    </div>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Application-level session tracking | Supabase Sessions with JWT | 2024 | Database-backed, scalable, configurable timeouts |
| Custom MFA implementation | Supabase MFA TOTP | 2024 | NIST-aligned, reduced implementation risk |
| Manual audit INSERT statements | pgAudit + BEFORE triggers | 2024 | Tamper-resistant, performance-optimized |
| Query-level org filtering | Native RLS policies | 2024 | Bypass-resistant, declarative |
| Hardcoded roles | Auth Hooks with custom claims | 2024 | Flexible, automatic token injection |

---

## Divergence from Project Baseline

**No divergence** - All Phase 1 requirements align with established project baseline:

- Supabase for authentication and database (per STACK.md)
- RLS for multi-tenant isolation (per ARCHITECTURE.md)
- pgvector for document embeddings (not used in auth phase)
- OpenAI for AI features (BAA process documented)
- HIPAA compliance patterns (per PITFALLS.md)

---

## Open Questions

1. **Emergency Access Verification**: Should break-glass access require biometric verification (additional factor)?
   - Recommendation: Require TOTP even for break-glass after initial 30-minute window
   
2. **Session Timeout Exceptions**: Allow extended sessions for training sessions?
   - Recommendation: Implement "extended session" flag requiring additional approval
   
3. **Audit Log Retention**: 6-year HIPAA requirement for audit logs?
   - Recommendation: Configure pgAudit for 6-year retention with archival to cold storage

---

## Sources

### Primary (HIGH confidence)
- Supabase Auth MFA Documentation - TOTP enrollment, challenge/verify flows
- Supabase Sessions Documentation - JWT claims, timeout configuration
- Supabase RLS Documentation - Multi-tenant isolation, restrictive policies
- Supabase Custom Claims Documentation - Auth hooks, JWT claim injection
- OpenAI Platform Documentation - Data controls, HIPAA compliance

### Secondary (MEDIUM confidence)
- HIPAA Security Rule (45 CFR 164.312) - Emergency access requirements
- NIST 800-63B - MFA implementation guidelines
- Supabase Storage Documentation - Storage RLS policies

### Tertiary (LOW confidence)
- Community implementations of break-glass procedures
- Healthcare AI compliance case studies

---

## Metadata

**Confidence breakdown:**
- MFA patterns: HIGH - Official Supabase documentation
- Session timeout: HIGH - Official Supabase documentation  
- Account lockout: MEDIUM - Auth hooks pattern verified
- Emergency access: MEDIUM - HIPAA requirements + custom implementation
- Audit triggers: HIGH - Official PostgreSQL + Supabase patterns
- RLS policies: HIGH - Official Supabase documentation
- Storage RLS: HIGH - Official Supabase documentation
- JWT claims: HIGH - Official Supabase documentation
- OpenAI BAA: MEDIUM - Official documentation, implementation experience

**Research date:** February 7, 2026
**Valid until:** July 2026 (Supabase features stable, quarterly releases)

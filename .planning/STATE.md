# Healthcare AI Assistant (HIPAA-Aware RAG) Roadmap

**Project:** Healthcare AI Assistant (HIPAA-Aware RAG)
**Created:** February 7, 2026
**Milestone:** MVP
**Depth:** Standard
**Confidence:** MEDIUM-HIGH

---

## Current Execution Status

### Phase 1: Foundation & Auth - Progress

**Current Wave:** 4 of 5 complete  
**Plans Completed:** 4 of 5 (Waves 1-4)  
**Current Status:** ✅ In Progress - Session Management

#### Wave Progress

| Wave | Plan | Name | Status | Tasks |
|------|------|------|--------|-------|
| 1 | 01-01 | Database Foundation & RLS | ✅ Complete | 3/3 |
| 2 | 01-02 | JWT Claims & Auth Hooks | ✅ Complete | 2/2 |
| 3 | 01-03 | MFA Implementation | ✅ Complete | 4/4 |
| 4 | 01-04 | Session Management | ✅ Complete | 4/4 |
| 5 | 01-05 | Audit Logging | ⏳ Pending | - |

#### Phase 1 Progress Bar

```
Phase 1: Foundation & Auth
██████████████████████████████████████████████████░░░░░░░░░░░░░ 80% complete (4/5 plans)
```

#### Completed This Wave (01-04)

**Tasks Completed:**
- ✅ Task 4.1: Configure Supabase Session Settings (`docs/session-configuration.md`)
- ✅ Task 4.2: Create Client-Side Session Monitor (`components/auth/SessionTimeoutMonitor.tsx`)
- ✅ Task 4.3: Create Account Lockout Function (`supabase/auth/02-account-lockout-hook.sql`)
- ✅ Task 4.4: Create Failed Login Trigger (`supabase/auth/03-failed-login-trigger.sql`)

**Key Deliverables:**
- HIPAA-compliant session configuration (15-min timeout, 480-min timebox)
- Client-side session timeout monitor with countdown and extend session option
- Account lockout after 5 failed attempts (30-minute lockout duration)
- IP-based rate limiting (20 attempts/IP/15min) for distributed attack prevention
- Comprehensive security monitoring views and admin unlock workflows
- All failed attempts logged with IP address and user agent

**Commits:**
- `9305652`: feat(01-04): document session configuration settings
- `0c5d5b8`: feat(01-04): create client-side session monitor component
- `9ee6c6a`: feat(01-04): create account lockout functions
- `fda7afc`: feat(01-04): create failed login tracking

**Files Created:**
- `docs/session-configuration.md` - Session configuration guide
- `components/auth/SessionTimeoutMonitor.tsx` - Client-side session monitor
- `supabase/auth/02-account-lockout-hook.sql` - Account lockout functions
- `supabase/auth/03-failed-login-trigger.sql` - Failed login tracking and rate limiting

#### Next Steps

**Upcoming:** Plan 01-05 - Audit Logging
- Build upon session management (session events available)
- Implement tamper-proof audit logging
- Capture all authenticated events for compliance
- Emergency access audit trail

---

#### Session Continuity

**Last Session:** February 7, 2026  
**Stopped At:** Completed Plan 01-04 (Session Management)  
**Resume Point:** Plan 01-05 (Audit Logging)  
**No Checkpoint Files:** Plan executed to completion without pausing

---

## Accumulated Context

### Decisions Made (Phase 1)

| Phase | Decision | Rationale | Impact |
|-------|----------|-----------|--------|
| 1-01 | Multi-tenant schema with org_id | HIPAA compliance requires tenant isolation | All tables use org_id for RLS |
| 1-01 | organization_members junction table | Flexible role assignments per org | Supports complex org structures |
| 1-01 | RLS on all tenant tables | Defense in depth for data isolation | Queries always filtered by org |
| 1-02 | Single org membership for MVP | Simplifies initial implementation | Multi-org deferred to future |
| 1-02 | TOTP-only MFA support | Standard, well-supported, HIPAA-compliant | Other MFA types not recognized |
| 1-02 | Claims in user_metadata | Supabase native pattern | Accessible via auth.user() |
| 1-03 | AAL2 fallback to MFA factors | Auth hook may not have updated token | Dual check ensures correctness |
| 1-03 | Helper functions for MFA status | Reusable across application code | Consistent MFA status checking |
| 1-03 | TOTP-only for MVP | Widely supported, no SMS dependency | Backup codes for recovery |
| 1-04 | 30-minute lockout duration | Balances security with usability | 2x penalty factor on attack window |
| 1-04 | Client-side + server-side enforcement | Defense in depth for HIPAA | Better UX with server-side guarantee |
| 1-04 | Separate IP rate limiting | Prevents distributed attacks | 20 attempts/IP/15min threshold |

### Constraints on This Execution

- **HIPAA Compliance:** All auth features must meet HIPAA technical safeguards
- **Multi-tenant Isolation:** org_id filtering at database and JWT level
- **MFA Implemented:** AAL2 enforcement for PHI access (complete)
- **Audit Trail:** All auth events must be logged

### Blockers/Concerns

**No Active Blockers** - Plan 01-02 executed successfully without issues.

**Concerns to Monitor:**
- Supabase Auth hooks require Pro plan or higher (cost consideration)
- MFA enrollment rates may impact user experience (monitor post-launch)
- JWT claim updates require token refresh (user session management)

### Alignment Status

✅ **On Track** - Phase 1 progressing as planned. Auth infrastructure foundation complete. MFA enforcement implemented. Session timeout and account lockout deployed. Ready for audit logging.

---

## Plan History

### Recently Completed

| Plan | Summary | Status |
|------|---------|--------|
| 01-01 | Multi-tenant schema with RLS policies | ✅ Complete |
| 01-02 | JWT claims injection with MFA status | ✅ Complete |
| 01-03 | MFA Implementation | ✅ Complete |

### Next Plans

| Plan | Focus | Dependencies |
|------|-------|--------------|
| 01-04 | Session Management | 01-03 (requires aal2 claims) |
| 01-05 | Audit Logging | 01-01 (requires schema), 01-04 (session context) |

### Recently Completed

| Plan | Summary | Status |
|------|---------|--------|
| 01-01 | Multi-tenant schema with RLS policies | ✅ Complete |
| 01-02 | JWT claims injection with MFA status | ✅ Complete |
| 01-03 | MFA Implementation | ✅ Complete |
| 01-04 | Session Management & Account Lockout | ✅ Complete |

---

## Overview

This roadmap structures the Healthcare AI Assistant into five delivery phases, progressing from foundational infrastructure through production hardening. The sequence respects critical dependencies: authentication and multi-tenant isolation must precede document management; the RAG pipeline must be operational before safety layers can be validated; compliance features depend on both security and functionality being in place.

Each phase delivers observable capabilities with measurable success criteria. Critical pitfalls—medical hallucinations, cross-tenant data leaks, PHI leakage, prompt injection, and citation fabrication—are woven into phase goals and success criteria rather than addressed as afterthoughts.

The estimated effort spans 14-18 weeks for a solo developer, with medical embedding evaluation, citation verification implementation, and emergency access procedures identified as research-intensive work items requiring phase-specific investigation.

---

## Phase Dependency Chain

```
Phase 1: Foundation & Auth
    │
    ├──► Phase 2: Document Management & RAG
    │           │
    │           └──► Phase 3: Safety Layer
    │                       │
    │                       └──► Phase 4: Compliance & Features
    │                                   │
    │                                   └──► Phase 5: Hardening & Monitoring
    │
    └──────────────────┬────────────────┘
                       │
                       ▼
              (Cross-phase requirements: MFA, Audit Logging, RLS)
```

---

## Phase 1: Foundation & Auth

**Goal:** Establish multi-tenant infrastructure with HIPAA-compliant authentication, session management, and audit logging foundation.

**Duration:** 2-3 weeks

**Research Flags:** `needs-research` — Supabase MFA implementation patterns, OpenAI BAA verification

**Dependencies:** None (foundation phase)

**Requirements Mapped:**

| ID | Requirement | Category | Priority |
|----|-------------|----------|----------|
| AUTH-01 | Multi-tenant database with org_id on every table | Foundation | Must-Have |
| AUTH-02 | MFA enforcement via Supabase Auth TOTP | Security | Must-Have |
| AUTH-03 | 15-minute session timeout with re-authentication | HIPAA | Must-Have |
| AUTH-04 | Account lockout after 5 failed attempts | Security | Must-Have |
| AUTH-05 | JWT claims include user_id, org_id, role | Authorization | Must-Have |
| AUTH-06 | Emergency access procedures (break-glass) | HIPAA | Must-Have |
| AUDIT-01 | Database triggers for tamper-proof audit logging | Compliance | Must-Have |
| AUDIT-02 | Append-only audit_log table with RLS | Compliance | Must-Have |
| AUDIT-03 | Audit events: logins, queries, document actions | Compliance | Must-Have |
| RLS-01 | RLS policies on all tenant tables | Security | Must-Have |
| RLS-02 | Storage RLS with org_id path segmentation | Security | Must-Have |

**Gating Criteria:**

- Multi-tenant schema deployed and verified with org isolation
- MFA enrollment flow implemented and tested
- Session timeout enforced at multiple layers (application, database)
- Audit triggers fire correctly for all authenticated operations
- Emergency access workflow designed and documented
- RLS policies prevent cross-org access in all scenarios

**Success Criteria:**

1. **User can complete MFA enrollment:** After email/password registration, user is prompted to scan QR code with authenticator app and verify TOTP code. Enrollment status persisted to users table. No session created until MFA verified.

2. **User session expires after 15 minutes of inactivity:** After 13 minutes of no activity, user receives warning banner. At 15 minutes, session invalidated and user redirected to login. Any authenticated API call after timeout returns 401 with session_expired reason.

3. **Failed login lockout activates after 5 attempts:** After 5 failed attempts within 15 minutes, account locked. Lockout persists for 15 minutes or until admin reset. Failed attempts logged to audit_log with IP address and user agent.

4. **Emergency access grants time-limited elevated permissions:** Admin can activate emergency access with dual authorization (second admin approval). Access expires after 4 hours automatically. All emergency access events logged separately with mandatory post-access justification.

5. **Audit log captures all authenticated events:** Every login (success/failure), MFA enrollment, session creation, session expiration, and authorization decision recorded in audit_log with user_id, org_id, IP, timestamp, and request_id. No UPDATE or DELETE operations possible on audit records.

6. **RLS enforces org boundaries at database level:** Even with direct database connection and valid credentials, queries return only rows matching authenticated user's org_id. Attempting to query across organizations returns zero rows, not an error.

**Pitfall Mitigations Addressed:**

- **Authentication Failures (CRITICAL):** MFA enforcement, session timeout, account lockout prevent unauthorized access
- **Incomplete Audit Trails (CRITICAL):** Database triggers capture all operations regardless of access path
- **Cross-Tenant Data Leaks (CRITICAL):** RLS on all tables with org_id filtering

**Effort Estimate:** 40-60 hours

---

## Phase 2: Document Management & RAG

**Goal:** Implement document ingestion pipeline with clinical-aware chunking, pgvector storage, and basic RAG query flow.

**Duration:** 3-4 weeks

**Research Flags:** `needs-research` — Medical embedding model evaluation, PDF processing library selection, citation verification pipeline

**Dependencies:** Phase 1 complete (auth infrastructure, RLS, audit logging required)

**Requirements Mapped:**

| ID | Requirement | Category | Priority |
|----|-------------|----------|----------|
| DOC-01 | Document upload with drag-and-drop | Features | Must-Have |
| DOC-02 | File type validation (PDF, TXT, DOCX) | Security | Must-Have |
| DOC-03 | Clinical-aware chunking (512 tokens, 128 overlap) | RAG | Must-Have |
| DOC-04 | Embedding generation with text-embedding-3-small | RAG | Must-Have |
| DOC-05 | pgvector storage with org-scoped search | RAG | Must-Have |
| DOC-06 | Document status tracking (processing, ready, error) | Features | Must-Have |
| DOC-07 | Document metadata: name, upload date, chunk count | Features | Must-Have |
| DOC-08 | Delete document removes embeddings | Features | Must-Have |
| DOC-09 | Org-scoped knowledge base visibility | RLS | Must-Have |
| DOC-10 | Medical embedding evaluation (PubMedBERT vs general) | RAG | Research |
| DOC-11 | Document versioning for audit trail | Compliance | Nice-to-Have |

**Gating Criteria:**

- Documents upload successfully and persist with correct org_id
- Chunking preserves clinical section structure (headers included)
- Embeddings stored in pgvector and searchable with cosine similarity
- Vector search returns results only from authenticated user's organization
- Processing status updates correctly through ingestion pipeline
- Deletion removes both document record and all associated chunks/embeddings

**Success Criteria:**

1. **User can upload clinical documents with validation:** Drag-and-drop or file picker accepts PDF, TXT, DOCX files. File size limit enforced (e.g., 50MB). Invalid file types rejected with clear error. File validated for clinical content patterns before processing begins.

2. **Documents process through pipeline with visible status:** Upload initiates processing status. User sees real-time status: uploading → parsing → chunking → embedding → ready. Errors at any stage display with retry option. Processing timeout prevents infinite loops.

3. **Clinical-aware chunking preserves section context:** Documents split into 512-token chunks with 128-token overlap. Section headers preserved in chunk metadata. Related clinical concepts remain in same chunk. No chunk contains partial sentences at boundaries.

4. **Vector search returns org-scoped results:** User asks clinical question. Query embedded with text-embedding-3-small. pgvector search returns top-5 chunks with cosine similarity >0.7. All returned chunks belong to user's organization. No cross-org results under any scenario.

5. **User can delete documents with cascade removal:** Admin deletes document. Document record removed. All associated chunks removed from pgvector. Storage files deleted. Audit log records deletion event with document metadata and timestamp.

6. **Medical embedding evaluation completed:** Comparison of text-embedding-3-small vs PubMedBERT/BioClinicalBERT on clinical terminology. Performance trade-offs documented. Decision recorded for production embedding choice.

**Pitfall Mitigations Addressed:**

- **Medical Hallucinations (CRITICAL):** Groundedness foundation with org-scoped vector search reduces retrieval of irrelevant documents
- **Cross-Tenant Data Leaks (CRITICAL):** pgvector search with org_id filter prevents cross-tenant contamination
- **Document Processing Issues (MEDIUM):** Clinical-aware chunking preserves semantic coherence
- **Vector Database Security (HIGH):** pgvector with proper RLS integration

**Effort Estimate:** 60-80 hours

---

## Phase 3: Safety Layer

**Goal:** Implement clinical safety constraints, PHI prevention, citation system with verification, and query intent classification.

**Duration:** 3-4 weeks

**Research Flags:** `needs-research` — Citation verification implementation patterns, query intent classification for clinical contexts

**Dependencies:** Phase 2 complete (RAG pipeline required, documents must be searchable)

**Requirements Mapped:**

| ID | Requirement | Category | Priority |
|----|-------------|----------|----------|
| SAFE-01 | Clinical safety system prompts | Safety | Must-Have |
| SAFE-02 | PHI detection and blocking at input layer | Security | Must-Have |
| SAFE-03 | Citation system with source attribution | RAG | Must-Have |
| SAFE-04 | Citation verification pipeline | Safety | Must-Have |
| SAFE-05 | Query intent classification | Safety | Must-Have |
| SAFE-06 | Groundedness scoring per response | Safety | Must-Have |
| SAFE-07 | No-response path for insufficient retrieval | Safety | Must-Have |
| SAFE-08 | Confidence indicator per response | Features | Nice-to-Have |
| SAFE-09 | System prompt isolation from user input | Security | Must-Have |
| SAFE-10 | Prompt injection detection and blocking | Security | Must-Have |

**Gating Criteria:**

- System prompts cannot be overridden by user input
- PHI patterns detected and blocked/redacted before reaching LLM
- Every response includes verifiable citations to source chunks
- Citation verification validates DOIs, PMIDs, and source excerpts
- Query intent classification distinguishes clinical queries from general questions
- Groundedness score calculated for each response

**Success Criteria:**

1. **System prompts enforce clinical safety rules:** Response generated with temperature 0.1. System prompt injects: "Answer ONLY from provided documents. Never make up information. Cite sources. If uncertain, say so." Model follows constraints in >95% of test queries.

2. **PHI input patterns blocked or redacted:** User input containing SSN, MRN, DOB, or address patterns blocked with "Input contains prohibited PHI patterns" error. Email and phone patterns redacted before processing. Audit log records PHI detection events without storing PHI values.

3. **Every AI response includes verifiable source citations:** Response displays inline citations like [Source: chunk_id, relevance: 0.85]. Citations include document title, section path, and exact excerpt. User can click citation to view source document context.

4. **Citation verification catches fabricated citations:** Verification pipeline checks every citation against actual source chunks. Fabricated citations flagged for human review. Verified citation rate >95%. Failed verifications logged with response ID for analysis.

5. **Query intent classification routes appropriately:** Clinical decision queries flagged for additional verification. General protocol questions proceed normally. Intent classification accuracy >90% on test set. Misclassified queries handled gracefully with fallback.

6. **Prompt injection attempts detected and blocked:** Input containing injection patterns (e.g., "Ignore previous instructions", "System prompt:") detected. Suspicious inputs blocked or sanitized. Attempt logged to audit_log with full input for security analysis.

7. **Groundedness scoring prevents ungrounded responses:** Response groundedness calculated by comparing claims to retrieved chunks. Score below threshold triggers fallback: "I don't have sufficient evidence to answer this question." Low-groundedness responses logged for analysis.

**Pitfall Mitigations Addressed:**

- **Medical Hallucinations (CRITICAL):** Clinical safety prompts, groundedness scoring, citation verification
- **PHI Leakage (CRITICAL):** PHI detection at input layer, output validation
- **Prompt Injection (CRITICAL):** Input sanitization, system prompt isolation, injection detection
- **Citation Fabrication (CRITICAL):** Citation verification pipeline, source cross-reference
- **Clinical Context Misinterpretation (HIGH):** Query intent classification, confidence indicators

**Effort Estimate:** 60-80 hours

---

## Phase 4: Compliance & Features

**Goal:** Implement document approval workflow, role-based access controls, user feedback mechanisms, and production-ready emergency access.

**Duration:** 2-3 weeks

**Research Flags:** `standard` — Role-based access implementation patterns well-documented

**Dependencies:** Phase 1 complete (auth, RLS, audit), Phase 3 complete (safety layer for feedback)

**Requirements Mapped:**

| ID | Requirement | Category | Priority |
|----|-------------|----------|----------|
| COMP-01 | Document approval workflow (admin review) | Features | Nice-to-Have |
| COMP-02 | Role-based access: admin, provider, staff | Authorization | Must-Have |
| COMP-03 | User feedback mechanism ("Was this helpful?") | Features | Nice-to-Have |
| COMP-04 | Audit log export to CSV | Compliance | Nice-to-Have |
| COMP-05 | Role-specific feature visibility | UI/UX | Must-Have |
| COMP-06 | Post-access justification for emergency access | Compliance | Must-Have |
| COMP-07 | User management: invite, assign roles, deactivate | Admin | Must-Have |
| COMP-08 | Organization settings: timeout, MFA policy | Admin | Must-Have |
| COMP-09 | System health dashboard | Admin | Nice-to-Have |
| COMP-10 | Document deprecation notifications | Features | Nice-to-Have |

**Gating Criteria:**

- Admin approval required before documents enter RAG pipeline
- Role-based access controls restrict features by user role
- Feedback mechanism captures user ratings and comments
- Emergency access includes mandatory post-access justification
- Audit log filtering and export functional
- User management operations audit-logged

**Success Criteria:**

1. **Admin approval required before documents indexed:** Uploaded documents enter "pending approval" status. Admin sees pending documents list with preview. Approval moves document to "published" status and triggers indexing. Rejection requires reason. All status changes logged.

2. **Role-based access controls enforce feature visibility:** Staff role: chat interface, conversation history, document viewing. Provider role: all staff features + document upload. Admin role: all features + user management, audit logs, system settings. Unauthorized actions return 403.

3. **User feedback captures helpfulness ratings:** After each AI response, user can rate "Was this helpful?" (thumbs up/down). Optional comment field for feedback. Feedback logged to dedicated table linked to message_id. Feedback analyzed for improvement opportunities.

4. **Emergency access requires post-access justification:** Emergency access activated. Time-limited (4 hours). After access expires or manually ended, user must complete justification form. Justification reviewed by compliance officer. Incomplete justifications trigger escalation.

5. **Audit log filtering and export functional:** Audit page allows filtering by user, date range, action type. Filtered results exportable to CSV. Export operation itself logged. Read-only view for non-admin users (their own events only).

6. **User management operations audit-logged:** Admin can invite new users via email. Roles assigned at invitation. Deactivated users cannot login. All user management actions logged to audit_log with admin user ID.

**Pitfall Mitigations Addressed:**

- **Emergency Access Controls (MEDIUM):** Time-limited access, multi-person authorization, post-access justification
- **Clinical Governance Gaps (MEDIUM):** Document approval workflow, feedback mechanism
- **Data Retention Violations (HIGH):** Audit export supports retention compliance

**Effort Estimate:** 40-60 hours

---

## Phase 5: Hardening & Monitoring

**Goal:** Production hardening, penetration testing, monitoring dashboards, governance integration, and documentation.

**Duration:** 2-3 weeks

**Research Flags:** `standard` — Monitoring patterns well-documented, pen testing services standard

**Dependencies:** Phase 4 complete (all features implemented)

**Requirements Mapped:**

| ID | Requirement | Category | Priority |
|----|-------------|----------|----------|
| HARD-01 | Production deployment configuration | Infrastructure | Must-Have |
| HARD-02 | Penetration testing (external) | Security | Must-Have |
| HARD-03 | Monitoring and alerting dashboards | Operations | Must-Have |
| HARD-04 | Jailbreak resilience testing | Security | Must-Have |
| HARD-05 | Clinical governance documentation | Compliance | Must-Have |
| HARD-06 | Security incident response procedures | Security | Must-Have |
| HARD-07 | HIPAA compliance documentation package | Compliance | Must-Have |
| HARD-08 | Disaster recovery procedures | Operations | Nice-to-Have |
| HARD-09 | Rate limiting per org/user | Security | Must-Have |
| HARD-10 | Performance optimization for production | Performance | Must-Have |

**Gating Criteria:**

- Production deployment passes security scan
- External penetration test completed with critical/high findings remediated
- Monitoring dashboards operational with alerting
- Jailbreak testing shows resilience to common attack vectors
- Governance documentation complete
- Rate limiting prevents abuse while allowing normal use

**Success Criteria:**

1. **Production deployment passes security scan:** Deployment configuration reviewed for security misconfigurations. No critical or high vulnerabilities in dependencies. SSL/TLS configuration verified. Environment variables secured. Secrets rotation procedures documented.

2. **External penetration test completed:** Third-party penetration test executed. Critical and high findings remediated before launch. Medium findings tracked with remediation timeline. Low findings documented for future iterations. Report archived for compliance.

3. **Monitoring dashboards operational:** Real-time dashboards show: query volume, error rates, latency percentiles, auth events, audit completeness. Alert thresholds configured for anomalies. PagerDuty/notification integration functional. Dashboard access restricted to authorized personnel.

4. **Jailbreak resilience validated:** Common jailbreak patterns tested (roleplay, encoding, distraction). Success rate <5% on sophisticated attacks. Failed attacks logged for analysis. Mitigation updates deployed as new attack patterns emerge.

5. **Clinical governance framework documented:** Governance committee structure defined. Accountability framework for AI-assisted decisions documented. Clinician training materials completed. Adverse event reporting specific to AI incidents established.

6. **HIPAA compliance documentation complete:** BAA with Supabase verified. BAA with OpenAI verified. Data processing agreements documented. SecurityRule compliance matrix completed. Audit procedures documented. Breach notification procedures documented.

7. **Rate limiting prevents abuse:** Per-user rate limits (e.g., 60 queries/minute). Per-org rate limits (e.g., 1000 queries/minute). Rate limit headers returned on 429 responses. Abuse detected and blocked automatically. Legitimate high-volume usage accommodated with tier upgrades.

**Pitfall Mitigations Addressed:**

- **Inadequate Model Security (HIGH):** Jailbreak resilience testing, ongoing red teaming
- **Incomplete Audit Trails (CRITICAL):** Monitoring dashboards, log integrity verification
- **Authentication Failures (CRITICAL):** Rate limiting, production security scanning
- **Cross-Tenant Data Leaks (CRITICAL):** Final verification with pen test

**Effort Estimate:** 40-60 hours

---

## Requirements Coverage Summary

| Category | Requirements | Phases | Status |
|----------|--------------|--------|--------|
| Authentication | AUTH-01 through AUTH-06 | Phase 1 | Mapped |
| Audit Logging | AUDIT-01 through AUDIT-03 | Phase 1 | Mapped |
| RLS Enforcement | RLS-01 through RLS-02 | Phase 1 | Mapped |
| Document Management | DOC-01 through DOC-11 | Phase 2 | Mapped |
| Safety Layer | SAFE-01 through SAFE-10 | Phase 3 | Mapped |
| Compliance | COMP-01 through COMP-10 | Phase 4 | Mapped |
| Hardening | HARD-01 through HARD-10 | Phase 5 | Mapped |

**Total Requirements:** 41
**Mapped to Phases:** 41 (100%)
**Orphaned Requirements:** 0

---

## Research Requirements by Phase

| Phase | Research Topic | Confidence | Source |
|-------|--------------|------------|--------|
| Phase 1 | Supabase MFA Implementation | MEDIUM | Supabase Auth documentation |
| Phase 1 | OpenAI BAA Status | MEDIUM | OpenAI Enterprise documentation |
| Phase 2 | Medical Embedding Evaluation | MEDIUM | PubMedBERT, BioClinicalBERT papers |
| Phase 2 | PDF Processing Library | HIGH | LangChain.js, pdf-parse-lib |
| Phase 3 | Citation Verification Pipeline | MEDIUM | Vercel AI SDK, verification patterns |
| Phase 3 | Query Intent Classification | LOW | Clinical decision support research |
| Phase 4 | Emergency Access Patterns | MEDIUM | HIPAA OCR guidance |
| Phase 5 | Jailbreak Testing Patterns | HIGH | OWASP AI Security |

---

## Effort Summary

| Phase | Estimated Hours | Key Work Items |
|-------|----------------|----------------|
| Phase 1: Foundation & Auth | 40-60 | Multi-tenant schema, MFA flow, session management, audit triggers, RLS policies, emergency access |
| Phase 2: Document Management & RAG | 60-80 | Document upload, chunking pipeline, pgvector integration, vector search, medical embedding evaluation |
| Phase 3: Safety Layer | 60-80 | Clinical prompts, PHI detection, citation system, verification pipeline, intent classification, groundedness scoring |
| Phase 4: Compliance & Features | 40-60 | Approval workflow, RBAC, feedback mechanism, audit export, user management, emergency access |
| Phase 5: Hardening & Monitoring | 40-60 | Production deployment, pen testing, monitoring dashboards, governance docs, rate limiting |

**Total Estimated Effort:** 240-340 hours (6-9 weeks at 40 hours/week)

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Medical embedding choice affects retrieval quality | HIGH | MEDIUM | Evaluation in Phase 2, fallback to general embeddings |
| Citation verification complexity underestimated | MEDIUM | HIGH | Dedicated research in Phase 3, MVP verification scope |
| Emergency access patterns unclear | MEDIUM | MEDIUM | HIPAA OCR guidance research in Phase 1 |
| Pen test findings require rework | MEDIUM | LOW | Buffer time in Phase 5, iterative remediation |
| Model cost exceeds budget | LOW | LOW | GPT-4o already specified, rate limiting in place |

---

## Next Steps

1. **Approve roadmap** or request modifications to phase structure
2. **Begin Phase 1 planning** with `/gsd-plan-phase 1`
3. **Execute Phase 1 research** for MFA implementation and BAA verification
4. **Initialize project scaffolding** during Phase 1 setup

---

## Notes

- **Phase ordering respects dependency chain:** Foundation → RAG → Safety → Compliance → Hardening
- **Critical pitfalls integrated throughout:** Each phase addresses relevant CRITICAL pitfalls through specific success criteria
- **Research flags indicate uncertainty:** Phases marked `needs-research` require investigation before implementation
- **Success criteria observable and testable:** Each criterion describes user-facing behavior, not implementation details
- **Coverage validated:** All 41 requirements mapped to exactly one phase, no orphans

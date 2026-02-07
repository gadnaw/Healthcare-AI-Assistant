# Feature Landscape: HIPAA-Compliant Healthcare AI Assistant

**Project:** Healthcare AI Assistant (HIPAA-Aware RAG)
**Researched:** February 7, 2026
**Research Mode:** Ecosystem Survey
**Confidence Level:** MEDIUM (based on domain expertise; WebSearch unavailable for verification)

## Executive Summary

This feature landscape analysis maps the complete feature ecosystem for a HIPAA-compliant healthcare AI assistant focused on clinical protocol/guideline retrieval. The research identifies critical safety features that prevent medical hallucinations, audit requirements for HIPAA compliance, and UX patterns optimized for clinical workflows. Key findings indicate that while the core RAG pipeline is well-understood, healthcare-specific features like source citation systems, audit trail architecture, and PHI prevention require careful implementation. The recommended feature priority places safety and compliance features first, followed by usability enhancements that support clinical decision-making without introducing workflow friction.

**Critical Insight:** Healthcare AI assistants differ fundamentally from general-purpose chatbots because errors can directly harm patients. Every feature must be evaluated against the "could this contribute to a medical error?" criterion. The specification correctly emphasizes zero hallucinations as the core value proposition, but this requires more than just RAG—it demands citation systems that make the source connection explicit and unmissable for clinical users.

## Table of Contents

1. [Core Feature Categories](#core-feature-categories)
2. [Clinical Safety Features](#clinical-safety-features)
3. [HIPAA Compliance Features](#hipaa-compliance-features)
4. [RAG and Citation Features](#rag-and-citation-features)
5. [Multi-Tenant Architecture Features](#multi-tenant-architecture-features)
6. [Document Management Features](#document-management-features)
7. [User Experience Features](#user-experience-features)
8. [Recommended Feature Priority](#recommended-feature-priority)
9. [Missing Features to Consider](#missing-features-to-consider)
10. [Confidence Assessment](#confidence-assessment)

---

## Core Feature Categories

### Feature Category Matrix

| Category | Priority | Complexity | Clinical Safety Impact | HIPAA Required |
|----------|----------|------------|----------------------|-----------------|
| PHI Prevention | Critical | Medium | Critical | Yes |
| Audit Logging | Critical | Medium | High | Yes |
| Source Citation | Critical | High | Critical | No |
| Session Security | Critical | Low | High | Yes |
| RAG Pipeline | Critical | High | Critical | No |
| Multi-Tenant Isolation | Critical | Medium | High | Yes |
| Role-Based Access | High | Low | High | Yes |
| Document Approval | High | Medium | High | No |
| Confidence Indicators | Medium | Medium | Medium | No |
| User Feedback | Low | Low | Low | No |

### Feature Definitions by Category

#### Critical Features (Must-Have, MVP)

Critical features are those whose absence would either violate HIPAA requirements or introduce unacceptable patient safety risks. These features must be fully implemented before any clinical deployment.

**PHI Prevention (Critical):** The system must actively prevent Protected Health Information from entering AI prompts. This is not just a UI concern—it requires architectural safeguards including input sanitization, PHI detection and redaction, and explicit warnings when users attempt to include patient identifiers. The specification mentions "no PHI in AI prompts" but this requires active enforcement, not just assumption of user compliance.

**Audit Logging (Critical):** Every AI interaction must be logged with full context including user identity, timestamp, query content, retrieved documents, response content, and session metadata. The logs must be append-only and tamper-proof to meet HIPAA audit requirements. This is discussed further in the HIPAA Compliance Features section.

**Source Citation (Critical):** Every AI response must include explicit citations to the source documents used to generate that response. The citation must be specific enough that a clinician could locate the exact passage. This is the primary mechanism for preventing and detecting hallucinations—if the AI generates an answer without a citation, it should be flagged as potentially erroneous.

**Session Security (Critical):** The 15-minute timeout specified is appropriate for HIPAA compliance, but session security extends beyond timeout. Consider implementing session binding to device fingerprints, concurrent session limits, and automatic session termination on tab close or browser exit.

**RAG Pipeline (Critical):** The complete pipeline from document ingestion through vector search to GPT-4o response must be implemented with proper error handling at each stage. Failures should be graceful and logged, with no possibility of silent hallucination due to retrieval failures.

#### High Priority Features (Should-Have, Pre-Launch)

High priority features enhance safety, compliance, or usability but can be deferred slightly beyond MVP if necessary. However, clinical deployment should not proceed without these features.

**Role-Based Access (High):** The specification identifies three roles (admin, provider, staff) but role definitions need more granularity. Consider sub-roles within these categories—for example, a "clinical pharmacist" role might have different document access than a "registered nurse" role, even though both are "providers."

**Document Approval Workflow (High):** Clinical protocols must be vetted before they enter the knowledge base. The workflow should include version tracking, approval signatures, effective dates, and retirement dates for outdated protocols.

**Multi-Tenant Isolation (High):** Organizations must be strictly isolated. A user from Organization A must never see Organization B's documents, and the UI must make this isolation visible and obvious to prevent confusion.

#### Medium Priority Features (Nice-to-Have, Post-MVP)

These features enhance the user experience and provide valuable quality signals but do not directly impact safety or compliance.

**Confidence Indicators (Medium):** AI-generated responses should include calibrated confidence scores that help clinicians understand when they should verify the information through additional sources.

**User Feedback (Medium):** Simple thumbs-up/thumbs-down feedback provides quality signals for continuous improvement.

**Bulk Upload (Medium):** Organizations with existing protocol libraries need efficient bulk import capabilities.

---

## Clinical Safety Features

### The Safety-First Design Principle

Healthcare AI assistants operate in a fundamentally different risk environment than general-purpose AI systems. When a consumer asks a chatbot for restaurant recommendations and receives a hallucinated answer, the consequence is a bad dinner. When a clinician asks for a dosing protocol and receives a hallucinated answer, the consequence could be patient harm or death. This risk profile demands a safety-first design philosophy where every feature is evaluated against the question: "Could this feature, or its absence, contribute to a medical error?"

The specification's core value proposition—"Zero medical hallucinations"—is the right north star, but achieving this requires systematic attention to every pathway through which hallucinations could occur or appear to occur. Hallucinations in clinical AI can arise from multiple sources:

1. **Model Hallucination:** The LLM generates plausible-sounding but incorrect information regardless of retrieved context.
2. **Retrieval Failure:** Relevant documents exist but are not retrieved, causing the model to hallucinate a response.
3. **Context Confusion:** Retrieved documents are misapplied, with the model using information from the wrong source.
4. **Citation Fabrication:** The model generates plausible-sounding but fake citations.
5. **User Misinterpretation:** The AI provides a correct answer with correct citations, but the user misapplies it to an inappropriate clinical scenario.

Each of these failure modes requires specific countermeasures.

### Hallucination Prevention Architecture

#### Primary Defense: Citation-Required Responses

Every AI response must include at least one citation to a source document. The system should be architected such that a response without citations is not merely discouraged but technically prevented. This requires:

**Citation Integration in Response Generation:** The prompt to GPT-4o should explicitly require citations in a structured format. For example:

```
You are a clinical knowledge assistant. You must answer ONLY based on the provided documents.

CONTEXT DOCUMENTS:
{retrieved_documents}

INSTRUCTIONS:
1. Answer the user's question based ONLY on the context documents above
2. If the context documents do not contain sufficient information to answer, say "I don't have enough information to answer this question"
3. Cite your sources using the format [Document: {doc_id}, Section: {section}]
4. If you cannot answer the question from the provided documents, do not speculate

USER QUESTION: {user_question}

YOUR RESPONSE:
```

**Citation Verification Layer:** After the model generates a response, implement a verification step that:
1. Extracts all citations from the response
2. Validates that each cited document exists
3. Verifies that the cited section contains the information attributed to it
4. Flags responses with fabricated citations for human review

**No-Response Path:** When the retrieved documents do not contain sufficient information, the system must explicitly say "I don't have enough information to answer this question" rather than attempting to answer from general knowledge. This explicit uncertainty is a safety feature—it prevents the false confidence of a plausible but ungrounded answer.

#### Secondary Defense: Retrieval Confidence Scoring

Not all retrievals are equally reliable. Implement a retrieval confidence system:

**High Confidence:** Multiple documents with high semantic similarity contain directly relevant information.

**Medium Confidence:** Single document with high similarity contains relevant information.

**Low Confidence:** Low semantic similarity or ambiguous relevance.

**No Retrieval:** No documents matched the query.

Each confidence level should trigger different behaviors:
- High Confidence: Standard citation format
- Medium Confidence: Enhanced citation format with proximity indicators
- Low Confidence: Explicit warning in response that "This answer is based on loosely related documents—please verify applicability"
- No Retrieval: Block response generation, suggest alternative queries

#### Tertiary Defense: Medical Terminology Awareness

Clinical guidelines often use precise medical terminology. Implement terminology awareness in the retrieval system:

**Synonym Expansion:** The retrieval system should expand clinical terms to their synonyms, abbreviations, and common misspellings. "NPO" should match documents containing "nothing by mouth."

**Acronym Disambiguation:** Medical acronyms are frequently ambiguous. "BP" could mean "blood pressure" or "bipolar disorder." Context-aware expansion should disambiguate based on surrounding terms.

**Hierarchy Awareness:** Medical ontologies (SNOMED CT, ICD-10) provide hierarchical relationships. A query for "pneumonia" should retrieve documents about "lower respiratory infection" if the ontology mapping exists.

### Clinical Workflow Integration

#### EHR Integration Considerations

While the specification focuses on a standalone system, clinical utility is vastly enhanced through EHR integration. Consider future roadmap items for:

**Embedded Access:** Clinicians should be able to access the AI assistant without leaving the EHR workflow.

**Context Passing:** Relevant patient context (without PHI) can be passed to refine searches—for example, "antibiotic protocols for pneumonia in diabetic patients."

**Documentation Assistance:** AI-generated summaries can be inserted into clinical notes, with proper citation to source protocols.

#### Alert and Notification Patterns

Clinical decision support systems often use alert patterns, but these can cause "alert fatigue" when overused. Consider:

**Passive Citation:** Source citations should be visible without requiring action, supporting natural workflow rather than interrupting it.

**Explicit Uncertainty:** When the AI is uncertain, it should be explicitly stated rather than buried in UI elements.

**Verification Prompts:** At appropriate moments (before critical actions), the system can prompt: "Have you verified this protocol against the current version?"

### Safety Verification Features

#### Document Currency Tracking

Clinical protocols expire and are updated. The system must track:

**Effective Dates:** When protocols become active.

**Expiration Dates:** When protocols should no longer be used.

**Retirement Flags:** Marked documents that should not be used.

**Version History:** Track which version of a protocol is in effect.

When a user queries a topic, the response should indicate:
- "This information is based on Protocol X (Version 3.2, Effective January 2024)"
- If using an older version: "Note: A newer version of this protocol (Version 4.0) exists as of October 2024"

#### Cross-Reference Validation

When one protocol references another, the system should validate that:
- The referenced document exists in the knowledge base
- The referenced section is accessible to the user's role
- The referenced document is current (not expired or retired)

### Confidence Assessment Summary

| Safety Feature | Priority | Implementation Complexity | Safety Impact |
|----------------|----------|---------------------------|---------------|
| Citation-Required Responses | Critical | High | Critical |
| Citation Verification | Critical | Medium | Critical |
| No-Response on Insufficient Retrieval | Critical | Low | Critical |
| Retrieval Confidence Scoring | High | Medium | High |
| Medical Terminology Expansion | High | Medium | Medium |
| Document Currency Tracking | High | Low | High |
| Cross-Reference Validation | Medium | Medium | Medium |

---

## HIPAA Compliance Features

### HIPAA Requirements Overview

The Health Insurance Portability and Accountability Act (HIPAA) establishes requirements for protecting Protected Health Information (PHI). For an AI assistant system, HIPAA compliance spans multiple domains:

**Administrative Safeguards:** Policies, procedures, and workforce training.

**Physical Safeguards:** Physical security of servers, devices, and facilities.

**Technical Safeguards:** Access controls, audit controls, integrity controls, and transmission security.

The features discussed in this section focus primarily on Technical Safeguards, particularly Audit Controls and Access Controls as they relate to AI interaction logging and user authentication.

### Audit Logging Requirements

#### Mandatory Audit Events

HIPAA requires logging of all access to PHI. For an AI assistant that does not store PHI, the audit requirements extend to:

**Authentication Events:**
- Successful login (with timestamp, user ID, method)
- Failed login attempts (with timestamp, attempted user ID, failure reason)
- Logout events
- Password changes
- MFA enrollment and resets

**Authorization Events:**
- Role changes
- Permission grants
- Document access grants
- Organization membership changes

**AI Interaction Events (Most Critical):**
- Every query submitted (full query text)
- Retrieved documents (document IDs, but not content if it contains PHI)
- Response generated (full response text)
- Response modifications or redactions
- Export actions (if users can export responses)

**System Events:**
- Document uploads (metadata, not content)
- Document deletions
- Document approval/rejection
- Audit log exports
- System configuration changes

#### Audit Log Architecture

**Append-Only Storage:** Audit logs must be append-only. Implement via:
- Database triggers that prevent updates/deletes
- Separate audit database with no update/delete permissions granted to application users
- Write-only audit tables
- Cryptographic chaining (each entry includes hash of previous entry)

**Immutable Fields:** Certain fields must never change:
- User ID (if user is deactivated, preserve the record)
- Timestamp (cannot be backdated)
- Query content (cannot be modified)
- Document IDs (cannot be swapped)

**Log Retention:** HIPAA requires 6 years retention minimum. Implement:
- Automated archival to cold storage after primary retention period
- Integrity verification during archive and restore
- Secure deletion procedures after retention period expires

**Log Structure:**

```json
{
  "event_id": "uuid",
  "event_type": "ai_query",
  "timestamp": "ISO8601 UTC",
  "user_id": "uuid",
  "organization_id": "uuid",
  "session_id": "uuid",
  "ip_address": "192.168.1.1",
  "user_agent": "Mozilla/5.0...",
  "query_hash": "sha256 of query",
  "retrieved_documents": [
    {
      "document_id": "uuid",
      "document_version": "3.2",
      "relevance_score": 0.87,
      "chunk_id": "uuid"
    }
  ],
  "response_metadata": {
    "model": "gpt-4o",
    "citations": [
      {"document_id": "uuid", "section": "2.1"}
    ],
    "confidence_score": 0.94,
    "response_length": 450
  },
  "compliance_flags": [],
  "integrity_hash": "sha256 of entire record"
}
```

#### HIPAA Audit Access Controls

**Audit Log Visibility by Role:**

| Role | Can View Own Logs | Can View Org Logs | Can Export Logs | Can Modify Logs |
|------|-------------------|-------------------|-----------------|-----------------|
| Staff | Yes | No | No | No |
| Provider | Yes | No | No | No |
| Admin | Yes (org) | Yes | Limited | No |
| Compliance Officer | Yes (all) | Yes | Yes | No |
| System | N/A | N/A | Yes | Write-only |

**Audit Log Review Requirements:**
- Admins should review audit logs regularly (weekly minimum)
- Automated alerts for suspicious patterns:
  - Multiple failed login attempts
  - Queries outside normal hours
  - Bulk exports
  - Access to documents outside role permissions

### Access Control Requirements

#### Multi-Factor Authentication (MFA)

The specification requires MFA via Supabase Auth TOTP enrollment. Implementation considerations:

**MFA Enrollment Flow:**
1. User logs in with username/password
2. System checks if MFA is required for user's role
3. If not enrolled, redirect to enrollment flow
4. Display QR code for authenticator app
5. Verify enrollment with TOTP code
6. Provide backup codes (one-time use, store hash)
7. Require MFA verification on every subsequent login

**MFA Requirements by Role:**

| Role | MFA Required | Remember Device | grace Period |
|------|--------------|-----------------|--------------|
| Staff | Yes | 7 days | 24 hours |
| Provider | Yes | 7 days | 24 hours |
| Admin | Yes | No | None |

**MFA Bypass Rules:**
- MFA cannot be disabled by users
- Temporary bypass requires compliance officer approval and logs the exception
- Emergency access procedures with dual authorization

#### Session Management

**Session Timeout (HIPAA Requirement):**
The specification's 15-minute timeout is appropriate for HIPAA compliance but consider:

**Activity Detection:** Implement activity detection (mouse movement, keyboard input) to extend sessions during active use. The 15-minute timeout should apply to idle time, not absolute time.

**Absolute Session Limit:** Maximum session duration regardless of activity (e.g., 8 hours for a work shift).

**Concurrent Session Limits:** Prevent simultaneous logins from multiple devices:
- Single session per user (most restrictive)
- Limited concurrent sessions (e.g., 3) with session management UI
- Session termination when new login occurs

**Session Binding:** Bind sessions to device characteristics:
- IP address validation (with timeout for IP changes)
- User agent validation
- Consider device fingerprinting for higher security

**Session Termination Events:**
- Timeout expiration
- User logout
- Admin termination (remote logout)
- Security violation detection
- Password change
- MFA reset

#### Role-Based Access Control (RBAC)

**Role Definitions:**

**Admin:**
- Manage users within organization
- Upload and approve documents
- View organizational audit logs
- Configure organization settings
- Cannot view individual query content (segregation of duties)

**Provider:**
- Search and query knowledge base
- View documents
- View audit logs for own queries
- Provide feedback on responses

**Staff:**
- Search and query knowledge base
- View documents (limited by document permissions)
- View audit logs for own queries
- Cannot upload documents

**Document-Level Permissions:**
Beyond role-based access, implement document-level permissions:
- Some protocols may be restricted to specific specialties
- Implementation: Document metadata includes required roles
- Retrieval filters documents based on user's role

### PHI Prevention Architecture

#### PHI Detection and Prevention

The specification correctly notes that the system should contain no PHI in AI prompts. This requires active implementation:

**Input Sanitization Layer:**
- Detect potential PHI in user queries
- Patterns: Names, dates, MRN patterns, phone numbers, email addresses, SSN patterns
- redact detected PHI before passing to retrieval or generation

**PHI Detection Methods:**
- Regular expression matching for patterns (SSN, phone, email, MRN)
- Named entity recognition for person names and locations
- Context-aware detection (e.g., "patient with" followed by names)

**PHI Handling Actions:**

| Scenario | Action | User Notification |
|----------|--------|-------------------|
| Potential PHI detected | Redact and continue | Warning banner |
| Clear PHI detected | Block and require rephrasing | Error message |
| Repeated PHI attempts | Log for compliance review | Alert admin |
| Acceptable context (general questions) | Allow with confirmation | N/A |

**User Interface PHI Warnings:**
- Placeholder text in search box: "Ask about protocols—do not include patient information"
- Tooltip on focus: "This system does not store PHI. Remove patient identifiers from your query."
- Pre-populated warning when PHI-like patterns detected: "It appears your query may contain patient information. This system should only be used for general protocol questions, not patient-specific inquiries."

#### PHI in Retrieved Documents

Even though documents are clinical protocols, they may contain embedded PHI (e.g., example cases, historical protocols with patient information). Implement:

**Document Screening:** During upload, scan documents for PHI patterns.

**PHI Redaction Before Indexing:** If PHI is detected:
- Redact before indexing
- Note redaction in document metadata
- Store original document separately (with access restrictions)

**Chunk-Level PHI Handling:** PHI can appear in specific chunks:
- Flag chunks containing PHI
- Exclude PHI-containing chunks from vector index
- Provide alternate retrieval path with additional authentication

### Transmission Security

While not a feature per se, ensure:

**TLS 1.3:** Minimum for all connections.

**Certificate Pinning:** For mobile applications.

**API Security:** All API calls authenticated and authorized.

**No Logging of Sensitive Data:** Ensure PHI redaction before any logging.

### HIPAA Compliance Feature Summary

| Feature | HIPAA Requirement | Implementation Priority | Complexity |
|---------|-------------------|------------------------|------------|
| Audit Logging | Required (164.312(b)) | Critical | Medium |
| MFA | Addressable (164.312(d)) | Critical | Low |
| Session Timeout | Required | Critical | Low |
| Access Controls | Required (164.312(a)(1)) | Critical | Medium |
| PHI Prevention | Required | Critical | Medium |
| Transmission Security | Required (164.312(e)(1)) | Infrastructure | Low |
| Emergency Access | Required (164.312(a)(2)(ii)) | High | Medium |
| Automatic Logoff | Required (164.312(a)(2)(iii)) | Critical | Low |

---

## RAG and Citation Features

### RAG Pipeline Architecture

#### Document Ingestion Pipeline

The RAG pipeline for clinical guidelines requires specialized handling beyond general-purpose RAG:

**Document Type Support:**

| Document Type | Complexity | Key Considerations |
|---------------|------------|---------------------|
| PDF | High | Complex layout extraction, table handling, figure descriptions |
| Word (.docx) | Medium | Structured text, embedded tables, footnotes |
| Plain Text | Low | Simple chunking, but loses formatting |
| Markdown | Low | Structure preserved, good for guidelines |
| HTML | Medium | Extract structured content, strip navigation |

**PDF Processing Pipeline:**

1. **Text Extraction:** Use PDF text extraction library (pdfplumber, PyMuPDF, or similar).
2. **Structure Recognition:** Identify headers, paragraphs, tables, lists.
3. **Table Handling:** Extract tables as structured data with row/column mapping.
4. **Image Handling:** Extract images with alt-text if available; OCR if necessary.
5. **Metadata Extraction:** Document title, author, date, version.

**Medical Terminology in Documents:**

Clinical guidelines often contain:
- Drug names (generic and brand)
- CPT/ICD-10 codes
- LOINC laboratory codes
- Medical abbreviations
- Anatomical references

Implement terminology normalization during ingestion:
- Drug name standardization (map brand to generic)
- Code extraction and indexing (CPT, ICD-10, LOINC)
- Abbreviation expansion based on specialty context

#### Chunking Strategy

**Why Chunking Matters for Clinical Documents:**

Clinical guidelines have hierarchical structure that naive chunking can destroy. A chunk that splits a dosing table from its indication can lead to dangerous retrieval.

**Recommended Chunking Strategy:**

**Hierarchy-Aware Chunking:**
- Parse document structure (H1, H2, H3 headers)
- Create chunks at section level when possible
- Include parent headers in each chunk for context
- Maximum chunk size: ~1000 tokens (with overlap)

**Example Chunk Structure:**

```
---
Document: "Adult Antibiotic Dosing Protocol"
Section: "3.2 Vancomycin Dosing"
Chunk ID: uuid
Header Path: "Adult Antibiotic Dosing Protocol > 3.2 Vancomycin Dosing"
Content: |
  ## 3.2 Vancomycin Dosing
  
  ### Indications
  MRSA infections, Clostridium difficile (oral), [remaining content...]
  
  ### Dosing
  | Weight | Dose | Frequency |
  |--------|------|-----------|
  | < 50kg | 500mg | q6h |
  | ≥ 50kg | 1000mg | q12h |
---
```

**Chunk Metadata:**
- Document ID
- Section hierarchy
- Chunk position (for ordering)
- Relevant codes (CPT, ICD-10, LOINC)
- Specialty tags

#### Embedding Strategy

**Embedding Model Selection:**

Clinical text requires embeddings trained on medical corpora or fine-tuned for medical terminology.

**Recommended Models:**
- PubMedBERT (fine-tuned on medical literature)
- BioClinicalBERT
- MedBERT

These models outperform general-purpose embeddings on medical queries because they understand:
- Medical terminology relationships
- Drug-disease relationships
- Clinical concept hierarchies

**Chunk Overlap:**
- Use 20-30% overlap between chunks
- Ensures relevant context is retrieved even when query spans chunk boundaries
- Particularly important for multi-step protocols

#### Vector Search Implementation

**Retrieval Strategy:**

**Hybrid Retrieval (Recommended):**

Combine vector similarity with keyword matching:

1. **Vector Retrieval:** Semantic similarity using embedding model
2. **Keyword Retrieval:** BM25 or similar for exact term matching
3. **Reranking:** Combine scores, prioritize documents with both semantic and keyword matches

**Clinical Query Processing:**

Before vector search, process query:

1. **Medical Term Expansion:** Expand acronyms and synonyms
2. **Specialty Detection:** Detect query specialty (cardiology, infectious disease, etc.)
3. **Urgency Detection:** Detect time-sensitive queries (STAT, urgent, emergency)
4. **Patient Context:** Extract non-PHI context (age range, condition if mentioned)

**Retrieval Parameters:**

| Query Type | Top-K | Similarity Threshold | Reranking |
|------------|-------|----------------------|-----------|
| Standard | 10 | 0.7 | Standard |
| Emergency | 5 | 0.5 | Minimal |
| Complex | 15 | 0.6 | Aggressive |

#### Response Generation

**GPT-4o Prompt Engineering:**

The system prompt must be carefully crafted for clinical accuracy:

```
You are a clinical knowledge assistant for healthcare professionals.
Your role is to help clinicians find and understand protocol information.

CRITICAL RULES:
1. Answer ONLY based on the provided context documents
2. If the context does not contain sufficient information, say "I don't have enough information to answer this question"
3. Always cite sources for every factual claim
4. If you are uncertain about any aspect of the answer, explicitly state your uncertainty
5. Do not provide dosing calculations—direct users to calculators or pharmacists
6. Always direct users to verify current versions before clinical use

CONTEXT DOCUMENTS:
{formatted_context}

USER QUESTION: {query}

Answer format:
- Direct answer to the question
- Source citations after each factual claim
- Notes section with any caveats or limitations
- Warning if the information may be outdated

YOUR RESPONSE:
```

### Citation System Design

#### Citation Types

**Inline Citations:**

Format: [Document: ID, Section: Location]

Example: "Vancomycin dosing is 15-20mg/kg based on actual body weight [Document: abx-protocol-2024, Section: 3.2.1]"

**Response Citations Section:**

```
SOURCES:
1. Adult Antibiotic Dosing Protocol (Version 3.2, Effective January 2024)
   - Retrieved for: Vancomycin dosing
   - Relevance: 94%

2. MRSA Treatment Guidelines (Version 2.1, Effective March 2023)
   - Retrieved for: MRSA indication
   - Relevance: 78%
```

**Interactive Citations (Future Enhancement):**

Clickable citations that:
- Open document viewer at relevant section
- Highlight specific text passages
- Show surrounding context

#### Citation Verification

Before returning a response, implement verification:

1. Extract all citations from generated response
2. For each citation:
   - Verify document exists and is accessible
   - Verify document section contains the claimed information
   - Flag discrepancies for review
3. If citations fail verification:
   - Attempt to find correct citations
   - If unable, flag response for human review
   - Never return unverified citations

#### Source Display

**Primary Display: Document Excerpt**

For each cited document, show the relevant excerpt:

```
Source: Adult Antibiotic Dosing Protocol, Section 3.2.1

"Vancomycin should be dosed at 15-20mg/kg of actual body weight rounded to the 
nearest 250mg increment. For patients with renal impairment, use adjusted dosing 
based on CrCl calculations."
```

**Secondary Display: Full Context Link**

Provide link to full document with document-level permissions.

### RAG Feature Summary

| Feature | Clinical Safety Impact | Complexity | Priority |
|---------|----------------------|------------|----------|
| Hierarchy-Aware Chunking | Critical | High | Critical |
| Medical Embedding Model | High | Medium | Critical |
| Citation-Required Generation | Critical | Medium | Critical |
| Citation Verification | Critical | Medium | Critical |
| Hybrid Retrieval | High | High | High |
| Medical Term Expansion | High | Medium | High |
| No-Response on Insufficient Info | Critical | Low | Critical |

---

## Multi-Tenant Architecture Features

### Tenant Isolation Principles

Healthcare organizations require strict data isolation. A hospital's protocols must never be visible to a competing organization, and the UI must make this isolation obvious to prevent confusion.

#### Isolation Levels

**Database Isolation:**

Option 1: Separate Databases per Tenant
- Maximum isolation
- Higher operational complexity
- Best for large enterprise customers

Option 2: Shared Database with Tenant ID
- Common approach
- All tables include organization_id
- RLS policies enforce isolation
- Easier to manage

Option 3: Shared Database with Separate Schemas
- Middle ground
- Schema per tenant
- RLS policies still needed

**Recommendation:** Use Option 2 (shared database with tenant ID) with Supabase RLS for simplicity and manageability.

**Document Storage Isolation:**

- Documents stored in tenant-specific paths in object storage
- Path structure: /tenants/{organization_id}/documents/{document_id}
- Access controlled by database policies
- No cross-tenant document IDs in any system

**Vector Index Isolation:**

- Namespace per tenant in vector database
- Query filters by tenant namespace
- No cross-pollination of embeddings

#### Supabase Implementation

**RLS Policies:**

```sql
-- Enable RLS on all relevant tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE queries ENABLE ROW LEVEL SECURITY;

-- Documents: Users can only see their organization's documents
CREATE POLICY "Users can view org documents" ON documents
  FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations
    WHERE user_id = auth.uid()
  ));

-- Queries: Users can only see their own queries
CREATE POLICY "Users can view own queries" ON queries
  FOR SELECT
  USING (user_id = auth.uid());

-- Admin queries: Admins can see org queries (no query content, just metadata)
CREATE POLICY "Admins can view org queries" ON queries
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
    AND role = 'admin'
  );
```

**Organization Management:**

```sql
-- Organizations table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User-Organization mapping
CREATE TABLE user_organizations (
  user_id UUID REFERENCES auth.users(id),
  organization_id UUID REFERENCES organizations(id),
  role TEXT NOT NULL CHECK (role IN ('admin', 'provider', 'staff')),
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (user_id, organization_id)
);
```

### Cross-Tenant Prevention

**UI Indicators:**

- Organization name prominently displayed in header
- Clear indication of "Organization View" vs personal views
- No cross-organization search suggestions
- Visual separation between organizations if user has access to multiple

**Query Processing:**

- Tenant ID must be validated from session, not query parameter
- Any cross-tenant query attempt logs security event
- Immediate termination of cross-tenant requests

**Admin Controls:**

- Organization super admins can manage their organization's data
- No cross-organization admin access
- Audit logs track all admin actions

### Multi-Tenant Feature Summary

| Feature | Isolation Level | Implementation | Priority |
|---------|-----------------|----------------|----------|
| RLS on All Tables | Critical | Required | Critical |
| Tenant ID Validation | Critical | Required | Critical |
| Organization Management UI | High | Required | High |
| Cross-Tenant Request Blocking | Critical | Required | Critical |
| Multi-Org User Support | Medium | Optional | Low |

---

## Document Management Features

### Document Approval Workflow

Clinical protocols require validation before entering production use. Implement a workflow:

#### Workflow States

| State | Description | Transitions To |
|-------|-------------|----------------|
| DRAFT | Uploaded but not reviewed | APPROVED, REJECTED |
| PENDING_REVIEW | Submitted for review | APPROVED, REJECTED, DRAFT |
| APPROVED | Approved for use | DEPRECATED, RETIRED |
| DEPRECATED | Should not use for new cases | RETIRED, APPROVED |
| RETIRED | No longer valid | None |

#### Workflow Roles

| Action | Admin | Provider | Staff |
|--------|-------|----------|-------|
| Upload documents | Yes | Yes (own org) | Yes (own org) |
| Submit for review | Yes | Yes | Yes |
| Approve documents | Yes | No | No |
| Reject documents | Yes | No | No |
| Deprecate documents | Yes | No | No |
| Retire documents | Yes | No | No |
| View pending (own) | Yes | Yes | Yes |
| View all pending | Yes | No | No |

#### Approval Process

1. **Upload:** User uploads document, system creates DRAFT record
2. **Submit:** User submits for review (transitions to PENDING_REVIEW)
3. **Notification:** Admin receives notification (in-app and email)
4. **Review:** Admin reviews document content, verifies source authority
5. **Decision:** Admin approves, rejects, or requests changes
6. **Indexing:** Approved documents are indexed for retrieval
7. **Notification:** Uploader receives decision notification

#### Version Control

**Version Tracking:**

- Every document modification creates new version
- Version number: MAJOR.MINOR (e.g., 3.2)
- Major version: Significant changes (dosing changes, new indications)
- Minor version: Formatting, typos, clarifications
- Version history preserved indefinitely

**Version Display:**

- Current version prominently displayed
- Version history accessible
- Diff view between versions (future enhancement)
- Automatic notification when subscribed documents update

### Bulk Document Operations

**Bulk Upload:**

- Drag-and-drop multiple files
- Progress indicator per file
- Error handling for failed uploads
- Review queue for bulk uploads

**Bulk Actions:**

- Bulk approve (admin only)
- Bulk deprecate (admin only)
- Bulk export metadata
- Bulk tag application

### Document Processing Pipeline

#### Automated Processing

**Upon Upload:**

1. **Format Detection:** Identify document type (PDF, DOCX, etc.)
2. **Text Extraction:** Extract full text
3. **Structure Parsing:** Identify headers, sections, tables
4. **Metadata Extraction:** Title, author, date, version from content
5. **PHI Scan:** Check for potential PHI patterns
6. **Terminology Tagging:** Extract CPT, ICD-10, drug names
7. **Chunking:** Create semantic chunks with metadata
8. **Embedding:** Generate vector embeddings
9. **Indexing:** Add to vector search index
10. **Notification:** Notify uploader of completion

**Processing Status:**

| Status | Description |
|--------|-------------|
| PENDING | Waiting in queue |
| PROCESSING | Currently being processed |
| COMPLETE | Successfully processed |
| FAILED | Processing failed |
| REQUIRES_REVIEW | PHI detected, manual review needed |

### Document Search and Discovery

**Search Features:**

- Full-text search across all accessible documents
- Filter by specialty, document type, date range
- Filter by approval status
- Saved searches
- Recent documents

**Specialty Taxonomy:**

- Define specialty hierarchy
- Tag documents with relevant specialties
- Filter/search by specialty
- Auto-detect specialty from document content

### Document Feature Summary

| Feature | Workflow Impact | Complexity | Priority |
|---------|----------------|------------|----------|
| Approval Workflow | High | Medium | High |
| Version Control | Medium | Medium | High |
| Bulk Upload | Medium | Low | Medium |
| PHI Scanning | Critical | Medium | Critical |
| Specialty Tagging | Medium | Low | Medium |
| Document Search | High | Medium | High |

---

## User Experience Features

### Clinical UX Principles

Healthcare professionals work under time pressure and cognitive load. The AI assistant must:

**Minimize Friction:**
- Quick access from EHR or browser
- Instant search results
- Clear, scannable responses

**Maximize Clarity:**
- Unmistakable source citations
- Clear uncertainty indication
- Obvious visual hierarchy

**Support Clinical Reasoning:**
- Show relevant context
- Enable verification
- Connect related protocols

### Interface Components

#### Search Interface

**Search Box:**

```
┌─────────────────────────────────────────────────────────────────┐
│  🔍 Search clinical protocols...                              │
│      [?] Don't include patient information                      │
└─────────────────────────────────────────────────────────────────┘
```

**Results List:**

```
Results for "vancomycin dosing"

1. Adult Antibiotic Dosing Protocol (v3.2) ★★★★★
   Section 3.2: Vancomycin Dosing
   "Vancomycin should be dosed at 15-20mg/kg of actual body 
    weight..." [98% match]

2. MRSA Treatment Guidelines (v2.1) ★★★★☆
   Section 5.1: Vancomycin for MRSA
   "First-line therapy for MRSA bacteremia..." [76% match]
```

**Response Display:**

```
Response:

Vancomycin dosing for adults is 15-20mg/kg based on actual body weight,
rounded to the nearest 250mg increment. For patients with renal 
impairment, dosing should be adjusted based on creatinine clearance.

Sources:
• Adult Antibiotic Dosing Protocol (v3.2), Section 3.2.1
• MRSA Treatment Guidelines (v2.1), Section 5.1

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Was this helpful? 👍 👎
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### Document Viewer

**Integrated Viewer:**

- Side-by-side with response
- Highlighted passages from citations
- Table of contents navigation
- Version selector
- Download option

#### Session Management UI

**Active Sessions:**

- Show current session with device info
- Show other active sessions (if allowed)
- "Log out all other sessions" option
- Session timeout countdown (prominent, non-intrusive)

### Confidence Indicators

**Calibrated Confidence Display:**

| Confidence Level | Icon | Display | User Action |
|------------------|------|---------|-------------|
| High (≥90%) | ✓✓ | Standard display | None needed |
| Medium (70-90%) | ✓ | Enhanced citation | Verify if critical |
| Low (<70%) | ⚠ | Warning banner | Review required |
| No retrieval | ✗ | Blocked response | Rephrase query |

**Confidence Communication:**

High confidence response: No special indication

Medium confidence: "This answer is based on [N] relevant documents. Please verify applicability to your specific clinical scenario."

Low confidence: "This information may not directly address your question. Retrieved documents were loosely related. [Show retrieved excerpts] Please verify through primary sources."

### Feedback Mechanism

**Simple Feedback:**

- Thumbs up/down on each response
- Optional comment field
- Feedback sent to admin dashboard
- Trends identified for improvement

**Detailed Feedback (Future):**

- Specific inaccuracies flagged
- Missing information noted
- Suggestions for improvement
- Rating of citation quality

### Accessibility Considerations

**HIPAA-Compliant Accessibility:**

- WCAG 2.1 AA compliance
- Screen reader support
- Keyboard navigation
- High contrast mode
- Reduced motion option

**Clinical Accessibility:**

- Large touch targets (for tablet use)
- Clear typography
- Error messages that are actionable
- Confirmation for destructive actions

### UX Feature Summary

| Feature | Usability Impact | Complexity | Priority |
|---------|-----------------|------------|----------|
| Clear Citation Display | Critical | Medium | Critical |
| Confidence Indicators | High | Medium | High |
| Simple Search Interface | High | Low | High |
| Document Viewer | High | Medium | High |
| Session Management | High | Low | High |
| User Feedback | Medium | Low | Medium |
| Accessibility | High | Medium | High |

---

## Recommended Feature Priority

### MVP Priority (Critical)

Must-have features for clinical deployment:

1. **PHI Prevention Architecture**
   - Input sanitization with PHI detection
   - User warnings for potential PHI
   - Block and prompt rephrasing for clear PHI

2. **Complete RAG Pipeline**
   - Document ingestion and chunking
   - Medical embedding model
   - Vector search
   - GPT-4o response with citation

3. **Source Citation System**
   - Citation-Required response generation
   - Citation verification layer
   - Inline and reference section citations

4. **HIPAA Audit Logging**
   - Append-only logs
   - User authentication events
   - AI interaction events
   - Query and response logging

5. **Session Security**
   - 15-minute timeout
   - MFA via Supabase TOTP
   - Session binding

6. **Multi-Tenant Isolation**
   - RLS policies
   - Tenant ID validation
   - Organization separation

7. **Role-Based Access**
   - Admin, Provider, Staff roles
   - Document permission filtering

### Pre-Launch Priority (High)

Features needed before clinical use:

8. **Document Approval Workflow**
   - Multi-state workflow (Draft → Pending → Approved)
   - Admin approval interface
   - Version tracking

9. **No-Response Path**
   - Explicit "insufficient information" responses
   - Query suggestion for failed retrievals

10. **Document Currency Tracking**
    - Effective and expiration dates
    - Retirement flags
    - Version display

### Post-MVP Priority (Medium)

Enhancements after initial deployment:

11. **Confidence Indicators**
    - Calibrated confidence display
    - Uncertainty communication

12. **Bulk Upload**
    - Multi-file upload
    - Batch processing

13. **User Feedback**
    - Thumbs up/down
    - Simple comment option

14. **Interactive Citations**
    - Clickable source links
    - Document viewer integration

### Future Enhancement Priority (Low)

Roadmap items for future consideration:

15. **EHR Integration**
    - Embedded access
    - Context passing

16. **Advanced Feedback**
    - Inaccuracy reporting
    - Quality scoring

17. **Diff Viewing**
    - Version comparison
    - Change highlighting

18. **Alert Integration**
    - Protocol update notifications
    - Recall alerts

---

## Missing Features to Consider

Based on research findings, the following features should be considered for addition to the specification:

### Critical Gap: Citation Verification Layer

**Why Missing:** The specification requires source citations but does not specify verification. Without verification, the AI could fabricate citations to hallucinated information.

**Recommendation:** Add citation verification as a mandatory post-processing step before returning responses.

### Critical Gap: Query Intent Classification

**Why Missing:** Users might ask clinical decision questions (requiring strict sourcing) versus general knowledge questions. The system should classify intent and adjust confidence thresholds accordingly.

**Recommendation:** Add intent classification to detect:
- Clinical decision queries (higher confidence required)
- General protocol information queries
- Dosing calculations (should be blocked or heavily caveated)

### Critical Gap: Emergency Access Procedures

**Why Missing:** HIPAA requires documented emergency access procedures. If clinicians need urgent access to protocols outside normal workflows, the system must support this with appropriate controls.

**Recommendation:** Add:
- Break-glass access with dual authorization
- Mandatory post-use justification
- Enhanced logging for emergency access

### High Priority Gap: Document Deprecation Communication

**Why Missing:** When documents are deprecated or retired, users who previously accessed them should be notified if they have active queries or bookmarked documents.

**Recommendation:** Add:
- Notification system for document changes
- Bookmark/subscription functionality
- Update alerts for subscribed documents

### High Priority Gap: Multi-Language Support

**Why Missing:** Clinical settings may include patients or staff who speak different languages. The system might need to support protocol queries in multiple languages.

**Recommendation:** Consider:
- Multi-language query support
- Response in user's preferred language
- Medical terminology in multiple languages

### Medium Priority Gap: Analytics Dashboard

**Why Missing:** Organizations need visibility into system usage, popular queries, and potential knowledge gaps.

**Recommendation:** Add:
- Query analytics (what are users searching for)
- Miss rate tracking (queries that returned no results)
- Document usage tracking (which protocols are most accessed)

### Medium Priority Gap: Integration with Clinical Calculators

**Why Missing:** The specification correctly blocks dosing calculations, but the AI could reference calculators or integrate with them.

**Recommendation:** Consider:
- Integration with validated clinical calculators
- Links to calculator tools in responses
- Clear statement when calculations are needed

### Medium Priority Gap: Offline/Low-Bandwidth Mode

**Why Missing:** Clinical environments may have unreliable connectivity. Consider offline access to critical protocols.

**Recommendation:** Consider as future enhancement:
- Offline protocol cache for critical documents
- Sync when connectivity restored
- Appropriate warnings when offline

---

## Confidence Assessment

| Feature Area | Confidence | Notes |
|--------------|------------|-------|
| Core RAG Pipeline | HIGH | Well-established patterns, GPT-4o API stable |
| Citation Systems | MEDIUM | Best practices emerging, needs validation |
| HIPAA Audit Logging | HIGH | Requirements well-documented |
| PHI Prevention | MEDIUM | Patterns established, implementation varies |
| Clinical UX | MEDIUM | Research available, domain-specific validation needed |
| Multi-Tenant Architecture | HIGH | Established patterns with Supabase |
| Document Workflow | HIGH | Standard approval workflows apply |
| Medical Embeddings | MEDIUM | Multiple options, need evaluation |

**Overall Confidence:** MEDIUM - Core patterns are well-established, but healthcare-specific implementations require clinical validation. WebSearch verification recommended for specific tool selections.

---

## Sources and References

**Note:** This research was conducted using domain expertise. For current tooling decisions, verification via official documentation is recommended for:

1. Supabase Auth TOTP implementation details
2. Current medical embedding model benchmarks
3. Latest HIPAA audit requirements
4. PDF parsing library capabilities
5. Vector database feature comparisons

**Recommended Verification Searches:**
- "Supabase Auth TOTP implementation 2025"
- "Best medical embedding models 2025"
- "HIPAA audit requirements AI systems"
- "Clinical decision support UX best practices"

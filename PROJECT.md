# Healthcare AI Assistant (HIPAA-Aware RAG)

## Overview

AI-powered clinical knowledge base for healthcare organizations. Clinical staff upload approved medical protocols, formularies, and clinical guidelines, then ask questions in natural language. AI responds exclusively from the uploaded approved documents -- never from general training data. This eliminates the risk of hallucinated medical information. Combines two premium niches: AI + Healthcare with HIPAA-aware security patterns.

## Goals

- Demonstrate RAG in a regulated healthcare context with HIPAA-aware security patterns
- Show mastery of MFA, audit logging, RLS (org-level isolation), and encrypted storage
- Prove ability to build AI systems that answer ONLY from approved sources (critical for clinical use)
- Position for premium healthcare + AI jobs with minimal Upwork competition
- Target Upwork job categories: Healthcare IT, HIPAA Compliance, AI/ML Development, Medical Software

## Tech Stack

- **Framework:** Next.js 14+ App Router, TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **AI SDK:** Vercel AI SDK (`useChat` hook for streaming)
- **LLM:** OpenAI GPT-4o for clinical queries (accuracy matters), text-embedding-3-small for embeddings
- **Document Processing:** LangChain.js (document loaders, text splitters)
- **Vector Database:** Supabase pgvector
- **Auth:** Supabase Auth with MFA (TOTP via authenticator app)
- **File Storage:** Supabase Storage with RLS (encrypted at rest)
- **Database:** Supabase PostgreSQL with Row-Level Security
- **Deployment:** Vercel (BAA available on Enterprise plan)

## Pages / Screens

### Login Page (`/login`)
- Supabase Auth with email/password
- MFA challenge step (TOTP code from authenticator app) -- required for all users
- Session timeout: 15 minutes for clinical staff (HIPAA requirement for systems accessing sensitive data)
- Failed login lockout: account locked after 5 failed attempts (15-minute lockout)

### Knowledge Base Page (`/knowledge-base`)
- Upload clinical guidelines, formularies, protocol PDFs
- Drag-and-drop upload with file type validation (PDF, TXT, DOCX)
- Processing status per document: uploading -> parsing -> chunking -> embedding -> ready
- Document list with metadata: name, upload date, uploaded by, chunk count, status
- Delete document (admin only) -- removes document + embeddings
- Organization-scoped: each org sees only their own knowledge base

### AI Chat Page (`/chat`)
- Ask clinical questions in natural language
- Streaming AI responses grounded exclusively in uploaded protocols
- Source citations: which document, which section, with direct quotes
- Prominent disclaimer banner: "Answers are based on uploaded protocols only. Always verify with authoritative sources."
- Conversation history for reference and audit purposes
- Every query and response is logged to the audit trail

### Audit Log Page (`/audit`)
- Complete log of every AI interaction: who asked, what was asked, what was answered, which source documents were cited
- Filterable by user, date range, query type
- Read-only view (no user can delete audit entries)
- Export to CSV for compliance reporting
- Admin-only access (clinical staff cannot view other users' queries unless admin)

### Admin Page (`/admin`)
- Manage approved documents: upload, review, approve, delete
- Review AI interaction logs across the organization
- User management: invite staff, assign roles (admin/provider/staff), deactivate accounts
- Organization settings: session timeout duration, MFA enforcement
- System health: embedding status, storage usage, query volume

## Features

### Must-Have
- Full RAG pipeline (same as A1) with clinical document focus
- MFA for all users via Supabase Auth TOTP enrollment
- Audit log of every AI interaction (append-only, tamper-proof)
- RLS: users only see their organization's knowledge base and conversations
- Encrypted document storage via Supabase Storage
- System designed for protocols/guidelines only -- no PHI in AI prompts
- Source citations with every AI response
- Session timeout (15 minutes) with re-authentication required
- Role-based access: admin (full access), provider (chat + view docs), staff (chat only)

### Nice-to-Have
- Document approval workflow (uploaded docs need admin approval before AI indexes them)
- Bulk document upload
- AI confidence indicator per response
- Feedback mechanism ("Was this answer helpful?") for continuous improvement
- PDF annotation showing exact source passages

## Data Model

### organizations
- `id` (uuid, PK)
- `name` (text)
- `settings` (jsonb) -- session timeout, MFA policy, etc.
- `created_at` (timestamptz)

### users
- `id` (uuid, PK) -- from Supabase Auth
- `org_id` (uuid, FK -> organizations.id)
- `email` (text)
- `role` (text) -- 'admin' | 'provider' | 'staff'
- `mfa_enrolled` (boolean)
- `created_at` (timestamptz)

### documents
- `id` (uuid, PK)
- `org_id` (uuid, FK -> organizations.id)
- `uploaded_by` (uuid, FK -> users.id)
- `name` (text)
- `file_path` (text) -- Supabase Storage path: `{org_id}/{filename}`
- `file_size` (integer)
- `chunk_count` (integer)
- `status` (text) -- 'processing' | 'ready' | 'error'
- `created_at` (timestamptz)

### document_chunks
- `id` (uuid, PK)
- `document_id` (uuid, FK -> documents.id)
- `org_id` (uuid, FK -> organizations.id) -- denormalized for RLS efficiency
- `content` (text)
- `embedding` (vector(1536))
- `chunk_index` (integer)
- `metadata` (jsonb)
- `created_at` (timestamptz)

### conversations
- `id` (uuid, PK)
- `user_id` (uuid, FK -> users.id)
- `org_id` (uuid, FK -> organizations.id)
- `title` (text)
- `created_at` (timestamptz)

### messages
- `id` (uuid, PK)
- `conversation_id` (uuid, FK -> conversations.id)
- `role` (text) -- 'user' | 'assistant'
- `content` (text)
- `source_chunks` (jsonb) -- references to cited chunks
- `created_at` (timestamptz)

### audit_log
- `id` (uuid, PK)
- `org_id` (uuid, FK -> organizations.id)
- `user_id` (uuid, FK -> users.id)
- `action` (text) -- 'ai_query' | 'document_upload' | 'document_delete' | 'user_login' | 'settings_change'
- `details` (jsonb) -- query text, response summary, document name, etc.
- `ip_address` (text)
- `user_agent` (text)
- `created_at` (timestamptz)

### RLS Policies
- **Org-level isolation:** All tables use `WHERE org_id = (SELECT org_id FROM users WHERE id = auth.uid())`
- **Audit log:** INSERT only for regular users -- no UPDATE, no DELETE. Only admin role can SELECT.
- **Documents:** All org members can read. Only admin can delete.
- **Storage:** File paths include `{org_id}/` as first segment. Storage RLS policy matches org_id from JWT claims.

## AI Architecture

### RAG Pipeline (same foundation as A1, with healthcare constraints)
1. **Document Ingestion:** Upload -> Admin approval (optional) -> Parse -> Chunk (500 tokens, 50 overlap) -> Embed (text-embedding-3-small) -> Store in org-scoped pgvector
2. **Query Processing:** Question -> Embed -> Org-scoped vector search (only search org's chunks via RLS) -> Retrieve top-5 relevant chunks
3. **Response Generation:** System prompt + retrieved chunks + question -> GPT-4o streaming response with citations

### Clinical Safety Constraints
- **System prompt:** "You are a clinical knowledge assistant. Answer ONLY from the provided document context. If the information is not in the provided documents, say 'This information is not available in the current knowledge base.' NEVER provide medical advice, diagnoses, or treatment recommendations beyond what is stated in the approved documents. Always recommend consulting the original source document for critical clinical decisions."
- **Model choice:** GPT-4o (not mini) -- clinical accuracy is more important than cost savings
- **Temperature:** 0.1 (very low -- minimize creative interpretation of clinical content)
- **No PHI in prompts:** The system is designed for protocols and guidelines, not patient data. Questions about specific patients should reference documents, not contain patient identifiers.

### Vector Search (org-scoped)
```sql
CREATE OR REPLACE FUNCTION match_org_documents(
  query_embedding vector(1536),
  user_org_id uuid,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  content text,
  document_id uuid,
  chunk_index int,
  similarity float
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.content,
    dc.document_id,
    dc.chunk_index,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  WHERE dc.org_id = user_org_id
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

## Security Requirements

### Authentication
- Supabase Auth with email/password
- MFA required for ALL users (TOTP via authenticator app)
- Session timeout: 15 minutes (configurable by admin, minimum 15 min for HIPAA)
- Account lockout: 5 failed attempts -> 15-minute lock
- JWT claims include: user_id, org_id, role

### Authorization (RLS)
- Org-level isolation on all tables: users only see their org's data
- Role-based feature access: admin > provider > staff
- Storage RLS: file paths segmented by org_id, policies enforce org boundary
- Even app bugs cannot leak cross-org data -- database enforces the boundary

### Audit Trail
- Every AI query logged: who, what question, what answer, which sources, when, IP
- Every document action logged: upload, delete, re-index
- Every auth event logged: login, logout, failed login, MFA enrollment
- Audit log is append-only: RLS policy allows INSERT only, no UPDATE/DELETE for any user
- Admin can read audit logs; regular users cannot
- Database triggers for audit (not just app-level) -- catches direct database access too

### HIPAA Elements
- **MFA:** Required for all users accessing clinical data
- **Audit logging:** Complete trail of who accessed what and when
- **Encrypted storage:** Documents stored encrypted at rest in Supabase Storage
- **RLS:** Org-level data isolation at database level
- **No PHI in AI prompts:** System designed for protocols/guidelines, not patient-specific data
- **BAA-ready:** Supabase offers BAA on paid plans; Vercel offers BAA on Enterprise
- **Session management:** Short timeout (15 min), re-auth for sensitive actions
- **Token storage:** httpOnly cookies only (not localStorage -- prevents XSS token theft)

### Error Handling
- Generic error messages to client ("Something went wrong") -- no stack traces or DB details
- Full error details logged server-side with request ID
- Request IDs returned to client for support correlation

## Key Technical Decisions

- **GPT-4o over GPT-4o-mini:** Clinical accuracy justifies the higher cost. Wrong answers about drug interactions or protocols have serious consequences.
- **Supabase over Firebase:** BAA available, pgvector for RAG, RLS policies in SQL (easier to audit for compliance), relational model for complex healthcare data relationships.
- **Org-level RLS (not user-level):** Clinical teams share a knowledge base. All providers in an org should see the same protocols. User-level would prevent team collaboration.
- **Audit at database level (triggers):** App-level logging misses direct database access. Database triggers fire regardless of access path -- API, dashboard, migration scripts.
- **Temperature 0.1:** Minimize creative output for clinical content. Factual accuracy over conversational naturalness.
- **15-minute session timeout:** HIPAA guidance for clinical systems. Configurable by admin but with a floor of 15 minutes.

## Upwork Positioning

- **Project Catalog listings supported:** "HIPAA-Compliant Healthcare App", "Healthcare AI Assistant", "Clinical Knowledge Base"
- **Price tiers enabled:** $5,000-15,000 (HIPAA-aware AI), $15,000-50,000 (enterprise healthcare systems)
- **Key selling points for proposals:**
  - "I've built a HIPAA-aware AI knowledge base with MFA, audit logging, encrypted storage, and org-level data isolation"
  - "AI answers exclusively from approved clinical documents -- zero hallucinated medical information"
  - "Complete audit trail of every AI interaction for compliance reporting"
  - "No one else on Upwork has a healthcare + AI + HIPAA demo in their portfolio"
- **Premium positioning:** This demo commands 2-3x higher rates than general AI work because healthcare + HIPAA expertise is scarce.

## Build Estimate

- **Estimated effort:** 1-2 days with Claude Code (leverages A1 RAG patterns + adds HIPAA security layer)
- **Priority:** #2 -- build second. Premium niche with almost no competition on Upwork. The combination of AI + Healthcare + HIPAA is the strongest differentiator in the portfolio.
- **Build order rationale:** Reuses A1's RAG pipeline and adds security layers. Building A1 first means the core AI flow is already proven.

# Technology Stack Research: HIPAA-Compliant Healthcare AI Assistant

**Project:** Healthcare AI Assistant (HIPAA-Aware RAG)
**Researched:** February 7, 2025
**Focus:** HIPAA compliance, RAG architecture, clinical document processing

---

## Executive Summary

The proposed tech stack for the Healthcare AI Assistant is well-suited for HIPAA-compliant RAG implementations. Next.js 14+ App Router provides the security foundations, Supabase offers healthcare-ready infrastructure with BAA support, and the Vercel AI SDK + OpenAI combination delivers reliable clinical response generation. Key optimizations focus on zero-hallucination enforcement through system prompts, citation tracking, and strict document isolation via RLS policies. pgvector requires careful indexing strategy for production workloads, while LangChain.js document processing should prioritize structured extraction over raw text chunking for clinical accuracy.

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js | 14.x+ (App Router) | React framework, API routes | App Router provides better security headers, server components for PHI isolation, and built-in edge compatibility for audit logging |
| TypeScript | 5.x+ | Type safety | Critical for healthcare codebases where type errors could cause data leaks or incorrect clinical information |
| React | 18.x+ | UI library | Concurrent features useful for streaming responses, strict mode catches side effects early |

**Justification:** Next.js 14 App Router is the recommended choice over Pages Router because it enforces server/client boundaries more strictly, making it easier to ensure PHI never leaks to client-side code. The `server-only` package should be added to prevent accidental PHI exposure in client components.

### AI & Language Model Layer

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vercel AI SDK | 3.x+ | AI integration, streaming | Official OpenAI integration, built-in citation support, robust streaming implementation |
| OpenAI GPT-4o | Latest | LLM for responses | Best price/performance for clinical reasoning; 128k context window handles lengthy medical documents |
| OpenAI text-embedding-3-small | Latest | Vector embeddings | High performance, lower cost than ada-002, excellent medical text semantic understanding |

**Configuration for Clinical Accuracy:**

```typescript
// Recommended OpenAI configuration for clinical responses
const clinicalSystemPrompt = `You are a clinical knowledge assistant. 
CRITICAL RULES:
1. ONLY answer based on the provided context documents
2. If the answer is not in the documents, say "I don't have information about that in the available clinical guidelines"
3. Cite sources using the format [Document: filename, Section: X] for every claim
4. Never mention "AI", "language model", or "training data" - speak as a clinical reference tool
5. Include relevant clinical citations even for well-known protocols
6. Flag any uncertainty: "The document states X, but clinical judgment should verify this"

Temperature: 0.1 (near-deterministic for consistency)
Presence penalty: 0 (discourages adding information not in context)
Frequency penalty: 0.1 (reduces repetition of citations)
```

**Why GPT-4o over GPT-4o-mini for Healthcare:** While GPT-4o-mini is cost-effective, clinical accuracy requires the full model's reasoning capabilities. The marginal cost increase is justified by reduced hallucination risk. For high-volume, lower-stakes queries, consider routing to GPT-4o-mini with stricter prompting.

### Document Processing & RAG

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| LangChain.js | 0.2.x+ | Document loaders, chunking, RAG pipeline | Mature ecosystem, Supabase vector store integration, structured output parsing |
| @langchain/community | 0.2.x+ | Specialized document loaders | PDF, Markdown, and structured document support critical for clinical protocols |
| pdf-parse-lib | 1.x+ | PDF text extraction | More reliable than LangChain's default PDF loader for complex medical PDFs |
| Cheerio | 1.x+ | HTML parsing | Lightweight, fast for web-scraped clinical guidelines |

**Clinical Document Processing Strategy:**

```typescript
// Recommended document processing pipeline for clinical documents
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { MedicalTextProcessor } from './utils/medical-text-splitter';

interface ClinicalChunkingConfig {
  chunkSize: 800;           // Smaller chunks for precise citation
  chunkOverlap: 100;        // Maintain context continuity
  separators: ['\n## ', '\n### ', '\n#### ', '\n', '. '];
  keepStructure: true;      // Preserve clinical hierarchy
}

async function processClinicalDocument(file: File): Promise<Document[]> {
  // Step 1: Extract text with structure preservation
  const rawText = await extractWithStructure(file);
  
  // Step 2: Create semantic-aware chunks (not just character count)
  const processor = new MedicalTextSplitter({
    headersToKeep: ['title', 'section', 'clinical-note'],
    maxHeaderDepth: 4,
  });
  
  // Step 3: Add document metadata for citation tracking
  const chunks = await processor.createChunks(rawText, {
    documentId: generateUUID(),
    documentName: file.name,
    documentType: detectClinicalType(file), // protocol, guideline, policy
    uploadDate: new Date().toISOString(),
    clinicalDomain: extractClinicalDomain(rawText), // cardiology, oncology, etc.
  });
  
  return chunks;
}
```

**Critical:** Clinical documents should use semantic chunking that respects document structure (sections, subsections, clinical notes) rather than fixed character counts. A 4,000-character protocol section is more citeable than four 1,000-character chunks.

### Vector Database

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Supabase pgvector | Latest PostgreSQL extension | Vector storage, similarity search | Native PostgreSQL, RLS integration, HIPAA-compatible via Supabase |
| PostgreSQL | 15.x+ (Supabase managed) | Relational data, audit logs, metadata | ACID compliance critical for healthcare, native RLS support |

**pgvector Production Configuration:**

```sql
-- Recommended pgvector setup for clinical RAG
-- Enable the extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create ivfflat index for performance (recommended for >10k vectors)
-- Note: Must use cosine distance for medical semantic search
CREATE INDEX ON document_embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);  -- lists = sqrt(num_vectors) for optimal recall/performance

-- Alternative: hnsw index for higher recall (PostgreSQL 15+)
-- CREATE INDEX ON document_embeddings USING hnsw (embedding vector_l2_ops)
-- WITH (m = 16, ef_construction = 64);

-- For clinical search, cosine similarity is preferred as it captures
-- semantic meaning better than euclidean distance for medical concepts
```

**Performance Tuning Notes:**

| Scenario | Index Type | Configuration |
|----------|------------|---------------|
| < 10,000 documents | Flat (brute force) | No index needed, acceptable latency |
| 10K - 1M documents | IVFFlat | lists = sqrt(num_vectors) |
| > 1M documents | HNSW | m = 16, ef_construction = 64 |

**Supabase Healthcare-Specific Configuration:**

```typescript
// Supabase client with HIPAA-compliant settings
import { createClient } from '@supabase/supabase-js';
import { Database } from './database.types';

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      // Critical for healthcare: automatic session expiration
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      // Headers for compliance tracking
      headers: {
        'X-Request-ID': generateRequestId(),
        'X-Compliance-Level': 'HIPAA',
      },
    },
    realtime: {
      // Disable real-time for PHI rooms (audit only)
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

// RLS Policy Example: Organization-level document isolation
const createClinicalRLSPolicies = async () => {
  await sql`
    -- Organizations can only see their own documents
    CREATE POLICY "org_isolation_clinical_docs"
    ON clinical_documents FOR ALL
    USING (
      auth.uid() IN (
        SELECT user_id FROM organization_members
        WHERE organization_id = clinical_documents.organization_id
      )
    );

    -- Audit log: Every document access is tracked
    CREATE POLICY "audit_log_read_access"
    ON audit_logs FOR SELECT
    USING (
      auth.uid() IN (
        SELECT user_id FROM organization_members
        WHERE role IN ('admin', 'compliance_officer')
      )
    );
  `;
};
```

### Authentication & Security

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Supabase Auth | Latest | User authentication, MFA | Built-in TOTP MFA, RLS integration, HIPAA-compliant infrastructure |
| Supabase MFA | TOTP + Backup Codes | Multi-factor authentication | Required for HIPAA compliance; supports authenticator apps |
| Row-Level Security | Native PostgreSQL | Data isolation | Enforces tenant isolation at database level |

**HIPAA-Authentication Configuration:**

```typescript
// MFA enforcement for healthcare
async function enforceMFAForHealthcare(userId: string) {
  // Check MFA status
  const { data: factors } = await supabase.auth.mfa.listFactors({
    userId,
  });

  if (factors.totp.length === 0) {
    // Block access until MFA is enrolled
    await supabase.auth.admin.updateUserById(userId {
      user_metadata: {
        mfa_required: true,
        mfa_enrollment_blocked: true,
        temporary_access: false,
      },
    });

    throw new Error('MFA enrollment required for healthcare system access');
  }

  // Verify TOTP factor is verified
  const verifiedFactor = factors.totp.find(f => f.status === 'verified');
  if (!verifiedFactor) {
    throw new Error('Verified MFA factor required');
  }

  return true;
}

// Session management: Short-lived sessions for PHI access
async function createSecureHealthcareSession(userId: string) {
  const session = await supabase.auth.admin.createSession({
    userId,
    options: {
      // 15-minute session timeout for PHI access (HIPAA best practice)
      expiresIn: 15 * 60,
      // Refresh token with 8-hour total session limit
      refreshTokenExp: 8 * 60 * 60,
    },
  });

  // Log session creation
  await logAuditEvent({
    eventType: 'SESSION_CREATED',
    userId,
    ipAddress: getClientIP(),
    userAgent: getClientUserAgent(),
    mfaUsed: true,
  });

  return session;
}
```

### Storage & File Handling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Supabase Storage | Latest | Encrypted file storage | RLS policies, server-side encryption, audit logging |
| @supabase/ssr | Latest | Next.js integration | Secure cookie handling, server-side auth |

**Secure File Storage Configuration:**

```typescript
// Bucket configuration for clinical documents
const CLINICAL_BUCKET = 'clinical-documents';

// Configure bucket with HIPAA-compliant settings
async function configureClinicalStorage() {
  // Create bucket with restrictions
  await supabase.storage.createBucket(CLINICAL_BUCKET, {
    public: false,  // CRITICAL: Private only
    allowedMimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/markdown',
      'text/plain',
    ],
    fileSizeLimit: 50 * 1024 * 1024,  // 50MB limit for clinical documents
  });

  // RLS policy: Only authorized org members can access
  await supabase.storage.from(CLINICAL_BUCKET).createPolicy('clinical-access', {
    definition: {
      bucket_id: CLINICAL_BUCKET,
      conditions: {
        organization_id: { _eq: '${auth.organization_id}' },
      },
    },
  });
}

// Virus scanning should be handled at infrastructure level
// Supabase Enterprise or third-party scanning integration
```

### UI & Styling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Tailwind CSS | 3.x+ | Utility styling | Security: no runtime CSS injection, easy audit |
| shadcn/ui | Latest | Accessible components | Built on Radix UI, TypeScript-first, accessible |
| Radix UI Primitives | Latest | Headless components | Accessibility compliance (WCAG 2.1), customization |

**Why shadcn/ui for Healthcare:** The component library uses semantic HTML and ARIA attributes, which is essential for healthcare accessibility requirements. The "copy-paste" approach means no external dependencies that could introduce vulnerabilities.

---

## Alternative Libraries and When to Use Them

### Document Processing Alternatives

| Library | Use Case | Why Not Default |
|---------|----------|-----------------|
| LangChain.js (default) | General RAG | Excellent, keep as default |
| Document AI (Google Cloud) | Complex medical PDFs with tables/figures | Use when PDFs contain complex clinical tables, charts |
| Azure Form Recognizer | HIPAA-compliant OCR | Use when Microsoft ecosystem preferred |
| AWS Textract | Medical imaging extraction | Use when AWS is primary cloud provider |

**Recommendation:** LangChain.js is the correct default. Add specialized extractors (pdf-parse-lib for standard PDFs, Document AI for complex layouts) as needed per document type.

### Vector Database Alternatives

| Database | When to Use | Trade-off |
|----------|------------|-----------|
| pgvector (default) | General RAG, Supabase integration | Excellent for most healthcare workloads |
| Pinecone | Large-scale (100M+ vectors) | Higher cost, external dependency |
| Weaviate | Graph + Vector hybrid | More complex, overkill for pure RAG |
| Milvus | Ultra-high performance needs | Steeper learning curve |

**Recommendation:** Stick with pgvector unless you exceed 1M+ documents. The Supabase integration and RLS support are invaluable for HIPAA compliance.

### LLM Alternatives

| Model | When to Use | Consideration |
|-------|-------------|---------------|
| Claude 3.5/3.7 (Anthropic) | Complex clinical reasoning | May provide more nuanced medical understanding, but requires Anthropic BAA |
| GPT-4o (default) | General clinical Q&A | Best OpenAI option for reasoning vs cost |
| GPT-4o-mini | High-volume screening queries | Lower accuracy, use only for triage |
| Med-PaLM 2 (Google) | Specialized medical domain | Limited availability, Google Healthcare API required |

**Recommendation:** OpenAI GPT-4o with Claude 3.5 Sonnet as backup for complex cases. Ensure BAA coverage for both providers.

### Auth Alternatives

| Provider | When to Use | Trade-off |
|----------|------------|-----------|
| Supabase Auth (default) | Supabase integration | Excellent, keep |
| Auth0 | Enterprise SSO requirements | Higher cost, additional complexity |
| AWS Cognito | AWS ecosystem integration | Less Next.js native support |
| Keycloak | On-premises requirement | Self-hosted complexity |

**Recommendation:** Supabase Auth is optimal. Auth0 for enterprises requiring advanced SSO integrations.

---

## Security Considerations for Healthcare

### HIPAA Technical Requirements Matrix

| Requirement | Implementation | Stack Component |
|-------------|----------------|-----------------|
| Access Control | MFA, RBAC, session timeout | Supabase Auth, custom policies |
| Audit Logging | Every PHI access logged | Supabase database, custom middleware |
| Integrity | Hash verification, RLS | PostgreSQL, application layer |
| Transmission Security | TLS 1.3, encryption at rest | Supabase (managed) |
| Authentication | TOTP MFA, session management | Supabase Auth MFA |
| Authorization | RLS policies per organization | PostgreSQL RLS |

### Critical Security Configurations

```typescript
// 1. PHI Encryption at Rest (Supabase managed)
// Ensure encryption at rest is enabled in Supabase project settings

// 2. Encryption in Transit
// Next.js: Add security headers in next.config.js
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
        ],
      },
    ];
  },
};

// 3. Audit Logging - Required for HIPAA
interface AuditEvent {
  event_id: string;
  timestamp: Date;
  user_id: string;
  organization_id: string;
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'SEARCH' | 'EXPORT';
  resource_type: 'document' | 'conversation' | 'user' | 'export';
  resource_id: string;
  ip_address: string;
  user_agent: string;
  query_text?: string;  // For search audit
  response_metadata?: {
    documents_retrieved: number;
    citations_included: string[];
  };
  session_id: string;
}

async function logAuditEvent(event: AuditEvent) {
  await supabase.from('audit_logs').insert({
    event_type: event.action,
    user_id: event.user_id,
    organization_id: event.organization_id,
    resource_type: event.resource_type,
    resource_id: event.resource_id,
    ip_address: event.ip_address,
    user_agent: event.user_agent,
    query_text: event.query_text,
    response_metadata: event.response_metadata,
    created_at: new Date().toISOString(),
  });
}

// 4. Automatic Logout for PHI Sessions
// 15-minute inactivity timeout (HIPAA best practice)
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
let activityTimeout: NodeJS.Timeout;

function resetActivityTimeout() {
  clearTimeout(activityTimeout);
  activityTimeout = setTimeout(async () => {
    await supabase.auth.signOut();
    window.location.href = '/login?reason=inactivity';
  }, INACTIVITY_TIMEOUT_MS);
}

// Listen for user activity
['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(event => {
  window.addEventListener(event, resetActivityTimeout, { passive: true });
});
```

### Supabase BAA (Business Associate Agreement)

**Critical:** Before storing any PHI, ensure:

1. Supabase Enterprise plan (required for BAA)
2. BAA signed with Supabase
3. Region selection: US-based regions only for HIPAA
4. Encryption key management configuration
5. Audit logging enabled at infrastructure level

```typescript
// Verify BAA status before deployment
async function verifyComplianceStatus() {
  const { data: project } = await supabase.admin.getProject();

  if (!project.hipaa_compliant) {
    throw new Error('Supabase project must have HIPAA compliance enabled');
  }

  // Verify encryption status
  const { data: encryption } = await supabase.admin.getEncryptionStatus();
  if (!encryption.atRestEnabled) {
    throw new Error('Encryption at rest must be enabled');
  }
}
```

---

## Performance Considerations

### RAG Query Performance

```typescript
// Optimized RAG query for clinical documents
interface ClinicalSearchConfig {
  similarityThreshold: 0.75;  // Higher threshold = more precise
  maxDocuments: 5;           // Limit context window usage
  filterByOrganization: true; // RLS handles this, but explicit filter helps
  includeCitations: true;    // Required for clinical accuracy
}

async function clinicalRAGQuery(
  question: string,
  embedding: number[],
  config: ClinicalSearchConfig
) {
  // Step 1: Vector similarity search
  const { data: documents } = await supabase.rpc('clinical_document_search', {
    query_embedding: embedding,
    match_threshold: config.similarityThreshold,
    match_count: config.maxDocuments,
  });

  // Step 2: Re-rank if needed (for complex clinical queries)
  const rankedDocs = await reRankClinicalDocuments(question, documents);

  // Step 3: Generate response with citations
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: clinicalSystemPrompt },
      {
        role: 'user',
        content: `Question: ${question}\n\nRelevant Clinical Context:\n${rankedDocs.map(doc => doc.content).join('\n\n')}`,
      },
    ],
    temperature: 0.1,
    stream: true,
  });

  // Step 4: Stream with citation extraction
  return streamWithCitations(response, rankedDocs);
}

// pgvector function for clinical search
// Create this as a PostgreSQL function
/*
CREATE OR REPLACE FUNCTION clinical_document_search(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  content text,
  document_name text,
  section_title text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dd.id,
    dd.content,
    dd.document_name,
    dd.section_title,
    1 - (dd.embedding <=> query_embedding) as similarity
  FROM document_embeddings dd
  WHERE dd.organization_id = current_setting('app.current_organization_id', true)::uuid
    AND 1 - (dd.embedding <=> query_embedding) > match_threshold
  ORDER BY dd.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
*/
```

### Caching Strategy for Clinical Documents

```typescript
// Redis-compatible cache for document metadata
// Use Supabase Edge Functions with KV store

interface CacheConfig {
  documentMetadataTTL: 3600;  // 1 hour for document metadata
  embeddingCacheTTL: 86400;   // 24 hours for embeddings
  queryResultTTL: 300;        // 5 minutes for query results
}

async function getCachedDocuments(documentIds: string[]) {
  const cacheKey = `docs:${documentIds.sort().join(',')}`;
  
  const cached = await cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const { data: documents } = await supabase
    .from('clinical_documents')
    .select('id, content, metadata')
    .in('id', documentIds);

  await cache.set(cacheKey, JSON.stringify(documents), 'EX', 3600);
  return documents;
}
```

### Database Indexing for Query Performance

```sql
-- Critical indexes for clinical RAG performance

-- Primary vector index (see earlier section)

-- Metadata indexes for filtering
CREATE INDEX idx_documents_org_type 
ON clinical_documents(organization_id, document_type);

CREATE INDEX idx_documents_clinical_domain 
ON clinical_documents(organization_id, clinical_domain);

CREATE INDEX idx_audit_logs_timestamp 
ON audit_logs(organization_id, created_at DESC);

-- Composite index for common query patterns
CREATE INDEX idx_embeddings_org_lookup 
ON document_embeddings(organization_id, document_id);
```

---

## Version Considerations and Updates

### Current Stack Assessment (February 2025)

| Component | Current Version | Status | Recommendation |
|-----------|----------------|--------|---------------|
| Next.js | 14.x+ | Current | Excellent choice, stay on latest 14.x until 15.x stability proven |
| TypeScript | 5.x+ | Current | Excellent, enables strict mode for healthcare |
| Vercel AI SDK | 3.x+ | Current | Good, check for 3.3+ for improved citation support |
| LangChain.js | 0.2.x+ | Current | Migration from 0.1.x complete, ecosystem mature |
| Supabase | Latest | Current | Enterprise plan required for HIPAA |
| OpenAI | GPT-4o | Current | Optimal for clinical use case |

### Recommended Updates in Next 6 Months

| Component | Update | Reason |
|-----------|--------|--------|
| Vercel AI SDK | Monitor 3.3+ releases | Improved citation extraction |
| pgvector | Test HNSW index | Better recall for complex medical queries |
| OpenAI | Evaluate o1 model | If reasoning improvements justify cost |

### Libraries to Watch

- **NextAuth.js v6**: If migrating from Supabase Auth
- **Rust-based chunkers**: Emerging for faster document processing
- **Med-PaLM availability**: Potentially superior medical domain performance

---

## Installation and Setup

### Core Dependencies

```bash
# Next.js and React
npm install next@14 react@18 react-dom@18

# TypeScript
npm install -D typescript @types/react @types/node

# Vercel AI SDK
npm install ai @ai-sdk/openai

# LangChain.js
npm install langchain @langchain/community @langchain/core

# Vector operations
npm install @supabase/supabase-js @supabase/ssr

# UI Components
npm install tailwindcss @tailwindcss/typography shadcn-ui
```

### Development Dependencies

```bash
npm install -D \
  @types/node \
  @types/react \
  @types/react-dom \
  eslint \
  eslint-config-next \
  prettier \
  @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser
```

---

## Sources

- **Vercel AI SDK Documentation**: Context7 (official), streaming and citation patterns
- **Supabase Documentation**: Context7 (official), RLS policies, pgvector integration
- **OpenAI API Documentation**: Context7 (official), temperature and system prompt optimization
- **LangChain.js Documentation**: Context7 (official), document processing patterns
- **HIPAA Journal**: WebSearch, general compliance requirements
- **OWASP Healthcare Security**: WebSearch, security best practices
- **pgvector GitHub**: Official repository, indexing strategies

# Healthcare AI Assistant (HIPAA-Aware RAG)

A HIPAA-compliant AI assistant for healthcare organizations, featuring retrieval-augmented generation (RAG) with enterprise-grade security, compliance, and safety controls.

## Overview

This project delivers a production-ready healthcare AI assistant that enables clinical staff to query organizational documents using natural language while maintaining strict HIPAA compliance. The system implements multi-tenant isolation, PHI detection, citation verification, and comprehensive audit logging.

### Key Features

- **Multi-Tenant Architecture**: Complete org-level isolation with row-level security (RLS)
- **Clinical RAG Pipeline**: Document ingestion, embedding generation, and vector search
- **Safety Layer**: PHI detection, prompt injection blocking, groundedness scoring
- **HIPAA Compliance**: Audit logging, encryption, access controls, breach notification
- **Production Hardening**: Rate limiting, monitoring, incident response, disaster recovery

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20+, Next.js 14 |
| Database | PostgreSQL (Supabase) with pgvector |
| Authentication | Supabase Auth (MFA, JWT) |
| AI/ML | OpenAI GPT-4o, text-embedding-3-small |
| Vector Store | pgvector |
| Infrastructure | Vercel Enterprise (HIPAA-compliant) |
| Monitoring | Datadog + PagerDuty |
| Security | Upstash Redis (rate limiting), Lakera Guard (jailbreak detection) |

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ with pgvector extension
- Supabase project
- OpenAI API key
- Upstash Redis account
- Datadog account (optional)
- PagerDuty account (optional)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd a2-healthcare-ai-assistant

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Configure environment variables (see Configuration section)

# Run database migrations
npx prisma migrate deploy

# Seed initial data (optional)
npm run seed

# Start development server
npm run dev
```

### Configuration

Create a `.env` file with the following variables:

```env
# Database
DATABASE_URL="postgresql://user:password@host:5432/db"

# Supabase
NEXT_PUBLIC_SUPABASE_URL="https://project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="anon-key"
SUPABASE_SERVICE_ROLE_KEY="service-role-key"

# OpenAI
OPENAI_API_KEY="sk-..."
OPENAI_ORG_ID="org-..."

# Redis (Upstash)
UPSTASH_REDIS_REST_URL="https://redis.upstash.io"
UPSTASH_REDIS_REST_TOKEN="token"

# Rate Limiting
RATE_LIMIT_ORG=1000
RATE_LIMIT_USER=60
RATE_LIMIT_SESSION=10

# Security
JWT_SECRET="your-jwt-secret"
ENCRYPTION_KEY="32-byte-key"

# Monitoring (optional)
DATADOG_API_KEY="api-key"
DATADOG_APP_KEY="app-key"
PAGERDUTY_API_KEY="api-key"
PAGERDUTY_SERVICE_ID="service-id"

# Feature Flags
ENABLE_PHI_DETECTION=true
ENABLE_INJECTION_BLOCKING=true
ENABLE_JAILBREAK_DETECTION=false
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Web App  │  │ Mobile   │  │ API      │  │ Admin     │       │
│  │ (Next.js)│  │ (React)  │  │ Clients  │  │ Console   │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      API Gateway Layer                            │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ Next.js API Routes with Rate Limiting & Auth Middleware│    │
│  └──────────────────────────────────────────────────────────┘    │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      Service Layer                                │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│  │ Auth    │ │ RAG     │ │ Safety  │ │ Audit   │ │ Monitor │    │
│  │ Service │ │ Service │ │ Service │ │ Service │ │ Service │    │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘    │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                       Data Layer                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │PostgreSQL│ │ pgvector │ │  Redis   │ │  S3/Blob │           │
│  │(Supabase)│ │ (Embed.) │ │(RateLim) │ │(Files)   │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

### Core Services

#### Authentication Service (Phase 1)

- Multi-tenant user management with org_id
- MFA enforcement via TOTP
- JWT-based session management (15-minute timeout)
- Account lockout after failed attempts
- Emergency access with time-limited privileges

#### RAG Service (Phase 2)

- Document upload with validation (PDF, TXT, DOCX)
- Clinical-aware chunking (512 tokens, 128 overlap)
- Embedding generation with text-embedding-3-small
- pgvector storage with org-scoped search
- Cosine similarity >0.7 threshold

#### Safety Service (Phase 3)

- PHI detection (SSN, MRN, DOB, phone, email, addresses)
- Prompt injection detection and blocking
- Citation generation and verification
- Query intent classification (clinical, personal_health, conversational)
- Groundedness scoring (coverage, relevance, accuracy)

#### Compliance Service (Phase 4)

- Role-based access control (ADMIN, PROVIDER, STAFF)
- Document approval workflow
- User feedback mechanism
- Audit log viewer with CSV export
- Emergency access justification

#### Hardening Service (Phase 5)

- Multi-tier rate limiting (org/user/session)
- Jailbreak resilience testing (26 attack patterns)
- Monitoring dashboards (query volume, error rates, latency)
- Incident response with breach notification procedures
- Disaster recovery with RTO/RPO definitions

## Project Structure

```
├── prisma/
│   └── schema.prisma          # Database schema with all models
├── src/
│   ├── api/                   # Next.js API routes
│   │   ├── chat/             # Chat API with safety pipeline
│   │   ├── monitoring/       # Monitoring endpoints
│   │   ├── security/         # Security endpoints
│   │   └── admin/            # Admin endpoints
│   ├── components/           # React components
│   │   ├── admin/           # Admin UI components
│   │   ├── compliance/      # Compliance UI components
│   │   ├── feedback/        # Feedback components
│   │   ├── monitoring/      # Monitoring dashboard
│   │   └── rbac/            # RBAC components
│   ├── hooks/                # Custom React hooks
│   ├── lib/
│   │   ├── audit.ts         # Audit logging
│   │   ├── auth.ts          # Authentication
│   │   ├── compliance/      # Compliance services
│   │   ├── deployment/      # Deployment config
│   │   ├── feedback/        # Feedback service
│   │   ├── governance/      # Governance services
│   │   ├── monitoring/      # Monitoring services
│   │   ├── operations/      # DR orchestration
│   │   ├── performance/     # Performance optimization
│   │   ├── rag/             # RAG services
│   │   ├── rbac/            # RBAC services
│   │   └── security/        # Security services
│   │       ├── rate-limiter.ts
│   │       ├── jailbreak-*.ts
│   │       └── incident-*.ts
│   ├── server/actions/       # Server actions
│   ├── types/                # TypeScript types
│   └── utils/                # Utility functions
├── scripts/
│   └── security/            # Security testing scripts
├── docs/
│   ├── compliance/          # HIPAA compliance docs
│   ├── governance/          # Governance docs
│   ├── operations/         # DR procedures
│   ├── performance/         # Optimization docs
│   └── security/           # Security docs
├── .planning/               # GSD planning artifacts
└── .vercel/                # Vercel configuration
```

## Available Scripts

```bash
# Development
npm run dev                # Start development server
npm run build             # Build for production
npm run start             # Start production server
npm run lint              # Run ESLint
npm run typecheck         # Run TypeScript type checking

# Database
npx prisma migrate dev     # Run migrations
npx prisma generate        # Generate Prisma client
npx prisma studio          # Open Prisma Studio
npm run seed              # Seed database

# Testing
npm run test              # Run unit tests
npm run test:integration  # Run integration tests
npm run test:e2e          # Run end-to-end tests
npm run test:jailbreak     # Run jailbreak tests
npm run test:jailbreak:report  # Generate jailbreak test report

# Security
npm run security:scan      # Run security scan
npm run security:pentest  # Prepare for penetration test

# Monitoring
npm run dr:test           # Run disaster recovery test
npm run dr:test:database   # Test database recovery
npm run dr:test:complete   # Test complete system recovery

# Compliance
npm run compliance:check   # Run HIPAA compliance checklist
npm run compliance:report  # Generate compliance report
```

## Security & HIPAA Compliance

### Administrative Safeguards

- **Access Control**: Role-based access (ADMIN, PROVIDER, STAFF)
- **Audit Controls**: Comprehensive audit logging with SHA-256 hash chain
- **Integrity Controls**: Data validation, cryptographic chaining
- **Personnel Training**: Clinician training materials provided

### Technical Safeguards

- **Access Control**: Unique user identification, automatic logoff, encryption
- **Audit Controls**: Audit logging, access monitoring
- **Integrity Controls**: Data integrity validation
- **Transmission Security**: TLS 1.3, encryption in transit

### Business Associate Agreements

| Vendor | Status | Coverage |
|--------|--------|----------|
| Supabase | ✅ Verified | Database, Auth, Storage |
| OpenAI | ⚠️ Pending | AI/LLM Processing |
| Vercel | ✅ Verified | Infrastructure |
| Datadog | ⚠️ Pending | Monitoring |

### Compliance Documentation

All compliance documentation is available in `docs/compliance/`:

- `hipaa-compliance-package.md` - Executive compliance summary
- `baa-verification.md` - Business Associate Agreement verification
- `security-rule-compliance-matrix.md` - 45 CFR 164.312 mapping
- `audit-procedures.md` - Audit procedures and monitoring
- `retention-policy.md` - 6-year data retention policy
- `breach-notification-procedures.md` - HIPAA breach notification

## API Reference

### Chat API

```typescript
POST /api/chat
Body: {
  message: string,
  conversationId?: string,
  context?: {
    documentIds?: string[],
    clinicalPriority?: boolean
  }
}
Response: {
  response: string,
  citations: Citation[],
  groundednessScore: number,
  intent: "clinical" | "personal_health" | "conversational"
}
```

### Monitoring API

```typescript
GET /api/monitoring/metrics
Query: { range: "1h" | "24h" | "7d" | "30d" }

GET /api/monitoring/health

GET /api/monitoring/alerts
```

### Security API

```typescript
POST /api/security/incident/report
Body: {
  type: "phi_breach" | "jailbreak" | "unauthorized_access" | "system_compromise" | "data_exfiltration" | "service_disruption",
  severity: "high" | "critical" | "medium" | "low",
  description: string,
  metadata?: Record<string, any>
}

POST /api/security/jailbreak-test/run
Body: {
  action: "test_single" | "test_category" | "test_suite" | "metrics"
}
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript strict mode
- Add unit tests for new functionality
- Ensure all security checks pass (`npm run security:scan`)
- Update documentation for new features
- Maintain HIPAA compliance in all changes

## License

This project is proprietary software. All rights reserved.

## Support

For support, contact your system administrator or open an issue in the repository.

## Acknowledgments

- OpenAI for GPT-4o and embeddings
- Supabase for PostgreSQL and authentication
- Vercel for Next.js and deployment infrastructure
- The healthcare professionals who guided feature development

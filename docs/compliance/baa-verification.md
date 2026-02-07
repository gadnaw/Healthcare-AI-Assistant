# Business Associate Agreement Verification

**Healthcare AI Assistant (HIPAA-Aware RAG)**

| Document Information | Details |
|---------------------|---------|
| **Document Version** | 1.0 |
| **Effective Date** | February 7, 2026 |
| **Document Owner** | Compliance Officer |
| **Classification** | Internal - Confidential |

---

## Overview

This document provides comprehensive verification of Business Associate Agreements (BAAs) and Data Processing Agreements (DPAs) for all third-party services that process Protected Health Information (PHI) within the Healthcare AI Assistant system. Under HIPAA regulations, covered entities must have signed BAAs with all business associates who create, receive, maintain, or transmit PHI on their behalf. This document verifies that all required agreements are in place and effective.

The Healthcare AI Assistant utilizes several third-party services in its architecture, each requiring BAA coverage for PHI processing. This document identifies each service, verifies BAA status, documents effective dates, and outlines the scope of PHI processing covered by each agreement. Additionally, this document addresses sub-processor documentation for services that utilize their own subcontractors for PHI processing.

---

## Supabase BAA Verification

### Agreement Status: VERIFIED ✅

**Service Provider:** Supabase, Inc.  
**BAA Status:** Signed and Effective  
**Effective Date:** January 15, 2026  
**BAA Version:** Supabase HIPAA Business Associate Agreement v2024.1  
**Confirmation Method:** Supabase Dashboard → Organization → Compliance → HIPAA BAA  

### Agreement Coverage

The Supabase BAA covers all PHI processing activities conducted through the Supabase platform, including the PostgreSQL database with pgvector extension, authentication services, real-time subscriptions, storage services, and edge functions. The agreement specifically covers the following data categories: patient identifiers, medical record information, treatment and diagnosis information, demographic information, and any other PHI stored in the database.

The Supabase BAA includes commitments regarding data residency (US-based data centers with HIPAA compliance), encryption requirements (encryption at rest using AES-256), access controls (role-based access with Row Level Security policies), audit logging (comprehensive logging of database access), and sub-processor management (Supabase maintains BAAs with their sub-processors).

### Data Processing Scope

Supabase processes the following PHI categories as part of the Healthcare AI Assistant architecture:

**Database Storage:** Supabase PostgreSQL stores all application data including user profiles, document metadata, chat history, audit logs, and vector embeddings of clinical documents. All database tables containing PHI are protected by Row Level Security policies ensuring data isolation and access control.

**Authentication Services:** Supabase Auth handles user authentication and session management, processing user credentials and identity information. Authentication logs are maintained for audit purposes.

**Real-Time Subscriptions:** Supabase Realtime enables real-time updates for collaborative features, with all subscription traffic encrypted and access-controlled.

**File Storage:** Supabase Storage handles document uploads and downloads, with all files encrypted at rest and access-controlled through RLS policies.

### Compliance Verification Steps

The following steps were completed to verify Supabase BAA compliance:

1. Accessed Supabase Dashboard with organization administrator credentials
2. Navigated to Organization → Compliance → HIPAA BAA
3. Verified BAA status showing "Active" with effective date January 15, 2026
4. Confirmed HIPAA compliance settings are enabled for the organization
5. Verified that all projects in the organization are covered under the BAA
6. Documented BAA confirmation screenshot in compliance evidence repository

### Supabase Compliance Certifications

Supabase maintains the following compliance certifications relevant to HIPAA compliance:

- SOC 2 Type II certification
- ISO 27001 certification
- HIPAA compliance attestation
- GDPR compliance documentation

The Supabase platform architecture supports HIPAA compliance through technical controls including encryption at rest and in transit, comprehensive audit logging, access controls with Row Level Security, data isolation through project-based architecture, and configurable data residency.

---

## OpenAI BAA Verification

### Agreement Status: PENDING VERIFICATION ⚠️

**Service Provider:** OpenAI, LLC  
**BAA Status:** Enterprise Agreement Required - Verification Needed  
**Expected Timeline:** 2-4 weeks for enterprise account activation and BAA execution  
**Required Actions:** Enterprise Dashboard configuration for HIPAA compliance  

### Verification Requirements

The OpenAI BAA requires completion of the following steps through the OpenAI Enterprise Dashboard:

**Step 1: Enterprise Account Activation**
- Access OpenAI Enterprise Dashboard with organizational credentials
- Verify enterprise tier subscription is active
- Confirm billing information is configured for enterprise usage

**Step 2: HIPAA-Compliant Processing Tier Verification**
- Navigate to OpenAI Enterprise Dashboard → Compliance → HIPAA
- Verify HIPAA-compliant processing tier is enabled
- Confirm that data processing settings are configured for PHI handling
- Document processing tier configuration in compliance evidence repository

**Step 3: Business Associate Agreement Execution**
- Navigate to OpenAI Enterprise Dashboard → Legal → Business Associate Agreement
- Review BAA terms and conditions
- Execute BAA through authorized representative
- Document BAA execution confirmation with effective date

**Step 4: Data Processing Settings Configuration**
- Navigate to OpenAI Enterprise Dashboard → Settings → Data Processing
- Configure data retention settings (minimum retention recommended for HIPAA)
- Enable audit logging for API access
- Configure PHI handling preferences
- Document configuration settings in compliance evidence repository

### Data Processing Scope

Once BAA is executed, OpenAI will process the following PHI categories:

**Query Content:** User queries submitted to the Chat API may contain PHI terms or references. All PHI in query content is sanitized before transmission using the PHI Detection and Redaction system. The system removes or masks direct identifiers while preserving clinical context for relevant response generation.

**System Prompts:** System prompts contain clinical context and instructions for the AI model. System prompts do not contain PHI but reference clinical workflows and care processes.

**Response Content:** AI-generated responses may contain references to clinical concepts and terminology. Responses are verified through the Citation System to ensure grounding in provided clinical documents.

**Embeddings:** Document embeddings are created for clinical documents during the RAG pipeline. Embeddings are vector representations that do not contain identifiable PHI but are derived from documents that may contain PHI.

### Interim Compliance Measures

While awaiting OpenAI BAA execution, the following interim compliance measures are in effect:

**PHI Sanitization:** All PHI is sanitized from query content before transmission to OpenAI API. The PHI Detection system identifies and redacts direct identifiers while preserving clinical context.

**No PHI Storage:** No PHI is stored in OpenAI systems beyond the immediate API request-response cycle. Chat history is not stored by OpenAI unless explicitly configured.

**Audit Logging:** All API calls are logged with sanitized content for audit purposes. Audit logs document query patterns and response quality without storing PHI.

**Monitoring:** API usage is monitored for compliance with intended use cases and HIPAA requirements.

### OpenAI Enterprise Compliance Resources

OpenAI provides the following resources for HIPAA compliance verification:

- OpenAI Enterprise HIPAA Implementation Guide (available through Enterprise Dashboard)
- OpenAI Enterprise API Documentation - HIPAA Compliance section
- OpenAI Enterprise Support - HIPAA Compliance verification assistance

---

## Vercel Data Processing Agreement

### Agreement Status: VERIFIED ✅

**Service Provider:** Vercel Inc.  
**DPA Status:** Signed and Effective (Enterprise Plan)  
**Effective Date:** February 1, 2026  
**Plan Level:** Enterprise with Secure Compute Add-On  

### Agreement Coverage

The Vercel Data Processing Agreement covers all processing activities conducted through the Vercel hosting platform, including application hosting, serverless functions, edge functions, and content delivery network services. The agreement includes specific provisions for HIPAA-compliant hosting with the Secure Compute add-on enabled.

The Vercel DPA includes commitments regarding encryption for data at rest and in transit, isolation through container-based architecture, secure compute options for sensitive workloads, audit logging capabilities, and incident response coordination.

### Secure Compute Configuration

The Healthcare AI Assistant utilizes Vercel Secure Compute for HIPAA-compliant hosting. Secure Compute provides additional isolation and security controls required for processing PHI:

**Network Isolation:** Secure Compute provides dedicated network isolation preventing co-tenant interference.

**Compute Isolation:** Container-based compute isolation ensures workload separation from other Vercel customers.

**Enhanced Monitoring:** Secure Compute includes enhanced monitoring and logging capabilities for compliance auditing.

**Compliance Settings:** Secure Compute configuration is verified through Vercel Dashboard → Project → Settings → Functions → Secure Compute.

### Vercel Compliance Certifications

- SOC 2 Type II certification
- ISO 27001 certification
- HIPAA compliance documentation for Enterprise customers
- PCI DSS compliance for payment processing capabilities

---

## Data Processing Agreements Summary

### Primary Processors

| Service | Agreement Type | Status | Effective Date | Coverage |
|---------|---------------|--------|----------------|----------|
| Supabase | BAA | Verified | January 15, 2026 | Database, Auth, Storage |
| OpenAI | BAA | Pending | TBD (2-4 weeks) | AI Processing, Embeddings |
| Vercel | DPA (Enterprise) | Verified | February 1, 2026 | Hosting, Compute |

### Sub-Processor Documentation

Each primary processor maintains their own sub-processor documentation:

**Supabase Sub-Processors:** Supabase maintains BAAs with infrastructure providers including cloud hosting providers (AWS), payment processors, and support service providers. Full sub-processor list available through Supabase Compliance documentation.

**OpenAI Sub-Processors:** OpenAI maintains BAAs with infrastructure providers and service dependencies. Sub-processor documentation available through OpenAI Enterprise compliance resources.

**Vercel Sub-Processors:** Vercel maintains agreements with CDN providers, monitoring services, and infrastructure providers. Sub-processor list available through Vercel Enterprise documentation.

---

## PHI Data Flow Documentation

### Data Flow Diagram Overview

The following describes the flow of PHI through the Healthcare AI Assistant system:

**Step 1: User Authentication**
Users authenticate through Supabase Auth, providing credentials that are verified against the user database. Authentication tokens are issued and validated for subsequent requests. No PHI is processed during authentication.

**Step 2: Document Upload**
Users upload clinical documents through the application interface. Documents are stored in Supabase Storage with encryption at rest. Document metadata is stored in the Supabase database with PHI detection applied.

**Step 3: Document Processing**
Uploaded documents are processed through the RAG pipeline. Document content is chunked and embedded using OpenAI text-embedding-3-small. PHI is detected and redacted before embedding creation. Embeddings are stored in Supabase pgvector.

**Step 4: Query Processing**
Users submit clinical queries through the chat interface. Query content is processed through the PHI Detection system to identify and potentially redact PHI. Queries are vectorized and matched against document embeddings.

**Step 5: Response Generation**
Relevant document chunks are retrieved and used as context for AI response generation. Response is processed through the Citation System for verification. Response with citations is returned to the user.

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Interface                           │
│                         (Vercel Hosting)                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js Application                          │
│              (Vercel Secure Compute)                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              PHI Detection & Sanitization                │    │
│  │              Access Control & Authentication            │    │
│  │              Audit Logging                               │    │
│  └─────────────────────────────────────────────────────────┘    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Supabase Database                            │
│              (PostgreSQL + pgvector + RLS)                      │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │  User Data     │  │  Documents     │  │  Audit Logs    │  │
│  │  (Encrypted)   │  │  (Encrypted)   │  │  (Immutable)   │  │
│  └────────────────┘  └────────────────┘  └────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
┌─────────────────────────┐   ┌─────────────────────────────────┐
│   OpenAI API           │   │   Monitoring & Alerting        │
│   (Enterprise BAA)     │   │   (Datadog SIEM Integration)   │
│  ┌───────────────────┐ │   └─────────────────────────────────┘
│  │ Query Processing  │ │
│  │ Embedding Gen     │ │
│  │ Response Gen     │ │
│  └───────────────────┘ │
└─────────────────────────┘
```

### Data Processing Locations

All PHI processing occurs within United States jurisdictions:

- **Application Hosting:** Vercel (US data centers)
- **Database:** Supabase (AWS US regions)
- **AI Processing:** OpenAI (US data centers)
- **Monitoring:** Datadog (US data centers)

No PHI is transmitted, processed, or stored outside of the United States.

---

## Environment Variable Requirements

The following environment variables must be configured for BAA-compliant operation:

```bash
# Required for Supabase BAA Compliance
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Required for OpenAI BAA Compliance (after enterprise activation)
OPENAI_API_KEY=your-enterprise-api-key
OPENAI_ORG_ID=your-organization-id

# Required for Vercel DPA Compliance
VERCEL_TOKEN=your-vercel-token
EDGE_CONFIG=your-edge-config-connection

# Required for Compliance Monitoring
DATADOG_API_KEY=your-datadog-api-key
AUDIT_LOG_ENDPOINT=your-audit-log-endpoint
```

All environment variables should be stored securely and accessed only by authorized personnel. Secrets management should follow organizational security policies.

---

## Compliance Verification Checklist

### Pre-Production Verification

- [ ] Supabase BAA verified and documented
- [ ] OpenAI Enterprise account activated
- [ ] OpenAI HIPAA-compliant processing tier verified
- [ ] OpenAI BAA executed and documented
- [ ] Vercel Enterprise DPA verified
- [ ] Vercel Secure Compute enabled
- [ ] All environment variables configured for HIPAA compliance
- [ ] Data residency verified (US-only processing)
- [ ] Sub-processor documentation reviewed
- [ ] Data flow documentation completed

### Ongoing Compliance Verification

- [ ] Monthly BAA status review
- [ ] Quarterly sub-processor compliance verification
- [ ] Annual BAA renewal tracking
- [ ] Continuous monitoring for compliance deviations
- [ ] Incident response procedures for BAA-related issues

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | February 7, 2026 | Compliance Team | Initial release |

---

## References

- Supabase HIPAA Documentation: https://supabase.com/docs/guides/platform/hipaa
- OpenAI Enterprise HIPAA Guide: Available through Enterprise Dashboard
- Vercel Enterprise Compliance: https://vercel.com/docs/enterprise
- HIPAA Business Associate Agreement Requirements: 45 CFR 164.308(b)(1)

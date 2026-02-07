# RTO/RPO Definitions for Healthcare AI Assistant

## Document Information

| Property | Value |
|----------|-------|
| Document | RTO/RPO Definitions |
| Version | 1.0 |
| Created | February 7, 2026 |
| Last Updated | February 7, 2026 |
| Owner | DevOps Team |
| Review Frequency | Quarterly |

## Executive Summary

This document defines the Recovery Time Objective (RTO) and Recovery Point Objective (RPO) for all critical system components of the Healthcare AI Assistant platform. These objectives ensure that disaster recovery planning aligns with clinical requirements and HIPAA compliance mandates, recognizing that system availability directly impacts patient care delivery.

The RTO defines the maximum acceptable duration of time that a system can be unavailable following a disaster. The RPO defines the maximum acceptable amount of data loss measured in time. Together, these objectives establish the foundation for all backup, replication, and disaster recovery strategies implemented across the platform.

Our healthcare-focused RTO/RPO targets prioritize patient safety and clinical workflow continuity. Systems supporting real-time clinical decision-making receive the highest recovery priority, while administrative functions have more relaxed recovery windows. This tiered approach ensures that critical patient-facing capabilities are restored first during any disaster recovery scenario.

## Component Recovery Objectives

### Database Tier (Supabase/PostgreSQL)

The primary database supporting all application data receives our highest recovery priority due to its role as the system of record for all clinical interactions. The RTO of 1 hour reflects the critical nature of patient data access during active care scenarios, while the RPO of 15 minutes ensures minimal data loss in compliance with healthcare documentation requirements.

Supabase provides built-in continuous protection through point-in-time recovery capabilities, enabling restoration to any moment within the retention window. The 15-minute RPO is achieved through continuous archiving of write-ahead logs to geographically separate storage, ensuring that at most 15 minutes of transactions could be lost in a catastrophic failure scenario.

Database recovery procedures must prioritize data integrity over speed, as clinical data accuracy cannot be compromised even during disaster recovery. All recovery operations require validation against checksums and consistency checks before the database is marked operational for clinical use.

### Vector Store (pgvector)

The vector store containing document embeddings for the RAG pipeline requires recovery objectives that align with the primary database. The RTO of 1 hour ensures that clinical search functionality is restored promptly, while the RPO of 15 minutes maintains synchronization with the document database.

Vector store recovery presents unique challenges because embeddings represent significant computational investment. Rebuilding embeddings from source documents is time-consuming and costly, making backup preservation essential. The pgvector extension within PostgreSQL enables unified backup procedures that capture both relational and vector data simultaneously.

Recovery validation for the vector store must include similarity search accuracy testing to ensure that the restored embeddings maintain the same retrieval quality as the pre-failure state. This testing verifies that clinical documents remain discoverable with equivalent relevance rankings following recovery.

### File Storage

File storage encompassing uploaded documents, generated reports, and system configurations receives a more relaxed RTO of 4 hours and RPO of 1 hour. This tiered approach reflects the availability of alternative workflows during file storage outages, such as continued clinical documentation through paper-based fallback procedures.

File storage backup strategies leverage Vercel Blob Storage with automatic replication to S3 for cross-region durability. The 1-hour RPO is achieved through continuous synchronization between primary and backup storage locations, while the 4-hour RTO provides adequate time for DNS updates and traffic rerouting during regional outages.

Critical attention must be paid to PHI-containing documents within file storage during recovery operations. All recovered files containing protected health information require integrity verification and access log review to ensure no unauthorized access occurred during the recovery window.

### Application Tier

The application tier hosting all API endpoints and business logic receives an aggressive RTO of 30 minutes reflecting its role as the integration point for all user interactions. The RPO of 5 minutes minimizes transaction loss during application-level failures, achieved through stateless design and rapid redeployment capabilities.

Application tier recovery emphasizes infrastructure-as-code practices, enabling rapid redeployment from version-controlled configurations. The 30-minute RTO assumes that deployment infrastructure remains available and that container images are cached in accessible registries. Recovery procedures must verify that all environment variables, secrets, and configuration overrides are correctly applied during redeployment.

Session state management through Redis ensures that user authentication and in-flight transactions can be recovered or gracefully handled during application tier failures. The 5-minute RPO for application state aligns with typical session timeout values, minimizing user disruption during recovery operations.

### AI Services (OpenAI)

External AI services including GPT model access receive special treatment due to their stateless nature. The RTO of 15 minutes recognizes that OpenAI maintains global redundancy and that service restoration is largely outside our control, while the RPO of 0 minutes reflects the absence of persistent state requiring backup.

AI service recovery focuses on alternative provider configuration and graceful degradation procedures. When OpenAI services become unavailable, the system must seamlessly fall back to configured backup providers or enter reduced-functionality mode that preserves core clinical workflows while disabling AI-dependent features.

API key rotation and provider configuration are managed through environment variables, enabling rapid reconfiguration without code deployment. Monitoring integrations with OpenAI status feeds enable proactive awareness of service disruptions before user impact occurs.

## Recovery Priority Order

The following priority order guides all recovery operations, ensuring that critical clinical capabilities are restored first while acknowledging dependencies between system components.

**Priority 1 (Immediate - 0-15 minutes)** includes database and vector store recovery, as these systems support all downstream functionality. Without data layer availability, application and user-facing services cannot function regardless of their individual recovery status. Recovery efforts focus on data consistency verification before proceeding to dependent tiers.

**Priority 2 (15-30 minutes)** encompasses application tier recovery and AI service reconfiguration. Once data layer integrity is confirmed, application deployment enables service restoration. AI service fallback procedures execute in parallel with application deployment, minimizing total recovery time.

**Priority 3 (30 minutes - 2 hours)** addresses file storage recovery and secondary service restoration. With primary clinical workflows operational, administrative functions and document access are restored. This tier supports ongoing clinical activities while completing full system recovery.

**Priority 4 (2-4 hours)** focuses on non-critical auxiliary services and performance optimization following recovery. Monitoring verification, cache warming, and performance tuning occur after core clinical functionality is confirmed operational.

## Component Dependencies

Understanding component dependencies is essential for planning recovery sequences and identifying potential blocking conditions during disaster recovery operations.

The application tier depends directly on database availability, requiring successful database recovery before application deployment can succeed. Similarly, the vector store must be operational before RAG-based search functionality becomes available, though applications can operate in degraded mode without vector search capabilities.

File storage dependencies are more flexible, with applications capable of generating new documents without access to historical files. However, document viewing and report generation for historical records requires file storage recovery before those specific features become available.

AI services present a unique dependency profile. While the application can function without AI inference, clinical workflows requiring document analysis, summarization, or enhanced search capabilities experience degraded functionality during AI service outages. Application architecture must gracefully handle these degraded scenarios.

## Rationale for Recovery Objectives

### Clinical Requirements Alignment

Recovery objectives were established through collaboration with clinical leadership, ensuring alignment with patient care requirements and acceptable workflow disruption levels. The 1-hour database RTO reflects the maximum acceptable downtime for electronic health record access during active patient care scenarios.

Healthcare regulatory requirements influenced both RTO and RPO targets. HIPAA mandates require audit log preservation and data integrity, driving the emphasis on point-in-time recovery capabilities and comprehensive backup verification procedures. The 15-minute RPO ensures compliance with documentation timeliness expectations while remaining achievable with available technology.

Clinical workflow analysis identified peak usage periods where system availability is most critical. Recovery planning accounts for these high-availability windows, ensuring that backup procedures and recovery testing avoid scheduled clinical activities while maintaining readiness during unexpected failures.

### Technical Feasibility Assessment

Recovery objectives were validated against current infrastructure capabilities and cost constraints. The 1-hour database RTO is achievable through combination of automated failover, pre-configured standby instances, and documented recovery procedures that minimize human decision-making during initial recovery phases.

Vector store recovery feasibility depends on embedding size and computational requirements. Current implementation maintains embedding generation pipelines that can rebuild the vector store from source documents within 2 hours, providing a fallback option if primary recovery exceeds the 1-hour RTO.

Application tier recovery leverages containerized deployment with pre-built images and infrastructure-as-code configurations, enabling sub-30-minute recovery when deployment infrastructure remains available. Regional outage scenarios require DNS propagation time that extends effective recovery beyond pure deployment duration.

## Measurement and Verification

### RTO Verification Procedures

Recovery time measurement begins at failure detection and ends when all recovery validation checks pass. Measurement includes detection time, decision time, execution time, and validation time, enabling identification of improvement opportunities across the entire recovery workflow.

Automated measurement scripts record timestamps at each recovery phase, generating reports that compare actual recovery times against defined RTOs. Variance analysis identifies procedures requiring optimization, driving continuous improvement in disaster recovery capabilities.

Quarterly DR testing provides controlled measurement opportunities without production impact. Test scenarios simulate various failure modes, measuring recovery times under realistic conditions while documenting procedures and outcomes for compliance purposes.

### RPO Verification Procedures

Point-in-time recovery testing verifies that restored data reflects the intended recovery point within acceptable variance. Test restores to random timestamps validate that continuous archiving captures all committed transactions without data loss beyond the defined RPO.

Data integrity checks following recovery include checksum verification, referential integrity validation, and spot-check comparisons against source documents. These checks confirm not only that the correct amount of data is recovered, but that the recovered data maintains clinical accuracy and consistency.

Audit log continuity verification ensures that compliance-related records remain intact and properly sequenced following recovery. Any gaps in audit coverage require investigation and documentation, with root cause analysis informing backup procedure improvements.

## Review and Update Schedule

Recovery objectives require annual review with additional reviews triggered by significant infrastructure changes, clinical workflow modifications, or lessons learned from actual recovery events. The quarterly DR testing cadence provides ongoing validation of objective achievability.

Changes to recovery objectives require documented approval from clinical leadership, compliance, and technical stakeholders. Impact assessments evaluate how changes affect backup strategies, infrastructure investments, and operational procedures.

This document and all referenced recovery procedures are version-controlled and subject to change control processes. Effective dates and approval signatures are required for all modifications, ensuring traceability and accountability for recovery objective changes.

## Appendix A: Quick Reference Card

| Component | RTO | RPO | Priority | Recovery Method |
|-----------|-----|-----|----------|-----------------|
| Database (Supabase) | 1 hour | 15 minutes | 1 | Point-in-time recovery |
| Vector Store (pgvector) | 1 hour | 15 minutes | 1 | pgvector backup restore |
| Application Tier | 30 minutes | 5 minutes | 2 | Container redeployment |
| File Storage | 4 hours | 1 hour | 3 | Cross-region replication |
| AI Services (OpenAI) | 15 minutes | 0 minutes | 2 | Provider reconfiguration |

## Appendix B: Emergency Contacts

| Role | Contact | Responsibility |
|------|---------|----------------|
| DR Team Lead | [On-call rotation] | Recovery coordination |
| Database Admin | [On-call rotation] | Database recovery |
| Platform Engineer | [On-call rotation] | Application recovery |
| Security Officer | [On-call rotation] | Security validation |
| Clinical Liaison | [Designated contact] | Clinical impact assessment |
| Compliance Officer | [Designated contact] | Regulatory notification |

## Appendix C: Escalation Matrix

| Severity | Escalation Path | Response Time |
|----------|-----------------|---------------|
| P1 - Critical | DR Team Lead → CTO → Executive Team | Immediate |
| P2 - High | DR Team Lead → Department Heads | 30 minutes |
| P3 - Medium | Operations Team → DR Team Lead | 2 hours |
| P4 - Low | Operations Team | Next business day |

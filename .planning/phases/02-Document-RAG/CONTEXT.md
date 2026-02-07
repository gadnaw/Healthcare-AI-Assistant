# Phase 2 Context

**Phase**: Document Management & RAG  
**Research Status**: Complete  
**Confidence**: MEDIUM-HIGH  
**Date**: February 7, 2026

## Key Research Findings

### 1. Document Loaders (LangChain.js)
- PDF: pdfjs-dist with lazy loading for large files
- DOCX: mammoth library
- TXT: TextLoader with encoding detection

### 2. Clinical-Aware Chunking
- RecursiveCharacterTextSplitter with clinical separators
- Split on `\n## `, `\n### `, medical keywords
- 512 tokens, 128-token overlap
- Section headers preserved in chunk metadata

### 3. pgvector Indexing
- HNSW index (m=16, ef_construction=64) for production
- IVFFlat fallback for large datasets
- CREATE INDEX CONCURRENTLY to avoid blocking writes

### 4. Org-Scoped Vector Search
- RLS policies enforce org_id filtering
- match_org_documents() function for search
- Similarity threshold: 0.7

### 5. Medical Embedding Evaluation
- **Primary**: text-embedding-3-small (cost/latency balance, score 0.82)
- **Specialized**: PubMedBERT/BioClinicalBERT for medical QA
- Evaluation supports baseline selection

### 6. Document Status States
- uploaded → validating → processing → chunking → embedding → storing → ready/error
- Progress tracking per document

### 7. Cascade Deletion
- ON DELETE CASCADE foreign key constraints
- Explicit pgvector chunk deletion
- Storage file deletion

### 8. File Validation
- Magic byte validation
- SHA-256 hashing
- PDF security scanning (no JS, no auto-open)
- Malicious pattern detection

## Open Questions for Planning

1. Optimal chunk size for clinical protocols vs formularies?
2. Embedding dimension trade-offs (1536 vs 768)?
3. Batch embedding vs real-time for large uploads?

## Dependencies

- Phase 1: Auth, RLS, audit logging must be complete

## Ready for Planning

Research complete. All Phase 2 requirements have implementation patterns documented.

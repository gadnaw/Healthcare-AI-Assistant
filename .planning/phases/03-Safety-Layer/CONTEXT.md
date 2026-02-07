# Phase 3 Context

**Phase**: Safety Layer  
**Research Status**: Complete  
**Confidence**: HIGH  
**Date**: February 7, 2026

## Key Research Findings

### 1. PHI Detection (Defense-in-Depth)
- **Layer 1**: Regex patterns (SSN, MRN, DOB, phone, email, addresses)
- **Layer 2**: NLP-based entity recognition
- **Layer 3**: Azure Text Analytics (HIPAA-compliant)
- Audit logging without storing PHI values

### 2. Citation System
- Chunk references with relevance scores (0-1)
- Document title and section path included
- Clickable citations for source context
- Inline format: [Source: chunk_id, relevance: 0.85]

### 3. Citation Verification Pipeline
- Post-generation verification against source chunks
- String-similarity based checking (faster than LLM-based)
- Fabricated citations flagged for human review
- Target: >95% verified citation rate

### 4. Query Intent Classification
- Clinical protocol queries: strict grounding required
- Personal health advice: BLOCKED
- Conversational queries: lighter constraints
- Accuracy target: >90% on test set

### 5. Groundedness Scoring
- Multi-factor: coverage, relevance, accuracy, verification
- Minimum threshold: 0.7 for clinical use
- Below threshold triggers no-response path

### 6. No-Response Path
- "I don't have sufficient evidence to answer this question"
- Suggestions for rephrasing
- Links to relevant documents

### 7. System Prompt Isolation
- Message role enforcement (system/user/assistant)
- Content sanitization (strip dangerous patterns)
- Never expose system prompts to user input

### 8. Prompt Injection Detection
- **Patterns**: prompt leaks, role overrides, context ignoring
- **Delimiters**: XML, JSON, base64 encoding attacks
- **Coding exploits**: Python/JS injection
- LLM-based detection for sophisticated attacks

### 9. Clinical Safety System Prompt
```
You are a clinical knowledge assistant.
Answer ONLY from the provided document context.
If information is not in documents, say so.
Never provide medical advice beyond approved documents.
Cite sources with every claim.
Temperature: 0.1
```

## Open Questions for Planning

1. PHI detection: Azure vs alternative HIPAA-compliant services?
2. Citation verification: LLM-based vs string-similarity?
3. Query classification: custom classifier vs rule-based?

## Dependencies

- Phase 2: RAG pipeline must be operational

## Ready for Planning

Research complete. All Phase 3 requirements have implementation patterns documented.

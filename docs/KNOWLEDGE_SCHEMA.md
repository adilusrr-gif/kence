
---

### `KNOWLEDGE_SCHEMA.md`

```md id="jlwm4k"
# KENCE.ai — Knowledge Schema

# Overview

KENCE.ai does not store only text.

The system stores structured intelligence objects.

These objects power:
- dashboards
- GraphRAG
- analytics
- AI agents
- reports
- semantic search

---

# Core Intelligence Objects

## Document

Represents uploaded source material.

Fields:
- id
- title
- type
- source
- author
- created_at
- workspace_id
- metadata
- embedding_refs

---

## Chunk

Semantic section of a document.

Fields:
- id
- document_id
- content
- page_number
- chunk_type
- embeddings
- metadata

---

## Entity

Detected semantic object.

Examples:
- person
- organization
- technology
- location
- financial metric

Fields:
- id
- entity_type
- value
- aliases
- confidence_score

---

## Relationship

Semantic connection between entities.

Examples:
- references
- owns
- contradicts
- related_to

Fields:
- id
- source_entity
- target_entity
- relation_type
- confidence

---

## Insight

AI-generated structured finding.

Examples:
- anomaly
- trend
- recommendation
- contradiction

Fields:
- id
- insight_type
- severity
- explanation
- evidence_refs

---

## Evidence

Supporting source references.

Fields:
- id
- document_id
- chunk_id
- quote
- page
- confidence

---

## Risk

Detected compliance or operational risk.

Fields:
- id
- category
- severity
- affected_entities
- mitigation

---

## Metric

Structured numerical information.

Examples:
- revenue
- growth
- KPI
- percentages

Fields:
- id
- metric_name
- value
- source
- timestamp

---

## Timeline Event

Chronological knowledge object.

Fields:
- id
- event_type
- timestamp
- related_entities
- evidence

---

# Knowledge Flow

Document
 ↓
Parsing
 ↓
Chunking
 ↓
Embeddings
 ↓
Entity Extraction
 ↓
Relationship Mapping
 ↓
Insight Generation
 ↓
Knowledge Graph

---

# Structured Intelligence

AI outputs should be structured.

Avoid:
- plain text summaries only

Prefer:
- entities
- risks
- metrics
- relationships
- evidence

---

# Future Goals

- enterprise memory layer
- semantic organization intelligence
- GraphRAG
- autonomous reasoning
- proactive AI discovery
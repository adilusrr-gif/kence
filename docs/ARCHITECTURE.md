### `AI_ARCHITECTURE.md`

```md id="jlwmxa"
# KENCE.ai — AI Architecture

# Overview

KENCE.ai is an AI-native enterprise intelligence platform.

AI is not an additional feature.

AI is the core operating layer of the system.

---

# AI Layers

## 1. Ingestion Layer

Responsibilities:
- document parsing
- OCR
- media extraction
- preprocessing

Technologies:
- Docling
- Tesseract
- PyMuPDF

---

## 2. Embedding Layer

Responsibilities:
- semantic vector generation
- multimodal embeddings

Models:
- nomic-embed
- bge
- CLIP

---

## 3. Retrieval Layer

Responsibilities:
- semantic retrieval
- hybrid search
- reranking
- GraphRAG

Components:
- vector DB
- BM25
- rerankers
- metadata filters

---

## 4. Reasoning Layer

Responsibilities:
- contextual reasoning
- summarization
- analysis
- generation

Models:
- Qwen
- Llama
- future enterprise models

---

## 5. Intelligence Layer

Responsibilities:
- entity extraction
- relationship mapping
- risk analysis
- KPI extraction
- contradiction detection

---

## 6. Agent Layer

Future:
- autonomous workflows
- specialized AI agents
- orchestration

Examples:
- Compliance Agent
- Research Agent
- Presentation Agent

---

# Multimodal Architecture

Inputs:
- PDF
- DOCX
- PPTX
- images
- audio
- video

---

# Processing Pipeline

Input
 ↓
Parsing
 ↓
Chunking
 ↓
Embeddings
 ↓
Retrieval
 ↓
Reasoning
 ↓
Structured Intelligence
 ↓
Dashboards / Reports / Graph

---

# Hybrid Search

Search combines:
- semantic vectors
- keyword search
- metadata filtering
- graph traversal

---

# Structured Intelligence

AI outputs:
- entities
- risks
- insights
- metrics
- relationships

NOT only plain text.

---

# Long-Term Vision

KENCE.ai evolves into:
- enterprise intelligence infrastructure
- multimodal knowledge engine
- AI operating system
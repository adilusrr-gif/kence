# KENCE.ai — Database Schema

# Overview

KENCE.ai uses a hybrid storage architecture.

Components:
- PostgreSQL
- Vector Database
- Graph Database
- Object Storage

---

# PostgreSQL Core Tables

## users

```sql
id
email
password_hash
role
organization_id
created_at
organizations
id
name
plan
created_at
workspaces
id
organization_id
name
description
created_by
created_at
documents
id
workspace_id
filename
document_type
storage_path
status
metadata
uploaded_by
created_at
document_chunks
id
document_id
chunk_index
content
embedding_id
metadata
created_at
entities
id
workspace_id
entity_type
value
aliases
confidence
created_at
relationships
id
source_entity_id
target_entity_id
relationship_type
confidence
created_at
insights
id
workspace_id
insight_type
severity
summary
details
created_at
risks
id
workspace_id
risk_type
severity
description
status
created_at
metrics
id
workspace_id
metric_name
metric_value
source_document_id
timestamp
presentations
id
workspace_id
title
pptx_path
pdf_path
generated_by
created_at
sessions
id
user_id
workspace_id
started_at
last_activity
event_history
id
event_type
correlation_id
payload
status
duration_ms
error_message
created_at
Vector Database

Initial:

ChromaDB

Future:

Qdrant
Milvus

Stores:

embeddings
semantic vectors
multimodal vectors
Graph Database

Future:

Neo4j
FalkorDB

Stores:

entity relationships
semantic graph
GraphRAG structures
Object Storage

Stores:

uploaded files
extracted images
generated reports
presentations

Future:

S3-compatible storage
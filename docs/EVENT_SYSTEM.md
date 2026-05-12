# KENCE.ai — Event System Architecture

# Overview

KENCE.ai uses an event-driven AI-native architecture.

Events are the nervous system of the platform.

Every major action inside the system generates structured events that:
- trigger workflows
- update intelligence layers
- orchestrate AI pipelines
- synchronize UI state
- power analytics and observability

---

# Core Principles

- asynchronous processing
- decoupled services
- scalable orchestration
- realtime intelligence
- event replayability
- observability-first design

---

# Event Lifecycle

User Action
 ↓
Event Created
 ↓
Event Bus
 ↓
Processing Pipeline
 ↓
AI/Storage/Analytics
 ↓
Realtime UI Updates
 ↓
Audit/Event Store

---

# Base Event Schema

```json
{
  "event_id": "uuid",
  "event_type": "DOCUMENT_UPLOADED",
  "workspace_id": "uuid",
  "session_id": "uuid",
  "correlation_id": "uuid",
  "payload": {},
  "status": "PENDING",
  "created_at": "timestamp",
  "processed_at": "timestamp"
}
Core Event Types
Document Events
DOCUMENT_UPLOADED
DOCUMENT_PARSE_STARTED
DOCUMENT_PARSED
DOCUMENT_CHUNKED
DOCUMENT_EMBEDDED
DOCUMENT_INDEXED
DOCUMENT_READY
DOCUMENT_ARCHIVED
AI Events
PROMPT_RECEIVED
RETRIEVAL_STARTED
CONTEXT_GENERATED
RESPONSE_STREAM_STARTED
RESPONSE_STREAM_COMPLETED
Intelligence Events
ENTITY_DISCOVERED
RELATIONSHIP_CREATED
RISK_DETECTED
CONTRADICTION_FOUND
ANOMALY_DETECTED
KPI_EXTRACTED
TIMELINE_UPDATED
Analytics Events
DASHBOARD_UPDATED
METRICS_GENERATED
ANALYTICS_COMPLETED
Presentation Events
PRESENTATION_STARTED
SLIDES_GENERATED
REPORT_EXPORTED
System Events
ERROR_EVENT
SECURITY_ALERT
AGENT_FAILED
PIPELINE_TIMEOUT
Correlation IDs

Every event chain must contain:

correlation_id

This allows:

distributed tracing
debugging
workflow reconstruction
observability

Example:

UPLOAD_EVENT
-> PARSE_EVENT
-> CHUNK_EVENT
-> EMBED_EVENT

All linked by the same correlation_id.

Event Store

All events must be persisted.

Purpose
replayability
debugging
analytics
audit logs
workflow recovery
Event Store Schema
event_history

Fields:

id
event_type
workspace_id
document_id
correlation_id
payload
status
duration_ms
error_message
created_at
processed_at
Event Bus

Initial implementation:

internal async event dispatcher

Future:

Redis Streams
RabbitMQ
Kafka
Pipeline Architecture

Pipelines are collections of ordered events.

Example:

DOCUMENT_UPLOADED
↓
DOCUMENT_PARSED
↓
DOCUMENT_CHUNKED
↓
DOCUMENT_EMBEDDED
↓
DOCUMENT_READY

Branching Pipelines

Future architecture supports parallel execution.

Example:

DOCUMENT_PARSED
├── OCR_PIPELINE
├── IMAGE_PIPELINE
├── TABLE_PIPELINE
├── ENTITY_PIPELINE
└── GRAPH_PIPELINE

Realtime Streaming

Frontend receives:

token streams
status updates
analytics updates
dashboard refreshes

Protocols:

SSE
WebSockets
Future Goals
agent orchestration
autonomous workflows
distributed processing
realtime intelligence graph
AI-driven event generation
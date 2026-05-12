  Phase 4 Goal
  Phase 4 вводит frontend intelligence layer как отдельную архитектурную плоскость над shell, stores и workspace
  sessions. Это не “ещё один panel with cards”, а нормализованная intelligence system, которая:

  - связывает AI outputs с workspace context
  - обеспечивает inspectable reasoning
  - поддерживает cross-document intelligence
  - готова к GraphRAG, multimodal AI и agents
  - работает через event-driven updates

  ———

  ## 1. Intelligence Layer Position In Architecture

  Phase 4 sits above:

  - Phase 1 shared UI system
  - Phase 2 store/state system
  - Phase 3 shell/runtime

  Layer stack:

  1. shared/ui
  2. shell/runtime
  3. workspace/session
  4. domain entities
  5. intelligence entities
  6. intelligence selectors
  7. intelligence widgets/panels
  8. intelligence orchestration

  Principle:

  - intelligence objects are not raw backend payloads
  - intelligence objects are normalized frontend models derived from AI/analysis outputs and linked to sessions,
    documents, artifacts, tasks, and provenance

  ———

  ## 2. Full Frontend Folder Structure

  src/
    intelligence/
      model/
        types/
        normalization/
        selectors/
        orchestration/
        events/
        caching/
      graph/
        selectors/
        interactions/
        adapters/
      analytics/
        selectors/
        adapters/
        derived/
    entities/
      insight/
        model/
      risk/
        model/
      entity-node/
        model/
      relationship/
        model/
      evidence/
        model/
      timeline-event/
        model/
      metric/
        model/
      provenance-record/
        model/
      task-execution/
        model/
    widgets/
      intelligence-panel/
      insight-feed/
      provenance-viewer/
      evidence-navigator/
      reasoning-trace/
      timeline-intelligence/
      metric-visualization/
      graph-intelligence/
      cross-document-intelligence/
      artifact-intelligence/
    selectors/
      intelligence/
      graph/
      analytics/
    orchestration/
      intelligence/
        resolveIntelligenceContext.js
        bindIntelligenceToSession.js
        routeIntelligenceEvent.js
        reconcileIntelligenceObjects.js
        updateReasoningTrace.js
    graph/
      ui/
      selectors/
    analytics/
      ui/
      selectors/

  Rule:

  - entities/* hold normalized object families
  - intelligence/model/* holds cross-object orchestration, selectors, caching policy
  - widgets/* hold rendering surfaces
  - graph/* and analytics/* are intelligence consumers, not competing domains

  ———

  ## 3. Intelligence Object System

  Intelligence object families:

  - Insight
  - Risk
  - Entity
  - Relationship
  - Evidence
  - TimelineEvent
  - Metric
  - Artifact
  - TaskExecution
  - ProvenanceRecord

  Cross-object rules:

  - every intelligence object should be addressable by id
  - every intelligence object should be linked to workspaceId and/or sessionId
  - every intelligence object should carry provenance refs
  - every intelligence object should support partial realtime enrichment
  - intelligence objects must be renderable independently and composable together

  ———

  ## 4. Intelligence Object Schemas

  ## Insight

  Frontend schema

  {
    id,
    workspaceId,
    sessionId,
    title,
    summary,
    category,              // summary | anomaly | contradiction | recommendation | trend | correlation
    confidence,
    severity,              // low | medium | high | critical
    status,                // draft | active | archived | invalidated
    sourceDocumentIds,
    evidenceIds,
    entityIds,
    metricIds,
    riskIds,
    timelineEventIds,
    provenanceRecordIds,
    taskExecutionId,
    artifactIds,
    tags,
    createdAt,
    updatedAt
  }

  Ownership boundaries

  - owned by insight entity model
  - not owned by shell, activity rail, or message store

  Rendering strategy

  - cards, feed rows, summary tiles, graph annotations
  - can render compact or expanded

  Realtime update strategy

  - may arrive as draft and later be enriched
  - confidence, evidenceIds, severity can update incrementally

  Normalization

  - normalized by id
  - related refs via ids only

  Persistence

  - persist metadata and refs
  - do not persist giant rendered HTML fragments

  ———

  ## Risk

  Frontend schema

  {
    id,
    workspaceId,
    sessionId,
    title,
    description,
    type,                  // compliance | contradiction | operational | legal | financial | content
    severity,              // low | medium | high | critical
    confidence,
    status,                // open | acknowledged | mitigated | dismissed
    insightIds,
    evidenceIds,
    entityIds,
    sourceDocumentIds,
    provenanceRecordIds,
    taskExecutionId,
    createdAt,
    updatedAt
  }

  Ownership boundaries

  - owned by risk entity model

  ———

  ## 8. AI Provenance Viewer

  ### Purpose

  Make reasoning trace inspectable and enterprise-safe.

  ### Core views

  - lineage summary
  - evidence chain
  - reasoning stages
  - source documents
  - linked task execution
  - model/strategy metadata

  ### Composition

  ProvenanceViewer
    ProvenanceSummaryCard
    ProvenanceStageTimeline
    ProvenanceEvidenceList
    ProvenanceTaskInspector
    ProvenanceSourceBundle

  ### Contracts

  - input may be objectType + objectId
  - viewer resolves related ProvenanceRecord[]
  - can pivot to TaskExecution
  - can pivot to Evidence

  ### Rendering rule

  - provenance shows “how we know this”, not full raw chain-of-thought
  - trace visualization must be stage-based, evidence-based, and model-metadata-based

  ———

  ## 9. Knowledge Graph Interaction Model

  ### Graph object sources

  - Entity
  - Relationship
  - Evidence
  - Insight overlays
  - Risk overlays
  - Metric overlays

  ### Graph interactions

  - select node -> context panel entity inspector
  - select edge -> relationship inspector
  - open entity evidence -> evidence navigator
  - overlay risks/insights on nodes
  - pivot from insight to graph neighborhood
  - save graph-focused session context

  ### Frontend graph architecture

  - canonical graph data comes from entity + relationship stores
  - graph layer builds renderable nodes/edges through selectors
  - graph-specific transient state:
      - selectedNodeId
      - selectedEdgeId
      - expandedNeighborhoodIds
      - graphViewPreset

  ### GraphRAG support

  - relationship objects and provenance records are already graph-compatible
  - graph retrieval stages can create graph-context evidence and provenance links

  ———

  ## 10. Cross-Document Intelligence Model

  ### Purpose

  Generate intelligence not tied to a single document.

  ### Cross-document objects

  - insights spanning multiple docs
  - contradictions between docs
  - shared entities across docs
  - metric comparisons
  - timeline merges

  ### Model rules

  - cross-document object must include sourceDocumentIds.length > 1
  - evidence can come from multiple source documents
  - provenance must identify cross-document reasoning stage

  ### Rendering

  - cross-document insight cards
  - contradiction matrix
  - entity overlap panels
  - metric comparison groups
  - merged timeline lanes

  ### Session interaction

  - can live in compare sessions
  - can also appear in general workspace analytics sessions

  ———

  ## 11. Intelligence-To-Workspace Interaction

  ### Workspace -> intelligence

  - current session mode scopes visible intelligence
  - selected document/entity/evidence refines panel selectors
  - active command execution produces new intelligence

  ### Intelligence -> workspace

  - clicking insight opens evidence/doc context
  - clicking risk opens related documents or compare mode
  - clicking metric opens analytics view
  - clicking relationship opens graph view
  - clicking artifact opens studio/output view

  ### Rebinding

  - intelligence selectors must rebind on tab/session switch
  - frozen panel state may keep object focus if object still valid

  ———

  ## 12. Intelligence Event Flows

  ### Event classes

  - INSIGHT_CREATED
  - INSIGHT_UPDATED
  - RISK_DETECTED
  - ENTITY_DISCOVERED
  - ENTITY_MERGED
  - RELATIONSHIP_CREATED
  - TIMELINE_EVENT_EXTRACTED
  - METRIC_EXTRACTED
  - PROVENANCE_ATTACHED
  - ARTIFACT_INTELLIGENCE_UPDATED

  ### Flow

  1. transport or async action emits event
  2. event normalized in eventStore
  3. intelligence orchestration resolves affected object family
  4. target entity store upserts object
  5. selectors recompute views
  6. activity rail + intelligence panel reflect change

  ### Rule

  - events do not directly mutate UI
  - events mutate normalized stores, UI derives from selectors

  ———

  ## 13. Realtime Intelligence Updates

  ### Realtime sources

  - SSE status updates
  - streaming extraction phases
  - synthetic frontend events during async fallback
  - future WebSocket intelligence channels

  ### Update patterns

  - draft object created
  - partial enrichment patch
  - confidence recomputed
  - finalization mark
  - invalidation/archive mark

  ### Realtime-safe object families

  - Insight
  - Risk
  - Entity
  - Relationship
  - Metric
  - TaskExecution
  - ProvenanceRecord

  ### UI behavior

  - feeds show skeleton/draft states
  - provenance viewer may show “reasoning in progress”
  - graph can pulse new nodes/edges
  - metrics can appear progressively with confidence flags

  ———

  ## 14. Intelligence Selectors Architecture

  Selector layers:

  1. raw entity selectors
  2. family selectors
  3. composed intelligence selectors
  4. workspace-scoped selectors
  5. render selectors

  ### Required selector groups

  - selectInsightsForSession
  - selectRisksForSession
  - selectEntitiesForSession
  - selectRelationshipsForEntity
  - selectEvidenceForObject
  - selectTimelineForSession
  - selectMetricsForSession
  - selectArtifactsForInsight
  - selectTaskExecutionForObject
  - selectProvenanceForObject

  ### Cross-object selectors

  - selectIntelligenceOverviewForSession
  - selectCrossDocumentIntelligenceForWorkspace
  - selectGraphNeighborhoodForSelectedEntity
  - selectReasoningTraceForInsight
  - selectEvidenceTrailForRisk
  - selectMetricEvidenceBundle

  Rules:

  - selectors join objects by ids only
  - render selectors can sort/group
  - entity stores stay raw and normalized

  ———

  ## 15. Intelligence Rendering Boundaries

  ### Boundaries by surface

  - intelligence panel root boundary
  - insight feed boundary
  - provenance viewer boundary
  - graph intelligence boundary
  - timeline intelligence boundary
  - metric visualization boundary

  ### Rules

  - updating one insight should not rerender entire graph surface
  - metric refresh should not rerender evidence navigator unless shared selector changes
  - graph overlays should be separately memoized from base graph render
  - provenance viewer should lazy-load deeper trace sections

  ———

  ## 16. Intelligence Orchestration Flows

  ### Core orchestration modules

  - resolveIntelligenceContext
  - bindIntelligenceToSession
  - routeIntelligenceEvent
  - reconcileIntelligenceObjects
  - updateReasoningTrace

  ### Example flow: analyze document

  1. command submitted
  2. TaskExecution created
  3. extraction/retrieval events arrive
  4. entity/evidence/provenance records created
  5. insights/risks/metrics derived
  6. panel overview selector updates
  7. activity rail shows completed intelligence generation

  ### Example flow: compare documents

  1. compare task starts
  2. cross-document evidence objects created
  3. contradiction insights and delta metrics emitted
  4. risks linked to conflicting evidence
  5. timeline merges if dates extracted

  ———

  ## 17. Intelligence Caching Strategy

  ### Cache layers

  - normalized entity cache
  - query/index cache
  - session intelligence snapshot
  - recent execution cache

  ### Rules

  - intelligence payloads cached by entity family
  - query caches keyed by session/workspace/object context
  - provenance records retained longer than event stream but shorter than canonical entities if memory constrained
  - invalidation triggered by new task execution affecting same object space

  ### Invalidate when

  - session changes source documents significantly
  - same analysis rerun with newer outputs
  - entity merge/deprecation occurs
  - compare/presentation artifacts superseded

  ———

  ## 18. Intelligence UI Composition Model

  ### Core UI widgets

  - IntelligencePanel
  - InsightFeed
  - RiskMatrix
  - EntityClusterList
  - RelationshipInspector
  - EvidenceNavigator
  - TimelineIntelligenceView
  - MetricVisualizationPanel
  - ArtifactIntelligenceView
  - ProvenanceViewer
  - ReasoningTraceView

  ### Composition rules

  - widgets consume selectors, never raw cross-store traversal in render
  - widgets must render compact and expanded variants
  - widgets should be dockable over time
  - widgets must preserve workspace context on pivot

  ———

  ## 19. Knowledge Graph Frontend Integration

  ### Integration points

  - entity and relationship stores are canonical graph source
  - graph selectors derive visual node/edge models
  - provenance records annotate graph lineage
  - insights and risks become graph overlays
  - evidence can anchor graph edge/node explanations

  ### Future GraphRAG hooks

  - reasoningStage = graph-linking
  - graph neighborhood as context scope
  - graph-derived evidence objects
  - path confidence and relationship confidence surfaced in selectors

  ———

  ## 20. Analytics Object System

  Analytics in Phase 4 is object-based, not page-based.

  ### Analytics object families

  - Metric
  - Insight
  - future AnalyticView
  - future MetricSeries

  ### Responsibilities

  - metrics represent extracted structured signals
  - insights interpret them
  - evidence proves them
  - provenance explains them
  - artifacts package them

  ### UI

  - KPI cards
  - metric explanation panels
  - trend comparison groups
  - evidence-linked metrics

  ———

  ## 21. Artifact Intelligence System

  Artifacts are outputs with intelligence lineage.

  ### Artifact intelligence fields

  - source insights
  - source metrics
  - source risks
  - task execution ref
  - provenance records
  - preview meta

  ### Use cases

  - generated presentation shows which insights fed it
  - compare export shows which contradictions/metrics generated it
  - summary report references evidence bundle

  ———

  ## 22. Timeline System

  ### Purpose

  Transform extracted dates/events into navigable intelligence.

  ### Timeline sources

  - documents
  - compare sessions
  - cross-document sessions
  - entity-specific histories
  - task executions if debugging

  ### Views

  - session timeline
  - entity timeline
  - merged timeline
  - uncertainty-aware timeline

  ### Rule

  TimelineEvent is intelligence object, not shell activity event.

  ———

  ## 23. Evidence System

  ### Purpose

  Evidence is the grounding layer across all intelligence.

  ### Evidence navigation

  - object -> evidence
  - evidence -> source document/artifact
  - evidence -> other linked intelligence objects
  - evidence -> provenance stage

  ### Evidence types

  - text chunk
  - paragraph
  - quoted fragment
  - table cell
  - diff fragment
  - image region
  - slide region
  - future transcript span

  ### UI rules

  - evidence cards must show source, excerpt, location, relevance, links
  - users must be able to navigate from intelligence object to origin quickly

  ———

  ## 24. Risk System

  ### Purpose

  Operationalize potentially critical findings.

  ### Risk flow

  - evidence -> risk detection
  - risk -> insight linkage
  - risk -> artifact/report inclusion
  - risk -> acknowledge/dismiss workflow later

  ### Rendering

  - grouped by severity/status/type
  - cross-document contradictions should escalate into risks when warranted

  ———

  ## 25. Relationship System

  ### Purpose

  Represent semantic structure across workspace.

  ### Relationships support

  - graph rendering
  - evidence linking
  - contradiction detection
  - timeline/context fusion
  - GraphRAG bootstrapping

  ### UI rules

  - relationship display must include strength/confidence and evidence path
  - relation edges should not be treated as decorative graph-only objects

  ———

  ## 26. Intelligence Rendering Strategy By Family

  - Insight: feed cards, overview tiles, session summaries
  - Risk: severity-first cards, risk matrix, issue queues
  - Entity: chips, inspectors, graph nodes, cross-document overlaps
  - Relationship: graph edges, relation list, dependency view
  - Evidence: citations, source navigator, proof trays
  - TimelineEvent: chronology lanes and merged timelines
  - Metric: KPI cards, rows, comparison panels
  - Artifact: output tiles with lineage
  - TaskExecution: debug/ops timelines
  - ProvenanceRecord: lineage and reasoning trace viewers

  ———

  ## 27. Workspace Intelligence Synchronization

  ### Synchronization rules

  - every active session has scoped intelligence selectors
  - background tabs may keep intelligence metadata but not all heavy derived views hot
  - session switch triggers intelligence rebind
  - frozen panel state allowed only if object exists in new context or explicitly global

  ### Session context envelope additions

  Workspace session context should support:

  - selectedInsightIds
  - selectedRiskIds
  - selectedMetricIds
  - selectedTimelineEventIds
  - selectedProvenanceRecordIds

  ———

  ## 28. AI Reasoning Trace Visualization

  ### Purpose

  Expose structured reasoning steps without exposing raw chain-of-thought.

  ### Visual units

  - retrieval stage
  - evidence selection stage
  - extraction stage
  - synthesis stage
  - scoring stage
  - graph-linking stage
  - output generation stage

  ### Data source

  - TaskExecution
  - ProvenanceRecord
  - linked Evidence

  ### UI

  - stage timeline
  - stage cards
  - source bundle per stage
  - confidence input summary

  ———

  ## 29. Metric Extraction Visualization

  ### Components

  - metric card
  - metric detail drawer
  - metric evidence bundle
  - metric source comparison
  - trend interpretation insight block

  ### Rules

  - metrics must always be clickable back to evidence
  - confidence visible when extraction uncertain
  - multi-doc comparisons grouped under same logical metric key where possible

  ———

  ## 30. Intelligence-First Frontend Rules

  1. Intelligence objects are first-class frontend entities.
  2. Intelligence is normalized, not embedded ad hoc inside message payloads.
  3. Evidence and provenance are mandatory links for high-value intelligence.
  4. Realtime updates must enrich objects progressively, not replace whole trees.
  5. Graph, analytics, timeline, and artifact views all consume the same intelligence layer.
  6. Shell remains shell-first; intelligence plugs into shell regions and widgets.
  7. Intelligence selectors own joins and grouping logic.
  8. Intelligence rendering must be bounded and memoizable.
  9. Cross-document intelligence is not a special case; it is a core object pattern.
  10. Future agents and GraphRAG must map to existing task/provenance/intelligence contracts.
  11. Multimodal evidence must extend evidence types, not fork the architecture.
  12. No widget should become the hidden owner of intelligence truth.
  13. Provenance should explain outputs safely, not dump internal model reasoning.
  14. Intelligence objects must survive session restoration when metadata is available.
  15. The frontend must feel like an enterprise intelligence workspace, not a chat transcript with side cards.
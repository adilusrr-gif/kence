  Phase 2 Goal
  Phase 2 вводит state boundaries и store contracts для AI-native shell, не ломая legacy pages. Это не phase “rewrite
  screens”; это phase “introduce system of record”. Главный результат: App перестаёт быть owner runtime state, а stores
  становятся единым источником истины для shell, workspace sessions, domain entities и realtime flows.

  1. Full State Architecture
  State делится на 5 слоёв:

  1. Global Shell State
     Auth, theme, nav shell, active workspace id, rail visibility, UI preferences.
  2. Workspace Session State
     Tabs, active session, session mode, attached assets, panel layout, pinned context.
  3. Domain Entity State
     Documents, messages, comparisons, presentations, artifacts, events.
  4. Realtime / Event State
     Stream connections, task telemetry, event queue, sync health.
  5. Orchestration State
     Active intents, execution graph, context resolution, command lifecycle.

  Rule:

  - shell stores не хранят domain payloads глубоко
  - domain stores не знают layout details
  - orchestration store не становится generic cache
  - realtime store не является persistent event history

  2. Store Boundaries

  - authStore: identity and auth lifecycle only
  - shellStore: shell chrome and global UI preferences only
  - workspaceStore: active workspace metadata and current context envelope
  - sessionTabsStore: tab/session registry and restoration
  - dockStore: dock layout and widget placement
  - commandBarStore: command input and palette state
  - activityRailStore: visible tasks and activity presentation state
  - realtimeStore: transport/session sync state
  - contextPanelStore: right panel mode/follow/freeze and local pinned views
  - orchestrationStore: intent/task orchestration state machine
  - messageStore: normalized chat thread/message state
  - documentStore: normalized documents and document-derived metadata
  - comparisonStore: normalized comparison jobs/results
  - presentationStore: normalized presentation jobs/structures
  - eventStore: normalized frontend event ledger
  - artifactStore: normalized generated/downloadable outputs

  No store should own:

  - both UI layout and domain payload
  - both transport connection and semantic event history
  - both auth token and session tab model

  3. Domain State Model
  Normalized entity families:

  - user
  - workspace
  - session
  - document
  - message
  - thread
  - comparison
  - presentation
  - artifact
  - event
  - task

  Shared normalized shape:

  - byId: Record<string, Entity>
  - allIds: string[]
  - meta
  - queries
  - status

  Domain entity rules:

  - entities keyed by backend ids when available
  - if backend id absent, use frontend-stable synthetic id with namespace prefix
  - store payload and lightweight derived indexes only
  - computed joins go to selectors, not entity records

  4. Shell State Model
  Owned by shellStore.

  Schema:

  - theme
  - leftRail
      - collapsed
      - hoverPreview
  - topBar
      - globalMode
      - activeScopeDisplay
  - rightPanel
      - open
      - width
  - bottomRail
      - expanded
      - height
  - viewport
      - breakpoint
      - isTouch
  - preferences
      - density
      - reducedMotionAcknowledged

  Boundary:

  - shellStore does not store tab data, messages, documents, jobs

  5. Workspace / Session State Model
  Split across workspaceStore and sessionTabsStore.

  workspaceStore schema:

  - activeWorkspaceId
  - activeSessionId
  - workspaceIds
  - workspaceMetaById
  - contextEnvelopeBySessionId
      - mode
      - scope
      - activeAssetIds
      - selectedEntityIds
      - selectedEvidenceIds
      - pinnedContextIds
      - openWidgetIds
      - layoutPreset
      - artifactRefs

  sessionTabsStore schema:

  - tabOrder
  - tabsById
      - id
      - workspaceId
      - sessionId
      - type
      - title
      - dirty
      - restorable
      - lastVisitedAt
  - activeTabId
  - closedTabStack

  Boundary:

  - sessionTabsStore owns tab lifecycle
  - workspaceStore owns semantic session context

  6. Realtime / Event State Model
  Split across realtimeStore, eventStore, activityRailStore.

  realtimeStore schema:

  - transport
      - mode: idle | connecting | connected | degraded | disconnected
      - protocol: none | sse | websocket | polling
  - connectionsByScope
  - lastHeartbeatAt
  - lastEventAt
  - syncLagMs
  - streamBuffersByCorrelationId
  - subscriptions

  eventStore schema:

  - eventsById
  - eventIdsBySessionId
  - eventIdsByCorrelationId
  - latestEventIdByTaskId
  - unreadEventIds
  - eventIngestionStatus

  activityRailStore schema:

  - visibleTaskIds
  - taskOrder
  - filters
  - expandedTaskId
  - dismissedEventIds

  Boundary:

  - realtimeStore knows transport
  - eventStore knows normalized event data
  - activityRailStore knows presentation/filtering

  7. Orchestration State Model
  Owned by orchestrationStore.

  Schema:

  - activeIntent
      - id
      - source: command_bar | canvas | widget
      - type: ask | analyze | compare | generate | explore
      - scope
  - executionById
      - status
      - phase
      - taskIds
      - correlationId
      - startedAt
      - completedAt
      - error
  - currentExecutionId
  - plannerState
  - contextResolutionState
  - resultRoutingState
  - queuedIntents

  Boundary:

  - orchestrationStore never stores full message lists or document payloads
  - it references ids into domain stores

  8. Normalized Entity Architecture
  Folders:

  src/entities/<entity>/model/
  src/shared/stores/
  src/processes/workspace-session/model/

  Normalization rules:

  - one entity type per primary store
  - relation fields store ids, not embedded objects
  - lists are tracked through query indexes
  - task/event/artifact relations are many-to-many via id arrays
  - synthetic query caches stored separately from byId

  Examples:

  - message -> threadId, sessionId, artifactIds
  - document -> workspaceId, sessionIds, status
  - comparison -> sessionId, documentIds, resultArtifactIds
  - presentation -> sessionId, artifactIds

  **9. Store- resetRealtimeScope

  - resetEphemeralUiScope

  20. Memory / Performance Strategy
  Rules:

  - store ids and metadata, not giant payload copies
  - keep stream buffers bounded
  - prune dismissed/old event slices
  - use normalized maps over nested trees
  - avoid giant useStore() subscriptions to full state
  - prefer targeted selectors
  - large blobs and previews should remain outside persistent stores or be truncated

  Suggested limits:

  - event cache per session bounded
  - message streaming buffer bounded by active execution
  - closed tabs retain metadata but not full heavy detail
  - artifact blob URLs tracked separately and revoked on cleanup

  ———

  Store-by-Store Specification

  authStore

  - Responsibilities: auth identity, token lifecycle, login/logout hydration bridge
  - Schema:
      - token
      - userId
      - username
      - role
      - status: anonymous | authenticated | restoring
      - lastAuthAt
  - Actions:
      - hydrateAuth()
      - setAuth(payload)
      - clearAuth()
      - setStatus(status)
  - Selectors:
      - selectIsAuthenticated
      - selectCurrentUser
      - selectCurrentRole
  - Persistence: durable local persistence
  - Ownership boundaries: owns local auth truth only; not profile settings
  - Dependencies: local storage bridge, optional user entity sync
  - Anti-patterns: storing full user profile, storing nav state, redirect logic inside store

  shellStore

  - Responsibilities: global shell chrome state
  - Schema:
      - theme
      - density
      - leftRail
      - rightPanelShell
      - bottomRailShell
      - breakpoint
  - Actions:
      - toggleTheme
      - setDensity
      - setLeftRailCollapsed
      - setRightPanelOpen
      - setBottomRailExpanded
      - setBreakpoint
  - Selectors:
      - selectTheme
      - selectRailState
      - selectShellDensity
  - Persistence: theme/density/rail preferences
  - Boundaries: no domain entities, no workspace session context
  - Dependencies: theme config only
  - Anti-patterns: storing tab state or command input here

  workspaceStore

  - Responsibilities: active workspace/session semantic context
  - Schema:
      - activeWorkspaceId
      - activeSessionId
      - workspaceMetaById
      - contextEnvelopeBySessionId
  - Actions:
      - setActiveWorkspace
      - setActiveSession
      - upsertWorkspaceMeta
      - patchSessionContext
      - pinContextRef
      - unpinContextRef
      - setSessionMode
  - Selectors:
      - selectActiveWorkspaceId
      - selectActiveSessionId
      - selectActiveSessionContext
      - selectPinnedContextRefs
  - Persistence: session context envelopes and active ids
  - Boundaries: owns workspace/session context, not tab ordering
  - Dependencies: sessionTabsStore ids, entity references
  - Anti-patterns: embedding full documents/messages inside context envelope

  sessionTabsStore

  - Responsibilities: open tabs, active tab, closed tab recovery
  - Schema:
      - tabsById
      - tabOrder
      - activeTabId
      - closedTabStack
  - Actions:
      - openTab
      - closeTab
      - restoreClosedTab
      - setActiveTab
      - reorderTabs
      - markTabDirty
      - renameTab
  - Selectors:
      - selectActiveTab
      - selectOpenTabs
      - selectTabsForWorkspace
  - Persistence: durable semi-durable
  - Boundaries: no shell chrome, no domain payload
  - Dependencies: workspace ids, session ids
  - Anti-patterns: storing actual comparison/presentation results in tab objects

  dockStore

  - Responsibilities: dock/widget placement and layout presets
  - Schema:
      - layoutsBySessionId
      - floatingWidgetsBySessionId
      - pinnedWidgetIdsBySessionId
      - activeDockZone
  - Actions:
      - openWidget
      - closeWidget
      - moveWidget
      - pinWidget
      - unpinWidget
      - setLayoutPreset
      - resizeDock
  - Selectors:
      - selectWidgetsForActiveSession
      - selectDockLayout
  - Persistence: per-session layout persistence
  - Boundaries: no widget payload state
  - Dependencies: session ids
  - Anti-patterns: storing evidence data in dock store

  commandBarStore

  - Responsibilities: command bar and palette input state
  - Schema:
      - value
      - mode
      - scope
      - paletteOpen
      - suggestions
      - highlightedSuggestionId
  - Actions:
      - setValue
      - setMode
      - setScope
      - openPalette
      - closePalette
      - setSuggestions
      - clear
  - Selectors:
      - selectCommandDraft
      - selectCommandScope
      - selectPaletteState
  - Persistence: none
  - Boundaries: no execution state
  - Dependencies: shell/workspace context
  - Anti-patterns: storing resolved execution results here

  activityRailStore

  - Responsibilities: presentation of tasks/events in bottom rail
  - Schema:
      - visibleTaskIds
      - filters
      - expandedTaskId
      - dismissedEventIds
      - mode: compact | expanded | debug
  - Actions:
      - setMode
      - setFilters
      - expandTask
      - dismissEvent
      - registerVisibleTask
      - pruneOldTasks
  - Selectors:
      - selectVisibleTasks
      - selectExpandedTask
      - selectFilteredEvents
  - Persistence: minimal UI preference only
  - Boundaries: no transport ownership
  - Dependencies: eventStore and realtimeStore
  - Anti-patterns: becoming event history source of truth

  realtimeStore

  - Responsibilities: realtime transport orchestration and stream health
  - Schema:
      - transportMode
      - connectionState
      - subscriptionsByScope
      - bufferByCorrelationId
      - heartbeat
      - syncHealth
  - Actions:
      - connect
      - disconnect
      - subscribe
      - unsubscribe
      - appendBufferChunk
      - flushBuffer
      - setSyncHealth
  - Selectors:
      - selectConnectionState
      - selectStreamBuffer
      - selectSyncLag
  - Persistence: none
  - Boundaries: not normalized event history
  - Dependencies: auth token, active scope, transport adapter
  - Anti-patterns: persisting raw stream buffers long-term

  contextPanelStore

  - Responsibilities: right panel UI mode and follow behavior
  - Schema:
      - activeTab
      - followSelection
      - frozenEntityId
      - frozenEvidenceId
      - panelWidth
      - pinnedSectionIds
  - Actions:
      - setActiveTab
      - setFollowSelection
      - freezeOnEntity
      - freezeOnEvidence
      - clearFreeze
      - resizePanel
  - Selectors:
      - selectContextPanelMode
      - selectFollowSelection
      - selectFrozenTarget
  - Persistence: panel preferences and active tab optional
  - Boundaries: no entity payload ownership
  - Dependencies: workspace context ids
  - Anti-patterns: storing full selected entity data copy

  orchestrationStore

  - Responsibilities: intent/task execution graph
  - Schema:
      - activeIntent
      - queuedIntents
      - executionById
      - currentExecutionId
      - plannerState
      - routingState
  - Actions:
      - startIntent
      - queueIntent
      - advanceExecutionPhase
      - completeExecution
      - failExecution
      - attachTaskToExecution
  - Selectors:
      - selectCurrentExecution
      - selectExecutionPhase
      - selectQueuedIntents
  - Persistence: none
  - Boundaries: orchestration metadata only
  - Dependencies: workspaceStore, commandBarStore, realtimeStore, eventStore
  - Anti-patterns: becoming message/document cache

  messageStore

  - Responsibilities: normalized threads/messages for chat workspace
  - Schema:
      - threadsById
      - messagesById
      - messageIdsByThreadId
      - activeThreadIdBySessionId
      - streamingMessageIdByExecutionId
      - queryStatusByThreadId
  - Actions:
      - upsertThread
      - appendMessage
      - patchStreamingMessage
      - finalizeStreamingMessage
      - setActiveThreadForSession
      - markMessageError
  - Selectors:
      - selectMessagesForThread
      - selectActiveThreadForSession
      - selectStreamingMessage
  - Persistence: metadata only optional; full message cache preferably ephemeral initially
  - Boundaries: only messaging domain
  - Dependencies: session ids, artifact refs
  - Anti-patterns: storing command bar draft here

  documentStore

  - Responsibilities: normalized documents and ingest metadata
  - Schema:
      - documentsById
      - documentIdsByWorkspaceId
      - documentIdsBySessionId
      - uploadStatusBySessionId
      - previewByDocumentId
  - Actions:
      - upsertDocument
      - attachDocumentToSession
      - setUploadStatus
      - setDocumentPreview
      - markDocumentReady
  - Selectors:
      - selectDocumentsForWorkspace
      - selectDocumentsForSession
      - selectPrimaryDocumentForSession
  - Persistence: metadata yes, preview truncated only if lightweight
  - Boundaries: no chat threads, no compare results
  - Dependencies: workspace/session ids
  - Anti-patterns: storing full binary content in store

  comparisonStore

  - Responsibilities: comparison jobs and results
  - Schema:
      - comparisonsById
      - comparisonIdsBySessionId
      - activeComparisonIdBySessionId
      - jobStatusByComparisonId
  - Actions:
      - createComparisonJob
      - setComparisonStatus
      - setComparisonResult
      - setActiveComparison
      - attachDocuments
  - Selectors:
      - selectActiveComparisonForSession
      - selectComparisonStatus
      - selectExactDiffResult
  - Persistence: metadata and result references; large exact diff cautiously
  - Boundaries: no dock state, no presentation artifacts except refs
  - Dependencies: document ids, artifact ids, session ids
  - Anti-patterns: duplicating same diff payload in tab state

  presentationStore

  - Responsibilities: presentation generation jobs and generated structure
  - Schema:
      - presentationsById
      - presentationIdsBySessionId
      - activePresentationIdBySessionId
      - generationStatusById
  - Actions:
      - createPresentationJob
      - setGenerationStatus
      - setPresentationStructure
      - setActivePresentation
  - Selectors:
      - selectActivePresentationForSession
      - selectSlidesForPresentation
      - selectPresentationGenerationStatus
  - Persistence: metadata and structure yes, export blobs no
  - Boundaries: no actual download blob caching
  - Dependencies: session ids, artifact ids
  - Anti-patterns: storing slide UI selection state here if it’s local-only

  eventStore

  - Responsibilities: normalized semantic event ledger
  - Schema:
      - eventsById
      - eventIdsBySessionId
      - eventIdsByCorrelationId
      - eventIdsByTaskId
      - unreadIds
  - Actions:
      - ingestEvent
      - ingestEvents
      - markRead
      - pruneEvents
      - linkEventToTask
  - Selectors:
      - selectEventsForSession
      - selectEventsForCorrelation
      - selectUnreadEventCount
  - Persistence: bounded short-term cache only
  - Boundaries: not transport state, not task presentation state
  - Dependencies: correlation/task/session ids
  - Anti-patterns: keeping unbounded event history in memory

  artifactStore

  - Responsibilities: generated/downloadable outputs metadata
  - Schema:
      - artifactsById
      - artifactIdsBySessionId
      - artifactIdsBySourceEntity
      - downloadStatusByArtifactId
  - Actions:
      - upsertArtifact
      - attachArtifactToSession
      - setArtifactStatus
      - setDownloadStatus
  - Selectors:
      - selectArtifactsForSession
      - selectArtifactsByType
      - selectLatestArtifactForSource
  - Persistence: metadata yes, blob no
  - Boundaries: no presentation/document raw content duplication
  - Dependencies: session ids, source refs
  - Anti-patterns: storing object URLs forever

  ———

  Naming Conventions

  - Store hook: useAuthStore, useWorkspaceStore
  - Raw selector: selectActiveSessionId
  - Composed selector: selectCurrentExecutionSummary
  - Action creator in process layer: runChatIntent, restoreWorkspaceSession
  - Store slice field names: camelCase
  - Entity ids: stable string ids with prefixes if synthetic, e.g. tmp-msg-*, task-*

  Event Naming Strategy
  Frontend semantic events should mirror backend domain names where possible.

  Format:

  - uppercase snake case for semantic event type
  - examples:
      - DOCUMENT_UPLOAD_REQUESTED
      - DOCUMENT_READY
      - CHAT_STREAM_STARTED
      - CHAT_STREAM_TOKEN
      - CHAT_STREAM_COMPLETED
      - COMPARISON_COMPLETED
      - PRESENTATION_GENERATION_FAILED

  Rules:

  - UI-local synthetic events should use same style but may prefix internal namespace if needed:
      - UI_CONTEXT_PINNED
      - UI_TAB_RESTORED

  State Normalization Rules

  - all primary domain collections normalized by id
  - relation arrays store ids only
  - query/index state separate from entity maps
  - no repeated denormalized copies in multiple stores
  - all cross-entity joins done in selectors

  Cross-Store Communication Rules

  - UI -> feature/process action -> one or more store actions
  - realtime adapter -> normalize -> eventStore/domain store actions
  - orchestrationStore may coordinate, but not own domain payload
  - store-to-store direct reads allowed for ids/context only, not as hidden mutation pipelines
  - reset flows orchestrated centrally on logout/session-close

  Enterprise-Grade Frontend State Rules

  1. One store owns one concern.
  2. One field has one source of truth.
  3. Domain payloads are normalized.
  4. UI state and business state are separated.
  5. Async effects live outside components and outside most store definitions.
  6. Selectors shape read models; stores hold raw truth.
  7. Realtime transport and semantic events are different layers.
  8. Persistence is selective, bounded, and schema-tolerant.
  9. Legacy pages may read from stores before they stop owning local state.
  10. No store should become a second backend.
  11. Every long-running action must map to task/execution/event ids.
  12. Every session-scoped state must be cleanly resettable.
  13. Incremental migration beats “replace App in one step”.
  14. Shell state must stay fast even when domain payloads grow.
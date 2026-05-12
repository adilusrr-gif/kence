Workspace Shell Vision
  KENCE.ai Workspace Shell is the persistent operating layer of the product: not a page wrapper, but an AI-native
  control surface for enterprise knowledge work. Its job is to keep context, coordinate AI tools, expose system
  intelligence, and let users move between documents, analysis modes, agents, dashboards, graph views, and outputs
  without losing state.

  It should feel like a neural workstation:

  - persistent
  - spatial
  - context-aware
  - event-driven
  - multimodal
  - orchestration-first

  1. Global Layout Architecture
  Primary shell is a 5-region operating frame plus dock system:

  1. Left Rail
     Navigation, workspace switching, tool/module entry, global objects.
  2. Top Command Bar
     Global search, command palette, workspace status, AI mode, active context.
  3. Main Canvas
     Primary working surface for chat, documents, compare, graph, dashboards, generation studios.
  4. Right Intelligence Panel
     Context, evidence, entities, memory, suggestions, provenance, task outputs.
  5. Bottom Activity Rail
     Jobs, events, streams, agent activity, ingestion status, notifications, logs.

  This shell is persistent across all authenticated product areas except isolated auth flows.

  Layout model:

  - outer AppShell
  - inner WorkspaceShell
  - canvas-driven route content
  - dockable secondary panels
  - persistent panel state per workspace session

  2. Left Rail System
  Purpose: global orientation and fast mode switching.

  Zones:

  - Brand/System Anchor
  - Workspace Switcher
  - Primary Modules
  - Knowledge Objects
  - Pinned Assets
  - Utility Controls

  Primary modules:

  - Home / Dashboard
  - Workspace
  - Documents
  - Compare
  - Presentations
  - Analytics
  - Graph
  - Agents
  - Admin

  Knowledge objects:

  - recent sessions
  - pinned documents
  - collections
  - saved searches
  - dashboards
  - graph views

  Behavior:

  - icon-first compact mode
  - expanded semantic mode
  - hover preview for collapsed rail
  - unread/activity badges
  - drag pinning for important objects
  - context-aware ordering based on active workspace

  State boundary:

  - global navigation state
  - user pinning preferences
  - workspace-specific recent objects

  3. Top Command Bar
  Purpose: command center, not browser header.

  Subregions:

  - Workspace Breadcrumb + Mode
  - Global Semantic Search
  - Command Palette Trigger
  - AI Orchestration Controls
  - Context Scope Indicator
  - Live Status Cluster

  Capabilities:

  - semantic/global search across documents, sessions, graph, dashboards
  - slash-command style actions
  - quick mode switch: Ask, Analyze, Compare, Generate, Explore Graph
  - scope toggles: current doc / current workspace / organization / saved collection
  - active model/engine visibility
  - realtime status: indexing, retrieval, agent activity, stream health

  Interaction flow:

  - user enters intent in command bar
  - shell resolves scope
  - orchestration layer routes task to canvas and side panels
  - all dependent regions update from shared workspace event bus

  State boundary:

  - transient input
  - current intent mode
  - current scope
  - active orchestration state summary

  4. Main Canvas
  Purpose: the primary cognitive work area.

  Canvas is mode-based, not page-based. It hosts interchangeable workspaces:

  - Conversation Workspace
  - Document Review Workspace
  - Comparison Workspace
  - Presentation Studio
  - Analytics Studio
  - Knowledge Graph Explorer
  - Multimodal Review Workspace

  Canvas principles:

  - one primary task at a time
  - multiple subpanes allowed inside mode
  - preserve session continuity
  - deep-linkable internal views
  - supports tabbed workspace stacks

  Canvas composition examples:

  - Chat mode: thread + citations + inline artifacts
  - Document mode: document viewer + extracted structure + AI notes
  - Compare mode: split viewer + semantic diff + exact diff + summary cards
  - Graph mode: node canvas + evidence drawer + relationship inspector

  State boundary:

  - mode-local UI state
  - layout composition within active workspace
  - current selection and view parameters

  5. Right Intelligence / Context Panel
  Purpose: make AI reasoning inspectable and actionable.

  Subpanels:

  - Context
  - Evidence
  - Entities
  - Memory
  - Suggestions
  - Outputs
  - Provenance

  Responsibilities:

  - show what context AI is using
  - expose retrieved chunks and sources
  - display extracted entities, links, risks, metrics
  - surface related sessions/documents
  - show draft outputs: tables, summaries, slides, action items
  - allow pin/unpin into working memory

  Behavior:

  - tabbed or stacked
  - reacts to current canvas selection
  - can be locked to follow current focus or frozen
  - supports compare mode with dual-context view

  State boundary:

  - derived intelligence state
  - user-pinned memory objects
  - right-panel pin/follow mode

  6. Bottom Activity Rail
  Purpose: operational nervous system.

  Shows:

  - ingestion jobs
  - streaming chat phases
  - translation/export jobs
  - compare jobs
  - presentation generation
  - graph enrichment
  - agent executions
  - system events and warnings

  Modes:

  - compact ticker
  - expanded timeline
  - debug stream view

  Responsibilities:

  - communicate “what AI/system is doing now”
  - provide background job continuity
  - expose retries/errors without modal interruption
  - support drill-down into task logs

  State boundary:

  - event stream cache
  - task lifecycle state
  - notification dismissal state

  7. Dockable Widgets System
  Widgets are modular secondary tools, not primary pages.

  Examples:

  - task queue
  - entity inspector
  - graph mini-map
  - source evidence tray
  - KPI cards
  - semantic search results
  - notebook
  - prompt scratchpad
  - citations browser
  - model diagnostics

  Dock zones:

  - right dock
  - bottom dock
  - floating overlay
  - canvas split
  - secondary monitor future support

  Widget rules:

  - widgets subscribe to workspace context
  - widgets can be pinned per session
  - widgets can be global or mode-specific
  - widgets must degrade gracefully on smaller screens

  State boundary:

  - widget layout preferences
  - widget local ephemeral state
  - widget subscription scope

  8. Workspace Tabs / Sessions
  KENCE.ai should use workspace sessions, not simple page navigation.

  Session model:

  - each tab = a persistent analytical context
  - tab may contain one or more attached assets
  - tab stores active mode, scope, panel layout, selections, AI thread, pinned memory

  Tab types:

  - document session
  - comparison session
  - analytics session
  - graph exploration session
  - multimodal investigation session
  - dashboard session

  Behaviors:

  - create from search result/document/action
  - duplicate session
  - branch session
  - save snapshot
  - restore previous workspace state
  - show unsaved/generated artifacts state

  State boundary:

  - session container state
  - session-local derived intelligence
  - tab metadata and restoration payload

  9. AI Assistant Orchestration Layer
  This is the core shell intelligence layer.

  Responsibilities:

  - resolve user intent
  - bind intent to scope
  - choose correct tool/workspace surface
  - sequence AI operations
  - route outputs to panels/widgets
  - maintain context continuity
  - manage background tasks and streams

  Logical layers:

  - Intent Layer
  - Context Resolver
  - Task Planner
  - Execution Router
  - Event Publisher
  - Result Distributor

  Example flow:

  1. user asks a question in command bar or canvas
  2. intent classified: ask/analyze/compare/generate
  3. context resolver gathers active session, pinned memory, selected assets
  4. planner decides needed operations
  5. execution router triggers proper backend workflow
  6. event bus updates bottom rail
  7. results distributed to canvas, right panel, widgets

  State boundary:

  - orchestrator state machine
  - active intent execution
  - dependency graph of current task
  - event references to backend tasks

  10. Realtime Event Visualization
  Realtime is a first-class UX layer.

  Visual forms:

  - bottom task rail
  - live status chips in top bar
  - inline streaming blocks in canvas
  - right-panel evidence updates
  - event pulse markers in graph/dashboard views

  Event classes:

  - ingestion
  - retrieval
  - reasoning
  - generation
  - export
  - graph enrichment
  - agent steps
  - warnings/errors
  - user collaboration future

  Visualization rules:

  - show stage, not noise
  - distinguish background vs blocking tasks
  - preserve chronology
  - allow drill-down into execution chain
  - support replay of important runs

  11. Context Persistence Model
  Persistence is essential for “operating system” feel.

  Persistence layers:

  - Global User Preferences
  - Workspace Session State
  - Panel Layout State
  - Pinned Memory / Context Objects
  - Recent Activity / Open Tabs
  - Draft Outputs

  Context object model should include:

  - workspace_id
  - session_id
  - mode
  - active_assets
  - selected_entity_ids
  - selected_evidence_ids
  - active_filters
  - pinned_context
  - open_widgets
  - layout_config
  - conversation_thread_ref
  - generated_artifact_refs

  Persistence split:

  - durable: session/workspace metadata
  - semi-durable: open tabs/layout
  - ephemeral: hover state, temporary selection, transient streams

  12. Panel Communication Architecture
  Communication must be event-driven, not prop-chained.

  Recommended conceptual model:

  - shell-level workspace store
  - domain stores per entity/process
  - event bus for cross-region updates
  - selectors per panel/widget
  - command dispatchers for user actions

  Communication directions:

  - command bar -> orchestrator -> canvas/panels
  - canvas selection -> right panel + bottom rail
  - right panel pin action -> context store + canvas hints
  - event stream -> bottom rail + status chips + widgets
  - tab switch -> all regions rebind to active session

  Principles:

  - no panel owns global truth
  - panels consume normalized state
  - orchestration emits domain events
  - layout state separate from business state

  13. Multimodal Workspace Zones
  Main canvas must support different intelligence surfaces.

  Zones:

  - Text Zone
  - Document Zone
  - Visual Zone
  - Table/Data Zone
  - Graph Zone
  - Output Zone

  Usage:

  - document analysis: text + document + output
  - image/chart analysis: visual + evidence + output
  - compare: dual document + diff output
  - graph exploration: graph + entity detail + evidence
  - analytics: KPI/data + AI insight + source trace

  This enables multimodal AI without redesigning shell each time.

  14. Dashboard Integration
  Dashboard is a specialized workspace, not a separate design language.

  Dashboard should live inside same shell and reuse:

  - left rail
  - top command bar
  - right intelligence panel
  - bottom activity rail

  Dashboard contents:

  - recent workspaces
  - active jobs
  - intelligence summaries
  - document ingestion status
  - saved insights
  - risk/metric cards
  - pinned dashboards
  - graph highlights

  Role:

  - operational landing surface
  - macro-to-micro transition point
  - not a static reporting board

  15. Knowledge Graph Integration
  Graph is a core shell mode, not an add-on panel.

  Integration points:

  - left rail entry to graph views
  - top bar graph search and scope filters
  - canvas graph exploration
  - right panel entity/relationship inspector
  - bottom rail graph enrichment jobs

  Graph interactions:

  - open entity from chat answer
  - inspect relationships from document evidence
  - pivot from graph node to source documents
  - save graph workspace as session/tab
  - overlay graph signals into analytics and compare

  Graph should behave like an alternate cognition surface for the same workspace context.

  16. Responsive / Adaptive Behavior
  Desktop-first, but not desktop-only.

  Desktop wide:

  - full 5-region shell
  - docked widgets
  - persistent right panel
  - visible bottom rail

  Laptop:

  - narrower left rail
  - right panel collapsible
  - bottom rail compact by default
  - canvas-first priority

  Tablet:

  - left rail collapses to overlay
  - right panel becomes slide-over
  - bottom rail becomes task drawer
  - one primary canvas at a time

  Mobile:

  - limited operational mode
  - session list, status, quick ask, review outputs
  - no full multi-dock layout
  - focus on monitoring and lightweight interaction

  Adaptive rule:

  - preserve context over layout fidelity
  - never lose session continuity when regions collapse

  17. Future Scalability
  For agents

  - dedicated agent workspace mode
  - multi-agent run timeline in bottom rail
  - agent roster widget
  - agent-to-artifact traceability
  - background autonomous tasks with resumable sessions

  For analytics

  - dashboard widgets become reusable analytical blocks
  - canvases support chart + narrative + provenance triads
  - KPI entities and insight cards plug into same right panel model

  For GraphRAG

  - context resolver can include graph neighborhoods
  - right panel adds path evidence and relationship confidence
  - graph-specific retrieval stages visualized in activity rail

  For multimodal AI

  - multimodal zones already isolate visual/document/data surfaces
  - orchestrator supports modality-aware routing
  - evidence panel supports image regions, table cells, slide fragments

  For realtime streams

  - shell event bus supports long-running task telemetry
  - bottom rail is already stream-native
  - top bar exposes live health and active flow indicators
  - widgets can subscribe to live channels independently

  UI Regions Summary

  - Left Rail: orientation, workspace/module switching
  - Top Command Bar: search, commands, scope, orchestration controls
  - Main Canvas: primary analytical work surface
  - Dock Layer: optional modular utilities

  Interaction Flow Summary

  1. User opens or creates workspace session.
  2. Shell restores layout, assets, pinned memory, active mode.
  3. User issues intent via command bar or canvas.
  4. Orchestration layer resolves context and dispatches task.
  5. Main canvas renders primary interaction.
  6. Right panel exposes evidence, entities, suggestions, outputs.
  7. Bottom rail visualizes execution lifecycle.
  8. User branches, saves, pins, or pivots to graph/dashboard/compare.
  9. Session remains persistent across mode changes.

  State Boundaries

  - Global Shell State
    Auth, theme, navigation, open workspaces, user preferences.
  - Workspace Session State
    Current mode, attached assets, layout, pinned memory, active thread.
  - Domain State
    Documents, chat threads, compare results, presentations, entities, graph data.
  - Orchestration State
    Current intents, task plans, running jobs, event stream bindings.
  - UI Ephemeral State
    open drawers, hover, temporary selections, draft input.

  Architectural Outcome
  If implemented correctly, the shell will stop feeling like a collection of pages and start feeling like an enterprise
  intelligence runtime:

  - context persists
  - AI activity is visible
  - modes are composable
  - graph, analytics, documents, and chat coexist
  - sessions behave like working memory
  - UI surfaces expose reasoning, not just responses

  This is the correct frontend foundation for KENCE.ai as an AI operating system.
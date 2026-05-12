Implementation Principles
  Порядок должен быть shell-first, state-first, then workspace rewrites. После каждой фазы приложение должно оставаться
  рабочим через coexistence старых pages/* и новых app/workspace/*. Backend и API contracts не меняются; migration идёт
  через адаптеры, feature flags и route-by-route replacement.

  Target Frontend Structure

  src/
    app/
      providers/
      router/
      layouts/
      shell/
      styles/
    processes/
      workspace-session/
      command-execution/
      realtime-streams/
    pages/
      dashboard/
      workspace/
      compare/
      presentation/
      profile/
      admin/
      auth/
    widgets/
      left-rail/
      top-command-bar/
      right-intelligence-panel/
      bottom-activity-rail/
      workspace-tabs/
      dashboard-overview/
      chat-workspace/
      comparison-workspace/
      presentation-studio/
      dock-system/
    entities/
      user/
      workspace/
      session/
      document/
      message/
      event/
      artifact/
      comparison/
      presentation/
      graph/
    features/
      auth/
      theme/
      command-palette/
      semantic-search/
      context-pinning/
      widget-docking/
      panel-resizing/
    shared/
      ui/
      lib/
      api/
      config/
      hooks/
      stores/
      styles/
      types/

  Phase 0. Foundation Audit And Guardrails
  Цель: зафиксировать migration envelope и убрать риск “big bang”.

  - Папки: src/app, src/shared, src/entities, src/widgets, src/features, src/processes
  - Компоненты: только технические entry wrappers AuthenticatedApp, LegacyPageBridge
  - Stores: appStore, authStore, themeStore interfaces only
  - Layouts: AuthLayout, LegacyAppLayout facade
  - Shared UI: tokens inventory, spacing scale, surface taxonomy
  - Переиспользовать: текущий App.jsx, LoginPage, CSS tokens, card.jsx
  - Переписать: ничего функционального
  - Dependencies: none
  - Риски: отсутствие zustand в package.json, CSS collisions
  - Safe migration: новые папки создаются параллельно, маршруты не меняются

  Phase 1. Shared UI System And Design Tokens
  Цель: вынести foundation из монолитного index.css и создать reusable shell primitives.

  - Папки: shared/ui, shared/styles, shared/lib/classnames
  - Компоненты: Button, IconButton, Surface, Panel, Input, Textarea, Badge, Tabs, Tooltip, ScrollArea, StatusPill,
    EmptyState, Loader, ResizableHandle
  - Stores: нет, кроме optional themeStore
  - Layouts: нет
  - Widgets: нет
  - Entities: нет
  - Shared UI primitives нужны: shell surfaces, rails, command input, pills, task rows, dock tabs
  - Переиспользовать: card.jsx, utils.js, часть CSS tokens
  - Переписать: index.css разделить концептуально на tokens.css, base.css, legacy.css, shell.css
  - Dependencies: после Phase 0
  - Риски: legacy classes могут конфликтовать с новыми primitives
  - Safe migration: legacy pages продолжают использовать старые классы; новые primitives подключаются только в новых
    модулях

  Phase 2. Zustand Store Architecture
  Цель: ввести state boundaries, убрать prop drilling из App.

  - Папки: shared/stores, entities/*/model, processes/workspace-session/model
  - Stores:
      - authStore
      - themeStore
      - shellStore
      - workspaceStore
      - sessionTabsStore
      - dockStore
      - commandBarStore
      - activityRailStore
      - realtimeStore
      - contextPanelStore
  - Entities model slices:
      - userStore
      - documentStore
      - messageStore
      - comparisonStore
      - presentationStore
      - eventStore
  - Layouts: none yet
  - Переиспользовать: getStoredUser, saveAuth, clearAuth
  - Переписать: state ownership из App.jsx
  - Dependencies: Phase 1
  - Риски: duplicated truth between props and stores
  - Safe migration: сначала stores read-through only; legacy pages получают и props, и selectors, затем props постепенно
    убираются

  Phase 3. App Shell Implementation
  Цель: заменить текущий App.jsx на thin shell orchestration root.

  - Папки: app/shell, app/layouts, app/router
  - Layouts:
      - AppShellLayout
      - AuthLayout
      - LegacyWorkspaceFallbackLayout
  - Компоненты:
      - ShellFrame
      - ShellViewport
      - ShellStatusProvider
      - RouteGuard
  - Widgets:
      - LeftRail
      - TopCommandBar
      - RightPanelContainer
      - BottomActivityRail
      - WorkspaceTabsBar
  - Shared UI primitives: RailSection, CommandField, DockToggle, SessionChip
  - Переиспользовать: auth logic, theme toggle behavior, sidebar concepts
  - Переписать: current App.jsx navigation, user badge, session badge
  - Dependencies: Phase 2
  - Риски: routing regressions, auth redirect coupling in api.js
  - Safe migration: shell wraps old pages/* inside MainCanvasLegacyOutlet; existing routes remain valid

  Phase 4. Workspace Layout Implementation
  Цель: внедрить persistent WorkspaceShellLayout поверх authenticated routes.

  - Папки: app/layouts/workspace, widgets/workspace-tabs, widgets/right-intelligence-panel, widgets/bottom-activity-rail
  - Layouts:
      - WorkspaceShellLayout
      - StudioLayout
      - DashboardLayout
  - Компоненты:
      - WorkspaceCanvas
      - ContextPanelTabs
      - ActivityTicker
      - WorkspaceTabStrip
  - Stores:
      - workspaceStore
      - contextPanelStore
      - sessionTabsStore
  - Widgets:
      - RecentSessionsWidget
      - PinnedAssetsWidget
      - ContextSummaryWidget
      - TaskTimelineWidget
  - Entities:
      - workspace
      - session
      - artifact
  - Переиспользовать: current page-level content as temporary canvas bodies
  - Переписать: none of domain pages fully yet
  - Dependencies: Phase 3
  - Риски: shell too heavy before data bindings mature
  - Safe migration: each legacy page mounts inside new canvas without internal rewrite

  Phase 5. Event-Driven Frontend Layer And Realtime Transport
  Цель: построить UI event bus и transport abstraction для SSE/WebSocket.

  - Папки: processes/realtime-streams, entities/event, shared/api/transport
  - Компоненты: RealtimeProvider, EventStreamIndicator, TaskLifecycleBadge
  - Stores:
      - eventStore
      - realtimeStore
      - activityRailStore
  - Entities:
      - event
      - task
      - stream
  - Shared primitives: timeline row, event chip, phase badge, status pulse
  - Переиспользовать: current chat streaming parser concept, EVENT_SYSTEM.md
  - Переписать: ad hoc streaming logic in ChatPage
  - Dependencies: Phase 4
  - Риски: backend may only partially support structured streams
  - Safe migration: phase starts with frontend-local event normalization over current responses; true SSE/WebSocket
    support is adapter-based, fallback to polling/manual state transitions

  Phase 6. Command Bar Architecture And AI Orchestration Layer
  Цель: превратить shell в command-driven interface.

  - Папки: widgets/top-command-bar, processes/command-execution, features/command-palette, features/semantic-search
  - Компоненты:
      - TopCommandBar
      - CommandPalette
      - ScopeSwitcher
      - IntentModeSwitcher
      - LiveStatusCluster
  - Stores:
      - commandBarStore
      - orchestrationStore
  - Orchestration frontend layer:
      - intentResolver
      - contextResolver
      - taskPlanner
      - executionRouter
      - resultDistributor
  - Entities:
      - intent
      - context-scope
      - execution-task
  - Переиспользовать: current chat actions translate, convert, presentation
  - Переписать: page-local action buttons into command actions
  - Dependencies: Phase 5
  - Риски: trying to make orchestration “smart” too early
  - Safe migration: commands first trigger existing routes/actions; only later they open native workspaces

  Phase 7. Widget System And Docking/Panel System
  Цель: добавить secondary modular surfaces без поломки canvas.

  - Папки: widgets/dock-system, features/widget-docking, features/panel-resizing
  - Компоненты:
      - DockHost
      - DockPanel
      - DockTabs
      - FloatingWidget
      - SplitPane
      - PanelResizer
  - Stores:
      - dockStore
      - layoutPresetStore
  - Widgets:
      - EntityInspectorWidget
      - EvidenceTrayWidget
      - PromptScratchpadWidget
      - SearchResultsWidget
      - ModelDiagnosticsWidget
  - Shared primitives: splitter, drawer, widget header, widget tab, pin/freeze actions
  - Переиспользовать: right panel sections as first widgets
  - Переписать: none of domain canvases yet
  - Dependencies: Phase 6
  - Риски: overbuilding layout engine before real workloads
  - Safe migration: start with fixed right/bottom docks, floating mode later; no free-form desktop manager in first pass

  Phase 8. Dashboard Implementation
  Цель: получить первый full-shell native screen.

  - Папки: pages/dashboard, widgets/dashboard-overview, entities/insight, entities/metric
  - Компоненты:
      - DashboardPage
      - RecentWorkspacesCard
      - ActiveJobsCard
      - IntelligenceSummaryCard
      - PinnedArtifactsCard
      - GraphHighlightsCard
  - Stores:
      - dashboardStore
      - selectors from workspaceStore, eventStore
  - Layouts: DashboardLayout
  - Widgets: dashboard cards should already conform to dock/widget contracts
  - Переиспользовать: landing page product language, stats blocks
  - Переписать: LandingPage role changes from “hero page” to “marketing/home fallback”; dashboard becomes authenticated
    home
  - Dependencies: Phase 7
  - Риски: dashboard may become admin-style if too KPI-heavy
  - Safe migration: / can temporarily map by auth state: unauthenticated -> login, authenticated -> dashboard while
    legacy pages still exist

  Phase 9. Chat Workspace Rewrite
  Цель: превратить чат в основной AI workspace canvas.

  - Папки: widgets/chat-workspace, entities/message, entities/document, features/context-pinning
  - Компоненты:
      - ChatWorkspaceCanvas
      - ThreadPane
      - ComposerBar
      - InlineArtifactCard
      - CitationsStrip
      - DocumentContextPanel
      - SuggestedActionsPanel
  - Stores:
      - messageStore
      - documentStore
      - composerStore
      - contextSelectionStore
  - Layouts: WorkspaceLayout with chat preset
  - Widgets:
      - EvidenceWidget
      - EntityInspectorWidget
      - PinnedContextWidget
  - Переиспользовать: streaming UX, copy action, translate/export actions, document info panel concepts
  - Переписать: [ChatPage.jsx] полностью как workspace mode
  - Dependencies: Phase 8
  - Риски: stream-state, session continuity, source evidence sync
  - Safe migration: old /chat stays behind LegacyChatPage; new route mounts under /workspace/chat first, then promoted

  Phase 10. Comparison Workspace Rewrite
  Цель: перевести compare из page-demo в shell-native analytical studio.

  - Папки: widgets/comparison-workspace, entities/comparison
  - Компоненты:
      - ComparisonCanvas
      - CompareUploadStage
      - ModeSelector
      - SemanticSummaryPanel
      - TechnicalDiffTable
      - ExactDiffViewer
      - DualContextInspector
  - Stores:
      - comparisonStore
      - comparisonSessionStore
  - Widgets:
      - SourceAlignmentWidget
      - DiffMetricsWidget
      - EntityDeltaWidget
  - Переиспользовать: exact diff viewer logic, compare API calls
  - Переписать: ComparisonPage.jsx decomposition and session model
  - Dependencies: Phase 9
  - Риски: compare session currently isolated from app session model
  - Safe migration: keep legacy /compare; native comparison launches as separate workspace tab type

  Phase 11. Presentation Studio Rewrite
  Цель: превратить presentation flow в generation studio with artifacts lifecycle.

  - Папки: widgets/presentation-studio, entities/presentation
  - Компоненты:
      - PresentationStudioCanvas
      - SlideOutlineRail
      - SlidePreviewPane
      - GenerationStatusPanel
      - ArtifactExportPanel
  - Stores:
      - presentationStore
      - artifactStore
  - Widgets:
      - SlideNotesWidget
      - PresentationMetadataWidget
  - Переиспользовать: slide preview/detail logic, generate/download APIs
  - Переписать: PresentationPage.jsx
  - Dependencies: Phase 10
  - Риски: user may expect live edit but backend only returns generated structure
  - Safe migration: first version remains review-and-export studio, not editor

  Phase 12. Legacy Page Retirement And Route Convergence
  Цель: завершить migration without dead branches.

  - Папки: cleanup only after parity
  - Replace:
      - UploadPage -> workspace ingestion flow
      - ConvertPage -> command/action + artifact export widget
      - ProfilePage -> settings panel/page
      - AdminPage -> admin module inside shell
  - Stores: consolidate duplicate session/document state
  - Переиспользовать: auth/admin domain calls
  - Переписать: App.jsx, most legacy route glue, large parts of index.css
  - Dependencies: after native dashboard/chat/compare/presentation are stable
  - Риски: hidden regressions in rarely used routes
  - Safe migration: remove legacy pages only after route analytics and manual QA checklists pass

  Implementation Order By Requested Areas

  1. App shell implementation: Phases 3-4
  2. Workspace layout implementation: Phase 4
  3. Zustand store architecture: Phase 2
  4. Shared UI system: Phase 1
  5. Widget system: Phase 7
  6. Docking/panel system: Phase 7
  7. Event-driven frontend layer: Phase 5
  8. Realtime SSE/WebSocket layer: Phase 5
  9. Command bar architecture: Phase 6
  10. AI orchestration frontend layer: Phase 6
  11. Dashboard implementation: Phase 8
  12. Chat workspace rewrite: Phase 9
  13. Comparison workspace rewrite: Phase 10
  14. Presentation studio rewrite: Phase 11

  Cross-Phase Dependencies

  - Shared UI before shell, or shell becomes another monolith.
  - Stores before workspace rewrites, or state fragmentation remains.
  - Shell before dashboard/chat rewrites, or each rewrite invents its own layout.
  - Event layer before orchestration polish, or activity rail becomes fake.
  - Dashboard before chat rewrite is useful because it validates shell without hardest domain rewrite first.

  Major Risks

  - api.js currently mixes transport, auth side effects, and domain methods.
  - Current CSS is too global; class leakage can slow migration.
  - Streaming chat currently bypasses shared API layer.
  - sessionId semantics differ between upload/chat and compare.
  - zustand appears present in lock/node_modules context but should be explicitly normalized as dependency before
    implementation.

  Enterprise Safe Migration Strategy

  - Keep legacy pages running inside new shell first.
  - Introduce new stores as parallel read models before they become write owners.
  - Use adapter layer over current API contracts; never let new widgets call backend directly.
  - Migrate one workspace at a time: dashboard -> chat -> compare -> presentation.
  - Treat right panel and activity rail as shell contracts consumed by all future workspaces.
  - Do not build free-form docking or multi-agent UI before fixed shell regions prove stable.
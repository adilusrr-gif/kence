Phase 3 Goal
  Phase 3 вводит реальный shell runtime для KENCE.ai: persistent frame, workspace routing, shell hydration, session
  restoration, legacy coexistence, shell-first rendering model. Это не полная domain rewrite. Legacy pages должны
  продолжать работать, но уже внутри нового shell.

  ———

  ## 1. Full Shell Folder Structure

  src/
    app/
      shell/
        frame/
          ShellFrame.jsx
          ShellFrame.types.js
          index.js
        viewport/
          ShellViewport.jsx
          ShellViewport.types.js
          index.js
        hydration/
          ShellHydrator.jsx
          shellHydrationFlow.js
          shellRestorationFlow.js
          index.js
        boundaries/
          ShellErrorBoundary.jsx
          ShellSuspenseBoundary.jsx
          ShellRouteErrorBoundary.jsx
          index.js
        orchestration/
          shellEventBridge.js
          shellResizeController.js
          shellContextBinder.js
          shellModeResolver.js
          index.js
      layouts/
        app-shell/
          AppShellLayout.jsx
          index.js
        workspace-shell/
          WorkspaceShellLayout.jsx
          index.js
        legacy-workspace-fallback/
          LegacyWorkspaceFallbackLayout.jsx
          index.js
        auth/
          AuthLayout.jsx
          index.js
      router/
        AppRouter.jsx
        routeConfig.js
        routeGuards.js
        shellRouteBoundaries.js
        index.js

    widgets/
      left-rail/
        LeftRail.jsx
        LeftRailSections.jsx
        LeftRailWorkspaceSwitcher.jsx
        LeftRailPrimaryModules.jsx
        LeftRailKnowledgeObjects.jsx
        LeftRailPinnedAssets.jsx
        LeftRailUtilityZone.jsx
        index.js
      top-command-bar/
        TopCommandBar.jsx
        TopCommandBarBreadcrumbs.jsx
        TopCommandBarScope.jsx
        TopCommandBarStatusCluster.jsx
        index.js
      right-intelligence-panel/
        RightIntelligencePanel.jsx
        RightPanelTabs.jsx
        RightPanelSectionHost.jsx
        index.js
      bottom-activity-rail/
        BottomActivityRail.jsx
        ActivityRailCompact.jsx
        ActivityRailExpanded.jsx
        ActivityRailDebug.jsx
        index.js
      workspace-tabs/
        WorkspaceTabsBar.jsx
        WorkspaceTabItem.jsx
        WorkspaceTabOverflow.jsx
        index.js
      dock-system/
        DockHost.jsx
        DockRightZone.jsx
        DockBottomZone.jsx
        DockFloatingZone.jsx
        index.js

    pages/
      workspace/
        WorkspaceHomePage.jsx
        WorkspaceLegacyOutletPage.jsx
        index.js
      dashboard/
        DashboardPage.jsx
      auth/
        LoginPage.jsx
      legacy/
        LegacyChatPageBridge.jsx
        LegacyUploadPageBridge.jsx
        LegacyComparisonPageBridge.jsx
        LegacyPresentationPageBridge.jsx
        LegacyConvertPageBridge.jsx
        LegacyProfilePageBridge.jsx
        LegacyAdminPageBridge.jsx
        index.js

    processes/
      workspace-session/
        shell/
          restoreActiveWorkspaceSession.js
          bindWorkspaceContext.js
          rebindWorkspaceContext.js
          closeWorkspaceTab.js
          openWorkspaceTab.js
          index.js
      realtime-streams/
        shell/
          bindShellRealtimeSubscriptions.js
          unbindShellRealtimeSubscriptions.js
          index.js

  ———

  ## 2. Component Tree

  Canonical authenticated tree:

  AppRouter
    AppShellLayout
      ShellErrorBoundary
        ShellHydrator
          ShellFrame
            WorkspaceTabsBar
            ShellViewport
              LeftRail
              WorkspaceShellLayout
                TopCommandBar
                MainCanvas
                RightIntelligence`PHASE2TASKS.md` в репозитории пустой (`docs/PHASE_2_TASKS.md`, 0 bytes). Ниже
  спецификация опирается на [WORKSPACE_SHELL.md](/D:/docai/frontend/docs/WORKSPACE_SHELL.md),
  [FRONTEND_IMPLEMENTATION_PLAN.md](/D:/docai/frontend/docs/FRONTEND_IMPLEMENTATION_PLAN.md), [PHASE_1_TASKS.md](/D:/
  docai/frontend/docs/PHASE_1_TASKS.md) и согласованную Phase 2 store architecture.

  **Phase 3 Goal**
  Phase 3 внедряет persistent app shell как runtime-оболочку для AI workspace OS. Это не rewrite domain screens. Цель:
  обернуть существующие и будущие workspace surfaces в единый shell, подключить store-driven layout, session tabs, shell
  hydration и coexistence layer для legacy pages.

  ---

  ## 1. Full Shell Folder Structure

  ```text
  src/
    app/
      shell/
        ShellFrame.jsx
        ShellViewport.jsx
        ShellHydrator.jsx
        ShellStatusProvider.jsx
        ShellEventBridge.jsx
        ShellResizeProvider.jsx
        index.js
      layouts/
        AppShellLayout.jsx
        WorkspaceShellLayout.jsx
        LegacyWorkspaceFallbackLayout.jsx
        AuthLayout.jsx
        DashboardLayout.jsx
        StudioLayout.jsx
        index.js
      router/
        AppRouter.jsx
        route-config.js
        shell-routes.js
        legacy-routes.js
        RouteGuard.jsx
        WorkspaceRouteBoundary.jsx
        LegacyRouteBoundary.jsx
        index.js
      boundaries/
        AppShellErrorBoundary.jsx
        WorkspaceErrorBoundary.jsx
        PanelErrorBoundary.jsx
        CanvasErrorBoundary.jsx
        index.js
    widgets/
      left-rail/
        LeftRail.jsx
        LeftRailBrand.jsx
        LeftRailWorkspaceSwitcher.jsx
        LeftRailModules.jsx
        LeftRailPinnedAssets.jsx
        LeftRailUtilities.jsx
        index.js
      top-command-bar/
        TopCommandBar.jsx
        WorkspaceBreadcrumb.jsx
        IntentModeSwitcher.jsx
        ScopeIndicator.jsx
        LiveStatusCluster.jsx
        index.js
      right-intelligence-panel/
        RightIntelligencePanel.jsx
        ContextPanelTabs.jsx
        ContextPanelHeader.jsx
        ContextPanelBody.jsx
        index.js
      bottom-activity-rail/
        BottomActivityRail.jsx
        ActivityTicker.jsx
        ActivityTimeline.jsx
        ActivityDebugStream.jsx
        index.js
      workspace-tabs/
        WorkspaceTabsBar.jsx
        WorkspaceTab.jsx
        WorkspaceTabOverflow.jsx
        index.js
      dock-system/
        DockHost.jsx
        DockRightZone.jsx
        DockBottomZone.jsx
        DockFloatingLayer.jsx
        DockPanelHost.jsx
        index.js
      shell-canvas/
        MainCanvas.jsx
        LegacyCanvasOutlet.jsx
        WorkspaceModeOutlet.jsx
        index.js
    processes/
      workspace-session/
        model/
          restoreWorkspaceSession.js
          bindActiveWorkspaceSession.js
          rebindWorkspaceContext.js
          closeWorkspaceSession.js
      shell-lifecycle/
        initializeShell.js
        hydrateShell.js
        teardownShell.js
      shell-routing/
        openWorkspaceFromRoute.js
        syncRouteWithActiveSession.js
      shell-events/
        publishShellEvent.js
        attachRealtimeToShell.js

  ———

  ## 2. Component Tree

  AppRouter
    RouteGuard
      AppShellLayout
        AppShellErrorBoundary
          ShellHydrator
            ShellStatusProvider
              ShellResizeProvider
                ShellEventBridge
                  ShellFrame
                    LeftRail
                    ShellViewport
                      WorkspaceTabsBar
                      TopCommandBar
                      WorkspaceShellLayout | LegacyWorkspaceFallbackLayout | AuthLayout
                        WorkspaceErrorBoundary
                          MainCanvas
                            CanvasErrorBoundary
                              WorkspaceModeOutlet | LegacyCanvasOutlet
                        RightIntelligencePanel
                        BottomActivityRail
                    DockHost

  Rules:

  - AppShellLayout owns authenticated shell composition.
  - WorkspaceShellLayout is the default layout for workspace-aware routes.
  - LegacyWorkspaceFallbackLayout wraps existing pages without forcing rewrite.
  - DockHost lives at shell level, not inside canvas.

  ———

  ## 3. Shell Region Specifications

  ## ShellFrame

  Purpose

  - top-level authenticated shell skeleton
  - stable composition boundary for all shell regions
  - spatial contract for AI workspace OS

  Responsibilities

  - mount shell regions in fixed hierarchy
  - apply shell-level CSS grid/flex layout
  - host shell-level boundaries and dock layer
  - never own domain logic

  Render lifecycle

  - mounts after auth guard passes
  - renders immediately after shell hydration baseline completes
  - remains persistent across route changes except auth teardown

  State ownership

  - none beyond local layout refs
  - consumes shell state from stores

  Subscriptions

  - shellStore
  - workspaceStore active session presence
  - sessionTabsStore active tab
  - viewport/breakpoint state

  Communication flow

  - one-way composition host
  - children communicate via stores/events, not parent callbacks

  Resize behavior

  - responds to viewport and shellStore sizes
  - does not calculate business layout itself

  Mobile/tablet

  - swaps to adaptive region stacking mode
  - never unmounts core shell services

  Event handling

  - no business events
  - can emit shell layout lifecycle events like SHELL_FRAME_READY

  Rendering boundaries

  - must not rerender on message/document entity mutations unless shell-level selectors change

  ———

  ## AppShellLayout

  Purpose

  - authenticated root layout
  - separates auth experience from workspace runtime

  Responsibilities

  - wrap all authenticated routes
  - own shell hydration kickoff
  - connect route layer to shell layer
  - choose between workspace layout and legacy fallback layout

  State ownership

  - no persistent state
  - orchestration of lifecycle only

  Subscriptions

  - authStore
  - shellStore
  - route state
  - shell hydration status

  Communication

  - route resolution -> shell layout selection
  - route meta informs shell mode

  Rendering boundaries

  - should rerender only on auth state or route layout boundary changes

  ———

  ## WorkspaceShellLayout

  Purpose

  - canonical AI-native workspace layout

  Responsibilities

  - arrange WorkspaceTabsBar, TopCommandBar, MainCanvas, RightIntelligencePanel, BottomActivityRail
  - bind shell regions to active workspace session
  - apply workspace mode preset

  State ownership

  - no domain ownership
  - may own local measured layout refs

  Subscriptions

  - workspaceStore
  - sessionTabsStore
  - dockStore
  - contextPanelStore
  - activityRailStore

  Communication flow

  - active session changes cascade to all regions via stores
  - no prop drilling of session payloads

  Resize behavior

  - desktop: 3-column shell + bottom rail
  - laptop: narrower right panel, collapsible left rail
  - tablet: right panel drawer, bottom rail drawer
  - mobile: single active pane + overlays

  Event handling

  - shell events like:
      - WORKSPACE_BOUND
      - WORKSPACE_RESTORED
      - WORKSPACE_MODE_CHANGED

  Rendering boundaries

  - each region wrapped in memoized subtree/error boundary
  - canvas must not rerender when right panel tab changes unless selector overlap exists

  ———

  ## ShellViewport

  Purpose

  - structural viewport container for tab bar, command bar, main content stack

  Responsibilities

  - handle main shell scroll/overflow rules
  - define shell interior spacing and responsive behavior
  - isolate viewport-specific resize logic

  State ownership

  - local DOM measurement only

  Subscriptions

  - shellStore.breakpoint
  - shellStore.density
  - bottomRailStore.mode
  - contextPanelStore.panelWidth

  Resize behavior

  - calculates remaining space for canvas region
  - coordinates with right/bottom panel sizes

  Rendering boundaries

  - should not subscribe to domain stores

  ———

  ## MainCanvas

  Purpose

  - primary cognitive surface host
  - renders current workspace mode or legacy page content

  Responsibilities

  - mount active mode surface
  - preserve stable canvas keying per session
  - host suspense/loading and canvas-specific error boundaries
  - allow coexistence between new workspace canvases and legacy pages

  State ownership

  - none persistent
  - mode-local UI state belongs below canvas in workspace modules

  Subscriptions

  - workspaceStore.activeSessionId
  - workspaceStore.contextEnvelope
  - route mode metadata
  - orchestrationStore.currentExecutionId only if needed for inline execution UI

  Communication flow

  - canvas selection -> stores/events
  - canvas action -> orchestration/process layer
  - no direct knowledge of rail internals

  Resize behavior

  - fills available center region
  - supports mode-specific split zones later

  Mobile/tablet

  - becomes dominant primary pane
  - side panels accessed as overlay/drawer

  Event handling

  - publishes selection/context events
  - subscribes to execution result routing

  Rendering boundaries

  - heavy boundary
  - should be keyed by active tab/session, not route pathname alone

  ———

  ## LeftRail

  Purpose

  - persistent navigation and workspace orientation rail

  Responsibilities

  - module entry
  - workspace switching
  - pinned assets
  - utility controls
  - collapse/expand behavior

  State ownership

  - none; uses shellStore and workspaceStore

  Subscriptions

  - shellStore.leftRail
  - workspaceStore.activeWorkspaceId
  - sessionTabsStore
  - future pinned assets selectors

  Communication flow

  - user selects workspace/tab/module
  - actions dispatch into routing/session processes
  - emits shell nav events

  Resize behavior

  - expanded/collapsed widths tokenized
  - hover-preview on laptop/desktop
  - overlay drawer on tablet/mobile

  Mobile/tablet

  - hidden behind trigger
  - overlay with dismiss-on-selection

  Event handling

  - LEFT_RAIL_TOGGLED
  - WORKSPACE_SELECTED
  - MODULE_NAVIGATED

  Rendering boundaries

  - should not rerender on message/event streams except badge counts if explicitly selected

  ———

  ## TopCommandBar

  Purpose

  - AI command center, not plain navbar

  Responsibilities

  - breadcrumb
  - mode switcher
  - command input/palette entry
  - scope indicator
  - live status cluster

  State ownership

  - input draft and palette state live in commandBarStore
  - no execution truth here

  Subscriptions

  - commandBarStore
  - workspaceStore.activeSessionContext
  - orchestrationStore.currentExecution
  - realtimeStore.syncHealth
  - shellStore.breakpoint

  Communication flow

  - submit command -> orchestration/process layer
  - mode/scope changes -> commandBarStore + workspaceStore
  - live status derived from realtime/execution selectors

  Resize behavior

  - command field compresses first
  - non-critical clusters collapse into overflow on smaller widths

  Mobile/tablet

  - command bar can become sticky compact bar
  - advanced status behind expandable control

  Event handling

  - COMMAND_SUBMITTED
  - SCOPE_CHANGED
  - INTENT_MODE_CHANGED

  Rendering boundaries

  - avoid subscription to full event list; only summarized selectors

  ———

  ## RightIntelligencePanel

  Purpose

  - inspectable AI context and intelligence surface

  Responsibilities

  - context/evidence/entities/memory/outputs/provenance panel
  - follow/freeze behavior
  - panel width control
  - mode-sensitive content switching

  State ownership

  - contextPanelStore owns panel UI state
  - data comes from selectors over domain stores

  Subscriptions

  - contextPanelStore
  - workspaceStore.contextEnvelope
  - orchestrationStore
  - relevant entity selectors
  - shellStore.breakpoint

  Communication flow

  - canvas selection updates panel if follow-mode
  - pin/freeze actions update context/session stores
  - output artifact interactions route to artifact/domain layers

  Resize behavior

  - desktop resizable persistent side panel
  - laptop collapsible panel
  - tablet/mobile slide-over drawer

  Event handling

  - CONTEXT_TARGET_CHANGED
  - CONTEXT_FROZEN
  - CONTEXT_PINNED
  - OUTPUT_OPEN_REQUESTED

  Rendering boundaries

  - each internal tab should have sub-boundary
  - avoid remounting whole panel on every selection tick

  ———

  ## BottomActivityRail

  Purpose

  - operational nervous system of the shell

  Responsibilities

  - show tasks, event phases, realtime status, background jobs
  - compact/expanded/debug modes
  - drill-down into current execution chain

  State ownership

  - activityRailStore owns presentation/filter state
  - eventStore owns event records
  - realtimeStore owns transport state

  Subscriptions

  - activityRailStore
  - eventStore
  - realtimeStore
  - orchestrationStore

  Communication flow

  - transport/event ingestion -> eventStore -> activity selectors -> rail
  - user expands task -> activityRailStore
  - retry/open-detail -> orchestration/process layer

  Resize behavior

  - resizable height on desktop
  - compact ticker by default on laptop
  - drawer behavior on tablet/mobile

  Event handling

  - TASK_EXPANDED
  - EVENT_DISMISSED
  - DEBUG_STREAM_TOGGLED

  Rendering boundaries

  - list virtualization recommended once event volume grows
  - summary mode must avoid rendering full history

  ———

  ## WorkspaceTabsBar

  Purpose

  - session-oriented multitasking surface

  Responsibilities

  - show open workspace tabs
  - switch/close/reorder/restore tabs
  - show dirty/activity state

  State ownership

  - sessionTabsStore

  Subscriptions

  - sessionTabsStore
  - workspaceStore.activeSessionId
  - lightweight activity selectors for badges

  Communication flow

  - tab click -> activate session -> route sync
  - close tab -> session lifecycle process
  - open new tab -> workspace/session process

  Resize behavior

  - overflow menu when width constrained
  - pinned tabs future support

  Mobile/tablet

  - horizontal compact strip or session drawer
  - may collapse into session switcher

  Event handling

  - TAB_OPENED
  - TAB_ACTIVATED
  - TAB_CLOSED
  - TAB_RESTORED

  Rendering boundaries

  - tab item should subscribe only to its own badge/dirty state where possible

  ———

  ## DockHost

  Purpose

  - shell-level secondary surface manager

  Responsibilities

  - host right dock, bottom dock, floating dock layers
  - provide dock rendering boundaries independent of canvas
  - manage widget mounting zones

  State ownership

  - dockStore

  Subscriptions

  - dockStore
  - workspaceStore.activeSessionId
  - shellStore.breakpoint

  Communication flow

  - widget open/close/move -> dock actions
  - widgets consume session context from stores, not from DockHost props

  Resize behavior

  - desktop persistent zones
  - tablet/mobile fallback to drawers/overlays
  - no free-form desktop manager in first pass

  Event handling

  - WIDGET_OPENED
  - WIDGET_CLOSED
  - WIDGET_MOVED
  - DOCK_LAYOUT_CHANGED

  Rendering boundaries

  - each dock zone isolated
  - widgets mounted lazily

  ———

  ## 4. Full Shell Folder Structure Responsibilities

  ### app/shell

  Shell runtime and lifecycle infrastructure only.

  - no domain widgets
  - no page-specific logic

  ### app/layouts

  Route-driven composition contracts.

  - select shell arrangement
  - no heavy data logic

  ### app/router

  Declarative route/meta boundary definitions.

  - shell-aware route config
  - legacy coexistence

  ### app/boundaries

  Error isolation at shell, canvas, panel levels.

  ### widgets/*

  Shell region implementations only.

  ———

  ## 5. Route Architecture

  ### Route classes

  1. public-auth routes
      - /login
  2. authenticated-shell routes
      - /
      - /workspace/*
      - /compare
      - /presentation
      - /profile
      - /admin
  3. legacy shell-wrapped routes
      - existing legacy pages rendered inside shell canvas
  4. future full-native workspace routes
      - /workspace/chat/:sessionId?
      - /workspace/compare/:sessionId?
      - /workspace/presentation/:sessionId?

  ### Route metadata

  Each route should define:

  - authRequired
  - layoutType
  - workspaceAware
  - mode
  - legacy
  - restorable
  - panelPreset
  - dockPreset

  ### Shell routing boundaries

  - auth routes bypass shell
  - authenticated routes always enter AppShellLayout
  - workspace-aware routes use WorkspaceShellLayout
  - legacy routes use LegacyWorkspaceFallbackLayout inside shell

  ———

  ## 6. Shell Routing Boundaries

  RouteGuard

  - auth gate only
  - no layout logic

  WorkspaceRouteBoundary

  - converts route meta into workspace mode binding
  - ensures session exists or is restorable
  - may open workspace tab from route

  LegacyRouteBoundary

  - wraps current pages into canvas-compatible mount
  - allows old pages to remain operational inside shell frame

  Rule:

  - route layer chooses layout
  - store/process layer chooses session binding
  - canvas chooses content renderer

  ———

  ## 7. Legacy Page Coexistence Layer

  Purpose

  - keep current pages running while shell-first migration proceeds

  Mechanism

  - LegacyCanvasOutlet renders existing LandingPage, UploadPage, ChatPage, ComparisonPage, ConvertPage,
    PresentationPage, ProfilePage, AdminPage
  - shell regions stay active around them
  - legacy pages still receive props where needed during transition
  - store adapters run in parallel

  Rules

  - legacy page behavior must remain intact
  - legacy page state and store state may temporarily coexist
  - shell must not require immediate rewrite of internal page layout

  Migration order

  - legacy pages first shell-wrapped
  - then route-by-route replaced with native workspace canvases

  ———

  ## 8. Component Tree Render Flow

  1. router resolves route meta
  2. auth guard resolves access
  3. AppShellLayout mounts shell services
  4. ShellHydrator restores persisted shell state
  5. ShellFrame mounts stable shell chrome
  6. WorkspaceRouteBoundary binds active workspace/session
  7. WorkspaceShellLayout renders regions
  8. MainCanvas renders mode outlet or legacy page
  9. panel/rail selectors subscribe to active session context
  10. dock widgets mount lazily based on layout/session

  ———

  ## 9. Hydration Flow

  ### Shell hydration lifecycle

  1. authStore.hydrateAuth
  2. shellStore hydrate preferences
  3. sessionTabsStore restore open tabs
  4. workspaceStore restore active workspace/session context
  5. dockStore restore dock layout for active session
  6. contextPanelStore restore panel preferences
  7. realtimeStore initialize idle transport state
  8. ShellFrame renders
  9. route/session reconciliation runs
  10. missing entities fetched lazily by later phases

  ### Phases

  - boot
  - auth-restored
  - shell-preferences-restored
  - tabs-restored
  - workspace-bound
  - realtime-attached
  - ready

  Rule:

  - shell should render progressively, not block on full entity hydration

  ———

  ## 10. Navigation Flow

  1. user interacts with LeftRail or WorkspaceTabsBar
  2. action dispatches open/switch workspace session
  3. sessionTabsStore activates tab
  4. workspaceStore binds active session
  5. route sync process updates URL if necessary
  6. MainCanvas remounts mode surface keyed by session/mode
  7. right panel and bottom rail rebind through selectors

  Navigation principles:

  - URL reflects active mode/session when possible
  - tabs are the primary session abstraction
  - route is not the only state carrier

  ———

  ## 11. Workspace Restoration Flow

  1. app opens authenticated shell
  2. restored active tab resolved
  3. if route explicitly references session, route wins
  4. if route doesn’t specify session, restored active session wins
  5. restoreWorkspaceSession validates snapshot
  6. invalid entity refs pruned
  7. shell mode selected from route meta or session snapshot
  8. panel/dock presets rebound
  9. WORKSPACE_RESTORED event emitted

  Conflict precedence:

  1. explicit route
  2. valid active tab snapshot
  3. default workspace landing
  4. fallback legacy route

  ———

  ## 12. Shell-to-Store Interaction Model

  ### Read model

  - regions subscribe only to minimal selectors
  - composed selectors live outside UI files

  ### Write model

  - shell UI dispatches actions to:
      - store actions for simple UI concerns
      - process actions for cross-store/session concerns

  ### Examples

  - LeftRail collapse -> shellStore.setLeftRailCollapsed
  - tab switch -> activateWorkspaceTab(tabId) process
  - context freeze -> contextPanelStore.freezeOnEntity
  - route enter -> bindActiveWorkspaceSession(routeMeta) process

  Rule:

  - shell components do not imperatively manipulate sibling regions

  ———

  ## 13. Realtime Rendering Strategy

  Phase 3 shell should be realtime-ready even before full Phase 5 transport rollout.

  Strategy:

  - shell regions subscribe to summarized realtime selectors only
  - TopCommandBar shows connection/active task summary
  - BottomActivityRail consumes event/task stream summaries
  - RightIntelligencePanel only reacts to explicit relevant context/output updates
  - MainCanvas supports inline execution states via orchestration selectors

  If realtime unavailable:

  - shell renders idle/degraded state gracefully
  - synthetic local events from async actions can still feed activity rail

  ———

  ## 14. Dock System Architecture

  ### Initial dock zones

  - right dock
  - bottom dock
  - floating overlay layer reserved but limited

  ### DockHost internals

  - DockRightZone
  - DockBottomZone
  - DockFloatingLayer
  - DockPanelHost

  ### Contracts

  Each widget descriptor:

  - id
  - type
  - title
  - zone
  - sessionScoped
  - closable
  - restorable
  - minSize
  - preferredSize

  Rules:

  - dock state is session-aware
  - widgets subscribe to stores directly
  - DockHost manages placement, not widget data

  ———

  ## 15. Panel Communication Contracts

  ### Contract types

  - selection-follow
  - context-pin
  - output-open
  - task-focus
  - session-rebind

  ### Flows

  - Canvas selection -> workspaceStore/contextPanelStore
  - Right panel pin -> workspaceStore.patchSessionContext
  - Activity task focus -> orchestrationStore + contextPanelStore
  - Tab/session change -> all shell regions rebind using active session selectors

  ### Do not use

  - parent callbacks threaded across 5 shell regions
  - direct component refs across regions for business logic

  ———

  ## 16. Session / Tab Lifecycle

  States:

  - created
  - opened
  - activated
  - backgrounded
  - dirty
  - restoring
  - closing
  - closed
  - restorable

  Lifecycle flow:

  1. create tab/session shell record
  2. bind route/meta
  3. activate
  4. attach shell presets
  5. background when switching away
  6. restore if reopened
  7. cleanup transient buffers on close
  8. keep minimal snapshot in recently closed stack

  Dirty state sources:

  - unsaved output draft
  - active generated artifacts not acknowledged
  - future notebook/scratchpad state

  ———

  ## 17. Workspace Mode System

  Supported shell modes:

  - dashboard
  - workspace-chat
  - workspace-document
  - workspace-compare
  - workspace-presentation
  - workspace-graph
  - workspace-analytics
  - legacy-page

  Mode responsibilities:

  - inform canvas renderer
  - set panel preset
  - set dock preset
  - influence command bar mode defaults
  - influence activity rail filters

  Mode source precedence:

  1. route meta explicit mode
  2. active session snapshot mode
  3. default workspace mode

  ———

  ## 18. Multi-Tab Orchestration

  Requirements:

  - each tab tied to a session context
  - active execution belongs to session, not global shell
  - background tabs may have running tasks
  - bottom rail can show cross-tab tasks with active-tab filter
  - command bar defaults to active tab context

  Rules:

  - switching tabs must not destroy background task metadata
  - right panel must rebind to active tab context immediately
  - dock layout may vary by session/tab type

  ———

  ## 19. Workspace Context Rebinding

  Triggered by:

  - tab switch
  - route change
  - workspace switch
  - restore flow
  - compare/presentation open-from-action

  Rebinding steps:

  1. freeze transient outgoing subscriptions
  2. set active session/workspace ids
  3. compute new context envelope
  4. reselect active thread/document/artifact refs
  5. rebind command scope
  6. rebind right panel follow target
  7. rebind dock widgets
  8. resume realtime subscriptions for active scope
  9. emit WORKSPACE_CONTEXT_REBOUND

  Rule:

  - context rebinding should be atomic from UI perspective

  ———

  ## 20. Layout Resize System

  ### Resizable regions

  - LeftRail width: collapsed/expanded only in first pass
  - RightIntelligencePanel width: resizable desktop
  - BottomActivityRail height: resizable desktop
  - Dock zones: resizable in constrained presets

  ### Resize state ownership

  - structural sizes in shellStore or contextPanelStore / activityRailStore / dockStore
  - persisted per user or per session depending on region

  ### Resize behavior

  - drag handles update store throttled
  - on breakpoint downgrade, shell stores last desktop sizes but applies adaptive layout
  - on returning to desktop, restore previous sizes

  ### Mobile/tablet

  - no free resize
  - panel sizes map to drawer presets

  ———

  ## 21. Adaptive Responsive Shell

  ### Desktop wide

  - LeftRail persistent
  - RightIntelligencePanel persistent
  - BottomActivityRail visible
  - Dock zones active

  ### Laptop

  - LeftRail collapsible by default
  - Right panel narrower/collapsible
  - Activity rail compact by default

  ### Tablet

  - LeftRail overlay
  - Top bar condensed
  - Right panel drawer
  - Bottom rail drawer
  - Tabs maybe compact/scrollable

  ### Mobile

  - one dominant pane
  - tabs as session drawer
  - command bar compact
  - panel/rail overlay model

  Rules:

  - preserve session continuity
  - never lose active execution visibility entirely
  - shell contracts remain same even when regions collapse

  ———

  ## 22. Shell Event Orchestration

  Shell-level events:

  - SHELL_BOOTSTRAP_STARTED
  - SHELL_HYDRATED
  - WORKSPACE_BOUND
  - WORKSPACE_RESTORED
  - WORKSPACE_CONTEXT_REBOUND
  - SHELL_BREAKPOINT_CHANGED
  - PANEL_LAYOUT_CHANGED
  - TAB_ACTIVATED
  - ROUTE_SESSION_MISMATCH_RESOLVED

  Sources:

  - lifecycle services
  - route boundary
  - tab/session processes
  - resize system

  Destinations:

  - activity rail summary
  - debug tooling
  - future observability widgets

  ———

  ## 23. Shell Performance Strategy

  ### Principles

  - shell chrome stays cheap
  - region rerenders isolated
  - domain updates should not fan out across whole shell

  ### Tactics

  - selector-based subscriptions only
  - memoized region boundaries
  - separate error boundaries per region
  - lazy mount heavy legacy pages/native canvases
  - summarized realtime selectors for shell chrome
  - route-level code splitting for future native workspaces
  - virtualization for activity/event lists
  - avoid storing heavy denormalized payloads in shell-level selectors

  ### Region isolation

  - LeftRail isolated from message stream churn
  - TopCommandBar isolated from full event list churn
  - Right panel isolated by active tab/selection ids
  - Bottom rail optimized for list updates
  - MainCanvas keyed by session/mode, not unrelated shell preferences

  ———

  ## 24. Memory Cleanup Rules

  Cleanup on tab close:

  - remove tab local ephemeral UI state
  - detach dock layout if not restorable
  - release canvas-local subscriptions
  - prune inactive stream buffers for session
  - retain minimal snapshot if restorable

  Cleanup on workspace switch:

  - keep session snapshot
  - release transient selection/follow state if session-scoped and not persisted

  Cleanup on logout:

  - clear all auth-scoped shell/session stores
  - disconnect realtime
  - revoke any object URL registries later managed by artifact layer

  Cleanup on breakpoint change:

  - preserve desktop dimensions
  - drop obsolete overlay temp state

  ———

  ## 25. Error Boundaries

  ### AppShellErrorBoundary

  - catches fatal shell composition issues
  - fallback: minimal recovery shell + reload action

  ### WorkspaceErrorBoundary

  - catches workspace layout binding errors
  - fallback: session recovery / open dashboard

  ### PanelErrorBoundary

  - isolates right panel or activity rail failures
  - fallback: panel unavailable, canvas still works

  ### CanvasErrorBoundary

  - isolates active mode/legacy page crash
  - fallback: canvas error state, shell remains usable

  Rules:

  - no single panel crash should crash the shell
  - errors emit shell events for observability

  ———

  ## 26. Suspense / Loading Boundaries

  ### Shell loading boundaries

  - ShellHydrator: skeleton/blank-safe shell frame
  - MainCanvas: mode-level suspense
  - RightIntelligencePanel: independent suspense
  - BottomActivityRail: can render empty immediately and hydrate later

  Rules:

  - shell chrome should appear before all domain data resolves
  - avoid full-screen blocking loaders after auth
  - loading states should preserve orientation, not blank the UI

  ———

  ## 27. Future GraphRAG Integration Points

  Prepared shell hooks:

  - route meta mode=workspace-graph
  - right panel entity/relationship inspector tabs
  - bottom rail graph enrichment task filters
  - left rail graph module entry
  - dock widget slots for graph mini-map and path inspector
  - workspace context envelope supports selected entity/path refs

  Graph should plug into:

  - MainCanvas via WorkspaceModeOutlet
  - contextPanelStore via graph-related active tabs
  - workspaceStore via selected entity ids

  ———

  ## 28. Future Multimodal Workspace Zones

  Shell support points:

  - MainCanvas can host zone-based layouts later
  - dock system can host evidence/image/table widgets
  - workspace context envelope already supports active asset ids
  - right panel can add modality-sensitive tabs
  - bottom rail can visualize modality pipelines

  Future canvas zone presets:

  - text zone
  - document zone
  - visual zone
  - table zone
  - graph zone
  - output zone

  ———

  ## 29. Future Agent Workspace Support

  Shell-first provisions:

  - tabs can represent agent sessions
  - bottom rail already fits multi-step agent execution
  - command bar can target agents via intent mode later
  - right panel can expose agent artifacts/provenance
  - dock can host agent roster and run inspector widgets

  Needed future route mode:

  - workspace-agents

  ———

  ## 30. Enterprise-Grade Shell Rules

  1. Shell is persistent; pages are replaceable.
  2. Shell regions communicate through stores/events, not prop chains.
  3. Tabs represent analytical sessions, not just navigation shortcuts.
  4. Route and session are coordinated but not identical concepts.
  5. Shell hydration must be progressive and fault-tolerant.
  6. Legacy pages must remain mountable until native workspace parity exists.
  7. Panel collapse/adaptive changes must never lose context.
  8. Realtime summaries belong in shell chrome; heavy streams belong in specialized surfaces.
  9. Each shell region must have rendering isolation.
  10. No shell component should own domain payload state.
  11. Resize state is user/session preference, not business logic.
  12. Error boundaries must isolate failures by region.
  13. Suspense boundaries must preserve workspace orientation.
  14. Shell performance is a product requirement, not a later optimization.
  15. The shell must feel like an intelligence runtime, not a CRUD admin frame.
  KENCE.ai — Foundational Technical Contracts

  Behavioral operating contracts for all future systems. Every implementation must comply. Every deviation must be
  justified by amending the contract, not by exception.

  ---
  Contract Notation

  Each contract uses four declaration types:

  - INVARIANT: A property that must be true at all times. Violation is a system defect, not a usage error.
  - RULE: A behavioral constraint. Rule violations are detectable and must produce a defined error behavior.
  - TRANSITION: An allowed state machine step. Transitions not listed are forbidden.
  - MIGRATION NOTE: Current state that violates the contract, with a declared resolution path.

  ---
  Contract 1 — Store Ownership

  Purpose: Define exactly one authoritative writer per state field across all Zustand stores.

  ---
  Single Write Owner (SWO) table — current phase:

  ┌────────────────────────────────────┬────────────────────┬──────────────────┬───────────────────────────┐
  │               Field                │       Store        │   Current SWO    │        Target SWO         │
  ├────────────────────────────────────┼────────────────────┼──────────────────┼───────────────────────────┤
  │ theme, appName, appEmoji           │ shellStore         │ App.jsx (shadow) │ shellStore                │
  ├────────────────────────────────────┼────────────────────┼──────────────────┼───────────────────────────┤
  │ leftRail.collapsed                 │ shellStore         │ App.jsx (shadow) │ shellStore                │
  ├────────────────────────────────────┼────────────────────┼──────────────────┼───────────────────────────┤
  │ rightPanelShell.open               │ shellStore         │ Not yet written  │ shellStore                │
  ├────────────────────────────────────┼────────────────────┼──────────────────┼───────────────────────────┤
  │ breakpoint                         │ shellStore         │ Not yet written  │ Shell breakpoint observer │
  ├────────────────────────────────────┼────────────────────┼──────────────────┼───────────────────────────┤
  │ token, userId, role                │ authStore          │ App.jsx (shadow) │ authStore                 │
  ├────────────────────────────────────┼────────────────────┼──────────────────┼───────────────────────────┤
  │ activeSessionId, activeWorkspaceId │ workspaceStore     │ App.jsx (shadow) │ workspaceStore            │
  ├────────────────────────────────────┼────────────────────┼──────────────────┼───────────────────────────┤
  │ contextEnvelopeBySessionId         │ workspaceStore     │ App.jsx (shadow) │ workspaceStore            │
  ├────────────────────────────────────┼────────────────────┼──────────────────┼───────────────────────────┤
  │ tabsById, tabOrder, activeTabId    │ sessionTabsStore   │ App.jsx (shadow) │ sessionTabsStore          │
  ├────────────────────────────────────┼────────────────────┼──────────────────┼───────────────────────────┤
  │ intentsById, executionById         │ orchestrationStore │ Not yet written  │ Orchestration runtime     │
  ├────────────────────────────────────┼────────────────────┼──────────────────┼───────────────────────────┤
  │ connectionState, streamState       │ realtimeStore      │ Not yet written  │ Transport adapter         │
  └────────────────────────────────────┴────────────────────┴──────────────────┴───────────────────────────┘

  INVARIANT C1.1: No field has two simultaneous writers. If a shadow sync function (syncShellShadow,
  syncWorkspaceShadow, etc.) and a shell widget both write the same field, one must be disabled before the other is
  enabled. The crossover must be atomic — there is no period where both write.

  INVARIANT C1.2: A store's own action methods are the only valid write path once the SWO has migrated from App.jsx to
  the store. External code calling useStoreX.getState().set(...) directly is a contract violation.

  RULE C1.3: Every shadow sync function (syncShellShadow, syncAuthShadow, etc.) carries a deprecation annotation in its
   JSDoc from the moment a store widget takes SWO. It is removed — not kept as a dead backup — when the store widget is
   confirmed stable.

  RULE C1.4: Cross-store reads are permitted. Cross-store writes are forbidden. Store A calling
  useStoreB.getState().someAction() from within its own action is a contract violation. Cross-store communication
  routes through a declared mediator (a React provider, an event bridge, or a hook in the consuming component layer).

  MIGRATION NOTE: The sync*Shadow functions are currently the only write path. They are compliant during Phase 3. They
  become violations at the start of Phase 4 for any field where a shell widget has taken SWO.

  ---
  Contract 2 — Authority Boundaries

  Purpose: Define which layer has authority over which behavior at each migration phase, preventing the dual-authority
  bugs identified in prior reviews.

  ---
  Authority layers (ordered, highest to lowest):

  1. Store (Zustand): authoritative state for all persistent workspace behavior
  2. Shell widget: authoritative for its declared shell region's layout and lifecycle
  3. Page/feature component: authoritative for its own internal view state only
  4. App.jsx coordinator: authoritative for auth gating and router bootstrap only (target state)

  INVARIANT C2.1: A behavior is owned by exactly one authority layer. When two layers make conflicting decisions about
  the same behavior (e.g., App.jsx and shellStore both controlling theme), the higher layer's decision wins and the
  lower layer's code is removed, not kept as a fallback.

  INVARIANT C2.2: Page components (legacy pages inside the canvas host) have no authority over shell state. A page
  component may call a store action to signal intent (e.g., "document loaded, sessionId is X"), but it does not write
  shell layout state, tab state, or panel state directly.

  RULE C2.3: The authority handoff for each field follows this sequence:
  1. Shadow sync is the sole writer (current, Phase 3)
  2. Shadow sync writes; store action also writes the same value (transition — both active, store value is
  authoritative if they differ)
  3. Shadow sync is removed; store action is sole writer (Phase 4+)

  Step 2 is the validation window. It must not last more than one deployment cycle.

  RULE C2.4: App.jsx retains permanent authority over exactly two things: (a) the auth gate (if (!currentUser) return
  <LoginPage />) and (b) the root router bootstrap. All other state in App.jsx must have a declared migration target in
   a store.

  MIGRATION NOTE: App.jsx currently holds 9 useState declarations. Each is a declared shadow. The migration plan treats
   each one as a field-level handoff task, not a file-level refactor.

  ---
  Contract 3 — Shell Interaction Contracts

  Purpose: Define what the shell promises to regions, what regions promise to the shell, and how they communicate.

  ---
  Shell promises to each region:

  - Containment: The shell guarantees the region renders inside a declared CSS grid area. The region never bleeds
  outside its grid cell.
  - Error isolation: The shell's ShellRegionBoundary wraps every region. A region error never propagates to other
  regions.
  - No layout interference: The shell does not apply padding, margin, overflow, or z-index to region content. The shell
   provides the grid cell. The region owns everything inside it.
  - Conditional rendering: A region that is null or undefined is not rendered and does not reserve grid space. This is
  already implemented for rightPanel and bottomActivity in AppShellLayout.jsx:47,56.

  Region promises to the shell:

  - No cross-region DOM access: A region component never reads from or writes to another region's DOM. Cross-region
  communication is exclusively through stores.
  - No layout violations: A region never applies position: fixed or position: absolute with coordinates that place
  content outside its grid cell without declaring a portal. Portals are declared in the shell's portal root, not in the
   region itself.
  - Declared ARIA role: Every region has a declared ARIA landmark (role="navigation", role="main",
  role="complementary", role="banner", role="contentinfo"). Regions without declared roles are contract violations. The
   current AppShellLayout already applies aria-label to each region — the landmark roles must accompany them.
  - Self-contained error recovery: A region that errors handles its own recovery attempt before the ShellRegionBoundary
   catches it. An unhandled error reaching the boundary is a region failure, not a shell failure.

  INVARIANT C3.1: The shell has exactly six declared region slots: leftRail, topCommandBar, tabsBar, mainCanvas,
  rightPanel, bottomActivity. Adding a seventh region requires amending this contract. Feature teams do not add regions
   by adding props to AppShellLayout without a contract amendment.

  INVARIANT C3.2: The shell never passes business data as props to regions. Props to shell regions are React nodes
  only. All business data flows through stores. A shell region that needs to know the active session reads
  useWorkspaceStore, not a prop from App.jsx.

  RULE C3.3: The tab bar region (tabsBar) is always rendered between topCommandBar and the workspace area. It is never
  embedded inside mainCanvas. Its grid row is always declared between the header and workspace rows.

  RULE C3.4: ShellRegionBoundary must be extended to support a onError callback before any region transitions from
  placeholder to live. The callback feeds into the Zone-2 notification system (§14 of the interaction grammar). Silent
  region failures are a contract violation post-Phase 3.

  ---
  Contract 4 — Panel Lifecycle Contracts

  Purpose: Define the behavioral contract for every panel component in the workspace, grounded in the three binding
  types declared in the interaction grammar.

  ---
  Panel binding declaration (required at definition):

  Every panel component declares its binding at its definition site. The declaration is permanent.

  binding: 'selection' | 'session' | 'workspace'
  panelId: string          // unique, stable, kebab-case

  INVARIANT C4.1: A panel with binding: 'selection' never displays content from a previous selection when the current
  selection is empty. It renders its EmptyState exactly.

  INVARIANT C4.2: A panel with binding: 'session' never displays content from a previous session after a tab switch
  completes. The transition begins immediately on tab switch — the panel enters a loading state before new content is
  available, not after.

  INVARIANT C4.3: A panel with binding: 'workspace' never changes its content on tab switch. If it does, it is
  mis-declared as workspace-bound.

  Race prevention contract (applies to all bindings):

  When a panel receives a new context trigger (selection change, tab switch, workspace update), it must:
  1. Record the trigger's version ID (a monotonically incrementing counter per panel instance)
  2. Cancel any in-flight data fetch that carries an earlier version ID
  3. Render only the result whose version ID matches the most recent trigger

  A panel that renders a stale result because an earlier fetch completed after a later one is a contract violation. The
   version ID counter is local to the panel instance — it does not go into any store.

  Staleness signal contract:

  ┌────────────────────────┬─────────────────────────────────────────────────────────┐
  │ Time since last update │                         Signal                          │
  ├────────────────────────┼─────────────────────────────────────────────────────────┤
  │ 0–15 minutes           │ No indicator                                            │
  ├────────────────────────┼─────────────────────────────────────────────────────────┤
  │ 15–60 minutes          │ Muted "Updated Xm ago" in panel header                  │
  ├────────────────────────┼─────────────────────────────────────────────────────────┤
  │ 60+ minutes            │ Warning-colored timestamp; "Refresh" affordance appears │
  ├────────────────────────┼─────────────────────────────────────────────────────────┤
  │ Session expired        │ Panel shows "Session ended" state, not stale data       │
  └────────────────────────┴─────────────────────────────────────────────────────────┘

  RULE C4.4: The staleness clock runs only while the session is active and the user has been active in the workspace. A
   panel that has not updated because no user action has occurred is not stale — it is current. Staleness is measured
  from the last time the underlying data source changed, not from the last time the panel rendered.

  RULE C4.5: A panel's update debounce window for selection-bound panels is 150ms. Debounce is measured from the last
  selection event, not the first. This applies to keyboard navigation through lists, rapid entity clicks, and
  programmatic selections.

  ---
  Contract 5 — Tab and Workspace Contracts

  Purpose: Define the tab identity model, workspace containment rules, and tab state machine.

  ---
  Tab identity contract:

  A tab's identity is its id. The id is a stable, unique string that does not encode route path, session ID, or
  timestamp. It is generated once at creation and never regenerated for the same tab.

  INVARIANT C5.1: Tab identity is never path-based. The current legacy:${location.pathname} scheme is a Phase-3
  migration artifact. It must be replaced with a generated ID before tabs become user-visible interactive elements.
  Path-based IDs produce the comparison session collision failure identified in prior reviews.

  Tab schema — required fields:

  ┌───────────────────┬──────────────────────────┬─────────────────────┬───────────────────┐
  │       Field       │           Type           │     Writable by     │ Persistence tier  │
  ├───────────────────┼──────────────────────────┼─────────────────────┼───────────────────┤
  │ id                │ string (stable, unique)  │ Tab creation only   │ Tier-3            │
  ├───────────────────┼──────────────────────────┼─────────────────────┼───────────────────┤
  │ workspaceId       │ string                   │ Tab creation only   │ Tier-3            │
  ├───────────────────┼──────────────────────────┼─────────────────────┼───────────────────┤
  │ sessionId         │ string | null            │ workspaceStore      │ Tier-2 (ref only) │
  ├───────────────────┼──────────────────────────┼─────────────────────┼───────────────────┤
  │ type              │ TabType (enum)           │ Tab creation only   │ Tier-3            │
  ├───────────────────┼──────────────────────────┼─────────────────────┼───────────────────┤
  │ title             │ string                   │ sessionTabsStore    │ Tier-3            │
  ├───────────────────┼──────────────────────────┼─────────────────────┼───────────────────┤
  │ persistenceStatus │ PersistenceStatus        │ sessionTabsStore    │ Tier-3            │
  ├───────────────────┼──────────────────────────┼─────────────────────┼───────────────────┤
  │ sessionStatus     │ SessionStatus            │ workspaceStore      │ Tier-3            │
  ├───────────────────┼──────────────────────────┼─────────────────────┼───────────────────┤
  │ dirty             │ boolean                  │ Originating feature │ Tier-3            │
  ├───────────────────┼──────────────────────────┼─────────────────────┼───────────────────┤
  │ pinned            │ boolean                  │ User action only    │ Tier-3            │
  ├───────────────────┼──────────────────────────┼─────────────────────┼───────────────────┤
  │ assetComposition  │ AssetType[]              │ workspaceStore      │ Tier-3            │
  ├───────────────────┼──────────────────────────┼─────────────────────┼───────────────────┤
  │ lastVisitedAt     │ number (epoch ms)        │ sessionTabsStore    │ Tier-3            │
  ├───────────────────┼──────────────────────────┼─────────────────────┼───────────────────┤
  │ createdBy         │ 'user' | 'ai' | 'system' │ Tab creation only   │ Tier-3            │
  └───────────────────┴──────────────────────────┴─────────────────────┴───────────────────┘

  TabType enum (declared, exhaustive):

  'legacy-route'        // Phase 3 only — removed when migration is complete
  'document-session'    // RAG document workspace
  'graphrag-session'    // Saved GraphRAG traversal workspace
  'comparison-session'  // Multi-document comparison workspace
  'analytics-session'   // Analytics/dashboard workspace
  'synthesis-artifact'  // Generated artifact (output of Mode 4)
  'multimodal-session'  // Mixed-asset workspace

  SessionStatus enum:

  'active'     // Backend session alive, all content accessible
  'background' // Tab not focused; session alive in backend
  'expired'    // Backend session ended; document needs re-ingestion
  'restoring'  // Tab is in the process of restoring from restoreMeta
  'archived'   // Tab moved to archive; Tier-3 metadata preserved

  INVARIANT C5.2: A tab with sessionStatus: 'expired' never displays its content as if the session were active. The
  canvas for an expired tab shows the "Session ended" state with a reconnect affordance. It does not show a blank
  screen.

  INVARIANT C5.3: dirty: true on any tab prevents silent navigation away from that tab. The system must surface a "You
  have unsaved changes" confirmation before the tab loses focus. The confirmation is Level-1 (blocking) if the content
  is Tier-2 (would be lost on expiry). It is Level-3 (non-blocking notice) if the content is Tier-3 (persisted but
  modified).

  Workspace containment contract:

  A workspace is a container for tabs. All tabs belong to exactly one workspace. The workspace ID is on every tab
  record.

  INVARIANT C5.4: sessionTabsStore.openedWorkspaceIds contains the IDs of all workspaces that have at least one
  non-archived tab. A workspace with zero non-archived tabs is not in this list. A workspace with only archived tabs is
   in a separate archivedWorkspaceIds list.

  RULE C5.5: The tab bar renders only tabs belonging to activeWorkspaceId. Switching workspaces replaces the tab bar's
  content entirely. Tabs from non-active workspaces are not visible in the tab bar.

  ---
  Contract 6 — Orchestration Contracts

  Purpose: Define the schema, scoping, and registration contracts for the orchestration system before any runtime is
  implemented.

  ---
  Intent schema — required fields:

  ┌───────────────┬────────────────────────────────┬───────────────────────────────────────────┐
  │     Field     │              Type              │                Constraints                │
  ├───────────────┼────────────────────────────────┼───────────────────────────────────────────┤
  │ id            │ string                         │ Stable, unique, never reused              │
  ├───────────────┼────────────────────────────────┼───────────────────────────────────────────┤
  │ type          │ IntentType (registered string) │ Must exist in action registry             │
  ├───────────────┼────────────────────────────────┼───────────────────────────────────────────┤
  │ source        │ 'user' | 'ai' | 'system'       │ Required                                  │
  ├───────────────┼────────────────────────────────┼───────────────────────────────────────────┤
  │ scope         │ IntentScope                    │ Required — never null in Phase 5+         │
  ├───────────────┼────────────────────────────────┼───────────────────────────────────────────┤
  │ sessionId     │ string | null                  │ Required if scope is session or document  │
  ├───────────────┼────────────────────────────────┼───────────────────────────────────────────┤
  │ workspaceId   │ string                         │ Required always                           │
  ├───────────────┼────────────────────────────────┼───────────────────────────────────────────┤
  │ correlationId │ string                         │ Links to realtime event stream            │
  ├───────────────┼────────────────────────────────┼───────────────────────────────────────────┤
  │ modality      │ Modality                       │ Required — declares asset type context    │
  ├───────────────┼────────────────────────────────┼───────────────────────────────────────────┤
  │ status        │ IntentStatus                   │ Follows declared state machine            │
  ├───────────────┼────────────────────────────────┼───────────────────────────────────────────┤
  │ createdAt     │ number                         │ Epoch ms, set at creation, never modified │
  ├───────────────┼────────────────────────────────┼───────────────────────────────────────────┤
  │ updatedAt     │ number                         │ Epoch ms, updated on every status change  │
  └───────────────┴────────────────────────────────┴───────────────────────────────────────────┘

  IntentScope enum:

  'document'   // Operates against a single loaded document
  'session'    // Operates against the full current session context
  'workspace'  // Operates against workspace-level pinned context
  'all'        // Cross-workspace (admin/analytics operations only)

  INVARIANT C6.1: scope: null is a Phase-3 migration placeholder. No intent created after Phase 4 activation may have
  scope: null. The orchestration runtime rejects null-scope intents.

  IntentStatus state machine:

  queued → dispatched → running → complete
                                ↘ failed (terminal)
                                ↘ cancelled (terminal)
         → cancelled (terminal, before dispatch)

  No other transitions are valid. complete and failed and cancelled are terminal — an intent in a terminal state is
  never re-used. Retries create a new intent with a retriedFromIntentId reference field.

  Action registry contract:

  Every action that the orchestration system can execute is registered in actionRegistryById before any intent
  references it.

  Field: id
  Type: string
  Constraints: Namespaced: {module}.{verb}.{noun} (e.g., document.generate.presentation)
  ────────────────────────────────────────
  Field: label
  Type: string
  Constraints: Human-readable, used in UI affordances
  ────────────────────────────────────────
  Field: source
  Type: 'ui' | 'system' | 'ai'
  Constraints:
  ────────────────────────────────────────
  Field: scope
  Type: IntentScope[]
  Constraints: Which scopes this action supports
  ────────────────────────────────────────
  Field: modalities
  Type: Modality[]
  Constraints: Which asset types this action applies to
  ────────────────────────────────────────
  Field: version
  Type: number
  Constraints: Incremented on schema change
  ────────────────────────────────────────
  Field: deprecated
  Type: boolean
  Constraints: When true, existing intents complete but new ones are rejected
  ────────────────────────────────────────
  Field: reversible
  Type: boolean
  Constraints: Whether the action supports an undo
  ────────────────────────────────────────
  Field: maxDurationMs
  Type: number
  Constraints: Declared timeout; exceeded executions are failed, not hung

  INVARIANT C6.2: An intent whose type references an unregistered or deprecated: true action is rejected before
  entering the queued state. The orchestration runtime surfaces a Level-2 alert with the rejection reason.

  Session scoping contract:

  INVARIANT C6.3: Intents with scope: 'document' or scope: 'session' are isolated per sessionId.
  resetOrchestrationScope() is replaced with resetSessionOrchestration(sessionId) and
  resetWorkspaceOrchestration(workspaceId). A global reset is a privileged operation (admin only) that requires
  explicit user confirmation.

  ---
  Contract 7 — Task Lifecycle Contracts

  Purpose: Define the task schema, state machine, dependency model, and retry contract.

  ---
  Task schema — required fields:

  ┌───────────────┬───────────────┬────────────────────────────────────────────────────────┐
  │     Field     │     Type      │                      Constraints                       │
  ├───────────────┼───────────────┼────────────────────────────────────────────────────────┤
  │ id            │ string        │ Stable, unique                                         │
  ├───────────────┼───────────────┼────────────────────────────────────────────────────────┤
  │ executionId   │ string        │ Required — a task without an execution is invalid      │
  ├───────────────┼───────────────┼────────────────────────────────────────────────────────┤
  │ actionId      │ string        │ Must reference a registered action                     │
  ├───────────────┼───────────────┼────────────────────────────────────────────────────────┤
  │ label         │ string        │ User-visible description                               │
  ├───────────────┼───────────────┼────────────────────────────────────────────────────────┤
  │ status        │ TaskStatus    │ Follows state machine                                  │
  ├───────────────┼───────────────┼────────────────────────────────────────────────────────┤
  │ dependsOn     │ string[]      │ Task IDs that must be complete before this task starts │
  ├───────────────┼───────────────┼────────────────────────────────────────────────────────┤
  │ sessionId     │ string | null │                                                        │
  ├───────────────┼───────────────┼────────────────────────────────────────────────────────┤
  │ correlationId │ string | null │ Links to realtime event                                │
  ├───────────────┼───────────────┼────────────────────────────────────────────────────────┤
  │ modality      │ Modality      │ Inherited from parent intent                           │
  ├───────────────┼───────────────┼────────────────────────────────────────────────────────┤
  │ retriable     │ boolean       │                                                        │
  ├───────────────┼───────────────┼────────────────────────────────────────────────────────┤
  │ retryCount    │ number        │ 0 on creation                                          │
  ├───────────────┼───────────────┼────────────────────────────────────────────────────────┤
  │ maxRetries    │ number        │ From action descriptor's declared policy               │
  ├───────────────┼───────────────┼────────────────────────────────────────────────────────┤
  │ timeoutMs     │ number        │ From action descriptor                                 │
  ├───────────────┼───────────────┼────────────────────────────────────────────────────────┤
  │ startedAt     │ number | null │                                                        │
  ├───────────────┼───────────────┼────────────────────────────────────────────────────────┤
  │ completedAt   │ number | null │                                                        │
  ├───────────────┼───────────────┼────────────────────────────────────────────────────────┤
  │ failedAt      │ number | null │                                                        │
  ├───────────────┼───────────────┼────────────────────────────────────────────────────────┤
  │ errorCode     │ string | null │ Namespaced: {category}.{code}                          │
  ├───────────────┼───────────────┼────────────────────────────────────────────────────────┤
  │ outputRef     │ string | null │ Reference to the produced artifact, if any             │
  └───────────────┴───────────────┴────────────────────────────────────────────────────────┘

  TaskStatus state machine:

  pending → blocked (waiting on dependsOn)
          → queued (dependsOn met, waiting for capacity)
          → running
          → streaming (subset of running, for LLM token output)
          ↓
          complete (terminal)
          failed (terminal if retryCount >= maxRetries)
          retrying → queued (creates new attempt, retryCount + 1)
          cancelled (terminal)

  INVARIANT C7.1: A task with dependsOn entries never transitions from pending to queued until all declared
  dependencies are in the complete state. A dependency in failed or cancelled state propagates failure to the dependent
   task unless the action registry declares continueOnDependencyFailure: true.

  INVARIANT C7.2: A task that has been in running state for longer than its declared timeoutMs is transitioned to
  failed with errorCode: 'system.timeout'. The orchestration runtime enforces this. Feature teams do not implement
  their own timeouts.

  RULE C7.3: A retry creates a new task record with retryCount + 1 and the same executionId. The original failed task
  record is preserved with its failure metadata. The executionById record's taskIds array includes both the original
  and retry task IDs. There is no in-place mutation of a failed task to "un-fail" it.

  RULE C7.4: outputRef points to an artifact reference, never to inline artifact data. Task records in the store
  contain references, not content. Content lives in the artifact storage layer.

  ---
  Contract 8 — Realtime Transport Contracts

  Purpose: Define the adapter interface that any transport implementation must satisfy, and the session-scoped
  subscription model.

  ---
  Transport adapter interface (declared, not implemented):

  Any transport adapter (WebSocket, SSE, long-poll, mock) must satisfy this behavioral interface:

  Method: connect(workspaceId, sessionId)
  Behavior: Establishes connection scoped to workspace + session. Returns a connection handle.
  ────────────────────────────────────────
  Method: disconnect(handle)
  Behavior: Gracefully closes the connection. Pending events are flushed, not dropped.
  ────────────────────────────────────────
  Method: subscribe(scope, eventTypes[])
  Behavior: Registers interest in events matching scope and type. Returns an unsubscribe function.
  ────────────────────────────────────────
  Method: send(message)
  Behavior: Sends a client-originated message. Returns a correlation ID.
  ────────────────────────────────────────
  Method: reconnect(handle, policy)
  Behavior: Re-establishes a dropped connection using the declared policy.

  INVARIANT C8.1: No component calls transport methods directly. All transport interactions route through the realtime
  adapter layer, which updates realtimeStore as its output. Components read from realtimeStore. They do not hold
  transport handles.

  Connection lifecycle state machine:

  idle → connecting → connected → reconnecting (on drop)
                                ↘ disconnecting → idle
                   ↘ failed (terminal — requires explicit reconnect trigger)

  Reconnection policy contract:

  Every reconnection attempt uses exponential backoff with jitter:

  ┌─────────┬───────────────────────┬───────────┐
  │ Attempt │       Min delay       │ Max delay │
  ├─────────┼───────────────────────┼───────────┤
  │ 1       │ 1s                    │ 2s        │
  ├─────────┼───────────────────────┼───────────┤
  │ 2       │ 2s                    │ 4s        │
  ├─────────┼───────────────────────┼───────────┤
  │ 3       │ 4s                    │ 8s        │
  ├─────────┼───────────────────────┼───────────┤
  │ 4       │ 8s                    │ 16s       │
  ├─────────┼───────────────────────┼───────────┤
  │ 5+      │ 30s                   │ 60s       │
  ├─────────┼───────────────────────┼───────────┤
  │ ≥ 10    │ Terminal failed state │           │
  └─────────┴───────────────────────┴───────────┘

  INVARIANT C8.2: The transport adapter never hammers the backend. It never retries at an interval shorter than the
  minimum declared for that attempt number. Jitter is always applied (uniform random within the min–max band). This is
  enforced by the adapter layer, not by individual features.

  Subscription scope contract:

  subscriptionsByScope in realtimeStore is populated by the transport adapter. Each scope entry maps to a list of
  active subscriptions. The subscription model is:

  - Document scope: events for a specific document within a session
  - Session scope: events for a full session (all its documents and tasks)
  - Workspace scope: events for the workspace (tab state changes, shared task updates)
  - User scope: events targeting the authenticated user regardless of workspace

  INVARIANT C8.3: A component that unmounts must unsubscribe from all its subscriptions. The unsubscribe function
  returned by subscribe() is called in the component's cleanup path. Orphaned subscriptions are a contract violation —
  the adapter detects them via a TTL and logs them as errors.

  ---
  Contract 9 — Event Normalization Contracts

  Purpose: Define the canonical event schema that all events must conform to before entering any store, regardless of
  transport or backend source.

  ---
  Canonical event schema — required fields:

  Field: id
  Type: string
  Constraints: Globally unique, set by normalization layer, never by transport
  ────────────────────────────────────────
  Field: type
  Type: EventType (registered)
  Constraints: Must exist in event type registry
  ────────────────────────────────────────
  Field: sequenceId
  Type: number
  Constraints: Monotonically increasing per transport connection
  ────────────────────────────────────────
  Field: scope
  Type: EventScope
  Constraints: 'document' | 'session' | 'workspace' | 'user'
  ────────────────────────────────────────
  Field: sessionId
  Type: string | null
  Constraints: Required if scope is document or session
  ────────────────────────────────────────
  Field: workspaceId
  Type: string
  Constraints: Required always
  ────────────────────────────────────────
  Field: correlationId
  Type: string | null
  Constraints: Links to originating intent/task
  ────────────────────────────────────────
  Field: status
  Type: 'queued' | 'processing' | 'processed' | 'failed'
  Constraints:
  ────────────────────────────────────────
  Field: payload
  Type: object
  Constraints: Event-type-specific. Schema declared per EventType.
  ────────────────────────────────────────
  Field: receivedAt
  Type: number
  Constraints: Epoch ms, set by normalization layer on receipt
  ────────────────────────────────────────
  Field: createdAt
  Type: number
  Constraints: Epoch ms, set by backend on emission

  INVARIANT C9.1: Raw transport messages never enter any store directly. Every transport message passes through the
  normalization layer before any store action is called. The normalization layer is the sole writer of sequenceId and
  id. These fields are never trusted from the transport layer.

  INVARIANT C9.2: An event with a sequenceId lower than the last processed sequenceId for the same transport connection
   is a duplicate or out-of-order event. It is discarded silently after being logged to the diagnostic layer. It does
  not enter pendingEventsById.

  Event type registry contract:

  Every event type is registered before any transport goes live. The registry entry declares:
  - type: the canonical string key
  - scope: which scopes this event type can carry
  - payloadSchema: the required fields of the payload
  - routesTo: which store actions this event type triggers (realtimeStore, orchestrationStore, or both)
  - idempotent: whether processing the same event twice is safe

  INVARIANT C9.3: An event whose type is not in the registry is an UNKNOWN event. Unknown events are stored in a
  quarantine log, not in pendingEventsById. They never trigger store actions. They surface as a diagnostic entry
  visible only in dev mode.

  The normalization pipeline (declared stages, in order):

  1. Receive: raw transport message arrives
  2. Validate: required fields present, type registered
  3. Sequence check: sequenceId comparison, discard if duplicate/stale
  4. Normalize: assign id, receivedAt, coerce types
  5. Route: call declared store actions per routesTo
  6. Mark processed: update event status in pendingEventsById

  No stage may be skipped. No stage may write to a store that is not declared in that stage's responsibility.

  ---
  Contract 10 — Persistence Contracts

  Purpose: Define the three persistence tiers, which stores use each, eviction rules, and quota management.

  ---
  Tier assignments per store:

  ┌────────────────────┬───────────────────────────┬─────────────────────────────────────┬──────────────────────────┐
  │       Store        │           Tier            │             Middleware              │         Eviction         │
  ├────────────────────┼───────────────────────────┼─────────────────────────────────────┼──────────────────────────┤
  │ shellStore         │ Tier-3 (partial)          │ persist for theme, appName, density │ Never                    │
  ├────────────────────┼───────────────────────────┼─────────────────────────────────────┼──────────────────────────┤
  │ authStore          │ Tier-3 (token only)       │ persist for token                   │ On logout                │
  ├────────────────────┼───────────────────────────┼─────────────────────────────────────┼──────────────────────────┤
  │ sessionTabsStore   │ Tier-3                    │ persist (full)                      │ Per eviction rules below │
  ├────────────────────┼───────────────────────────┼─────────────────────────────────────┼──────────────────────────┤
  │ workspaceStore     │ Tier-2 (session lifetime) │ None — no persist                   │ On session expiry        │
  ├────────────────────┼───────────────────────────┼─────────────────────────────────────┼──────────────────────────┤
  │ orchestrationStore │ Tier-2 (session lifetime) │ None                                │ Per session cleanup      │
  ├────────────────────┼───────────────────────────┼─────────────────────────────────────┼──────────────────────────┤
  │ realtimeStore      │ Tier-1 (render lifetime)  │ None                                │ On disconnect            │
  └────────────────────┴───────────────────────────┴─────────────────────────────────────┴──────────────────────────┘

  INVARIANT C10.1: workspaceStore.contextEnvelopeBySessionId is never persisted to localStorage. Its data is Tier-2. On
   reload, context envelopes are re-hydrated from the backend session if the session is still alive. If the session has
   expired, the tab enters sessionStatus: 'expired'.

  localStorage quota contract:

  The total Tier-3 budget across all stores is 3MB. Distribution:

  ┌──────────────────────────────┬────────┐
  │            Store             │ Budget │
  ├──────────────────────────────┼────────┤
  │ sessionTabsStore             │ 1.5 MB │
  ├──────────────────────────────┼────────┤
  │ shellStore (persist slice)   │ 50 KB  │
  ├──────────────────────────────┼────────┤
  │ authStore (persist slice)    │ 50 KB  │
  ├──────────────────────────────┼────────┤
  │ Future graph traversal saves │ 1 MB   │
  ├──────────────────────────────┼────────┤
  │ Reserve                      │ 400 KB │
  └──────────────────────────────┴────────┘

  INVARIANT C10.2: sessionTabsStore enforces a maximum of 50 tabs across all workspaces in tabsById (archived + active
  combined). When this limit is reached, adding a new tab triggers automatic archival of the oldest inactive tab
  (lowest lastVisitedAt that is not pinned: true). Pinned tabs are never auto-archived.

  RULE C10.3: restoreMetaByTabId is bounded by the same 50-tab limit. Entries older than 90 days are pruned on the next
   workspace open, regardless of tab count.

  Hydration contract (on page load):

  1. persist middleware rehydrates synchronously from localStorage
  2. Component tree renders against rehydrated state (tabs appear, layout restores)
  3. For each tab with sessionStatus !== 'expired': workspaceStore initiates a backend session health check
  4. Tabs whose sessions are confirmed alive transition to sessionStatus: 'active'
  5. Tabs whose sessions are dead transition to sessionStatus: 'expired'
  6. Steps 3–5 complete before the canvas renders any session-bound content

  INVARIANT C10.4: The canvas never renders session-bound content while step 3–5 are in progress. During hydration,
  session-bound regions show a "Restoring session…" skeleton state. This prevents the false-restore failure identified
  in prior reviews.

  ---
  Contract 11 — GraphRAG State Contracts

  Purpose: Define the state schema for graph traversal before the GraphRAG store is created, ensuring the future store
  is architected to fit existing context envelope references.

  ---
  Graph state is session-referenced, not session-inline.

  The contextEnvelope.selectedEntityIds and contextEnvelope.pinnedContextIds fields are ID references, not inline graph
   data. They reference records in a dedicated graphStore (future). The context envelope remains lightweight. Graph
  data never lives inside workspaceStore.

  GraphStore schema (declared, not yet implemented):

  graphStore
  ├── graphsBySessionId: Map<sessionId, GraphSnapshot>
  ├── entityById: Map<entityId, EntityRecord>
  ├── edgeById: Map<edgeId, EdgeRecord>
  └── traversalStateBySessionId: Map<sessionId, TraversalState>

  EntityRecord required fields:

  ┌───────────────────┬─────────────────────────────────────┐
  │       Field       │                Type                 │
  ├───────────────────┼─────────────────────────────────────┤
  │ id                │ string (stable, backend-assigned)   │
  ├───────────────────┼─────────────────────────────────────┤
  │ label             │ string                              │
  ├───────────────────┼─────────────────────────────────────┤
  │ type              │ EntityType (registered enum)        │
  ├───────────────────┼─────────────────────────────────────┤
  │ confidence        │ number (0–1)                        │
  ├───────────────────┼─────────────────────────────────────┤
  │ sourceSessionId   │ string                              │
  ├───────────────────┼─────────────────────────────────────┤
  │ sourceDocumentId  │ string                              │
  ├───────────────────┼─────────────────────────────────────┤
  │ sourceLocationRef │ string (page, paragraph, timestamp) │
  ├───────────────────┼─────────────────────────────────────┤
  │ firstSeenAt       │ number                              │
  └───────────────────┴─────────────────────────────────────┘

  INVARIANT C11.1: selectedEntityIds in the context envelope contains only IDs that exist in graphStore.entityById. A
  context envelope referencing a non-existent entity ID is invalid. The GraphRAG system validates this on every
  selection change.

  Selection discrimination contract:

  The current flat selectedEntityIds[], selectedEvidenceIds[], pinnedContextIds[] must be replaced with typed
  containers before Phase 6:

  selectedItems: Array<{
    id: string,
    type: 'entity' | 'evidence' | 'documentAnchor' | 'artifact',
    sessionId: string,
    addedAt: number
  }>

  The flat string arrays are Phase-3 placeholders. They are not compliant with this contract. The migration is a schema
   change to the context envelope — existing envelopes with flat arrays are migrated on first access.

  Traversal state contract (Tier-2, session-scoped):

  ┌─────────────────────┬──────────────────────────────────┐
  │        Field        │               Type               │
  ├─────────────────────┼──────────────────────────────────┤
  │ startEntityId       │ string                           │
  ├─────────────────────┼──────────────────────────────────┤
  │ currentDepth        │ number (1–4)                     │
  ├─────────────────────┼──────────────────────────────────┤
  │ relationshipFilters │ string[] (active types)          │
  ├─────────────────────┼──────────────────────────────────┤
  │ confidenceFloor     │ number (0–1)                     │
  ├─────────────────────┼──────────────────────────────────┤
  │ viewportState       │ object (graph layout, zoom, pan) │
  └─────────────────────┴──────────────────────────────────┘

  Traversal state persists for the session lifetime. It survives tab switching. It does not persist to localStorage —
  if the session expires, the traversal state is lost and must be rebuilt.

  INVARIANT C11.2: pinnedContextIds (future: pinnedItems of type: 'entity') are Tier-3. They survive session expiry,
  browser reload, and workspace switching. They are stored in a workspace-level pin store, not in the session's context
   envelope.

  ---
  Contract 12 — Multimodal Asset Contracts

  Purpose: Define the asset type discriminated union, session asset model, and cross-asset link schema before
  multimodal sessions are implemented.

  ---
  Asset type discriminated union (declared exhaustively):

  type AssetType =
    | { kind: 'document'; mimeType: 'application/pdf' | 'application/vnd.openxmlformats...' | ... }
    | { kind: 'video';    mimeType: 'video/mp4' | 'video/webm' | ... }
    | { kind: 'audio';    mimeType: 'audio/mpeg' | 'audio/wav' | ... }
    | { kind: 'image';    mimeType: 'image/png' | 'image/jpeg' | ... }
    | { kind: 'table';    mimeType: 'text/csv' | 'application/vnd.ms-excel' | ... }
    | { kind: 'artifact'; artifactType: ArtifactType }

  AssetRecord required fields:

  ┌─────────────────┬──────────────────────────┬───────────────────────────────────┐
  │      Field      │           Type           │            Constraints            │
  ├─────────────────┼──────────────────────────┼───────────────────────────────────┤
  │ id              │ string                   │ Stable, backend-assigned          │
  ├─────────────────┼──────────────────────────┼───────────────────────────────────┤
  │ sessionId       │ string                   │ The session this asset belongs to │
  ├─────────────────┼──────────────────────────┼───────────────────────────────────┤
  │ assetType       │ AssetType                │ Discriminated union               │
  ├─────────────────┼──────────────────────────┼───────────────────────────────────┤
  │ displayName     │ string                   │ User-visible label                │
  ├─────────────────┼──────────────────────────┼───────────────────────────────────┤
  │ ingestStatus    │ IngestStatus             │ Follows state machine             │
  ├─────────────────┼──────────────────────────┼───────────────────────────────────┤
  │ sizeBytes       │ number                   │                                   │
  ├─────────────────┼──────────────────────────┼───────────────────────────────────┤
  │ persistenceTier │ 2 | 3                    │                                   │
  ├─────────────────┼──────────────────────────┼───────────────────────────────────┤
  │ addedAt         │ number                   │ Epoch ms                          │
  ├─────────────────┼──────────────────────────┼───────────────────────────────────┤
  │ addedBy         │ 'user' | 'ai' | 'system' │                                   │
  └─────────────────┴──────────────────────────┴───────────────────────────────────┘

  IngestStatus state machine:

  pending → uploading → parsing → indexing → ready
                      ↘ failed (terminal)

  INVARIANT C12.1: contextEnvelope.activeAssetIds contains only IDs that exist in the asset store and whose
  ingestStatus is 'ready'. An asset in any other state is not surfaced to AI modes as context.

  INVARIANT C12.2: contextEnvelope.activeAssetIds is an ordered array. The first entry is the primary asset (rendered
  in the main canvas). Subsequent entries are secondary assets (available in split view or asset rail). The order
  reflects user intent — it is explicitly set by the user, not auto-sorted by the system.

  Cross-asset link schema:

  AssetLink {
    id: string
    sourceAssetId: string
    sourceLocationRef: AssetLocationRef   // typed per asset kind
    targetAssetId: string
    targetLocationRef: AssetLocationRef   // typed per asset kind
    linkType: 'reference' | 'evidence' | 'derivedFrom' | 'contradicts'
    createdBy: 'user' | 'ai'
    confidence: number | null             // null if user-created
    createdAt: number
  }

  AssetLocationRef (discriminated by asset kind) {
    document: { pageIndex: number; paragraphIndex: number; charRange: [number, number] }
    video:    { timestampMs: number; durationMs: number }
    audio:    { timestampMs: number; durationMs: number }
    image:    { boundingBox: { x, y, w, h } }
    table:    { rowIndex: number; columnId: string }
  }

  INVARIANT C12.3: Following a cross-asset link opens the target asset in split view alongside the source — never as a
  full canvas replacement. Split view is the declared navigation outcome for link traversal. A feature that navigates
  away from the source on link follow violates this contract.

  ---
  Contract 13 — AI Mode Execution Contracts

  Purpose: Define the schema, scope resolution, response format, and error contract for each of the four declared AI
  interaction modes.

  ---
  Mode execution request schema (all modes share base fields):

  Field: mode
  Type: 'document' | 'command' | 'explore' | 'synthesis'
  Constraints: Required
  ────────────────────────────────────────
  Field: intentId
  Type: string
  Constraints: Links to orchestrationStore.intentsById
  ────────────────────────────────────────
  Field: scope
  Type: IntentScope
  Constraints: Resolved before execution begins, never inferred
  ────────────────────────────────────────
  Field: sessionId
  Type: string | null
  Constraints: Required for document and command modes
  ────────────────────────────────────────
  Field: workspaceId
  Type: string
  Constraints: Required always
  ────────────────────────────────────────
  Field: correlationId
  Type: string
  Constraints: Generated at request time, links to realtime event
  ────────────────────────────────────────
  Field: contextPayload
  Type: ModeContextPayload
  Constraints: Mode-specific, declared below

  Mode-specific response format contracts:

  Mode 1 (Document) response:
  {
    text: string,
    confidence: number (0–1),
    citations: Array<{
      assetId: string,
      locationRef: AssetLocationRef,
      excerpt: string
    }>,
    inferredWithoutSource: boolean   // true if no citation exists
  }

  INVARIANT C13.1: A Document mode response with inferredWithoutSource: true is displayed with a visible "Inferred — no
   direct source" indicator in the UI. It is never presented as cited.

  Mode 2 (Command) response:
  {
    artifactRef: string | null,   // output artifact ID if produced
    workspaceStateChange: WorkspaceStateDiff | null,  // if workspace was modified
    reversible: boolean,
    undoWindowMs: number | null   // null if not reversible
  }

  Command responses never include prose text as their primary output. They produce artifacts or state changes, not chat
   messages.

  Mode 3 (Explore) — no response schema. Explore mode interacts with the graph store directly. There is no AI response
  payload. Graph data is loaded from the graph store based on entity IDs and traversal parameters.

  Mode 4 (Synthesis) response:
  {
    artifactId: string,           // always produces an artifact, never null
    artifactType: 'synthesis-document',
    claimCount: number,
    sourcedClaimCount: number,    // claims with at least one citation
    unsourcedClaimCount: number,  // claims marked 'synthesized — no direct source'
    sourceSessionIds: string[]    // all sessions that contributed pinned context
  }

  INVARIANT C13.2: Mode 4 always produces an artifact. A Mode 4 execution that completes without producing an artifact
  is a failed execution, not a successful execution with empty output.

  Scope resolution contract (applies before any mode executes):

  ┌────────────────┬─────────────────────────────────────────────────────────────────────────────────┐
  │ Declared scope │                                   Resolves to                                   │
  ├────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
  │ 'document'     │ The primary asset in contextEnvelope.activeAssetIds[0]                          │
  ├────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
  │ 'session'      │ All ready assets in contextEnvelope.activeAssetIds + all items in selectedItems │
  ├────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
  │ 'workspace'    │ All items in pinnedItems across the workspace                                   │
  ├────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
  │ 'all'          │ Workspace + cross-workspace (requires explicit user confirmation modal)         │
  └────────────────┴─────────────────────────────────────────────────────────────────────────────────┘

  INVARIANT C13.3: Scope resolution occurs before the execution starts and is logged in the execution record. The scope
   that was used is always accessible post-completion for audit purposes. A response cannot claim wider scope than what
   was resolved.

  ---
  Contract 14 — Cross-Session Context Contracts

  Purpose: Define the pin schema, cross-session query authority, and synthesis input resolution.

  ---
  Pin record schema:

  Field: id
  Type: string
  Constraints: Stable, workspace-scoped unique
  ────────────────────────────────────────
  Field: workspaceId
  Type: string
  Constraints: Required
  ────────────────────────────────────────
  Field: sourceSessionId
  Type: string
  Constraints: The session from which the item was pinned
  ────────────────────────────────────────
  Field: sourceAssetId
  Type: string | null
  Constraints: The asset the item came from
  ────────────────────────────────────────
  Field: sourceLocationRef
  Type: AssetLocationRef | null
  Constraints: Where in the asset
  ────────────────────────────────────────
  Field: contentType
  Type: 'answer' | 'excerpt' | 'entity' | 'artifact' | 'evidence'
  Constraints:
  ────────────────────────────────────────
  Field: content
  Type: string
  Constraints: The pinned text/reference — always a copy, not a live reference
  ────────────────────────────────────────
  Field: confidence
  Type: number | null
  Constraints: From source answer, if applicable
  ────────────────────────────────────────
  Field: groupId
  Type: string | null
  Constraints: User-assigned grouping
  ────────────────────────────────────────
  Field: groupLabel
  Type: string | null
  Constraints:
  ────────────────────────────────────────
  Field: pinnedAt
  Type: number
  Constraints: Epoch ms
  ────────────────────────────────────────
  Field: pinnedBy
  Type: 'user' | 'ai'
  Constraints:
  ────────────────────────────────────────
  Field: persistenceTier
  Type: 3
  Constraints: Always Tier-3

  INVARIANT C14.1: A pin is always a copy of the content at the moment of pinning. It does not hold a live reference to
   the source. If the source session expires and the document is re-ingested, the pin remains valid because it holds
  its own content copy. Pin integrity does not depend on session availability.

  INVARIANT C14.2: The workspace pin store has a maximum capacity of 500 pins per workspace. On reaching capacity,
  adding a new pin requires archiving an existing one. The system surfaces this limit before rejection, not at the
  moment of rejection.

  Cross-session query authority contract:

  A cross-session query (Mode 4) is authorized if and only if:
  1. pinnedItems.length > 0 (at least one pin exists)
  2. The user has explicitly selected Mode 4 (no automatic cross-session queries)
  3. The scope chip shows 'workspace' at the moment of submission

  No implicit cross-session context injection is permitted. If a page or feature adds cross-session context to a
  Document mode query without the user's explicit awareness, it is a contract violation regardless of whether it
  improves the answer quality.

  Synthesis input resolution contract:

  When Mode 4 executes, it resolves its context payload as follows:
  1. Collect all pins in the declared group (or all pins if no group filter)
  2. For each pin: include content, sourceLocationRef, confidence, sourceAssetId
  3. Deduplicate pins with identical content and sourceLocationRef (keep the most recent)
  4. Order by groupId (grouped pins together), then by pinnedAt ascending within each group
  5. If the resolved payload exceeds the declared context window limit: truncate from oldest pins first, with a
  declared "N pins omitted" note in the synthesis output

  INVARIANT C14.3: The synthesis output explicitly lists which pins were included and which were omitted (if any). The
  user can always see what context the synthesis used. A synthesis that silently omits context is a contract violation.

  ---
  Contract 15 — Accessibility and System-State Contracts

  Purpose: Define the ARIA region contract, focus management rules, keyboard shortcut registry, and system-state
  announcement model.

  ---
  ARIA landmark contract — required per shell region:

  ┌────────────────┬─────────────────────────────┬─────────────────────────────────────────┐
  │  Shell region  │        Required role        │           Required aria-label           │
  ├────────────────┼─────────────────────────────┼─────────────────────────────────────────┤
  │ leftRail       │ navigation                  │ "Primary navigation"                    │
  ├────────────────┼─────────────────────────────┼─────────────────────────────────────────┤
  │ topCommandBar  │ banner                      │ "Workspace header"                      │
  ├────────────────┼─────────────────────────────┼─────────────────────────────────────────┤
  │ tabsBar        │ (implicit — tablist inside) │ Parent div: aria-label="Workspace tabs" │
  ├────────────────┼─────────────────────────────┼─────────────────────────────────────────┤
  │ mainCanvas     │ main                        │ "Workspace content"                     │
  ├────────────────┼─────────────────────────────┼─────────────────────────────────────────┤
  │ rightPanel     │ complementary               │ "Workspace context"                     │
  ├────────────────┼─────────────────────────────┼─────────────────────────────────────────┤
  │ bottomActivity │ contentinfo                 │ "Workspace activity"                    │
  └────────────────┴─────────────────────────────┴─────────────────────────────────────────┘

  The current AppShellLayout.jsx already applies aria-label to each region. The role attributes must accompany them.
  These are already in the layout file — the contract codifies that they must not be removed.

  INVARIANT C15.1: Every interactive element in the workspace has a non-empty accessible name. An interactive element
  with no accessible name is a contract violation detected by automated accessibility testing.

  Focus management contract:

  ┌───────────────────────────────┬────────────────────────────────────────────────────────────────────────────┐
  │             Event             │                             Focus destination                              │
  ├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ Tab opens                     │ First focusable element in the canvas of the new tab                       │
  ├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ Tab closes                    │ The adjacent tab's tab button (or the "new tab" button if no adjacent tab) │
  ├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ Panel opens                   │ First focusable element inside the panel                                   │
  ├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ Panel closes                  │ The element that triggered the panel opening                               │
  ├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ Modal opens                   │ The modal's primary action button (or heading if no button)                │
  ├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ Modal closes                  │ The element that triggered the modal                                       │
  ├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ Region error (boundary fires) │ The error fallback's primary action button                                 │
  └───────────────────────────────┴────────────────────────────────────────────────────────────────────────────┘

  INVARIANT C15.2: Focus is never lost to the document body on any workspace state transition. A transition that drops
  focus to document.body is a contract violation. Focus trapping within modals is required — Tab and Shift+Tab cycle
  within the modal.

  Keyboard shortcut registry contract:

  Every keyboard shortcut declared in the workspace is registered in a central shortcut registry before it is bound.
  The registry entry declares:

  ┌───────────────┬─────────────────────────────────────────────┐
  │     Field     │                    Type                     │
  ├───────────────┼─────────────────────────────────────────────┤
  │ id            │ string (namespaced: {scope}.{action})       │
  ├───────────────┼─────────────────────────────────────────────┤
  │ keys          │ string[] (e.g., ['ctrl+k', 'cmd+k'])        │
  ├───────────────┼─────────────────────────────────────────────┤
  │ label         │ string (user-visible in keyboard reference) │
  ├───────────────┼─────────────────────────────────────────────┤
  │ scope         │ 'global' | 'canvas' | 'panel' | 'graph'     │
  ├───────────────┼─────────────────────────────────────────────┤
  │ conflictsWith │ string[] (other shortcut IDs)               │
  └───────────────┴─────────────────────────────────────────────┘

  INVARIANT C15.3: No two shortcuts in the same scope may share the same key combination. The registry enforces this at
   registration time. A second shortcut attempting to claim an occupied key combination in the same scope is rejected
  with an error logged to the diagnostic layer, not silently applied.

  Declared global shortcuts (reserved — not implementable by feature teams without amendment):

  ┌────────────────┬────────────────────────────────────────────┐
  │    Shortcut    │                   Action                   │
  ├────────────────┼────────────────────────────────────────────┤
  │ Ctrl+K / Cmd+K │ Open command palette                       │
  ├────────────────┼────────────────────────────────────────────┤
  │ Ctrl+Tab       │ Cycle to next tab                          │
  ├────────────────┼────────────────────────────────────────────┤
  │ Ctrl+Shift+Tab │ Cycle to previous tab                      │
  ├────────────────┼────────────────────────────────────────────┤
  │ Ctrl+W         │ Close current tab (with dirty-check)       │
  ├────────────────┼────────────────────────────────────────────┤
  │ Ctrl+Z         │ Undo last reversible command               │
  ├────────────────┼────────────────────────────────────────────┤
  │ Escape         │ Dismiss topmost modal, panel, or selection │
  └────────────────┴────────────────────────────────────────────┘

  Tab bar keyboard navigation contract:

  The tab bar (tabsBar region) implements the ARIA tab pattern fully:
  - Arrow Left / Arrow Right: move focus between tab buttons (wrapping)
  - Home: focus first tab
  - End: focus last tab
  - Delete: close focused tab (if closeable and not dirty)
  - Enter / Space: activate focused tab

  Active tab: tabIndex={0}. All other tabs: tabIndex={-1}. Focus within the tablist is managed by the tablist
  component, not by natural tab order.

  aria-live region contract:

  ┌──────────────────────┬───────────┬─────────────┬─────────────────────────────────┐
  │        Region        │ aria-live │ aria-atomic │            Announces            │
  ├──────────────────────┼───────────┼─────────────┼─────────────────────────────────┤
  │ Zone-1 modal         │ assertive │ true        │ Blocker message                 │
  ├──────────────────────┼───────────┼─────────────┼─────────────────────────────────┤
  │ Zone-2 alert banner  │ assertive │ false       │ Alert content as it appears     │
  ├──────────────────────┼───────────┼─────────────┼─────────────────────────────────┤
  │ Zone-3 toast         │ polite    │ true        │ Full toast content on appear    │
  ├──────────────────────┼───────────┼─────────────┼─────────────────────────────────┤
  │ Zone-4 activity rail │ None      │ —           │ Not announced (peripheral only) │
  ├──────────────────────┼───────────┼─────────────┼─────────────────────────────────┤
  │ Zone-5 ambient panel │ None      │ —           │ Never announced                 │
  └──────────────────────┴───────────┴─────────────┴─────────────────────────────────┘

  INVARIANT C15.4: Zone-4 and Zone-5 updates never trigger aria-live announcements. High-frequency streaming updates
  (chunk-by-chunk token output) never feed into an aria-live region. Only the terminal state ("Response complete") is
  announced, after streaming ends, via a polite live region.

  System state announcement contract:

  Every named workspace state change that affects the user's ability to act has a declared announcement:

  ┌───────────────────────────┬───────────────────────────────────────────────────────────────────────┬───────────┐
  │       State change        │                           Announcement text                           │   Level   │
  ├───────────────────────────┼───────────────────────────────────────────────────────────────────────┼───────────┤
  │ Session expired           │ "Your session has ended. Please re-upload your document to continue." │ assertive │
  ├───────────────────────────┼───────────────────────────────────────────────────────────────────────┼───────────┤
  │ Background task complete  │ "{Task label} complete. [Result location]"                            │ polite    │
  ├───────────────────────────┼───────────────────────────────────────────────────────────────────────┼───────────┤
  │ Background task failed    │ "{Task label} failed. {Error reason}. [Retry]"                        │ assertive │
  ├───────────────────────────┼───────────────────────────────────────────────────────────────────────┼───────────┤
  │ Connection lost           │ "Connection to KENCE.ai lost. Attempting to reconnect."               │ assertive │
  ├───────────────────────────┼───────────────────────────────────────────────────────────────────────┼───────────┤
  │ Connection restored       │ "Connection restored."                                                │ polite    │
  ├───────────────────────────┼───────────────────────────────────────────────────────────────────────┼───────────┤
  │ Tab restored from archive │ "{Tab title} restored."                                               │ polite    │
  └───────────────────────────┴───────────────────────────────────────────────────────────────────────┴───────────┘

  Announcements are made via a single global aria-live region in the shell root — not via multiple live regions
  scattered across components. The global announcer is a shell-owned singleton that feature teams send messages to,
  never a region they create themselves.

  ---
  Contract Compliance Summary

  ┌───────────────────────┬──────────────────────────────────────┬─────────────────────────────────────────────┐
  │       Contract        │           Compliant today            │              Compliant target               │
  ├───────────────────────┼──────────────────────────────────────┼─────────────────────────────────────────────┤
  │ Store SWO             │ Shadow only (Phase-3 compliant)      │ Phase 4: field-by-field handoff             │
  ├───────────────────────┼──────────────────────────────────────┼─────────────────────────────────────────────┤
  │ Authority boundaries  │ App.jsx holds all authority          │ Phase 4: shell widgets take SWO             │
  ├───────────────────────┼──────────────────────────────────────┼─────────────────────────────────────────────┤
  │ Shell interaction     │ Regions are passive                  │ Phase 4: regions are active, still isolated │
  ├───────────────────────┼──────────────────────────────────────┼─────────────────────────────────────────────┤
  │ Panel lifecycle       │ Not implemented                      │ Phase 4: all panels declare binding         │
  ├───────────────────────┼──────────────────────────────────────┼─────────────────────────────────────────────┤
  │ Tab identity          │ Path-based (non-compliant)           │ Before tab bar activates                    │
  ├───────────────────────┼──────────────────────────────────────┼─────────────────────────────────────────────┤
  │ Orchestration schema  │ scope: null exists                   │ Phase 5: null scope rejected                │
  ├───────────────────────┼──────────────────────────────────────┼─────────────────────────────────────────────┤
  │ Task DAG              │ Not implemented                      │ Phase 5                                     │
  ├───────────────────────┼──────────────────────────────────────┼─────────────────────────────────────────────┤
  │ Realtime adapter      │ No transport                         │ Phase 5                                     │
  ├───────────────────────┼──────────────────────────────────────┼─────────────────────────────────────────────┤
  │ Event normalization   │ No pipeline                          │ Phase 5                                     │
  ├───────────────────────┼──────────────────────────────────────┼─────────────────────────────────────────────┤
  │ Persistence tiers     │ Partial (session tabs only)          │ Phase 4: hydration contract enforced        │
  ├───────────────────────┼──────────────────────────────────────┼─────────────────────────────────────────────┤
  │ GraphRAG state        │ Flat string arrays                   │ Phase 6 migration                           │
  ├───────────────────────┼──────────────────────────────────────┼─────────────────────────────────────────────┤
  │ Multimodal assets     │ Not modeled                          │ Phase 7                                     │
  ├───────────────────────┼──────────────────────────────────────┼─────────────────────────────────────────────┤
  │ AI mode execution     │ Document mode only (inline)          │ Phase 5: all modes declared                 │
  ├───────────────────────┼──────────────────────────────────────┼─────────────────────────────────────────────┤
  │ Cross-session context │ Not implemented                      │ Phase 6                                     │
  ├───────────────────────┼──────────────────────────────────────┼─────────────────────────────────────────────┤
  │ Accessibility         │ ARIA labels exist, focus not managed │ Phase 4: tab bar; Phase 5: full             │
  └───────────────────────┴──────────────────────────────────────┴─────────────────────────────────────────────┘

  Every contract that is "not implemented" is a declared future state. Every contract that is "non-compliant" is a
  declared migration obligation with a named phase.

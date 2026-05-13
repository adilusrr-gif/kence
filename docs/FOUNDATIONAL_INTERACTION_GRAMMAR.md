---
  KENCE.ai — Foundational Interaction Grammar

  The behavioral operating system of the workspace, defined before the dynamic systems are implemented.

  ---
  Governing Principles

  Before the grammar rules, four principles constrain every decision below. If a rule conflicts with a principle, the
  principle wins.

  P1 — User intention is always explicit, never inferred.
  The system never silently changes mode, scope, or context on the user's behalf. When a mode switch is needed, the
  system offers it. The user confirms or declines. Inference produces wrong-mode responses that destroy trust faster
  than asking.

  P2 — Complexity arrives with capability, never before it.
  A shell region does not activate visually until it can deliver functional value. A placeholder that looks like a
  panel but does nothing is worse than no panel. Activation is gated on capability, not on schedule.

  P3 — Workspace state is explicit, not ambient.
  The user always knows what session they are in, what context the AI is operating against, and what tier their work is
   persisted at. These facts are always visible in the chrome, never buried in settings.

  P4 — Interruption is earned, not assumed.
  The system has zero right to interrupt focused work for anything below a data-loss event. Every notification,
  suggestion, and status update must enter through a declared escalation path and stop at the lowest sufficient level.

  ---
  1. AI Interaction Modes

  KENCE.ai has exactly four AI interaction modes. All AI behavior in the platform belongs to one of these modes. Modes
  are never mixed within a single interaction. The active mode is always visible to the user.

  ---
  Mode 1 — Document (Document-scoped Q&A)

  Current implementation: ChatPage RAG pipeline.

  The user asks questions. The AI answers using the content of the currently loaded document. The response is text. The
   conversation is the artifact.

  - Entry trigger: User types in the chat input when a document session is active.
  - Scope indicator: Chip shows the document name (e.g., Contract_Q3.pdf). Never shows "Workspace" or "All sessions."
  - Response format: Prose answer with a confidence indicator and a source citation anchor. The anchor links to the
  document location from which the answer was drawn. A response without a citation is flagged as "inferred, not
  sourced."
  - Latency contract: Responds within the streaming window. The first token appears within 2 seconds or the system
  shows an explicit "thinking" indicator. No silent waiting.
  - Error behavior: If the document session has expired, the system says so immediately in the response area. It does
  not attempt to answer from a stale context and present the result as valid.
  - Exit: The user navigates away, switches tabs, or explicitly closes the session.

  ---
  Mode 2 — Command (Effect-producing orchestration)

  The user issues an instruction that produces a new artifact or modifies workspace state. This mode connects to the
  orchestrationStore intent and execution model.

  The boundary rule: if the output of the interaction is a new file, a new session, a structural change to the
  workspace, or a multi-step pipeline — it is a command. If the output is information — it is Document mode.

  - Entry trigger: User types a / prefix in the command input, selects from a command palette, or uses a toolbar action
   button. Never triggered by natural language alone (P1).
  - Scope indicator: Chip shows the command's target scope — Document, Session, Workspace, or All Sessions. The scope
  is always declared before execution.
  - Response format: Not a chat message. A command produces a result card — a structured output showing: what was
  produced, where it was saved, what tier it persists at (§8), and a primary action button (Open, Download, Review).
  The result card appears in the bottom activity rail on completion, not in the chat thread.
  - Reversibility signal: Commands that are reversible display an "Undo" affordance in the result card for 30 seconds.
  Commands that are irreversible display a confirmation dialog before execution (not after).
  - Error behavior: A failed command produces a persistent Level 2 notification (§14) with the failure reason and a
  retry option. It never silently fails.

  ---
  Mode 3 — Explore (GraphRAG traversal)

  The user navigates a knowledge graph. This mode is non-linear, iterative, and selection-accumulating. It has no
  conversational component. See §10 for the full grammar.

  - Entry trigger: Explicit — from a document selection context menu, from an entity surface in the right panel, or
  from a command ("Map entities in this session"). Never automatic.
  - Scope indicator: Chip shows the graph scope — which session or sessions the graph is drawn from.
  - Response format: Graph visualization, not prose. No text answers are generated in this mode.
  - Exit: Explicit. Returning to document view preserves the traversal state.

  ---
  Mode 4 — Synthesis (Cross-context generation)

  The user requests a structured output that draws from accumulated context — pinned findings, multiple sessions,
  traversal state, or workspace-level knowledge. This mode is only available when the user has pinned at least one item
   to the workspace context.

  - Entry trigger: "Synthesize from context" command. Only active when pinnedContextIds.length > 0. The user sees a
  count badge on the synthesis trigger: "Synthesize (7 items)."
  - Scope indicator: Always Workspace scope. This mode never operates against a single document.
  - Response format: Generates a synthesis artifact — a structured document (not a chat reply) that is saved as a
  Tier-3 persistent asset in the workspace. The artifact has: a title, a summary, a body with claim-level citations,
  and a "Sources" appendix listing every pinned item that contributed.
  - Error behavior: If synthesis fails mid-generation, the partial artifact is saved with a "Incomplete — generation
  failed" watermark. It is not discarded.

  ---
  2. Command vs Conversation Boundaries

  The boundary is declared by output type, confirmed by scope chip, never inferred from phrasing.

  The decision tree:

  User initiates input
  │
  ├─ Starts with "/" or uses command palette → Command Mode
  │
  ├─ Selects entities first, then types → offered Command Mode
  │  (system surfaces: "Use these 3 entities as context? [Chat] [Synthesize]")
  │
  └─ Types free text with no prior selection
     │
     ├─ Active document session exists → Document Mode
     └─ No active document session → system prompts:
        "No document loaded. [Upload a document] or [Search workspace knowledge]"

  The forbidden inference: the system never reads the natural language content of a typed message to determine mode.
  "Generate a presentation" typed into a chat input is treated as a Document Mode question about presentations, not as
  a Command Mode trigger. This is intentional. Automatic intent recognition fails enough of the time to be worse than
  explicit mode selection. Users who want Command Mode must use Command Mode entry triggers.

  The mode chip is authoritative. Whatever the mode chip displays is what the AI will do. If the mode chip shows
  Document — Contract_Q3.pdf and the user types a command-like phrase, the system answers from the document. The user
  must change the mode chip to change the behavior.

  Mode switching requires one explicit action. The user can tap the mode chip to open a mode selector. This is always
  available. Switching mode resets the input field but preserves the previously typed text in a "continue in [mode]"
  state so nothing is lost.

  ---
  3. Ambient AI Behavior Rules

  Ambient AI is Mode-independent. It operates in the background and surfaces suggestions in the right panel without any
   explicit user trigger. It has five binding rules that cannot be overridden by any feature team.

  Rule A1 — Ambient AI never interrupts. Any ambient suggestion surfaces in the right panel only. It never produces a
  toast, a badge on a tab, a modal, or a sound. If the user is not looking at the right panel, the suggestion is
  invisible. This is correct behavior, not a bug.

  Rule A2 — Ambient AI never animates to attract attention. The right panel does not pulse, flash, or slide when a new
  ambient suggestion arrives. The suggestion appears silently. Motion in the right panel is reserved for user-triggered
   actions only.

  Rule A3 — Ambient suggestions have a confidence floor. A suggestion is only surfaced if the ambient model's
  confidence exceeds the workspace-level threshold (default: 0.72). Suggestions below this threshold are discarded
  silently. This threshold is user-configurable per workspace.

  Rule A4 — Dismissed suggestions never return in the same session. When a user dismisses an ambient suggestion (swipes
   it away, clicks ✕), that specific suggestion — identified by its entity ID, topic ID, or evidence ID — does not
  re-surface in the same session. Across sessions, suggestions may return if they are newly computed (not the same
  cached suggestion).

  Rule A5 — Ambient AI declares its basis. Every ambient suggestion shows a compact "Why this?" disclosure: one
  sentence explaining what triggered the suggestion (e.g., "Because you read section 3.2, which references this
  entity"). If the basis cannot be stated, the suggestion is not shown.

  ---
  4. Workspace Attention Hierarchy

  Every surface in the workspace belongs to one of five attention zones. Each zone has a declared attention demand
  level. No surface may behave at a higher demand level than its zone permits.

  Zone 1 — CRITICAL (full attention, blocks all other interaction)
  Zone 2 — ALERT    (persistent presence, requires acknowledgment)
  Zone 3 — NOTICE   (transient, self-dismissing, clickable)
  Zone 4 — ACTIVITY (peripheral awareness, never demands attention)
  Zone 5 — AMBIENT  (discovered, never pushed)

  Zone-to-region mapping:

  ┌──────┬──────────┬─────────────────────────────┬────────────────────────────────────────────┐
  │ Zone │  Level   │        Shell Region         │                  Examples                  │
  ├──────┼──────────┼─────────────────────────────┼────────────────────────────────────────────┤
  │ 1    │ Critical │ Modal overlay (all regions) │ Session expiry, auth failure, data loss    │
  ├──────┼──────────┼─────────────────────────────┼────────────────────────────────────────────┤
  │ 2    │ Alert    │ Below top command bar       │ Task failure, connection lost, parse error │
  ├──────┼──────────┼─────────────────────────────┼────────────────────────────────────────────┤
  │ 3    │ Notice   │ Toast (top-right, 5s)       │ Task complete, document ready              │
  ├──────┼──────────┼─────────────────────────────┼────────────────────────────────────────────┤
  │ 4    │ Activity │ Bottom activity rail        │ Progress, heartbeat, indexing, streaming   │
  ├──────┼──────────┼─────────────────────────────┼────────────────────────────────────────────┤
  │ 5    │ Ambient  │ Right panel                 │ Entity suggestions, related docs, evidence │
  └──────┴──────────┴─────────────────────────────┴────────────────────────────────────────────┘

  Escalation rules:

  - A Zone 5 event never escalates to Zone 4 without a state change (a suggestion completing a background load is not
  an escalation trigger — only a failure or a completion requiring action is).
  - A Zone 4 event escalates to Zone 3 only on terminal state (completion or failure).
  - A Zone 3 event escalates to Zone 2 only if it requires a user action to resolve.
  - A Zone 2 event escalates to Zone 1 only if inaction within 60 seconds causes irreversible data loss.
  - The same event never appears in two zones simultaneously.

  Attention budget rule: At any given moment, the system may have at most: 0 or 1 Zone 1 events, 0 or 1 Zone 2 events,
  0–3 Zone 3 events (queued, not stacked), unlimited Zone 4 and Zone 5 items. If a fourth Zone 3 event arrives while
  three are displayed, it waits in queue. It does not push the others off the screen.

  ---
  5. Tab vs Dock Jurisdiction Rules

  The single governing rule: Tabs contain work. Docks provide tools.

  Work is anything the user authored, produced, or accumulated. Tools are anything the workspace provides to support
  that work.

  Tab jurisdiction — a surface belongs in a tab if:
  - The user authored the content (uploaded document, chat conversation, pinned entity set)
  - Closing the tab makes the content inaccessible
  - The content has its own persistence tier (it can be saved, exported, or resumed)
  - The content has a history (the user cares what version they are on)
  - The content is a workspace session — it has an identity, a start time, and a scope

  Dock/panel jurisdiction — a surface belongs in a dock if:
  - The workspace provides the content (entity inspector, evidence viewer, command history)
  - The content re-computes from the current tab's context (it is always derived, never authored)
  - Closing the dock loses nothing the user cannot regenerate by reopening it
  - The same tool applies to any tab (the tool itself has no session identity)

  Jurisdiction decisions for future systems:

  ┌──────────────────────────────────────┬──────────────┬───────────────────────────────────────────────────────┐
  │               Feature                │ Jurisdiction │                        Reason                         │
  ├──────────────────────────────────────┼──────────────┼───────────────────────────────────────────────────────┤
  │ GraphRAG traversal (saved state)     │ Tab          │ User built it; closing loses the traversal path       │
  ├──────────────────────────────────────┼──────────────┼───────────────────────────────────────────────────────┤
  │ GraphRAG explorer tool               │ Dock         │ Tool applied to current session; re-opens at any time │
  ├──────────────────────────────────────┼──────────────┼───────────────────────────────────────────────────────┤
  │ Analytics dashboard (auto-generated) │ Dock         │ Derived from session data, regenerable                │
  ├──────────────────────────────────────┼──────────────┼───────────────────────────────────────────────────────┤
  │ Analytics dashboard (user-curated)   │ Tab          │ User authored the layout and selections               │
  ├──────────────────────────────────────┼──────────────┼───────────────────────────────────────────────────────┤
  │ Reference document (pinned)          │ Dock panel   │ Not a session; a tool viewport for another asset      │
  ├──────────────────────────────────────┼──────────────┼───────────────────────────────────────────────────────┤
  │ AI conversation                      │ Tab          │ User authored; has history                            │
  ├──────────────────────────────────────┼──────────────┼───────────────────────────────────────────────────────┤
  │ Synthesis artifact                   │ Tab          │ User-produced output; has its own identity            │
  ├──────────────────────────────────────┼──────────────┼───────────────────────────────────────────────────────┤
  │ Entity inspector                     │ Dock         │ Tool; shows current selection; no user authorship     │
  ├──────────────────────────────────────┼──────────────┼───────────────────────────────────────────────────────┤
  │ Session activity feed                │ Dock         │ Derived; regenerable; no authorship                   │
  └──────────────────────────────────────┴──────────────┴───────────────────────────────────────────────────────┘

  The split-workspace rule: When a user needs two tabs side-by-side (two documents, one comparison), the correct model
  is a split canvas within one tab — not two separate tabs. The tab represents the work context (a comparison session);
   the split canvas is a view configuration within that context. Two separate tabs for a comparison session violate
  jurisdiction — each tab implies an independent work context.

  ---
  6. Panel Lifecycle Grammar

  Every panel in the workspace declares one of three binding types at creation. The binding determines its lifecycle
  behavior permanently. A panel cannot change its binding after it is first rendered.

  Binding 1 — Selection-bound
  The panel's content derives from the user's current selection (an entity, a document section, an evidence item, a
  data row). It reacts to selection changes and has no meaningful state when nothing is selected.

  - On selection change: Panel clears its previous content, shows a loading state (skeleton), then renders the new
  content. There is never a moment where old content is visible with new selection active.
  - On selection clear: Panel shows its EmptyState — never stale data, never blank white space.
  - On tab switch: Panel clears immediately. It shows the new tab's selection state, which may be empty.
  - Debounce rule: Rapid selection changes (user clicking through a list) trigger only one panel load — on the final
  selection after 150ms of no change.

  Binding 2 — Session-bound
  The panel's content derives from the active session's accumulated context — pinned entities, conversation summary,
  session assets.

  - On tab switch: Panel transitions to the new tab's session context. The transition uses a cross-fade, not a blank
  flash.
  - On session data update (new pin added, new entity discovered): Panel updates in place without full re-render. Only
  the changed section updates.
  - Staleness signal: If the panel's data source has not updated in 15 minutes while the session has been active, the
  panel header shows a muted "Updated 15m ago" timestamp. At 60 minutes, the timestamp turns warning-colored. The panel
   never automatically refreshes — staleness is signaled, and the user decides whether to refresh.
  - On tab close: Panel state for that session is preserved in the context envelope until the workspace session
  expires. Reopening a closed tab (if implemented) restores the panel to its last state.

  Binding 3 — Workspace-bound
  The panel's content is global — it does not change on tab switch.

  - On tab switch: Panel does not react. Its content is workspace-level, not session-level.
  - Examples: Workspace asset browser, global activity feed, workspace settings.
  - Constraint: Workspace-bound panels must never show content that implies a session scope. If a workspace panel shows
   "3 tasks running," those tasks are workspace-level tasks, not session-level.

  Panel race prevention rule: A panel that receives two update triggers in rapid succession (e.g., tab switch
  immediately followed by entity selection in the new tab) must cancel the first pending load before starting the
  second. The panel always reflects the most recent trigger, never an earlier one that happened to complete later.

  ---
  7. Background Task Interaction Model

  The foundational rule: every AI operation that takes more than 2 seconds is a background task. No AI operation blocks
   the UI.

  This rule applies retroactively to ChatPage.jsx's streaming implementation. Streaming is a background operation
  displayed inline, not a UI-blocking operation. The user can type in other inputs, switch tabs, or navigate while a
  stream is in progress. The stream continues and its result arrives in the originating session when complete.

  Task identity contract:
  Every background task has a stable taskId that persists for the duration of the workspace session. The task ID is the
   same whether the user is looking at the task's originating session or has navigated 5 tabs away. This maps directly
  to taskMetaById in orchestrationStore.

  Task lifecycle states (visible to users):

  queued → running → streaming (if applicable) → complete
                               ↘ failed (with reason)
                               ↘ cancelled (user-triggered)

  User-facing task affordances:

  - Queued: Bottom rail shows a spinner with task label. No canvas interruption.
  - Running: Bottom rail shows a progress indicator if deterministic, a pulse indicator if indeterminate.
  - Streaming: The originating session shows the streaming output inline. If the user is in a different session, the
  originating session tab shows a streaming indicator badge. Clicking the tab navigates to the stream in progress.
  - Complete: Zone 3 notice fires (5 seconds, clickable). Bottom rail logs the completion. The result card appears in
  the originating session.
  - Failed: Zone 2 alert persists. Bottom rail shows the failure. The failed task card in the originating session shows
   the error reason and a retry button.
  - Cancelled: No notification. Task record is removed from the active queue. A "cancelled" entry appears in the
  session history.

  Concurrent task limit: The workspace supports a declared maximum of N concurrent tasks (N is
  workspace-configuration-defined). If a new task is submitted when at capacity, the system does not silently queue it
  — it informs the user: "3 tasks are running. Your task will start when one completes." The user can cancel a running
  task to prioritize the new one.

  ---
  8. Workspace Persistence Semantics

  All content in the workspace belongs to exactly one persistence tier. The tier is always displayed when the content
  carries user work.

  The three tiers:

  Tier 1 — Render (ephemeral):
  Exists only in the current render. Disappears on navigation, tab switch, or reload. No indicator needed — users
  expect render-state to be transient (hover states, animation states, scroll position in progress).

  Tier 2 — Session (backend-lifecycle):
  Exists as long as the backend session is alive (typically hours). Includes: chat conversation messages, streaming
  in-progress state, active document parse state, generated content not yet saved. Visual contract: any Tier-2 surface
  that contains user-authored content displays a "Session only" badge. When that surface is in focus, a passive tooltip
   is available on the badge: "This content will be lost when this session ends. [Save to workspace]."

  Tier 3 — Workspace (user-lifecycle):
  Persists across browser sessions, subject to explicit user deletion. Includes: tab metadata, pinned context,
  synthesis artifacts, workspace layout, entity traversal states the user explicitly saved. Visual contract: Tier-3
  surfaces display an auto-save indicator ("Saved") that transitions to a sync indicator when backend persistence is in
   progress.

  The persistence promise rule:
  The tab bar is a Tier-3 surface. It persists across reloads. Therefore: every tab's visual state must accurately
  reflect the persistence tier of its contents. A tab containing only Tier-2 content must visually differ from a tab
  containing Tier-3 content.

  Tab persistence states (four, each distinct):

  State: Active + Tier-3
  Visual: Normal tab, sync indicator
  Meaning: Session alive, work persisted
  ────────────────────────────────────────
  State: Active + Tier-2
  Visual: Normal tab, "Session only" badge
  Meaning: Session alive, work will be lost on expiry
  ────────────────────────────────────────
  State: Restored (session alive)
  Visual: Normal tab
  Meaning: Navigated away; session still active in background
  ────────────────────────────────────────
  State: Expired
  Visual: Greyed tab, "Reconnect" chip
  Meaning: Backend session ended; document needs re-upload

  An expired tab is never removed automatically. It stays in the tab bar, greyed, with a reconnect affordance. Clicking
   it opens the re-upload flow for that document, pre-filled with the last document name. It does not navigate to an
  empty chat session and pretend the context is intact.

  ---
  9. Cross-Session Intelligence Semantics

  The pin is the unit of cross-session intelligence.

  A pin is an item from any session that the user has explicitly designated as workspace-level context. Pins are
  Tier-3. Pins survive session expiry, browser reload, and workspace switching.

  What can be pinned:
  - A document excerpt (a paragraph, a clause, a finding)
  - A chat answer (the AI's response to a question, with its source citation)
  - An entity from GraphRAG traversal
  - A generated artifact (a synthesis, a slide, a comparison result)
  - A data table row or a chart from an analytics session

  Pinning interaction: Always explicit, always one action. Right-click (or long-press) → "Pin to workspace." The item
  appears in the workspace pin rail (a persistent panel in the right rail, Binding 3 / workspace-bound). The pin count
  is visible in the workspace chrome at all times.

  Cross-session query grammar: A cross-session query is not a chat message. It is a Synthesis command (Mode 4). The
  user must explicitly enter Mode 4 to query across sessions. The scope chip reads "Workspace (N pins)." The user sees
  exactly what context the query will use before submitting it. This is P1 in action: cross-session intelligence is
  never automatic.

  Cross-session context transfer rule: When a user opens a new session (new document), the workspace offers — once,
  passively, in the right panel — "You have 7 pinned items. Include them in this session's context?" The user accepts
  or declines. Declining means the new session starts clean. Accepting means the session's context envelope is
  initialized with the workspace's pinned items. This offer appears once per session, never again, never as an
  interruption.

  The no-surprise rule for cross-session AI: The AI never uses cross-session context without the user's explicit
  awareness. If pinned items are in the context, the scope chip shows it. If only the current document is in context,
  the scope chip shows only that document. Context scope is always visible at the moment of input, not revealed in the
  response.

  ---
  10. GraphRAG Interaction Grammar

  GraphRAG is Mode 3 (Explore). It has a defined five-phase grammar. No feature implementation may add a sixth phase
  without amending this grammar first.

  Phase 1 — Entry (always explicit)

  Two valid entry paths:
  - From document: User selects text → context menu → "Explore entity" → system identifies the entity or asks the user
  to confirm entity disambiguation → graph opens with that entity centered.
  - From command: Mode 2 command "Map [entity] in this session" → graph opens with the entity centered and its
  immediate neighborhood (depth 1).

  The graph opens in the right panel (if width is sufficient for minimum viable graph at 320px) or replaces the canvas
  (if right panel is insufficient). The canvas replacement is a declared workspace state — the tab chrome shows a
  "Graph view" indicator, and there is always a visible "Return to document" anchor.

  Phase 2 — Orientation (always depth-1 start)

  The graph initializes at depth 1: the entry entity plus its immediate neighbors. The user sees: the central entity,
  its relationship labels on the edges, and its neighbor entities as nodes.

  Three orientation controls are always visible:
  - Depth +/−: Expand or contract the visible neighborhood. Maximum declared depth: 4. Beyond depth 4 is a command
  operation (batch analysis), not an interactive traversal.
  - Relationship filter: Checkboxes for relationship types present in the current view (e.g., "Mentions",
  "Contradicts", "References", "Defines"). Unchecking a type collapses those edges.
  - Confidence floor slider: Hides edges below a confidence threshold. Default: 0.6. User-adjustable.

  Phase 3 — Selection (four distinct gestures)

  Gesture: Single click
  Effect: Inspect
  State change: Entity details load in right panel (selection-bound). Node is highlighted. selectedEntityIds unchanged.
  ────────────────────────────────────────
  Gesture: Double click / space
  Effect: Add to context
  State change: Entity added to selectedEntityIds. Node shows a context ring indicator.
  ────────────────────────────────────────
  Gesture: Ctrl + click
  Effect: Multi-select
  State change: Multiple entities added to selectedEntityIds.
  ────────────────────────────────────────
  Gesture: Right-click → Pin
  Effect: Pin to workspace
  State change: Entity added to pinnedContextIds (Tier-3). Persists after session ends.

  Escape key at any time clears the visual highlight but does not remove entities from selectedEntityIds. Clearing
  selectedEntityIds requires an explicit "Clear context" button, separate from Escape.

  Phase 4 — Synthesis trigger (gated)

  The "Synthesize from graph context" button is visible at all times in the graph view header but is active only when
  selectedEntityIds.length > 0. When zero entities are selected, the button is disabled with a tooltip: "Select
  entities to synthesize from."

  Clicking the active button transitions to Mode 4 (Synthesis). The graph view collapses. The synthesis command is
  pre-populated with the selected entity IDs as context. The user sees a "Synthesizing from [N] entities" scope
  indicator before the synthesis begins. They can cancel at this confirmation step.

  Phase 5 — Exit (state-preserving)

  "Return to document" is always accessible. Clicking it:
  1. Collapses the graph view to the right panel (or closes the canvas replacement view)
  2. Returns the canvas to the document view
  3. Preserves the traversal state in the session's context envelope — selectedEntityIds, depth, relationship filter
  settings, and viewport position are all retained

  The user can re-enter the graph at any time and find it exactly where they left it. The traversal is not a transient
  view — it is a session-persistent state. The tab chrome shows a "Graph context active" indicator when
  selectedEntityIds.length > 0, so the user always knows they have an accumulated traversal even when not looking at
  the graph.

  ---
  11. Multimodal Navigation Semantics

  A multimodal session holds multiple asset types. Navigation within a multimodal session follows a declared
  three-level hierarchy.

  Level 1 — Workspace navigation (between sessions): Tab bar. Each tab is a session. Tab switching is the coarsest
  navigation gesture.

  Level 2 — Session navigation (between assets within a session): Asset rail. The asset rail lives in the left rail
  below the workspace navigation. It shows all assets in the current session — each asset as a typed thumbnail:
  - Documents: page 1 thumbnail with page count
  - Videos: duration chip with a chapter count
  - Data tables: column count and row count
  - Generated artifacts: output type icon with creation timestamp

  Clicking an asset in the rail loads it into the canvas. The canvas shows one primary asset at a time. A "split"
  button on any asset opens a split-canvas view (primary asset left, selected asset right). Maximum two assets in split
   view. No three-way split.

  Level 3 — Asset navigation (within a single asset):
  - Documents: page thumbnails in a bottom strip, or a table of contents panel
  - Videos: chapter markers on a timeline scrubber
  - Data tables: filter/sort controls in a toolbar
  - Graph traversals: depth controls and relationship filters (see §10)

  Cross-asset linking semantics:

  A link between two assets in the same session (document page 12 ↔ video timestamp 14:30) is a first-class object —
  not a user note, but a system-recognized connection. Links are created explicitly: select content in Asset A →
  right-click → "Link to..." → select target in Asset B. Links are bidirectional and navigable.

  Following a cross-asset link does not replace the current asset view — it opens the target asset in split view
  alongside the source, with the target scrolled to the linked position. The user sees both sides of the link
  simultaneously. Closing the split returns to the source asset.

  Asset type indicator in the tab chrome:
  Every tab shows a compact asset composition badge: icons representing each asset type in the session (📄 PDF, 🎬
  Video, 📊 Table, 🧠 Graph). A session with one PDF shows one icon. A session with PDF + Video + Table shows three
  icons. This gives the user immediate session composition awareness from the tab bar without clicking.

  ---
  12. Enterprise Analyst Workflow Grammar

  The enterprise analyst workflow has four named phases. The workspace must support each phase without requiring a page
   navigation between them. The entire workflow lives within one session (or spans multiple sessions connected by
  pinned context).

  Phase 1 — Ingest

  The analyst loads assets into a session. Multiple documents, recordings, or data files can be added to one session.
  The session does not begin until at least one asset is loaded and parsed. During parsing, the canvas shows a
  structured progress view: "Parsing: 45%", "Building vector index: 78%", "Ready." Not a spinner. Not a blank screen.

  After ingest, the system performs a passive ambient action: it identifies the session's primary entities, document
  type, and domain, and pre-populates the right panel with an "About this session" card — a 3-sentence summary plus the
   top 5 entities discovered. The analyst can dismiss this. It is Zone 5 ambient, not an interruption.

  Phase 2 — Explore

  The analyst uses Document mode (RAG Q&A) and Explore mode (GraphRAG) to investigate the session's content. Findings
  are ephemeral (Tier 1) until explicitly acted upon.

  The pin action is the analyst's primary productivity gesture. At any point during exploration, the analyst pins a
  finding. The keyboard shortcut for "Pin current answer to workspace" is always declared in the command bar tooltip
  and is the same key combination across all modes. Pinning is the bridge from Tier-1 exploration to Tier-3
  accumulation.

  Phase 3 — Accumulate

  The analyst's workspace pin rail grows as they explore multiple sessions. The pin rail is always visible in the right
   panel (Binding 3, workspace-bound). It shows: what was pinned, from which session, when, and the confidence score of
   the source answer.

  The analyst can organize pins: drag to reorder, add labels, group by theme. Grouping is explicit — the analyst
  creates a group manually. The system never auto-groups. Groups become the structure of the eventual synthesis.

  Phase 4 — Synthesize and output

  When the analyst is ready, they invoke Mode 4 (Synthesis). The scope is "Workspace — [N] pins." They can further
  refine: "Synthesize only the pins in Group: Penalty Clauses." The synthesis produces a Tier-3 artifact. The artifact
  appears as a new tab (it is user-authored output; it belongs in a tab per §5).

  The synthesis artifact includes, for every claim: the source session, the source document, the source page/timestamp,
   and the confidence of the source answer. Claims without traceable sources are marked "synthesized — no direct
  source." The analyst can click any citation to navigate to the exact source location in the originating session.

  ---
  13. Executive and Simple-User Workflow Grammar

  The executive workflow is a separate mode of workspace presentation, not a different product. The same backend, same
  sessions, same AI — but a different surface layer that suppresses complexity the executive did not ask for.

  Executive entry contract:
  When a user's role is executive (or the user explicitly selects "Simple mode" in workspace settings), the workspace
  activates with:
  - Left rail collapsed (shows only icons, no labels)
  - Tab bar hidden (single-session workspace; no tab management)
  - Right panel hidden (no entity inspector or evidence viewer)
  - Bottom activity rail hidden (no task queue visibility)
  - Canvas: full-width, full-height
  - Top command bar: simplified — shows only the document name and a single "Ask" input

  This is the same AppShellLayout with all regions except the canvas at zero width. No architectural change — a
  configuration of the existing shell.

  The executive workflow has three steps, always:

  1. Load: Drag or paste a document into the canvas (or use a recent document from the "Recents" strip below the
  command bar). The canvas shows a simple progress indicator. When done, the canvas shows the document.
  2. Ask: The command bar input shows placeholder: "Ask anything about this document." The user types. Mode is always
  Document mode in executive view. There is no mode chip, no scope selector.
  3. Receive: The answer appears below the document (or in a split view). The answer includes a "Read more" anchor to
  the source section. A "Save this answer" button promotes the answer to a pinned workspace item (making it Tier-3). If
   not saved, the answer is Tier-2 (session only).

  The complexity transition offer (appears once per session):
  If the executive asks a question that the system determines would benefit from GraphRAG (because the answer involves
  multiple entities with complex relationships), the system surfaces a passive right-panel card: "This topic has a rich
   entity network. Explore it? [View graph]." Clicking opens the full workspace — left rail expands, all panels
  activate. Declining keeps the executive view. This offer appears once per session per trigger. It is Zone 5 ambient —
   never an interruption.

  The "I need more" escape hatch:
  A persistent but minimal "Switch to full workspace" link lives at the bottom of the canvas in executive mode. One
  click, no confirmation, no tutorial. The full workspace opens with the current session preserved.

  ---
  14. Interruption and Notification Priority System

  The five-level system from §4 is here specified as a behavioral contract with quantified rules.

  Level 1 — Blocker (modal)
  - Trigger conditions: session about to expire with unsaved Tier-2 content (user has 60 seconds to save or extend),
  authentication token invalid, catastrophic data loss imminent.
  - Appearance: full-screen modal overlay, semi-transparent, non-dismissible without action.
  - Dismissal: requires a named action button ("Save and extend session", "Re-authenticate", "Discard and continue").
  Never an X button.
  - Maximum: one active at a time. A second Level-1 event waits until the first is resolved.
  - Duration: until user action.

  Level 2 — Alert (persistent banner)
  - Trigger conditions: background task failed, document parse error, WebSocket connection lost, backend error on a
  user-triggered action.
  - Appearance: sticky banner below the top command bar. Does not push content down — overlays the top of the canvas by
   48px.
  - Dismissal: explicit "Dismiss" button. For actionable alerts (task failed → retry available), the dismiss button is
  secondary to the action button.
  - Maximum: one active at a time. A second Level-2 alert replaces the first only if it is higher severity (connection
  lost replaces "task failed"). Otherwise, it queues.
  - Duration: until dismissed.

  Level 3 — Notice (toast)
  - Trigger conditions: background task completed successfully, document parsing complete, translation ready, synthesis
   artifact saved.
  - Appearance: bottom-right toast, 280px wide, 5-second auto-dismiss timer shown as a progress bar on the toast
  border.
  - Dismissal: auto-dismisses after 5 seconds, or immediate on click (click navigates to the relevant
  session/artifact).
  - Maximum: three toasts stacked simultaneously. A fourth queues and appears as the stack clears.
  - Duration: 5 seconds (auto).

  Level 4 — Activity (bottom rail)
  - Trigger conditions: any background task in queued, running, or streaming state.
  - Appearance: activity rail shows a compact task list — task label, status indicator, elapsed time. Updates in place.
  - Dismissal: not dismissible while running. Completed/failed items clear from the active list after 30 seconds, move
  to the activity history log.
  - Demand: zero. The bottom rail never pulses, flashes, or animates to attract attention.

  Level 5 — Ambient (right panel)
  - Trigger conditions: ambient AI confidence threshold exceeded, new entity discovered in the current session, related
   document found in workspace context.
  - Appearance: silent update to right panel content. No animation.
  - Dismissal: swipe or ✕ on the suggestion card. Dismissed suggestions obey Rule A4 (never return in the same
  session).
  - Demand: zero.

  The notification tax rule: Every 30 minutes of active workspace use, the system calculates its notification
  frequency. If Level 3 notices have averaged more than 4 per hour, it batches subsequent Level 3 notices into a
  summary notice: "3 tasks completed — [View]." This prevents notification fatigue from high-throughput orchestration
  sessions.

  ---
  15. Long-Session Fatigue Mitigation Model

  Long sessions (4+ hours of continuous workspace use) degrade UX in predictable ways. The grammar defines three
  mitigation mechanisms, each operating at a different scope.

  Mechanism 1 — Context refresh (AI conversation scope)

  After 60 messages in a single Document mode conversation, the AI's context window accumulates significant irrelevant
  history. The system detects this condition and surfaces a Zone-5 ambient card in the right panel: "Your conversation
  has 60+ messages. Start a focused context? [Keep history] [Fresh context]."

  "Fresh context" starts a new conversation window within the same session — the document and pinned entities remain,
  but the conversation history is not sent to the model. The previous conversation is archived in the session's history
   and accessible via a "Conversation history" tab within the chat panel. Nothing is deleted.

  "Keep history" dismisses the suggestion permanently for that session. The suggestion never appears again in that
  session regardless of message count.

  Mechanism 2 — Session summary on demand (session scope)

  At any point, the user can issue a Mode 2 command: "Summarize this session." This produces a structured Tier-3
  artifact:
  - What assets were in the session
  - What questions were asked (grouped by topic, not listed one by one)
  - What answers were pinned
  - What entities were added to the traversal context
  - What artifacts were generated
  - Duration and activity metrics

  This artifact is not a chat message. It is a document-type artifact that opens in a new tab. The user can edit it,
  export it, or pin sections from it. It becomes the "memory" of the session — usable in future sessions via Mode 4
  Synthesis.

  Mechanism 3 — Workspace hygiene (workspace scope)

  After 4 hours of cumulative workspace activity (not a single session — cumulative across the workspace lifetime), the
   system evaluates tab health:
  - Tabs with no activity in the last 2 hours are candidates for archiving
  - Tabs whose backend sessions have expired are candidates for dismissal

  The system surfaces a Zone-5 ambient card: "You have 8 tabs inactive for 2+ hours. Archive them? [Review] [Archive
  all inactive]." "Review" opens a panel listing the inactive tabs with their last activity time. The user selects
  which to archive. "Archive" does not close — it moves the tab to an "Archived" section accessible from the tab bar
  overflow, preserving all Tier-3 content associated with that session.

  Panel staleness is addressed by Mechanism 3 indirectly: when a session is archived, its session-bound panels clear.
  When the user returns to an active session that has been in the background for 2+ hours, any session-bound panel
  shows a "last updated X ago" timestamp that has turned warning-colored (per §6). The user sees the staleness signal
  and can request a refresh explicitly.

  ---
  Grammar Reference Summary

  ┌───────────────────────┬────────────────────────────────────────────────────────────────────┐
  │        Concept        │                                Rule                                │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ AI mode selection     │ Explicit, never inferred from phrasing (P1)                        │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Mode indicator        │ Always visible before and during interaction                       │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Cross-session query   │ Mode 4 only, user must have pinnedContextIds.length > 0            │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Ambient AI            │ Zone 5 only, no animation, no escalation without state change      │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Tab jurisdiction      │ User-authored work with persistent identity                        │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Dock jurisdiction     │ Workspace-provided tools, always re-derivable                      │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Panel binding         │ Declared at creation (selection / session / workspace) — immutable │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Panel staleness       │ Signaled at 15 min, warning at 60 min — never silent               │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Panel race            │ Always cancel prior pending load before starting new one           │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Background tasks      │ Every operation > 2s is a named task with a stable taskId          │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Task failure          │ Always Level 2 alert — never silent                                │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Persistence tier      │ Always visible on surfaces with user-authored content              │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Expired tabs          │ Never auto-removed, always show reconnect affordance               │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Pin                   │ The unit of cross-session intelligence — always explicit           │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ GraphRAG entry        │ Always explicit — never automatic                                  │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ GraphRAG exit         │ Always state-preserving                                            │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Notification cap      │ Max 1 Level-1, 1 Level-2, 3 Level-3 simultaneously                 │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Notification batching │ Level-3 batched if frequency > 4/hour                              │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Context refresh offer │ Once per session, Zone 5, after 60 messages                        │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Session summary       │ On-demand command, produces Tier-3 artifact                        │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Executive mode        │ Same shell, zero-configuration presentation layer                  │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────┤
  │ Complexity transition │ One offer per session, Zone 5, never an interruption               │
  └───────────────────────┴────────────────────────────────────────────────────────────────────┘

  ---
  This grammar is the contract. Every future feature team builds against it. When a feature team encounters a scenario
  not covered by the grammar, they do not invent a local rule — they propose an amendment to the grammar, which is
  reviewed against the four governing principles before adoption. The grammar evolves, but always through a declared
  process, never through individual feature decisions that collectively drift the system toward inconsistency.
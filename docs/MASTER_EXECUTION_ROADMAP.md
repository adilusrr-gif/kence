 KENCE.ai must evolve in a controlled sequence from “advanced AI document MVP” into an AI-native enterprise
  intelligence workspace OS without breaking the product during migration. The roadmap must preserve momentum, maintain
  demoability, and avoid architecture collapse from premature complexity.

  This roadmap unifies:

  - frontend architecture
  - shell architecture
  - UX system
  - intelligence layer
  - event system
  - state system
  - design system
  - multimodal direction
  - future GraphRAG
  - future agents
  - analytics system

  ———

  # 1. Execution Principles

  ## Core rules

  1. Shell-first, not page-first
  2. State-first before feature rewrites
  3. Intelligence objects before graph/agents
  4. Event-driven semantics before realtime complexity
  5. Incremental coexistence over big-bang rewrites
  6. Design system before UX scaling
  7. GraphRAG and agents only after workspace intelligence is stable

  ## What to build first

  - design system
  - store architecture
  - shell runtime
  - workspace session model
  - activity/event surface
  - dashboard and chat workspace

  ## What must not be done too early

  - free-form docking desktop manager
  - full GraphRAG UX
  - multi-agent orchestration UX
  - multimodal UI explosion
  - advanced analytics builder
  - deep backend-dependent abstractions before shell and state stabilize

  ## What can be simplified temporarily

  - graph visualization can start read-only/minimal
  - realtime can start as SSE + synthetic frontend events
  - analytics can start with extracted KPI cards, not full builder
  - multimodal can start as intelligence-aware asset zones without full reasoning UI
  - agent UI can start as task timeline + execution cards

  ———

  # 2. Macro Roadmap Structure

  1. Foundation
  2. Frontend OS
  3. Intelligence Layer
  4. Analytics
  5. Multimodal
  6. GraphRAG
  7. Agentic AI
  8. Enterprise Infrastructure

  ———

  # 3. Full Order Of Implementation

  ## Phase 0. Architectural Guardrails

  Objective
  Freeze target structure, naming, store boundaries, shell boundaries, and migration rules.

  Deliverables

  - master folder strategy
  - coding boundaries
  - route coexistence strategy
  - migration rules
  - architecture acceptance checklist

  Dependencies

  - none

  Blockers

  - unclear ownership between current and future code

  Success criteria

  - all future phases can reference stable architecture rules

  Rollback

  - none required

  Complexity

  - low

  Risk

  - low

  ———

  ## Phase 1. Design System Foundation

  Objective
  Create shared UI system, tokens, themes, surfaces, motion, accessibility baseline.

  Deliverables

  - token architecture
  - theme system
  - shell-grade primitives
  - layered CSS/Tailwind strategy
  - responsive and accessibility baseline

  Dependencies

  - Phase 0

  Blockers

  - current monolithic CSS collisions

  Success criteria

  - new shell/UI can be built without legacy CSS coupling

  Rollback

  - legacy styles remain intact

  Complexity

  - medium

  Risk

  - medium

  ———

  ## Phase 2. State System Foundation

  Objective
  Introduce Zustand store architecture and normalized ownership boundaries.

  Deliverables

  - auth, shell, workspace, tabs, dock, command, realtime, context, orchestration stores
  - normalized domain stores
  - persistence rules
  - selector architecture

  Dependencies

  - Phase 1

  Blockers

  - duplicated state in App.jsx and page props

  Success criteria

  - shell/runtime state no longer requires prop drilling

  Rollback

  - legacy pages continue using props while stores act as read-through mirrors

  Complexity

  - high

  Risk

  - high

  ———

  ## Phase 3. Frontend OS Shell Runtime

  Objective
  Build persistent shell runtime and wrap legacy pages inside it.

  Deliverables

  - AppShellLayout
  - WorkspaceShellLayout
  - ShellFrame
  - LeftRail
  - TopCommandBar
  - RightIntelligencePanel
  - BottomActivityRail
  - WorkspaceTabsBar
  - DockHost
  - shell hydration and restoration lifecycle
  - shell routing boundaries

  Dependencies

  - Phase 2

  Blockers

  - route/session synchronization
  - legacy coexistence complexity

  Success criteria

  - product runs inside a persistent shell while old pages still work

  Rollback

  - route switch back to legacy App composition if needed

  Complexity

  - very high

  Risk

  - high

  ———

  ## Phase 4. UX Simplification Layer

  Objective
  Apply deceptively simple UX system on top of shell foundation.

  Deliverables

  - mode-based complexity system
  - novice/professional/analyst/executive UX presets
  - onboarding flows
  - empty states
  - contextual help
  - smart defaults
  - copiloting prompts
  - confidence-building and recovery UX

  Dependencies

  - Phase 3
  - Phase 1 design system

  Blockers

  - shell not stable enough to host progressive disclosure

  Success criteria

  - system feels simpler without removing architecture depth

  Rollback

  - fallback to neutral professional mode as global default

  Complexity

  - medium-high

  Risk

  - medium

  ———

  ## Phase 5. Event-Driven Frontend Layer

  Objective
  Make shell runtime and intelligence surfaces event-driven.

  Deliverables

  - event normalization
  - event ingestion bridge
  - task lifecycle model
  - activity rail real event semantics
  - frontend event taxonomy aligned with backend evolution
  - synthetic event fallback for missing backend streams

  Dependencies

  - Phase 2
  - Phase 3

  Blockers

  - inconsistent current async behaviors

  Success criteria

  - tasks, streams, and state updates flow through event semantics

  Rollback

  - fallback to request/response state transitions

  Complexity

  - high

  Risk

  - high

  ———

  ## Phase 6. Dashboard And Workspace Entry

  Objective
  Replace landing-style authenticated UX with operational dashboard and workspace entry.

  Deliverables

  - dashboard page
  - recent workspaces
  - active jobs
  - recommended actions
  - intelligence summaries
  - workspace creation/open flow

  Dependencies

  - Phase 3
  - Phase 4
  - Phase 5

  Blockers

  - insufficient shell/context fidelity

  Success criteria

  - authenticated home feels like command center, not marketing page

  Rollback

  - route / can temporarily fallback to current home

  Complexity

  - medium

  Risk

  - medium

  ———

  ## Phase 7. Chat Workspace Rewrite

  Objective
  Make chat the first true native workspace.

  Deliverables

  - chat canvas
  - document context panel
  - evidence-aware answers
  - action recommendations
  - task-driven streaming UX
  - workspace session persistence for chat

  Dependencies

  - Phases 2-6

  Blockers

  - streaming integration and session continuity

  Success criteria

  - chat becomes the central AI workspace, not a standalone page

  Rollback

  - legacy chat page remains available under fallback route

  Complexity

  - high

  Risk

  - high

  ———

  ## Phase 8. Intelligence Layer Foundation

  Objective
  Introduce normalized intelligence objects and intelligence rendering architecture.

  Deliverables

  - insight, risk, entity, relationship, evidence, timeline, metric, provenance, task-execution models
  - intelligence selectors
  - intelligence panel architecture
  - provenance viewer
  - evidence navigator
  - insight feed

  Dependencies

  - Phase 5
  - Phase 7

  Blockers

  - no stable event/task semantics
  - no session context binding

  Success criteria

  - AI outputs are structured, inspectable, and reusable across workspaces

  Rollback

  - keep summary-only fallback views while intelligence objects stay internal

  Complexity

  - very high

  Risk

  - very high

  ———

  ## Phase 9. Comparison Workspace Rewrite

  Objective
  Build compare as first cross-document intelligence workspace.

  Deliverables

  - native compare canvas
  - semantic/technical/exact compare surfaces
  - cross-document evidence links
  - contradiction insights
  - delta metrics
  - compare-linked provenance

  Dependencies

  - Phase 8

  Blockers

  - cross-document intelligence selectors

  Success criteria

  - compare becomes intelligence workflow, not tool page

  Rollback

  - legacy compare stays available

  Complexity

  - high

  Risk

  - medium-high

  ———

  ## Phase 10. Presentation Studio Rewrite

  Objective
  Build presentation generation as artifact studio with lineage.

  Deliverables

  - presentation studio
  - slide structure explorer
  - artifact intelligence lineage
  - generation status UX
  - export handling

  Dependencies

  - Phase 8

  Blockers

  - artifact/provenance model immaturity

  Success criteria

  - generated outputs feel connected to evidence and insights

  Rollback

  - legacy presentation page stays available

  Complexity

  - medium-high

  Risk

  - medium

  ———

  ## Phase 11. Analytics Foundation

  Objective
  Create first analytics object layer and executive/analyst surfaces.

  Deliverables

  - metrics model rendering
  - KPI cards
  - timeline intelligence views
  - cross-document summary panels
  - dashboard intelligence blocks

  Dependencies

  - Phase 8
  - Phase 9

  Blockers

  - metric extraction quality
  - cross-document modeling

  Success criteria

  - analytics exists as intelligence surface, not just charts

  Rollback

  - metrics can remain read-only and lightweight

  Complexity

  - high

  Risk

  - medium-high

  ———

  ## Phase 12. Multimodal Workspace Foundation

  Objective
  Add multimodal zones without redesigning shell.

  Deliverables

  - multimodal asset typing
  - evidence types for image region/table cell/slide region
  - canvas zone presets
  - visual/document/data hybrid contexts

  Dependencies

  - Phase 8
  - Phase 11

  Blockers

  - evidence schema needs to be mature

  Success criteria

  - shell can host non-text-first intelligence workflows

  Rollback

  - multimodal assets remain passive attachments until fully active

  Complexity

  - high

  Risk

  - medium-high

  ———

  ## Phase 13. Knowledge Graph Foundation

  Objective
  Turn entities/relationships into graph-native workspace mode.

  Deliverables

  - graph explorer mode
  - graph selectors
  - entity/relationship inspectors
  - graph overlays for insights/risks
  - graph-driven pivots into evidence and documents

  Dependencies

  - Phase 8

  Blockers

  - entity normalization quality
  - relationship confidence quality

  Success criteria

  - graph mode is usable as alternate reasoning surface

  Rollback

  - graph can remain read-only exploration mode

  Complexity

  - high

  Risk

  - high

  ———

  ## Phase 14. GraphRAG UX Layer

  Objective
  Integrate graph-aware retrieval and reasoning into frontend UX.

  Deliverables

  - graph neighborhood context scope
  - graph-linked provenance stages
  - graph path evidence views
  - graph-aware recommendations

  Dependencies

  - Phase 13
  - backend GraphRAG readiness

  Blockers

  - backend GraphRAG maturity
  - path explanation quality

  Success criteria

  - user can understand graph-assisted intelligence without seeing system internals

  Rollback

  - graph remains visual exploration only

  Complexity

  - very high

  Risk

  - very high

  ———

  ## Phase 15. Agentic AI Foundation

  Objective
  Introduce agent execution UX as task/workspace layer.

  Deliverables

  - agent session type
  - multi-step execution cards
  - agent timeline in activity rail
  - agent-generated artifact lineage
  - agent workspace mode basics

  Dependencies

  - Phase 5
  - Phase 8
  - Phase 13

  Blockers

  - orchestration semantics
  - task execution tracing quality

  Success criteria

  - agents feel like supervised coworkers, not hidden automation

  Rollback

  - agents can remain backend-only surfaced as tasks

  Complexity

  - very high

  Risk

  - very high

  ———

  ## Phase 16. Enterprise Infrastructure Hardening

  Objective
  Make system production-grade for enterprise expectations.

  Deliverables

  - performance budgets
  - observability hooks
  - memory cleanup discipline
  - error boundaries refinement
  - permission-aware UX
  - long-session stability
  - audit-friendly event visibility
  - offline/degraded handling patterns

  Dependencies

  - all prior phases as needed

  Blockers

  - unstable feature surface
  - unresolved technical debt

  Success criteria

  - shell and intelligence system survive prolonged use, large workspaces, and enterprise demos

  Rollback

  - not a rollback phase; hardening and stabilization

  Complexity

  - high

  Risk

  - medium

  ———

  # 4. Dependency Graph

  ## Strong dependency chain

  Phase 1 -> Phase 2 -> Phase 3 -> Phase 5 -> Phase 7 -> Phase 8 -> Phase 9/10/11 -> Phase 12/13 -> Phase 14/15 -> Phase
  16

  ## Parallelizable zones

  - Phase 4 UX simplification can begin after Phase 3 baseline
  - Phase 10 Presentation can progress parallel to Phase 9 Compare after Phase 8
  - Phase 11 Analytics can overlap late Phase 10
  - Phase 12 Multimodal can start once evidence schema is stable
  - Phase 16 hardening starts partially from Phase 8 onward, but intensifies at end

  ———

  # 5. Critical Path

  1. Design system
  2. Zustand store system
  3. App shell runtime
  4. Event-driven frontend layer
  5. Native chat workspace
  6. Intelligence object layer
  7. Cross-document intelligence
  8. Graph foundation
  9. Enterprise hardening

  If this path slips, the whole AI-native workspace vision slips.

  ———

  # 6. High-Risk Zones

  ## Highest risk

  - state migration from App.jsx prop ownership
  - shell/route/session synchronization
  - event semantics without full backend parity
  - intelligence normalization quality
  - provenance UX without overwhelming users
  - graph integration before intelligence model matures
  - agent UX before task execution trace is reliable

  ## Medium-high risk

  - CSS coexistence during shell rollout
  - session restoration correctness
  - compare cross-document selectors
  - performance under many events and intelligence objects

  ———

  # 7. Migration Strategy

  ## General pattern

  - coexistence -> shadow state -> route-by-route replacement -> convergence

  ## Rules

  - keep legacy pages functional inside shell first
  - add stores before removing props
  - introduce new widgets before replacing pages
  - route new workspaces separately before promoting them
  - preserve backend contracts and API semantics
  - prefer adapters over rewrites at integration points

  ## Safe migration layers

  1. design tokens coexist with legacy CSS
  2. stores coexist with local page state
  3. shell wraps legacy pages
  4. native workspaces replace legacy pages gradually
  5. intelligence layer augments outputs before fully structuring them

  ———

  # 8. Refactor Safety Strategy

  - never refactor shell, state, and domain pages all at once
  - every phase must have a fallback route or legacy view
  - preserve old behavior behind feature flags or alternate routes
  - move ownership gradually:
      - read from old + new
      - write to old + new if needed
      - cut old source only after parity
  - freeze stable contracts before building dependent layers

  ———

  # 9. Incremental Delivery Strategy

  ## Delivery unit types

  - shell milestone
  - workspace milestone
  - intelligence milestone
  - analytics milestone
  - infrastructure milestone

  ## Every increment should deliver

  - visible UX gain
  - retained backward compatibility
  - measurable architecture progress
  - no major regression in demoability

  ———

  # 10. MVP Checkpoints

  ## MVP Checkpoint A

  - Phase 3 complete
  - shell wraps legacy product
  - tabs + command bar + rails visible

  ## MVP Checkpoint B

  - Phase 7 complete
  - native chat workspace operational
  - session persistence works

  ## MVP Checkpoint C

  - Phase 8 baseline complete
  - structured insights/evidence/provenance visible

  These checkpoints transform product from tool set into workspace OS candidate.

  ———

  # 11. Demo-Ready Checkpoints

  ## Demo Checkpoint 1

  - shell + dashboard + native chat
  - simple guided UX
  - working upload -> ask -> explain flow

  ## Demo Checkpoint 2

  - intelligence layer visible
  - evidence and provenance visible
  - activity rail shows live AI behavior

  ## Demo Checkpoint 3

  - compare workspace + presentation studio
  - exportable artifact flow
  - executive summary demo path

  ———

  # 12. Investor-Demo Checkpoints

  Investor demo should show vision arc, not backend complexity.

  ## Investor Checkpoint 1

  - AI workspace shell
  - natural language workflows
  - live status/activity
  - summary + evidence

  ## Investor Checkpoint 2

  - structured intelligence
  - risk detection
  - KPI extraction
  - executive-ready outputs

  ## Investor Checkpoint 3

  - graph mode preview
  - multimodal readiness
  - agent timeline preview
  - enterprise architecture story without UX intimidation

  ———

  # 13. Enterprise Readiness Checkpoints

  ## Enterprise Readiness 1

  - shell stability
  - persistent sessions
  - recoverable workflows
  - permissions-safe navigation

  ## Enterprise Readiness 2

  - intelligence provenance
  - explainability
  - event visibility
  - long-session reliability

  ## Enterprise Readiness 3

  - graph and analytics maturity
  - hardening
  - performance budgets
  - operational observability hooks

  ———

  # 14. Performance Milestones

  ## Milestone P1

  After Phase 3:

  - shell regions rerender independently
  - no full-shell rerender on chat stream

  ## Milestone P2

  After Phase 8:

  - intelligence lists bounded and selector-driven
  - panel updates localized

  ## Milestone P3

  After Phase 13:

  - graph rendering remains interactive under realistic entity counts

  ## Milestone P4

  After Phase 16:

  - prolonged session usage does not cause memory drift or UI degradation

  ———

  # 15. UX Milestones

  ## UX Milestone U1

  After Phase 4:

  - novice-safe shell navigation
  - clear empty states
  - onboarding and guidance

  ## UX Milestone U2

  After Phase 7:

  - natural language-first workspace feels intuitive

  ## UX Milestone U3

  After Phase 8:

  - intelligence feels understandable, not scary

  ## UX Milestone U4

  After Phase 11:

  - executives can consume outputs without analyst training

  ———

  # 16. AI Capability Milestones

  ## AI Milestone A1

  - document Q&A and generation stabilized in shell

  ## AI Milestone A2

  - structured intelligence: insights, risks, entities, evidence

  ## AI Milestone A3

  - cross-document reasoning and compare intelligence

  ## AI Milestone A4

  - metric and timeline intelligence

  ## AI Milestone A5

  - graph-linked reasoning

  ## AI Milestone A6

  - agent-assisted workflows

  ———

  # 17. Infrastructure Milestones

  ## Infra I1

  - state system and persistence stable

  ## Infra I2

  - event-driven frontend semantics stable

  ## Infra I3

  - realtime transport abstraction stable

  ## Infra I4

  - workspace restoration and cleanup reliable

  ## Infra I5

  - enterprise hardening and observability complete

  ———

  # 18. What Should Be Frozen / Stable

  ## Freeze early

  - shared UI primitive contracts
  - token and theme architecture
  - store boundaries
  - workspace session model
  - shell routing boundaries
  - event naming strategy
  - intelligence object base schemas

  ## Freeze later

  - graph render contracts
  - provenance viewer contracts
  - artifact lineage contracts

  ———

  # 19. What Should Stay Experimental

  - UX complexity adaptation heuristics
  - recommendation ranking logic
  - graph overlays
  - multimodal evidence rendering
  - agent workspace behavior
  - advanced command simplification heuristics
  - docking richness beyond fixed zones

  ———

  # 20. Likely Technical Debt Zones

  - legacy CSS coexistence
  - temporary dual state ownership in old pages
  - adapter layers around current api.js
  - synthetic event generation before backend parity
  - route aliases during coexistence
  - partial duplication of session semantics between legacy compare and workspace sessions

  ———

  # 21. Future Scalability Bottlenecks

  - monolithic selectors joining too much intelligence at once
  - unbounded event caches
  - large graph render trees
  - artifact preview memory usage
  - mixed ownership between orchestration and intelligence
  - overcoupling command bar to backend capabilities too early

  ———

  # 22. Required Abstraction Boundaries

  1. Design System Boundary
     shared UI must stay domain-agnostic
  2. State Boundary
     one concern per store
  3. Shell Boundary
     shell owns runtime, not domain payloads
  4. Workspace Boundary
     session context owns refs, not heavy object copies
  5. Intelligence Boundary
     intelligence objects are first-class and normalized
  6. Realtime Boundary
     transport != event ledger != activity presentation
  7. Graph Boundary
     graph consumes entities/relationships, does not own them
  8. Agent Boundary
     agents consume task/intelligence systems, do not replace them

  ———

  # 23. What Cannot Happen Earlier Than It Should

  Do not build before prerequisites:

  - GraphRAG UX before entity/relationship/provenance system
  - agent workspace before task execution/intelligence lineage
  - multimodal orchestration UX before evidence types generalize
  - advanced analytics builder before metrics/insights stabilize
  - free-form dock ecosystem before shell/panel contracts settle

  These are prime collapse zones.

  ———

  # 24. Realistic Simplifications By Stage

  - use route-wrapped legacy pages while shell matures
  - start realtime with SSE + local synthetic events
  - start intelligence with read-only insights/evidence before editable workflows
  - start graph as exploration, not full operational workspace
  - start agents as visible executions, not autonomous planners
  - start analytics as KPI extraction and summaries, not BI platform

  ———

  # 25. Master Success Definition

  The roadmap succeeds if KENCE.ai reaches a state where:

  - the shell is persistent and intuitive
  - chat, compare, and presentation are native workspaces
  - intelligence is structured, inspectable, and reusable
  - analytics emerges from intelligence rather than separate ad hoc UIs
  - multimodal, graph, and agents extend the same core architecture
  - enterprise users see depth
  - novices see clarity
  - the system feels like a living intelligence workspace, not a pile of AI features

  If needed, the next step can be a stricter program-management format:

  - phase-by-phase timeline grid
  - RAG status matrix
  - priority tiers P0/P1/P2
  - engineering team stream split
  - quarter-based roadmap

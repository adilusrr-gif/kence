  Execution Protocol Goal
  This protocol exists to prevent:

  - architecture drift
  - uncontrolled rewrites
  - unstable demos
  - broken shell migration
  - duplicated state ownership
  - premature GraphRAG/agent complexity
  - collapse from “just one more refactor”

  The protocol is strict by design. KENCE.ai must remain:

  - working
  - demoable
  - incrementally improving
  - shell-first
  - architecture-safe

  ———

  # 1. Core Execution Laws

  ## Law 1. The product must remain runnable after every meaningful step

  No phase may require a future phase to “make the app work again”.

  ## Law 2. No big-bang rewrites

  Any rewrite that replaces a working subsystem without coexistence is prohibited.

  ## Law 3. Shell-first is mandatory

  No new major frontend surface may bypass the shell architecture.

  ## Law 4. Legacy coexistence is mandatory

  Legacy pages remain valid migration surfaces until native replacements reach parity.

  ## Law 5. One concern, one owner

  State, layout, intelligence, and transport concerns must not share ownership ambiguously.

  ## Law 6. Demoability is a release gate

  If a change damages the demo path, it is not ready.

  ## Law 7. Architecture depth is allowed internally, not in user experience

  Complexity may exist in code and orchestration, but must not leak uncontrolled into UX.

  ———

  # 2. Daily Execution Workflow

  ## Standard daily flow

  1. Confirm current phase and subphase.
  2. Confirm whether task is:
      - safe additive
      - migration
      - replacement
      - stabilization
  3. Identify architecture boundary touched:
      - shared UI
      - stores
      - shell
      - intelligence
      - analytics
      - multimodal
      - graph
      - agents
  4. Identify fallback path before coding.
  5. Implement smallest viable slice.
  6. Verify working product path.
  7. Verify current demo path.
  8. Record migration impact and next safe step.

  ## Required daily questions

  Before starting:

  - What phase am I in?
  - What layer am I touching?
  - What existing behavior could break?
  - What is the fallback if this fails?
  - Can this be introduced in coexistence mode?

  After finishing:

  - Does the app still run?
  - Do existing flows still work?
  - Did I create duplicate ownership?
  - Did I widen architecture debt?
  - Is rollback straightforward?

  ———

  # 3. Safe Refactor Rules

  ## Allowed safe refactors

  - additive abstractions behind existing behavior
  - extraction of reusable primitives
  - store read-through introduction
  - route wrapping without changing page internals
  - selector extraction
  - CSS/token cleanup that preserves legacy rendering

  ## Unsafe refactors

  - replacing old and new state ownership simultaneously
  - changing route structure and state model in one change
  - rewriting shell and workspace logic in one pass
  - moving domain data into shell state
  - removing legacy code before parity

  ## Safe refactor condition

  A refactor is safe only if:

  - behavior remains equivalent
  - fallback path exists
  - ownership gets clearer, not blurrier
  - the codebase is more migratable afterward

  ———

  # 4. Feature Branch Strategy

  ## Branch classes

  - phase/<n>-foundation
  - feature/<subsystem>-<slice>
  - migration/<old>-to-<new>
  - stabilization/<subsystem>
  - demo/<checkpoint>
  - hotfix/<issue>

  ## Rules

  - one branch should target one architecture boundary
  - do not mix shell migration, intelligence objects, and UX rewrite in one branch
  - no branch should combine foundational store migration with multimodal/graph features
  - demo branches should only polish or stabilize, not alter architecture direction

  ## Merge conditions

  - phase alignment confirmed
  - rollback path clear
  - demo path verified
  - architecture review passed when required

  ———

  # 5. Incremental Migration Protocol

  ## Migration pattern

  1. Introduce new structure
  2. Add adapter layer
  3. Run old and new in coexistence
  4. Redirect selected flows
  5. Validate parity
  6. Freeze new contract
  7. Remove old path only after sustained stability

  ## Mandatory coexistence sequence

  - parallel
  - shadow
  - switchable
  - default
  - remove old

  ## Never skip directly from

  legacy -> full replacement

  ———

  # 6. Store Migration Protocol

  ## Allowed sequence

  1. Define new store boundary.
  2. Add store as read model.
  3. Mirror data from legacy/local state if necessary.
  4. Migrate one write path.
  5. Verify selectors and derived views.
  6. Remove duplicated write path.
  7. Remove old source of truth last.

  ## Rules

  - never change source of truth for multiple domains in one PR
  - never have two silent write owners indefinitely
  - mark temporary duplication explicitly
  - session/tab/shell state must migrate before workspace rewrites

  ## Forbidden

  - introducing new store without defined ownership boundary
  - embedding intelligence payloads into shell/workspace stores
  - writing raw fetch logic into UI while store migration is underway

  ———

  # 7. Shell Migration Protocol

  ## Shell-first discipline

  - all authenticated UX must move toward shell containment
  - new screens must target shell-native composition
  - shell wraps legacy before replacing them

  ## Required shell migration order

  1. AppShell runtime
  2. tabs/session binding
  3. command bar
  4. right panel
  5. activity rail
  6. dock host
  7. native workspaces

  ## Forbidden

  - creating new standalone authenticated pages outside shell
  - bypassing workspace session model for convenience
  - embedding shell controls inside legacy page internals as permanent solution

  ———

  # 8. Legacy Coexistence Rules

  ## Mandatory rules

  - legacy pages remain operational until replacement parity
  - shell must host legacy pages cleanly
  - legacy routes may remain behind fallback boundaries
  - no legacy removal before verification window

  ## Legacy code policy

  - legacy code may be frozen but should not receive deep new architecture
  - only bugfixes, adapters, and minimal compatibility patches allowed
  - no new major feature should be built only in legacy path

  ## Removal condition

  Legacy path removable only when:

  - native replacement exists
  - key workflow parity proven
  - demo path uses native version
  - rollback branch/tag exists

  ———

  # 9. Component Rewrite Rules

  ## Allowed component rewrites

  - primitive extraction
  - layout wrapper replacement
  - shell-region replacement
  - page decomposition into widgets

  ## Rewrite protocol

  1. Define old responsibility.
  2. Define new ownership.
  3. Extract stable subparts.
  4. Introduce wrapper or compatibility layer.
  5. Replace leaf nodes first, roots later.
  6. Validate state and styling parity.

  ## Forbidden

  - rewriting a monolith into a new monolith in a different folder
  - mixing design-system migration with domain behavior rewrite without boundaries
  - rewriting component tree and state model at once unless component is isolated

  ———

  # 10. Event System Rollout Rules

  ## Rollout order

  1. event taxonomy
  2. synthetic frontend events
  3. task lifecycle integration
  4. activity rail consumption
  5. transport-backed realtime updates
  6. intelligence object enrichment
  7. advanced observability/debug views

  ## Rules

  - event schema must stabilize before graph/agent features depend on it
  - synthetic events are acceptable as transitional scaffolding
  - transport and semantic event layers must remain separated

  ## Forbidden

  - piping raw backend transport payloads directly into widgets
  - coupling event rendering to backend message format

  ———

  # 11. Intelligence Layer Rollout Rules

  ## Rollout order

  1. evidence and provenance links
  2. insights
  3. risks
  4. entities
  5. relationships
  6. metrics
  7. timeline
  8. graph overlays
  9. cross-document intelligence

  ## Rules

  - no intelligence object without source/evidence/provenance strategy
  - insight-first UI must remain simple
  - cross-document intelligence cannot precede normalized evidence/object model

  ## Forbidden

  - embedding intelligence only inside chat messages
  - rendering “AI magic” without inspectable grounding for enterprise flows

  ———

  # 12. Feature Flag Strategy

  ## Flag classes

  - ui_experiment
  - shell_migration
  - workspace_native
  - intelligence_preview
  - graph_preview
  - agent_preview
  - multimodal_preview

  ## Rules

  - any high-risk replacement must be gateable
  - flags must be short-lived for migration, not permanent architecture band-aids
  - flags should separate:
      - old vs new route
      - old vs new workspace renderer
      - old vs new intelligence panel
      - graph/agent experimental surfaces

  ## Forbidden

  - hiding architectural instability behind endless flags
  - using flags to avoid clarifying ownership

  ———

  # 13. Rollback Strategy

  ## Rollback types

  1. code rollback
  2. route rollback
  3. feature-flag rollback
  4. layout rollback
  5. store write rollback

  ## Requirement

  Every major migration must define:

  - what is reversible
  - how fast it is reversible
  - what data loss risk exists
  - whether rollback is local or cross-cutting

  ## Preferred rollback method

  Feature-flag or route fallback before code removal.

  ## Forbidden

  - irreversible migration without a fallback route
  - deleting legacy path before stable native usage window

  ———

  # 14. Testing Checkpoints

  ## Mandatory checkpoint types

  - build/run checkpoint
  - shell checkpoint
  - legacy coexistence checkpoint
  - demo path checkpoint
  - responsive checkpoint
  - performance checkpoint
  - error recovery checkpoint

  ## Minimum per milestone

  - app starts
  - auth works
  - shell renders
  - legacy routes still mount if expected
  - active demo flow works
  - no catastrophic console/runtime errors

  ## Additional by layer

  ### Store changes

  - ownership consistency
  - no duplicated writes
  - restoration sanity

  ### Shell changes

  - session/tab persistence
  - route rebinding
  - resize behavior

  ### Intelligence changes

  - evidence/provenance links
  - rendering isolation
  - no full-app rerenders on updates

  ———

  # 15. Acceptance Criteria Rules

  A task is accepted only if it satisfies all relevant dimensions:

  1. Functional
     intended behavior exists
  2. Architectural
     ownership boundaries improved or preserved
  3. Coexistence
     legacy/non-target flows still function
  4. Demoability
     key demo path preserved
  5. Stability
     no hidden breakage in adjacent systems
  6. Reversibility
     rollback path exists if risk was non-trivial

  No task is complete if it only “looks right” but violates architecture.

  ———

  # 16. Performance Safety Rules

  ## Baseline rules

  - no shell region subscribes to full domain stores
  - no expensive derivations in render
  - use selectors for read shaping
  - event and intelligence lists must be bounded/virtualizable
  - preserve lazy boundaries around heavy surfaces

  ## Red flags

  - full shell rerender on message stream
  - graph redraw on unrelated event
  - activity rail processing raw entire store on each tick
  - storing large blobs in persisted stores

  ## Mandatory review trigger

  Any change affecting:

  - shell rerender patterns
  - graph rendering
  - long-lived buffers
  - session restoration payload size

  ———

  # 17. Frontend Stability Rules

  ## Stability means

  - routes predictable
  - shell always mounts
  - sessions restorable
  - commands understandable
  - panels recoverable
  - failures isolated

  ## Rules

  - every shell region must have rendering boundary
  - critical surfaces must fail soft, not crash app
  - hydration must be progressive
  - no loading step should blank the app after auth

  ———

  # 18. UI Consistency Rules

  ## Rules

  - all new UI uses shared primitives
  - shell surfaces follow design token system
  - new features must fit mode-based UX complexity model
  - no ad hoc visual systems in graph/agents/analytics
  - explanations, statuses, warnings, and empty states use consistent language patterns

  ## Forbidden

  - building a new subsystem with a separate visual language
  - bypassing shared UI primitives “temporarily” for major surfaces

  ———

  # 19. State Ownership Rules

  ## Mandatory rules

  - one source of truth per field
  - shell stores own shell only
  - workspace store owns context refs only
  - intelligence stores own intelligence objects
  - event store owns semantic event ledger
  - transport state stays in realtime store
  - orchestration store owns execution graph, not payload data

  ## Forbidden

  - domain payload in shell store
  - event history in realtime store
  - intelligence objects in message store
  - tab state in document store

  ———

  # 20. Realtime Safety Rules

  ## Rules

  - realtime must degrade gracefully
  - transport disconnection must not destroy workspace state
  - stream buffers must be bounded
  - UI must distinguish “working”, “waiting”, and “disconnected”
  - synthetic fallback events are allowed when realtime absent

  ## Forbidden

  - direct widget dependence on raw stream payloads
  - assuming realtime availability for core UX

  ———

  # 21. Architecture Review Checkpoints

  ## Architecture review required for:

  - new store introduction
  - new shell region or shell contract change
  - route architecture change
  - session model change
  - intelligence schema change
  - graph integration changes
  - event schema changes
  - multimodal evidence schema expansion
  - agent orchestration surface introduction
  - removal of legacy path
  - change to persistence boundaries

  ## Architecture review not required for:

  - isolated primitive component additions
  - non-structural styling fixes
  - safe bugfixes within existing boundaries
  - leaf widget improvements that do not widen ownership

  ———

  # 22. What Must Never Be Done

  1. Big-bang frontend rewrite
  2. Shell bypass for new authenticated features
  3. Dual state ownership left unresolved
  4. Unbounded event/intelligence caches
  5. Graph/agent UI before foundational intelligence contracts
  6. Replacing legacy flow without fallback
  7. Mixing experimental graph/agent logic into stable shell contracts
  8. Introducing new visual system outside design system
  9. Breaking demo path for “future architecture”
  10. Treating incomplete architecture as good enough if it cannot be rolled back

  ———

  # 23. What Requires Architecture Review

  - store boundary changes
  - shell lifecycle changes
  - hydration/restoration changes
  - intelligence schema changes
  - provenance model changes
  - graph selector model changes
  - multimodal evidence model changes
  - feature-flag strategy for high-risk migrations
  - backend contract adapter shape changes
  - legacy removal decisions

  ———

  # 24. What Can Be Done Quickly

  - additive shared UI primitives
  - empty-state improvements
  - copy/microcopy simplification
  - mode labels and guidance text
  - bounded selector additions
  - safe shell wrapper components
  - local widget UI improvements
  - fallback and recovery UX

  Quick work is allowed only if it does not change ownership or foundational contracts.

  ———

  # 25. What Requires Phased Migration

  - App.jsx decomposition
  - route model changes
  - shell rollout
  - state ownership migration
  - chat rewrite
  - compare rewrite
  - presentation rewrite
  - intelligence object introduction
  - graph mode introduction
  - agent mode introduction

  ———

  # 26. What Must Be Frozen / Immutable

  ## Freeze early

  - design token architecture
  - shared UI contracts
  - store ownership boundaries
  - route/layout boundary rules
  - workspace session contract
  - event naming strategy
  - intelligence object base schema shape

  ## Freeze after maturity

  - provenance contract
  - graph node/edge adapter contract
  - artifact lineage contract
  - mode-based UX complexity contract

  Frozen means:

  - changes require architecture review
  - no casual ad hoc edits

  ———

  # 27. Implementation Discipline Rules

  1. Work by phase, not by excitement.
  2. Smallest safe slice beats comprehensive rewrite.
  3. Every migration starts with coexistence.
  4. Every complex subsystem gets explicit ownership.
  5. New code must move architecture forward, not sideways.
  6. Demo path is part of the definition of done.
  7. Temporary solutions must be marked temporary with exit strategy.
  8. Performance and memory are architectural, not polishing concerns.

  ———

  # 28. Code Review Rules

  Review must ask:

  - What architectural boundary is touched?
  - Is ownership clearer after this?
  - Is coexistence preserved?
  - Is rollback possible?
  - Is shared UI respected?
  - Does this leak complexity into UX?
  - Does this create hidden state duplication?
  - Does this hurt demoability?

  Reject changes that:

  - widen ambiguity
  - bypass shell
  - bypass stores
  - create undocumented temporary hacks in core layers
  - make future graph/agent work harder without reason

  ———

  # 29. AI / Codex Interaction Rules

  ## Allowed use

  AI can:

  - analyze architecture
  - propose phased migrations
  - generate additive structure
  - extract reusable primitives
  - help with targeted refactors
  - codify acceptance criteria
  - check boundary violations

  ## Must not allow AI to do

  - architecture-wide uncontrolled rewrites
  - multi-layer refactors in one pass without explicit staging
  - deletion of legacy paths without parity checks
  - “cleanup” that removes fallback architecture
  - hidden broad edits that change ownership silently

  ## Prompting discipline

  Every AI coding request should specify:

  - current phase
  - architecture boundary
  - whether coexistence is required
  - what must remain working
  - whether code change is additive or migratory

  ———

  # 30. Anti-Chaos Engineering Rules

  1. No subsystem grows without a contract.
  2. No contract changes silently.
  3. No migration skips fallback.
  4. No “temporary” architecture without removal plan.
  5. No high-risk merge late before demo.
  6. No cross-cutting refactor without checkpoint plan.
  7. No mixing experimental graph/agent work with stable shell milestones.
  8. No UI complexity increase without UX justification.
  9. No state duplication without explicit transition plan.
  10. No success metric that ignores working-product continuity.

  ———

  # 31. Enterprise-Grade Migration Discipline

  ## Mandatory migration sequence

  - define target boundary
  - define coexistence plan
  - define rollback
  - implement additive path
  - validate parity
  - switch default
  - observe stability
  - remove old path

  ## Enterprise rule

  A migration is not “done” when the new path exists.
  It is done when:

  - the old and new paths were safely overlapped
  - default was switched safely
  - rollback remained possible during validation
  - removal happened only after stability evidence

  ———

  # 32. Final Protocol Standard

  Every significant change to KENCE.ai must answer:

  1. What phase is this in?
  2. What architecture layer does it touch?
  3. What is the source of truth?
  4. What legacy path still works?
  5. What is the fallback if this fails?
  6. Does the shell remain stable?
  7. Does the demo path remain intact?
  8. Does this reduce or increase future collapse risk?

  If any answer is unclear, implementation is not ready.

  If needed, the next step can be a stricter operational artifact:

  - phase-gated checklist matrix
  - PR template for architecture-safe development
  - demo preservation checklist
  - definition of done by subsystem
  - Codex prompt protocol for each phase

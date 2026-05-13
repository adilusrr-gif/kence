# Phase 2 Architecture Checkpoint

Date: 2026-05-13

Purpose:
- freeze the current frontend architecture state before Phase 3 shell work
- record what is implemented versus what is still target architecture
- define migration boundaries so shell work does not accidentally rewrite legacy behavior

## 1. Current Frontend Architecture State

Current runtime shape:
- the application is still a legacy route-based app centered on `frontend/src/App.jsx`
- `App.jsx` remains the active runtime owner for authenticated app composition
- legacy pages are still mounted directly through React Router routes
- no persistent shell runtime exists yet
- no workspace shell layout, tabs UI, dock system, command bar runtime, right panel runtime, or activity rail runtime exists yet

Current authenticated composition:
- sidebar/navigation lives in `App.jsx`
- route switching lives in `App.jsx`
- legacy pages still receive props directly from `App.jsx`
- legacy route transitions are still pathname-driven, not session-shell-driven

Current state ownership reality:
- local React state is still the source of truth for live behavior
- Zustand stores exist as shadow/read-model preparation only
- Phase 2 is not complete source-of-truth migration

## 2. Implemented Stores

Implemented store foundation lives in `frontend/src/shared/stores/`.

### authStore

Purpose:
- auth snapshot
- auth hydration bridge
- future auth selector source for shell

Current implementation status:
- implemented
- initialized from existing local storage auth bridge
- mirrored from `App.jsx` via `syncAuthShadow(...)`
- not yet the primary write owner

Current fields:
- `token`
- `userId`
- `username`
- `role`
- `status`
- `lastAuthAt`

### shellStore

Purpose:
- shell preference and shell chrome preparation

Current implementation status:
- implemented
- mirrored from `App.jsx` via `syncShellShadow(...)`
- not yet the primary write owner

Current fields:
- `theme`
- `density`
- `appName`
- `appEmoji`
- `leftRail.collapsed`
- `rightPanelShell.open`
- `bottomRailShell.expanded`
- `breakpoint`

### workspaceStore

Purpose:
- active session/document context preparation for future shell session binding

Current implementation status:
- implemented
- mirrored from `App.jsx` via `syncWorkspaceShadow(...)`
- upload flow still owns actual write behavior

Current fields:
- `activeWorkspaceId`
- `activeSessionId`
- `activeDocumentName`
- `workspaceIds`
- `workspaceMetaById`
- `contextEnvelopeBySessionId`

Current envelope shape:
- `sessionId`
- `activeDocumentName`
- `scope`
- `mode`
- `activeAssetIds`
- `selectedEntityIds`
- `selectedEvidenceIds`
- `pinnedContextIds`
- `openWidgetIds`
- `layoutPreset`
- `artifactRefs`

### sessionTabsStore

Purpose:
- future workspace tab/session restoration preparation

Current implementation status:
- implemented
- metadata only
- persisted through Zustand `persist`
- populated from legacy route context via `syncSessionTabsShadow(...)`
- no tabs UI exists yet

Current fields:
- `tabsById`
- `tabOrder`
- `activeTabId`
- `openedWorkspaceIds`
- `restoreMetaByTabId`
- `closedTabStack`

Current tab model:
- `id`
- `workspaceId`
- `sessionId`
- `type`
- `title`
- `routePath`
- `dirty`
- `restorable`
- `documentName`
- `lastVisitedAt`

### realtimeStore

Purpose:
- future transport/event readiness preparation

Current implementation status:
- implemented
- metadata only
- no SSE transport
- no WebSocket transport
- no page integration

Current fields:
- `transportMode`
- `connectionState`
- `streamState`
- `pendingEventsById`
- `pendingEventOrder`
- `activityMetaById`
- `streamBuffersByCorrelationId`
- `subscriptionsByScope`
- `readiness`
- `timestamps`

### orchestrationStore

Purpose:
- future intent/execution/task orchestration preparation

Current implementation status:
- implemented
- metadata only
- no orchestration engine
- no agent runtime
- no workflow execution

Current fields:
- `activeIntent`
- `queuedIntentIds`
- `intentsById`
- `currentExecutionId`
- `executionById`
- `taskMetaById`
- `actionRegistryById`
- `readiness`
- `diagnostics`
- `timestamps`

## 3. Ownership Boundaries

### Current real owners

`App.jsx` currently owns:
- authenticated app composition
- sidebar visibility state
- theme toggle state
- app branding state
- current auth session object in live runtime
- `sessionId`
- `documentName`

Legacy pages currently own:
- page-local async lifecycle
- page-local loading/error states
- page-local domain results
- page-local streaming behavior

Examples:
- `UploadPage` owns upload flow and creates the active session
- `ChatPage` owns chat messages, input, loading, translation state, and streaming logic
- `ComparisonPage` owns its own upload/compare/result state
- `PresentationPage` owns generation/result state

### Current shadow owners

Stores currently act as:
- read-models
- restoration preparation
- shell-compatibility preparation
- metadata mirrors

Stores currently do not act as:
- primary write owners
- orchestration engines
- transport layers
- domain caches

### Explicit boundary rules frozen at this checkpoint

- `authStore` must not own shell tabs or navigation state
- `shellStore` must not own domain payloads
- `workspaceStore` must not own message payloads or compare/presentation results
- `sessionTabsStore` must not hold heavy page payloads
- `realtimeStore` must not become semantic event history
- `orchestrationStore` must not become a document/message cache

## 4. Migration Strategy From This Checkpoint

Phase 3 must proceed in coexistence mode.

Required strategy:
1. introduce shell runtime around legacy pages
2. keep legacy pages operational inside shell
3. let shell read from current stores/selectors
4. migrate one boundary at a time
5. move write ownership only after read-model parity exists

Required order from this checkpoint:
1. shell frame and authenticated shell composition
2. shell hydration and restoration baseline
3. legacy page shell wrapping
4. tabs/session binding using current metadata stores
5. command/panel/activity regions as shell surfaces
6. route-by-route native workspace migration later

Migration discipline:
- old and new must coexist
- write-owner transfer must be explicit
- legacy routes must remain fallback surfaces until parity
- store foundations created in Phase 2 must be consumed before new parallel state models are added

## 5. High-Risk Zones

### App.jsx central ownership

Risk:
- `App.jsx` is still both composition root and live state owner for several cross-route concerns

Why high risk:
- shell work can accidentally duplicate ownership if shell also begins writing auth/theme/session state before transfer rules are defined

### ChatPage streaming path

Risk:
- `ChatPage` still performs direct streaming fetch and local message mutation

Why high risk:
- Phase 3 shell or realtime work must not partially wrap or partially replace chat streaming without a dedicated migration slice

### Route-path-as-session-identity behavior

Risk:
- current session tab shadow records are derived from legacy pathnames such as `legacy:/chat`

Why high risk:
- shell session binding cannot assume current route identity is equivalent to future workspace session identity

### Persisted sessionTabsStore metadata

Risk:
- persisted restore metadata exists before shell runtime exists

Why high risk:
- Phase 3 must define reconciliation rules carefully so route, auth, restored tab, and active session do not fight each other

### Legacy page local domain state

Risk:
- compare, presentation, and chat still keep their runtime truth locally

Why high risk:
- shell wrappers must not assume domain state is in stores yet

## 6. Known UI Issues

Known current UI/UX issues that remain outside Phase 2 scope:
- authenticated app still behaves like a route-switched page app, not a persistent shell
- sidebar, page container, and route transitions are still legacy-app-level behavior
- state continuity across routes is limited to the `sessionId` and `documentName` props managed in `App.jsx`
- chat streaming state is isolated inside `ChatPage`, so shell-wide execution visibility does not exist
- comparison and presentation surfaces are isolated pages, not workspace sessions
- no workspace tab strip exists
- no shell hydration UX exists
- no right intelligence panel exists
- no bottom activity rail exists
- no dock/widget system exists
- some Russian/Cyrillic text rendering remains mojibake in source/output and should be treated as a separate UI cleanup concern, not a Phase 3 architecture shortcut

## 7. Shell-Readiness Status

### Ready enough for Phase 3

- Zustand foundation exists
- initial store folder structure exists
- auth shadow model exists
- shell preference shadow model exists
- active session/document shadow model exists
- lightweight tab restoration metadata exists
- realtime readiness metadata exists
- orchestration readiness metadata exists

### Not ready yet

- no shell runtime components
- no shell hydration flow
- no route metadata system
- no workspace shell layouts
- no shell-aware router layer
- no dock store
- no command bar store
- no context panel store
- no activity rail store
- no event store
- no domain entity stores
- no shell process layer
- no legacy page bridge components

### Readiness conclusion

Phase 2 has established the minimum metadata foundation for Phase 3 shell work.

Phase 3 should treat the current state as:
- shell-prepared
- not shell-migrated

## 8. Forbidden Migration Zones

Before dedicated migration slices exist, Phase 3 must not:
- rewrite `ChatPage` internals
- rewrite `ComparisonPage` internals
- rewrite `PresentationPage` internals
- move chat streaming into `realtimeStore`
- move chat execution into `orchestrationStore`
- move comparison or presentation result payloads into `sessionTabsStore`
- turn `workspaceStore` into a domain payload container
- bypass legacy routes by building shell-only authenticated flows without fallback
- introduce docking behavior before shell frame and region ownership are defined
- introduce event history into `realtimeStore`
- introduce execution runtime into `orchestrationStore`
- silently make stores primary write owners while local page state still writes independently

## 9. Future Shell Constraints

Phase 3 shell work must obey these constraints:

### Constraint 1. Shell wraps legacy first

- shell must host legacy pages before replacing them

### Constraint 2. One owner per field

- if shell starts writing a field already written by `App.jsx` or a legacy page, the transfer must be explicit and isolated

### Constraint 3. Store roles stay narrow

- shell store for shell
- workspace store for session context
- sessionTabsStore for tab metadata/restoration
- realtimeStore for transport readiness/state
- orchestrationStore for intent/execution metadata

### Constraint 4. Route and session remain separate concepts

- current pathname-based legacy tab ids are transitional only
- future shell must reconcile route state with session state, not collapse them into one thing

### Constraint 5. Legacy pages remain prop-compatible during coexistence

- shell wrappers may adapt inputs, but must not force immediate internal rewrites

### Constraint 6. Realtime and orchestration remain readiness layers until dedicated rollout

- no hidden runtime behavior should be attached to these stores during shell scaffolding

### Constraint 7. Hydration must be progressive

- Phase 3 shell should not block the authenticated app on nonexistent domain hydration

### Constraint 8. Demo path stability is mandatory

- upload -> chat
- upload -> presentation
- compare flow
- auth/profile/admin flow

These must remain operational throughout shell rollout.

## 10. Checkpoint Summary

What is frozen at this checkpoint:
- the app is still legacy-first in live behavior
- the store layer is implemented but remains shadow-first
- shell, realtime, and orchestration stores are preparation infrastructure, not runtime migration
- Phase 3 must build the shell around this state rather than trying to replace it in one pass

Definition of success for the next phase:
- persistent authenticated shell composition
- legacy page coexistence inside shell
- selector-driven shell binding using the Phase 2 stores
- no breakage of current working flows

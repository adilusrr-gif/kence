• Phase 1 Execution Goal
  Phase 1 creates the design foundation for KENCE.ai without changing architecture ownership, routing, shell runtime, or
  state system. The app must stay fully working throughout. This phase is strictly additive.

  Scope allowed:

  - shared UI primitives
  - design tokens
  - theme structure
  - motion tokens/presets
  - CSS layering
  - Tailwind/token alignment
  - compatibility bridge

  Scope forbidden:

  - shell rollout
  - Zustand rollout
  - page rewrites
  - routing changes
  - domain logic changes
  - backend/API changes

  ———

  # 1. Exact Execution Order

  ## Execution sequence

  1. Freeze Phase 1 boundaries
  2. Create folder skeleton
  3. Create utility foundation
  4. Create token files
  5. Create theme files
  6. Create base style layer
  7. Create legacy coexistence layer
  8. Create motion layer
  9. Create structural layout primitives
  10. Create surface primitives
  11. Create interaction primitives
  12. Create form primitives
  13. Create feedback primitives
  14. Create shell-oriented primitives
  15. Integrate primitives into isolated new surfaces only
  16. Validate dark/light/responsive/a11y
  17. Document migration rules
  18. Mark Phase 1 done and freeze contracts

  ———

  # 2. File-by-File Implementation Sequence

  ## Step 0. Phase Freeze

  Purpose
  Prevent Phase 1 from drifting into shell or state work.

  Files affected

  - no source changes required
  - planning/docs only if maintained

  Dependencies

  - none

  Rollback

  - none

  Verification

  - confirm forbidden scope is understood

  Risk

  - low

  ———

  ## Step 1. Create Folder Skeleton

  Purpose
  Create the permanent shared UI and style structure before any implementation.

  Files/folders first

  src/app/styles/
  src/shared/ui/
  src/shared/lib/
  src/shared/config/

  Subfolders:

  src/shared/ui/button
  src/shared/ui/icon-button
  src/shared/ui/input
  src/shared/ui/textarea
  src/shared/ui/select
  src/shared/ui/badge
  src/shared/ui/status-pill
  src/shared/ui/surface
  src/shared/ui/panel
  src/shared/ui/card
  src/shared/ui/tabs
  src/shared/ui/tooltip
  src/shared/ui/scroll-area
  src/shared/ui/divider
  src/shared/ui/empty-state
  src/shared/ui/loader
  src/shared/ui/progress
  src/shared/ui/command-input
  src/shared/ui/section-header
  src/shared/ui/stack
  src/shared/ui/inline
  src/shared/ui/grid

  src/shared/lib/cn
  src/shared/lib/tokens
  src/shared/lib/a11y
  src/shared/lib/responsive
  src/shared/lib/motion

  src/shared/config/theme
  src/shared/config/ui

  Dependencies

  - Step 0

  Rollback

  - folders can remain even if unused

  Verification

  - no runtime effect
  - imports still untouched

  Risk

  - low

  ———

  ## Step 2. Create Utility Foundation

  Purpose
  Stabilize shared import base before primitives.

  Files

  - src/shared/lib/cn/index.js
  - src/shared/lib/tokens/getTokenValue.js
  - src/shared/lib/a11y/focusRing.js
  - src/shared/lib/responsive/breakpoints.js
  - src/shared/lib/motion/presets.js
  - src/shared/config/theme/theme.config.js
  - src/shared/config/ui/ui.config.js

  Dependencies

  - Step 1

  Rollback

  - additive only, safe to leave in place

  Verification

  - no production UI changed
  - imports compile if referenced in sandbox components

  Risk

  - low

  ———

  ## Step 3. Token Architecture Implementation

  Purpose
  Create design token source of truth before any new component styling.

  Files

  - src/app/styles/tokens.css

  Token implementation order

  1. core color tokens
  2. spacing tokens
  3. radius tokens
  4. shadow tokens
  5. typography tokens
  6. duration/easing tokens
  7. semantic surface/text/border tokens
  8. status tokens
  9. glass tokens

  Dependencies

  - Step 2

  Rollback

  - token file can exist unused

  Verification

  - CSS parses
  - no regression because file not yet wired into existing pages in a destructive way

  Risk

  - medium

  ———

  ## Step 4. Theme System Implementation

  Purpose
  Map semantic tokens to actual dark/light theme behavior.

  Files

  - src/app/styles/themes.css

  Theme implementation order

  1. dark theme semantic mapping
  2. light theme semantic mapping
  3. .dark compatibility bridge
  4. optional data-theme forward-compatible structure

  Dependencies

  - Step 3

  Rollback

  - if theme file causes regressions, remove import only
  - current index.css dark behavior remains fallback

  Verification

  - theme switching still works
  - current pages visually unchanged or minimally affected

  Risk

  - medium-high

  ———

  ## Step 5. Base Style Layer

  Purpose
  Establish non-page-specific base rules for new foundation.

  Files

  - src/app/styles/base.css

  Contents order

  1. reset compatibility
  2. body defaults
  3. typography defaults
  4. selection/focus defaults
  5. reduced-motion baseline
  6. base semantic utility hooks

  Dependencies

  - Steps 3-4

  Rollback

  - remove file import if global regression appears

  Verification

  - current pages render correctly
  - no global margin/padding/focus regressions

  Risk

  - medium-high

  ———

  ## Step 6. Legacy Coexistence Layer

  Purpose
  Protect current frontend from new global style architecture.

  Files

  - src/app/styles/legacy-bridge.css

  Role

  - preserve current .btn-primary, .card, .dark assumptions
  - neutralize accidental clashes between new tokens and old global classes

  Dependencies

  - Steps 3-5

  Rollback

  - bridge can be edited/expanded without changing architecture
  - if bridge causes issues, disable specific compatibility rules only

  Verification

  - legacy pages still match pre-Phase-1 behavior closely

  Risk

  - high

  ———

  ## Step 7. Motion Layer

  Purpose
  Create motion system tokens and reusable animation classes before primitives use them.

  Files

  - src/app/styles/motion.css

  Motion rollout order

  1. duration/easing semantic mapping
  2. keyframes for fade/slide/pulse/shimmer
  3. reduced-motion overrides
  4. shell-ready status animations
  5. non-invasive utility classes

  Dependencies

  - Step 5

  Rollback

  - disable import or specific animations
  - no domain impact

  Verification

  - no runaway animation regressions
  - reduced motion respected

  Risk

  - medium

  ———

  ## Step 8. Utility Layer

  Purpose
  Add semantic utility helpers for new primitives only.

  Files

  - src/app/styles/utilities.css

  Dependencies

  - Steps 3-7

  Rollback

  - additive, can remain
  - remove class usage from new primitives if needed

  Verification

  - utilities do not override old page-specific selectors

  Risk

  - medium

  ———

  # 3. Layout Primitive Order

  ## Step 9. Structural Layout Primitives

  Purpose
  Introduce compositional building blocks before visual blocks.

  Files

  - src/shared/ui/stack/Stack.jsx
  - src/shared/ui/stack/index.js
  - src/shared/ui/inline/Inline.jsx
  - src/shared/ui/inline/index.js
  - src/shared/ui/grid/Grid.jsx
  - src/shared/ui/grid/index.js
  - src/shared/ui/divider/Divider.jsx
  - src/shared/ui/divider/index.js

  Order

  1. Stack
  2. Inline
  3. Grid
  4. Divider

  Dependencies

  - Steps 2-8

  Rollback

  - primitives unused by legacy pages, safe to abandon without product break

  Verification

  - isolated rendering sanity
  - spacing tokens resolve correctly
  - responsive behavior intact

  Risk

  - low

  ———

  # 4. Primitive Implementation Order

  ## Step 10. Surface Primitives

  Purpose
  Define depth system before interactive components.

  Files

  - src/shared/ui/surface/Surface.jsx
  - src/shared/ui/surface/index.js
  - src/shared/ui/panel/Panel.jsx
  - src/shared/ui/panel/index.js
  - src/shared/ui/card/Card.jsx
  - src/shared/ui/card/index.js

  Order

  1. Surface
  2. Panel
  3. Card

  Dependencies

  - Step 9

  Rollback

  - keep current legacy card styles untouched
  - do not replace existing page cards yet

  Verification

  - dark/light correctness
  - surface hierarchy readable
  - no dependence on legacy CSS

  Risk

  - medium

  ———

  ## Step 11. Interaction Primitives

  Purpose
  Standardize basic action surfaces.

  Files

  - src/shared/ui/button/Button.jsx
  - src/shared/ui/button/index.js
  - src/shared/ui/icon-button/IconButton.jsx
  - src/shared/ui/icon-button/index.js
  - src/shared/ui/tabs/Tabs.jsx
  - src/shared/ui/tabs/index.js
  - src/shared/ui/tooltip/Tooltip.jsx
  - src/shared/ui/tooltip/index.js

  Order

  1. Button
  2. IconButton
  3. Tabs
  4. Tooltip

  Dependencies

  - Step 10

  Rollback

  - do not replace old .btn-primary globally
  - use new Button only in isolated future-facing components

  Verification

  - focus ring visible
  - icon-only buttons accessible
  - tabs keyboard behavior valid
  - no current page regressions

  Risk

  - medium-high

  ———

  ## Step 12. Form Primitives

  Purpose
  Create shell-ready input system.

  Files

  - src/shared/ui/input/Input.jsx
  - src/shared/ui/input/index.js
  - src/shared/ui/textarea/Textarea.jsx
  - src/shared/ui/textarea/index.js
  - src/shared/ui/select/Select.jsx
  - src/shared/ui/select/index.js

  Order

  1. Input
  2. Textarea
  3. Select

  Dependencies

  - Step 11 or Step 10 minimum

  Rollback

  - do not migrate login/chat forms yet
  - keep legacy inputs untouched initially

  Verification

  - states: default/error/disabled
  - contrast correct
  - form controls usable on narrow widths

  Risk

  - high if migrated too early into live forms
  - medium if additive only

  ———

  ## Step 13. Feedback Primitives

  Purpose
  Create standard result/status language.

  Files

  - src/shared/ui/badge/Badge.jsx
  - src/shared/ui/badge/index.js
  - src/shared/ui/status-pill/StatusPill.jsx
  - src/shared/ui/status-pill/index.js
  - src/shared/ui/loader/Loader.jsx
  - src/shared/ui/loader/index.js
  - src/shared/ui/progress/Progress.jsx
  - src/shared/ui/progress/index.js
  - src/shared/ui/empty-state/EmptyState.jsx
  - src/shared/ui/empty-state/index.js

  Order

  1. Badge
  2. StatusPill
  3. Loader
  4. Progress
  5. EmptyState

  Dependencies

  - Step 10

  Rollback

  - legacy statuses remain
  - only new or isolated surfaces adopt these first

  Verification

  - semantic color consistency
  - loading states readable in both themes
  - empty states clear and non-frightening

  Risk

  - low-medium

  ———

  ## Step 14. Shell-Oriented Primitives

  Purpose
  Build primitives needed by future shell without building shell.

  Files

  - src/shared/ui/scroll-area/ScrollArea.jsx
  - src/shared/ui/scroll-area/index.js
  - src/shared/ui/command-input/CommandInput.jsx
  - src/shared/ui/command-input/index.js
  - src/shared/ui/section-header/SectionHeader.jsx
  - src/shared/ui/section-header/index.js

  Order

  1. ScrollArea
  2. SectionHeader
  3. CommandInput

  Dependencies

  - Steps 11-12

  Rollback

  - keep unused until shell work starts
  - no current page dependency

  Verification

  - command input supports icons/actions layout
  - scroll area does not fight browser/native overflow
  - section header works in dense and regular layouts

  Risk

  - medium

  ———

  # 5. Which Files Create First

  ## First wave

  - folder skeleton
  - shared utility files
  - tokens.css
  - themes.css
  - base.css
  - legacy-bridge.css
  - motion.css
  - utilities.css

  ## Second wave

  - layout primitives
  - surface primitives

  ## Third wave

  - button/icon-button
  - badge/status-pill/loader/progress/empty-state

  ## Fourth wave

  - inputs/textarea/select
  - tabs/tooltip
  - command-input/scroll-area/section-header

  ———

  # 6. Which Files Migrate Later

  These should not be migrated in early Phase 1:

  - src/App.jsx
  - src/pages/LoginPage.jsx
  - src/pages/ChatPage.jsx
  - src/pages/UploadPage.jsx
  - src/pages/ComparisonPage.jsx
  - src/pages/PresentationPage.jsx
  - src/pages/ConvertPage.jsx
  - src/pages/ProfilePage.jsx
  - src/pages/AdminPage.jsx

  Late-Phase-1 allowed only for smoke usage:

  - create one isolated preview/test harness or use one non-critical isolated block
  - do not replace major interactive flows yet

  ———

  # 7. Tailwind Migration Order

  ## Tailwind strategy

  Tailwind remains present, but new primitives become token-driven.

  ## Order

  1. stop adding raw palette classes in new shared primitives
  2. map semantic classes to CSS variable usage
  3. preserve old Tailwind-heavy pages untouched
  4. use Tailwind mainly for layout/responsive composition in new shared primitives
  5. do not refactor old page Tailwind usage in Phase 1

  ## Never do in Phase 1

  - full Tailwind rewrite of legacy pages
  - removing existing utility usage from old pages
  - converting all old classes to tokenized variants

  ———

  # 8. Token Implementation Order

  1. color primitives
  2. semantic background/text/border
  3. spacing scale
  4. radius scale
  5. shadow scale
  6. typography scale
  7. duration/easing
  8. status tokens
  9. glass tokens

  ## Why

  Surfaces and text must stabilize before components can use them safely.

  ———

  # 9. Motion System Rollout Order

  1. semantic motion tokens
  2. reduced-motion rules
  3. basic fade/slide
  4. status pulse
  5. shimmer/skeleton
  6. optional shell-oriented motion classes

  ## Not in Phase 1

  - page-specific motion refactors
  - replacing existing framer-motion behaviors globally

  ———

  # 10. Theme System Rollout Order

  1. semantic dark theme
  2. semantic light theme
  3. .dark compatibility
  4. optional data-theme compatibility bridge
  5. visual regression check on current pages

  ## Not in Phase 1

  - full theme refactor of legacy custom page gradients/backgrounds
  - changing business logic around theme toggling

  ———

  # 11. Safe Coexistence Strategy With Current Frontend

  ## Rule

  New foundation is additive and opt-in.

  ## Coexistence model

  - current index.css remains active
  - new styles imported alongside it
  - legacy pages continue using old classes
  - new shared primitives depend only on Phase 1 style stack
  - no global removal of old utility classes

  ## Practical coexistence rule

  “New components use new system. Old pages keep old styling until explicitly migrated later.”

  ———

  # 12. Which Legacy Styles Stay Untouched Initially

  Do not touch initially:

  - sidebar layout classes
  - chat page classes
  - upload scene classes
  - presentation page classes
  - login shell classes
  - global legacy page-specific gradients
  - .btn-primary, .btn-secondary, .card behavior in live pages
  - page-specific dark-mode overrides

  These are Phase 3+ or workspace rewrite concerns.

  ———

  # 13. Highest Priority UI Primitives

  Top priority:

  1. Stack
  2. Inline
  3. Grid
  4. Surface
  5. Panel
  6. Card
  7. Button
  8. IconButton
  9. Badge
  10. StatusPill
  11. Loader
  12. EmptyState

  Reason:
  These unlock shell, dashboard, and guided UX without touching core workflows.

  ———

  # 14. Primitives Dangerous To Migrate Too Early

  High danger early migration:

  - Input
  - Textarea
  - Select
  - Tabs
  - CommandInput
  - ScrollArea

  Why:
  These can affect login/chat/input-heavy flows and subtle keyboard/focus/overflow behavior.

  Rule:
  Implement them in Phase 1, but do not replace critical live forms immediately.

  ———

  # 15. Quick Wins

  1. token architecture in place
  2. dark/light semantic theme layer
  3. Surface, Panel, Card
  4. Button and StatusPill
  5. EmptyState
  6. SectionHeader
  7. Stack/Inline/Grid

  These create immediate architecture value with low product risk.

  ———

  # 16. High-Risk Zones

  ## Highest risk

  - global CSS import order
  - collisions with existing .dark overrides
  - accidental override of current buttons/cards
  - focus style regressions
  - form primitive early replacement
  - scroll behavior changes from new base styles

  ## Mitigation

  - introduce legacy-bridge.css
  - avoid replacing existing live primitives in Phase 1
  - verify each style layer independently

  ———

  # 17. Acceptance Checkpoints After Each Step

  ## Checkpoint A after Steps 1-2

  - project still runs
  - no UI change visible
  - shared structure ready

  ## Checkpoint B after Steps 3-6

  - project still runs
  - current pages visually stable
  - theme toggle still works
  - no catastrophic global CSS regressions

  ## Checkpoint C after Steps 9-10

  - layout and surface primitives render correctly in isolation
  - dark/light stable
  - no dependency on legacy styles

  ## Checkpoint D after Steps 11-13

  - core actions and feedback primitives stable
  - accessibility baseline visible
  - no live flow replacements yet

  ## Checkpoint E after Step 14

  - shell-ready primitives exist
  - command input and scroll primitives render correctly
  - no product regression

  ## Final Checkpoint F

  - design foundation complete
  - contracts stable
  - migration guidance documented
  - Phase 2 can start without redesigning primitives

  ———

  # 18. Rollback Points

  ## Rollback Point 1

  After styles layer (tokens/themes/base/legacy-bridge/motion/utilities)

  - rollback by removing new style imports only

  ## Rollback Point 2

  After layout/surface primitives

  - rollback by leaving files unused

  ## Rollback Point 3

  After interaction/form/feedback primitives

  - rollback by removing isolated usage only
  - primitives remain in repo harmlessly

  ## Rollback rule

  Because Phase 1 is additive, rollback should be import-level, not deletion-level.

  ———

  # 19. Demo Validation Checkpoints

  Even though shell is not being built yet, demo path must stay safe.

  ## Validate after style layer

  - login page works
  - landing page works
  - upload page renders
  - chat page renders
  - current dark/light mode still works

  ## Validate after primitive creation

  - no regression in active demo path:
      - login
      - upload
      - chat
      - presentation basic render
      - compare basic render

  ## Rule

  If any style-layer change makes demo look unstable, stop and fix before continuing.

  ———

  # 20. Exact Definition Of Done For Phase 1

  Phase 1 is done only when all are true:

  1. Shared folder structure exists and is coherent.
  2. Token architecture is implemented and imported safely.
  3. Dark/light semantic theme system exists.
  4. Base, motion, utility, and legacy bridge CSS layers exist.
  5. Core layout primitives exist:
      - Stack
      - Inline
      - Grid
      - Divider
  6. Core surface primitives exist:
      - Surface
      - Panel
      - Card
  7. Core interaction primitives exist:
      - Button
      - IconButton
  8. Core form primitives exist:
      - Input
      - Textarea
      - Select
  9. Core feedback primitives exist:
      - Badge
      - StatusPill
      - Loader
      - Progress
      - EmptyState
  10. Shell-ready primitives exist:

  - ScrollArea
  - CommandInput
  - SectionHeader

  11. New primitives are domain-agnostic.
  12. Legacy pages still work without forced migration.
  13. Demo path remains intact.
  14. No shell/state/domain logic was prematurely introduced.
  15. Shared UI contracts are stable enough for Phase 2 and Phase 3.

  ———

  # 21. Practical Step Table

  ## Step 1

  - Purpose: create skeleton
  - Files: folders only
  - Dependencies: none
  - Rollback: none needed
  - Verification: repo still builds
  - Risk: low

  ## Step 2

  - Purpose: utility/config foundation
  - Files: shared lib/config files
  - Dependencies: Step 1
  - Rollback: leave unused
  - Verification: imports compile
  - Risk: low

  ## Step 3

  - Purpose: tokens
  - Files: tokens.css
  - Dependencies: Step 2
  - Rollback: remove import
  - Verification: no global breakage
  - Risk: medium

  ## Step 4

  - Purpose: themes
  - Files: themes.css
  - Dependencies: Step 3
  - Rollback: remove import
  - Verification: theme behavior intact
  - Risk: medium-high

  ## Step 5

  - Purpose: base layer
  - Files: base.css
  - Dependencies: Steps 3-4
  - Rollback: remove import
  - Verification: legacy pages still render correctly
  - Risk: medium-high

  ## Step 6

  - Purpose: legacy coexistence protection
  - Files: legacy-bridge.css
  - Dependencies: Step 5
  - Rollback: remove specific bridge rules
  - Verification: regression shield works
  - Risk: high

  ## Step 7

  - Purpose: motion foundation
  - Files: motion.css
  - Dependencies: Step 5
  - Rollback: remove import
  - Verification: reduced motion and basic animations safe
  - Risk: medium

  ## Step 8

  - Purpose: utility layer
  - Files: utilities.css
  - Dependencies: Step 7
  - Rollback: remove import
  - Verification: utility classes don’t override legacy unexpectedly
  - Risk: medium

  ## Step 9

  - Purpose: structural primitives
  - Files: Stack, Inline, Grid, Divider
  - Dependencies: style foundation
  - Rollback: keep unused
  - Verification: isolated rendering
  - Risk: low

  ## Step 10

  - Purpose: depth/surface primitives
  - Files: Surface, Panel, Card
  - Dependencies: Step 9
  - Rollback: keep unused
  - Verification: surface hierarchy works
  - Risk: medium

  ## Step 11

  - Purpose: interaction primitives
  - Files: Button, IconButton, Tabs, Tooltip
  - Dependencies: Step 10
  - Rollback: keep unused or remove isolated usage
  - Verification: keyboard/focus behavior okay
  - Risk: medium-high

  ## Step 12

  - Purpose: form primitives
  - Files: Input, Textarea, Select
  - Dependencies: Step 11
  - Rollback: do not swap into live forms yet
  - Verification: isolated form tests
  - Risk: high

  ## Step 13

  - Purpose: feedback primitives
  - Files: Badge, StatusPill, Loader, Progress, EmptyState
  - Dependencies: Step 10
  - Rollback: keep unused
  - Verification: semantic states clear
  - Risk: low-medium

  ## Step 14

  - Purpose: shell-oriented primitives
  - Files: ScrollArea, CommandInput, SectionHeader
  - Dependencies: Steps 11-12
  - Rollback: keep unused
  - Verification: shell-readiness without shell rollout
  - Risk: medium

  ## Step 15

  - Purpose: isolated adoption/smoke validation
  - Files: optional isolated preview surfaces only
  - Dependencies: all primitives done
  - Rollback: revert isolated usage
  - Verification: no demo regression
  - Risk: medium

  ## Step 16

  - Purpose: final validation and contract freeze
  - Files: docs/checklists if kept
  - Dependencies: all above
  - Rollback: N/A
  - Verification: Phase 1 done criteria satisfied
  - Risk: low

  ———

  # 22. Phase 1 Execution Rule Set

  1. Add, do not replace.
  2. Build primitives before using them.
  3. Protect legacy before touching globals.
  4. Do not migrate live forms early.
  5. Do not touch shell architecture yet.
  6. Do not introduce state ownership changes.
  7. Stop immediately on demo regression.
  8. Freeze contracts before Phase 2 begins.

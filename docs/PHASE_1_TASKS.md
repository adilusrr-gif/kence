 Phase 1 Scope
  Phase 1 covers only Shared UI System And Design Tokens. No business rewrites, no workspace logic, no routing changes,
  no backend changes. Output of this phase is a stable frontend foundation that new shell/workspace code can build on
  while legacy pages continue to work.

  Phase 1 Goals

  - extract reusable UI foundation from current monolithic CSS
  - define tokenized visual system for KENCE.ai as AI-native workspace
  - create low-level primitives for shell, panels, inputs, commands, status, layout surfaces
  - establish consistent theme, motion, glass, spacing, shadows, responsive, and accessibility rules
  - keep current app working during migration

  ———

  ## 1. Full Folder List

  src/
    app/
      styles/
        tokens.css
        themes.css
        base.css
        legacy-bridge.css
        motion.css
        utilities.css
    shared/
      ui/
        button/
        icon-button/
        input/
        textarea/
        select/
        badge/
        status-pill/
        surface/
        panel/
        card/
        tabs/
        tooltip/
        scroll-area/
        divider/
        empty-state/
        loader/
        progress/
        command-input/
        section-header/
        stack/
        inline/
        grid/
      lib/
        cn/
        tokens/
        a11y/
        responsive/
        motion/
      config/
        theme/
        ui/

  If TypeScript is introduced later, same structure can move to .ts/.tsx; Phase 1 should not depend on that.

  ———

  ## 2. Full File List

  src/app/styles/tokens.css
  src/app/styles/themes.css
  src/app/styles/base.css
  src/app/styles/legacy-bridge.css
  src/app/styles/motion.css
  src/app/styles/utilities.css

  src/shared/lib/cn/index.js
  src/shared/lib/tokens/getTokenValue.js
  src/shared/lib/a11y/focusRing.js
  src/shared/lib/responsive/breakpoints.js
  src/shared/lib/motion/presets.js

  src/shared/config/theme/theme.config.js
  src/shared/config/ui/ui.config.js

  src/shared/ui/button/Button.jsx
  src/shared/ui/button/index.js

  src/shared/ui/icon-button/IconButton.jsx
  src/shared/ui/icon-button/index.js

  src/shared/ui/input/Input.jsx
  src/shared/ui/input/index.js

  src/shared/ui/textarea/Textarea.jsx
  src/shared/ui/textarea/index.js

  src/shared/ui/select/Select.jsx
  src/shared/ui/select/index.js

  src/shared/ui/badge/Badge.jsx
  src/shared/ui/badge/index.js

  src/shared/ui/status-pill/StatusPill.jsx
  src/shared/ui/status-pill/index.js

  src/shared/ui/surface/Surface.jsx
  src/shared/ui/surface/index.js

  src/shared/ui/panel/Panel.jsx
  src/shared/ui/panel/index.js

  src/shared/ui/card/Card.jsx
  src/shared/ui/card/index.js

  src/shared/ui/tabs/Tabs.jsx
  src/shared/ui/tabs/index.js

  src/shared/ui/tooltip/Tooltip.jsx
  src/shared/ui/tooltip/index.js

  src/shared/ui/scroll-area/ScrollArea.jsx
  src/shared/ui/scroll-area/index.js

  src/shared/ui/divider/Divider.jsx
  src/shared/ui/divider/index.js

  src/shared/ui/empty-state/EmptyState.jsx
  src/shared/ui/empty-state/index.js

  src/shared/ui/loader/Loader.jsx
  src/shared/ui/loader/index.js

  src/shared/ui/progress/Progress.jsx
  src/shared/ui/progress/index.js

  src/shared/ui/command-input/CommandInput.jsx
  src/shared/ui/command-input/index.js

  src/shared/ui/section-header/SectionHeader.jsx
  src/shared/ui/section-header/index.js

  src/shared/ui/stack/Stack.jsx
  src/shared/ui/stack/index.js

  src/shared/ui/inline/Inline.jsx
  src/shared/ui/inline/index.js

  src/shared/ui/grid/Grid.jsx
  src/shared/ui/grid/index.js

  Optional documentation files for Phase 1:

  src/shared/ui/README.md
  src/app/styles/README.md

  ———

  ## 3. Dependency Order

  Implementation order inside Phase 1 must be strict:

  1. cn utility
  2. token architecture
  3. theme architecture
  4. base CSS and legacy bridge
  5. motion presets
  6. layout primitives: Stack, Inline, Grid, Divider
  7. surface primitives: Surface, Panel, Card
  8. form primitives: Input, Textarea, Select
  9. interaction primitives: Button, IconButton, Tabs, Tooltip
  10. feedback primitives: Badge, StatusPill, Loader, Progress, EmptyState
  11. shell-oriented primitive: CommandInput, SectionHeader, ScrollArea
  12. QA pass on dark/light, responsive, a11y
  13. document migration rules

  Dependency rules:

  - all components depend on tokens, not hardcoded page colors
  - Panel depends on Surface
  - Card depends on Surface
  - CommandInput depends on Input contract but can have specialized shell styling
  - StatusPill depends on semantic color tokens
  - Tabs must not encode business logic

  ———

  ## 4. Tailwind Architecture

  Tailwind should be used as a primitive composition layer, not as the design system source of truth.

  Role of Tailwind

  - layout utility composition
  - spacing/flex/grid helpers
  - responsive helpers
  - interaction states where class composition is clean

  Role of CSS variables

  - tokens
  - themes
  - glass surfaces
  - semantic colors
  - shadows
  - radii
  - typography scales
  - motion durations/easings

  Architecture

  - Tailwind classes consume CSS variables
  - avoid hardcoded Tailwind palette classes like bg-blue-500 in shared primitives
  - shared primitives should prefer semantic classes or inline var-driven classes
  - page-level legacy Tailwind remains allowed during migration, but new primitives should map to tokenized styles

  Pattern

  - good: bg-[hsl(var(--surface-1))]
  - bad: bg-white dark:bg-slate-900 repeated across components

  ———

  ## 5. Design Token Architecture

  Token layers:

  1. Core Tokens
     Raw visual values.
  2. Semantic Tokens
     Meaning-based values.
  3. Component Tokens
     Optional specialized mappings for shell primitives.

  ### Core tokens

  --color-neutral-0
  --color-neutral-50
  --color-neutral-100
  ...
  --color-cyan-400
  --color-cyan-500
  --color-red-500
  --color-amber-500
  --color-green-500

  --space-0
  --space-1
  --space-2
  ...
  --radius-xs
  --radius-sm
  --radius-md
  --radius-lg
  --radius-xl
  --radius-2xl

  --shadow-xs
  --shadow-sm
  --shadow-md
  --shadow-lg
  --shadow-xl
  --shadow-glass
  --shadow-focus

  --font-sans
  --font-mono
  --text-xs
  --text-sm
  --text-md
  --text-lg
  --text-xl
  --text-2xl

  --duration-fast
  --duration-base
  --duration-slow
  --ease-standard
  --ease-emphasized

  ### Semantic tokens

  --bg-app
  --bg-canvas
  --bg-surface-1
  --bg-surface-2
  --bg-surface-3
  --bg-overlay

  --text-primary
  --text-secondary
  --text-tertiary
  --text-inverse

  --border-subtle
  --border-default
  --border-strong

  --accent-primary
  --accent-primary-hover
  --accent-secondary

  --status-success
  --status-warning
  --status-danger
  --status-info

  --focus-ring
  --selection-bg

  ### Glass/system tokens

  --glass-bg
  --glass-bg-strong
  --glass-border
  --glass-highlight
  --glass-blur
  --glass-shadow

  Rules:

  - components consume semantic tokens first
  - never bind components directly to raw palette unless truly decorative
  - theme switching changes semantic mappings, not component code

  ———

  ## 6. Theme System

  Themes for Phase 1:

  - light
  - dark

  Optional future:

  - system
  - contrast-dark
  - contrast-light

  Theme application:

  - theme controlled through html[data-theme="dark"] or html.dark
  - current code already uses .dark; Phase 1 should support .dark for compatibility
  - recommended future-compatible model: data-theme, with compatibility bridge to .dark

  Theme responsibilities:

  - map semantic tokens
  - define shell background
  - define surface contrast hierarchy
  - define accent behavior
  - define glass appearance
  - define shadow intensity

  Rules:

  - do not use inverted light theme as dashboard theme
  - dark mode is default workspace-grade mode
  - light mode should remain operational, not decorative

  ———

  ## 7. Glassmorphism System

  KENCE.ai should use disciplined glass, not generic frosted cards everywhere.

  Glass tiers:

  1. glass-subtle
     lightweight overlay, utility rail, hover layer
  2. glass-panel
     sidebar/panel surface
  3. glass-modal
     overlays, command palette
  4. glass-focus
     high-attention shell modules

  Glass properties:

  - semi-transparent surface tint
  - controlled blur
  - border highlight
  - depth shadow
  - ambient glow only where intentional

  Rules:

  - glass only on shell surfaces and premium intelligence surfaces
  - dense content tables should prefer solid/semi-solid surfaces
  - avoid stacking blur on blur
  - text contrast must remain high

  Tokens:

  --glass-opacity-subtle
  --glass-opacity-panel
  --glass-opacity-modal
  --glass-blur-sm
  --glass-blur-md
  --glass-blur-lg

  ———

  ## 8. Motion / Animation System

  Motion must support “AI operating system” feel, not marketing-site theatrics.

  Motion categories:

  - enter
  - exit
  - emphasis
  - status
  - streaming
  - dock
  - panel-resize
  - focus-shift

  Shared presets:

  fadeInFast
  fadeInUp
  fadeScaleIn
  slideLeftPanel
  slideRightPanel
  dockExpand
  statusPulse
  skeletonShimmer

  Rules:

  - use meaningful motion only
  - durations must be tokenized
  - status motion should communicate processing state
  - panel transitions should preserve orientation
  - no bouncing animations in enterprise shell
  - disable/reduce motion under prefers-reduced-motion

  ———

  ## 9. Surface System

  Surface hierarchy should express workspace depth.

  Surface levels:

  - canvas
  - surface-1
  - surface-2
  - surface-3
  - overlay
  - glass-panel
  - glass-modal

  Component mapping:

  - Surface: generic depth container
  - Panel: structured surface with header/body/footer regions
  - Card: content grouping surface
  - Overlay: later phase, modal/drawer/popover surfaces

  Rules:

  - every surface must declare its level
  - nested surfaces should step depth intentionally
  - do not mix random border/shadow combinations per component

  ———

  ## 10. Typography System

  Type roles:

  - display
  - title
  - section
  - body
  - caption
  - mono

  Suggested semantic classes:

  - text-display-lg
  - text-title-md
  - text-section-sm
  - text-body-md
  - text-caption
  - text-code

  Rules:

  - workspace shell should prioritize clarity and density
  - large display type only for dashboard hero or major state headers
  - body copy must optimize scanability
  - mono reserved for IDs, logs, events, code-like data

  ———

  ## 11. Spacing / Radius / Shadow System

  ### Spacing

  Base 4px system:

  - space-0 = 0
  - space-1 = 4px
  - space-2 = 8px
  - space-3 = 12px
  - space-4 = 16px
  - space-5 = 20px
  - space-6 = 24px
  - space-8 = 32px
  - space-10 = 40px
  - space-12 = 48px

  ### Radius

  - xs = 6
  - sm = 8
  - md = 10
  - lg = 12
  - xl = 16
  - 2xl = 20

  ### Shadow

  - xs: fine separators
  - sm: default content surface
  - md: raised panel
  - lg: modal/palette
  - glass: ambient blurred shadow
  - focus: keyboard focus/selected shell state

  Rules:

  - shell uses medium radii; avoid consumer-app roundness
  - shadows should suggest depth, not card decoration overload

  ———

  ## 12. Component Contracts

  Every shared primitive must follow the same contract shape:

  - visual props are semantic, not page-specific
  - no domain props in shared UI
  - controlled state when applicable
  - accessibility semantics included
  - class extension via className
  - composition through children
  - asChild pattern optional later; not required in Phase 1

  Base prop conventions:

  - className
  - children
  - variant
  - size
  - tone
  - disabled
  - loading
  - aria-*
  - data-*

  ———

  ## 13. UI Primitive APIs

  ### Button

  Purpose: primary interaction trigger.

  Props:

  - variant: primary | secondary | ghost | subtle | danger
  - size: sm | md | lg
  - leadingIcon
  - trailingIcon
  - loading
  - disabled
  - block
  - className
  - children
  - native button props

  State rules:

  - loading implies disabled interaction
  - keyboard focus visible
  - icon-only should use IconButton, not Button

  Composition rules:

  - can include text + icons
  - no nested buttons
  - no business-specific styling in shared primitive

  Usage boundaries:

  - use for actions, not navigation-only links unless styled consistently by router wrapper later

  ### IconButton

  Purpose: compact shell and panel actions.

  Props:

  - variant
  - size
  - label required for accessibility
  - active
  - disabled
  - children icon node

  State rules:

  - must have accessible name
  - active state is semantic, not just hover

  Usage boundaries:

  - rail actions, panel controls, utility tools

  ### Input

  Purpose: tokenized single-line input.

  Props:

  - size
  - state: default | error | success
  - leadingIcon
  - trailingIcon
  - disabled
  - standard input props

  State rules:

  - visual state controlled by props
  - validation messaging external to primitive

  Usage boundaries:

  - forms, search bars, command bar bases

  ### Textarea

  Purpose: multiline input.

  Props:

  - resize: none | vertical
  - state
  - native textarea props

  Usage boundaries:

  - composer bases, notes, descriptions

  ### Select

  Purpose: tokenized native or wrapped select.

  Props:

  - options
  - value
  - onChange
  - placeholder
  - disabled
  - state

  Usage boundaries:

  - lightweight form controls only in Phase 1

  ### Badge

  Purpose: categorical label.

  Props:

  - variant: neutral | accent | success | warning | danger | info
  - size
  - children

  Usage boundaries:

  - statuses, tags, filters, scopes

  ### StatusPill

  Purpose: explicit runtime/system state.

  Props:

  - status: idle | active | success | warning | error | streaming
  - label
  - pulse
  - icon

  Usage boundaries:

  - system state, jobs, AI activity, not generic tags

  ### Surface

  Purpose: generic background depth primitive.

  Props:

  - level: canvas | 1 | 2 | 3 | overlay
  - glass: false | subtle | panel | modal
  - padding
  - bordered
  - elevated

  Usage boundaries:

  - only structure, no semantic headers/footers

  ### Panel

  Purpose: structured shell region.

  Props:

  - title
  - subtitle
  - headerActions
  - footer
  - scrollable
  - level
  - glass
  - children

  Composition rules:

  - header/body/footer regions
  - can contain widgets or content groups

  ### Card

  Purpose: compact grouped content.

  Props:

  - tone
  - interactive
  - children

  Usage boundaries:

  - dashboard summaries, grouped data, not shell containers

  ### Tabs

  Purpose: content switching.

  Props:

  - items
  - value
  - onValueChange
  - variant: underline | segmented | pills

  Usage boundaries:

  - local view switching, not router replacement in Phase 1

  ### Tooltip

  Purpose: explanatory hint.

  Props:

  - content
  - side
  - children

  Rules:

  - no essential information only in tooltip

  ### ScrollArea

  Purpose: styled container with overflow.

  Props:

  - orientation
  - maxHeight
  - children

  ### EmptyState

  Purpose: consistent zero-state.

  Props:

  - icon
  - title
  - description
  - actions

  ### Loader

  Purpose: standardized loading feedback.

  Props:

  - size
  - tone
  - label

  ### Progress

  Purpose: scalar progress display.

  Props:

  - value
  - max
  - variant

  ### CommandInput

  Purpose: shell-grade input for command/search surfaces.

  Props:

  - mode
  - scope
  - placeholder
  - leadingIcon
  - trailingActions
  - value
  - onChange
  - onSubmit

  Usage boundaries:

  - command bar, command palette, semantic search surfaces

  ### SectionHeader

  Purpose: panel/module section heading.

  Props:

  - title
  - subtitle
  - actions
  - dense

  ### Stack, Inline, Grid

  Purpose: structural layout primitives.

  Props:

  - gap/alignment/distribution props only

  Usage boundaries:

  - use instead of repetitive manual flex wrappers in new code

  ———

  ## 14. Naming Conventions

  Folders:

  - kebab-case
    Examples: status-pill, command-input

  Components:

  - PascalCase
    Examples: StatusPill, CommandInput

  Exports:

  - named exports preferred from component file
  - index.js re-export

  Tokens:

  - semantic lowercase kebab CSS vars
    Example: --bg-surface-1

  Variants:

  - lowercase string enums
    Example: variant="primary"

  Shared utilities:

  - simple verb/noun names
    Example: cn, focusRing, breakpoints

  Rules:

  - no FancyCard, CoolPanel, GlassBox
  - names must reflect role, not appearance gimmick

  ———

  ## 15. Import Conventions

  Use alias imports from @/ for all new shared modules.

  Examples:

  import { Button } from '@/shared/ui/button'
  import { Panel } from '@/shared/ui/panel'
  import { cn } from '@/shared/lib/cn'

  Rules:

  - shared modules import only from shared, app/styles, and low-level config/lib
  - shared UI must not import from pages, widgets, entities, features
  - widgets may import shared UI and entities
  - pages may import widgets and features, not vice versa

  ———

  ## 16. CSS Strategy

  CSS must be layered.

  ### CSS files responsibility

  - tokens.css: all core + semantic tokens
  - themes.css: light/dark theme mappings
  - base.css: reset, body, selection, focus baseline
  - motion.css: keyframes and reduced-motion handling
  - utilities.css: shared custom utility classes
  - legacy-bridge.css: compatibility overrides for old pages

  Rules:

  - Phase 1 must not delete legacy styles
  - new shared components should not rely on page-scoped classes
  - avoid giant single stylesheet again
  - no inline magic colors in component files unless token-driven

  ———

  ## 17. Responsive Strategy

  Shared UI primitives must be responsive by contract.

  Breakpoints:

  - sm
  - md
  - lg
  - xl
  - 2xl

  Principles:

  - primitives scale, layouts decide arrangement
  - compact variants available for shell-dense zones
  - inputs/buttons must support comfortable hit area
  - typography should compress slightly on laptop/tablet
  - shell primitives should work at narrow panel widths

  Rules:

  - components must survive inside 220px rail and 320px side panel
  - no fixed widths by default except where essential

  ———

  ## 18. Accessibility Baseline

  Every primitive must satisfy baseline a11y.

  Requirements:

  - visible focus ring
  - keyboard operable
  - accessible labels for icon-only controls
  - semantic roles preserved
  - sufficient color contrast in both themes
  - prefers-reduced-motion support
  - loading states announced where relevant
  - disabled state visually and semantically represented

  Component-specific:

  - Button / IconButton: native button semantics
  - Tabs: proper tablist semantics if custom-built
  - Tooltip: non-essential only
  - Loader: optional aria-label
  - Input / Textarea / Select: labelable and error-state compatible

  ———

  ## 19. Dark / Light Mode Architecture

  Theme layer must be semantic and symmetric.

  Structure:

  - root core tokens remain stable
  - themes.css remaps semantic tokens for light and dark
  - components never branch manually on theme except rare decorative cases

  Compatibility:

  - support existing .dark
  - future-ready data-theme="dark" and data-theme="light"

  Rules:

  - dark mode is not just inverted colors
  - shell depth must remain readable in both themes
  - glass tokens differ per theme
  - focus ring and border visibility must be tested in both modes

  ———

  ## 20. Migration Strategy From Current CSS

  Current index.css is the monolith. Phase 1 should not replace it at once.

  ### Migration steps

  1. Keep index.css intact.
  2. Add new layered style files.
  3. Import new style files before or alongside legacy styles.
  4. Use new shared primitives only in new shell/UI modules.
  5. Add legacy-bridge.css for compatibility mappings if needed.
  6. Gradually replace .btn-primary, .card, ad hoc inputs with primitives.
  7. Only after multiple phases, shrink legacy CSS.

  ### What can be reused

  - current tokens that are still valid conceptually
  - card.jsx as reference only
  - current dark mode toggle behavior
  - selected status styles from chat/upload/presentation

  ### What should not be reused as-is

  - page-specific hardcoded gradients
  - global .dark .bg-* override strategy as long-term model
  - mixed Tailwind/CSS semantic drift
  - one-file CSS ownership

  ———

  ## Implementation Order

  1. Create folders and cn
  2. Create token files and config skeleton
  3. Define theme mappings
  4. Add base, motion, utility, legacy bridge CSS
  5. Build Stack, Inline, Grid, Divider
  6. Build Surface, Panel, Card
  7. Build Button, IconButton
  8. Build Input, Textarea, Select
  9. Build Badge, StatusPill, Loader, Progress, EmptyState
  10. Build Tabs, Tooltip, ScrollArea
  11. Build CommandInput, SectionHeader
  12. Validate in dark/light and responsive conditions
  13. Produce usage rules and migration checklist

  ———

  ## Acceptance Criteria

  Phase 1 is complete when:

  - shared UI folder structure exists and is coherent
  - tokens are separated into layered CSS files
  - dark and light themes render consistently
  - at least core primitives exist with stable APIs
  - no new shared primitive depends on page code
  - new components use semantic tokens, not raw page colors
  - reduced motion is respected
  - focus visibility works across all interactive primitives
  - legacy pages still render without breaking
  - shell-ready primitives exist for next phase

  Minimal component completion set:

  - Button
  - IconButton
  - Input
  - Textarea
  - Badge
  - StatusPill
  - Surface
  - Panel
  - Card
  - Tabs
  - ScrollArea
  - Loader
  - EmptyState
  - CommandInput
  - Stack
  - Inline
  - Grid

  ———

  ## Anti-Patterns

  - creating page-specific components inside shared/ui
  - hardcoding colors in JSX
  - importing pages/* into shared primitives
  - baking domain language into primitives
  - making Panel aware of workspace/session logic
  - duplicating button variants in different folders
  - adding random Tailwind classes per usage instead of tokenized variants
  - using glass effect on every content block
  - implementing dark mode with component-level if (dark)
  - keeping legacy .btn-primary as the long-term standard
  - animation without reduced-motion fallback
  - fixed width components that break narrow rails/panels

  ———

  ## Enterprise-Grade Frontend Rules

  1. Shared UI is domain-agnostic.
  2. Tokens are the source of truth; components consume tokens.
  3. Semantic color mapping lives in theme layer, not component logic.
  4. Every primitive must support keyboard navigation and visible focus.
  5. Visual variants are finite and documented.
  6. No component should require global page CSS to look correct.
  7. Responsive behavior is a contract, not an afterthought.
  8. Shared components must be composable but not over-generic.
  9. Motion must communicate state, hierarchy, or system activity.
  10. Glass is a shell language, not a decorative default.
  11. New code uses alias imports from @/.
  12. Legacy CSS can coexist temporarily but cannot define new architecture.
  13. Dense enterprise UI should optimize scanability over visual novelty.
  14. Primitives should be stable enough to support shell, dashboard, chat, compare, and studio surfaces without
     redefinition.

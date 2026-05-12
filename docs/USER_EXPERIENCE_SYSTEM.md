 UX System Goal
  KENCE.ai must behave like an intelligent workspace that quietly handles complexity for the user. Internally it can
  remain enterprise-grade, multimodal, event-driven, and AI-native. Externally it should feel calm, guided, forgiving,
  and obvious.

  Core UX principle:
  Power is layered. Complexity is earned, not imposed.

  The user should always feel:

  - “I know where I am”
  - “I know what to do next”
  - “The AI is helping me”
  - “I can’t break anything”
  - “If I get lost, the system will guide me back”

  ———

  ## 1. Cognitive Load Reduction System

  ### Primary strategy

  Reduce simultaneous decisions, not just visual noise.

  ### Rules

  - one primary action per screen region
  - one primary question per moment
  - one dominant interpretation of AI output before advanced details
  - default to summaries before structures
  - hide secondary controls until user intent is clear

  ### Cognitive reduction layers

  1. Action reduction
     Show only most likely next actions.
  2. Language reduction
     Replace technical labels with user-centered labels.
  3. Decision reduction
     Smart defaults select mode, scope, and output shape.
  4. Visual reduction
     Progressive hierarchy, grouped controls, stable positions.
  5. Context reduction
     Only show intelligence relevant to current object/session.

  ### UX rule

  Never present the raw system architecture to the user. Present tasks.

  ———

  ## 2. Progressive Disclosure Architecture

  ### Principle

  Everything advanced exists, but almost nothing advanced appears first.

  ### Disclosure levels

  1. Immediate
     Essential action, current context, AI suggestion.
  2. Expanded
     More options, evidence preview, alternate actions.
  3. Advanced
     Filters, trace, graph, provenance, technical controls.
  4. Expert
     orchestration state, event diagnostics, graph neighborhoods, execution timelines.

  ### UI pattern

  - summary card first
  - “show why”
  - “show sources”
  - “show advanced”
  - “open detailed workspace”

  ### Example

  Instead of showing:

  - entities
  - risks
  - provenance
  - graph links
  - metrics
  - timeline
    all at once,

  show:

  - “Here are the 3 important findings”
  - “Potential risk found”
  - “Would you like to see why?”

  ———

  ## 3. Beginner-to-Expert UX Scaling

  ### Model

  Same product, different visible complexity.

  ### Scaling mechanisms

  - role/mode presets
  - adaptive panel visibility
  - AI-recommended shortcuts
  - contextual surfaces instead of static menus
  - gradual feature exposure based on usage

  ### Rule

  Expert features should not disappear from architecture. They should become opt-in layers.

  ———

  ## 4. AI-Guided Onboarding

  ### Goal

  The system teaches by doing, not by tutorial walls.

  ### Onboarding phases

  1. Welcome orientation
     “Upload a document or ask a question.”
  2. First success moment
     quick summary, simple answer, visible source proof
  3. First guided action
     “I can compare this”, “I can create slides”, “I can find risks”
  4. First workspace understanding
     explain tabs, context, pinned items, activity timeline
  5. Power discovery
     introduce graph, analytics, advanced compare only after confidence is built

  ### AI onboarding agent behavior

  - greets in plain language
  - suggests one next step
  - explains results simply
  - notices hesitation signals and reduces complexity
  - offers “show me” patterns instead of documentation dumps

  ———

  ## 5. Workspace Orientation System

  Users should never be disoriented.

  ### Orientation surfaces

  - clear workspace name
  - current document/session chip
  - current mode label: Ask, Analyze, Compare, Present
  - current scope label: This document, This workspace, All selected documents
  - visible AI status: Thinking, Reading sources, Ready

  ### Orientation questions always answerable

  - Where am I?
  - What am I working on?
  - What is the AI looking at?
  - What can I do next?
  - What is happening right now?

  ### Anchors

  - left rail = where to go
  - top bar = what I can ask
  - canvas = what I’m doing
  - right panel = why this result exists
  - bottom rail = what the system is doing

  ———

  ## 6. Empty States Architecture

  Empty states are critical trust-building surfaces.

  ### Types

  - no documents
  - no active session
  - no insights yet
  - no graph data yet
  - no metrics extracted yet
  - no comparison selected
  - no activity history
  - failed generation

  ### Empty state structure

  - plain-language title
  - reassuring explanation
  - one primary next action
  - optional one-click AI suggestion
  - preview of outcome

  ### Example

  Bad:

  - “No context available”

  Good:

  - “Nothing is loaded yet”
  - “Upload a file and I’ll summarize it, find important points, and answer questions.”
  - Upload document

  ———

  ## 7. AI Copiloting UX

  ### AI’s UX role

  AI is not just a responder. It is a navigator, explainer, and confidence builder.

  ### Copilot behaviors

  - suggest next best action
  - detect dead ends
  - propose simplifications
  - explain what it is doing
  - ask clarifying questions only when necessary
  - convert user goals into system actions

  ### Copilot tone

  - plain
  - calm
  - concrete
  - non-technical
  - never blaming
  - never overwhelming

  ### Copilot patterns

  - “I found 3 key points.”
  - “This looks like a policy document. I can summarize it or find risks.”
  - “I’m comparing the two files now.”
  - “I’m not fully certain about this claim. Here are the source sections.”

  ———

  ## 8. Simplified Intelligence Presentation

  ### Principle

  Intelligence should feel understandable before it feels powerful.

  ### First-layer intelligence objects

  Show:

  - key findings
  - important risks
  - main entities
  - useful dates
  - important numbers

  Hide initially:

  - relation strength
  - confidence vectors
  - provenance internals
  - execution graph
  - rerank stages
  - advanced graph topology

  ### Simplification pattern

  - What matters
  - Why it matters
  - Where it came from
  - What you can do next

  ———

  ## 9. Adaptive UI Complexity System

  ### Purpose

  The UI changes how much it reveals based on mode, role, context, and user behavior.

  ### Complexity dimensions

  - number of visible controls
  - number of simultaneously visible panels
  - intelligence detail depth
  - diagnostic verbosity
  - navigation density

  ### Complexity triggers

  - explicit mode selection
  - repeated usage confidence
  - task type
  - device size
  - user hesitation signals
  - user role

  ### System behavior

  - novice users get guided flow and summary-first UI
  - advanced users get denser dashboards and richer controls
  - complexity expands without changing core mental model

  ———

  ## 10. Command Simplification Layer

  ### Goal

  Turn system capabilities into natural user intentions.

  ### User-facing commands should sound like:

  - “Summarize this”
  - “Compare these documents”
  - “Find important risks”
  - “Explain this section”
  - “Make slides from this”
  - “Show me the timeline”
  - “What changed?”
  - “What should I pay attention to?”

  ### Do not expose as primary language:

  - retrieval
  - embeddings
  - reranking
  - pipeline orchestration
  - graph traversal
  - inference chain

  ### Command model

  Natural language first, structured controls second.

  ———

  ## 11. Natural Language-First Interactions

  ### Principle

  Every important system capability should be invocable through simple language.

  ### Supported intents

  - ask
  - explain
  - summarize
  - compare
  - translate
  - extract
  - generate
  - highlight
  - show sources
  - show timeline
  - show risks

  ### UX rules

  - the user should not need to know modes before asking
  - the system can infer likely intent and confirm gently
  - if ambiguity exists, offer 2-3 clear options

  Example:
  User: “What’s important here?”
  System:

  - “I can summarize the whole document”
  - “I can list risks”
  - “I can extract key dates”

  ———

  ## 12. AI Recommendations System

  ### Recommendation categories

  - next action
  - hidden opportunity
  - missing context
  - useful comparison
  - possible risk
  - export opportunity
  - graph exploration opportunity

  ### Placement

  - welcome cards
  - result footer actions
  - right-panel suggestions
  - empty states
  - post-task completion cards

  ### Rules

  - recommendations must be low-pressure
  - maximum 1 primary and 2 secondary suggestions
  - recommendations must explain value, not just action

  ———

  ## 13. Contextual Help System

  ### Help types

  - inline helper text
  - AI explanation bubbles
  - “what is this?” tooltips
  - contextual walkthrough prompts
  - expandable “learn more”
  - recovery prompts after error/confusion

  ### Rules

  - help should appear where confusion happens
  - help should use the user’s current object and task
  - help should not dump documentation
  - help should be dismissible and stateful

  ### Example

  Instead of “Graph view shows semantic relationships”:
  “This view shows which people, topics, and documents are connected.”

  ———

  ## 14. Visual Hierarchy System

  ### Hierarchy order

  1. current task
  2. current answer/result
  3. current next action
  4. current source proof
  5. advanced details
  6. system diagnostics

  ### Visual rules

  - strongest contrast for primary task/result
  - subdued styling for secondary metadata
  - consistent iconography for object types
  - use spacing more than borders to create clarity
  - avoid dashboard overload for novice-oriented modes

  ### Layout density

  - low density for novice/executive
  - medium density for professional
  - high density for analyst

  ———

  ## 15. User Confidence-Building UX

  ### Confidence signals

  - clear AI status
  - visible source evidence
  - confidence language in plain terms
  - easy undo/retry
  - stable workspace state
  - no unexplained output jumps

  ### Confidence language patterns

  - “I found this in 2 sections of the document.”
  - “This is likely important because…”
  - “I’m not fully certain. Here is the exact source.”
  - “You can verify this by opening the source.”

  ### Trust rule

  Never pretend certainty where there is uncertainty.

  ———

  ## 16. Error Recovery UX

  ### Goal

  Errors should feel recoverable, not catastrophic.

  ### Error UX structure

  - what happened
  - what it means in plain language
  - what the user can do now
  - one-click recovery if possible
  - preserve context and work

  ### Example

  Bad:

  - “Pipeline timeout”

  Good:

  - “This analysis took too long.”
  - “Your document is still safe. You can try again, ask a smaller question, or continue working in this workspace.”
  - Retry Ask simpler question Continue

  ———

  ## 17. AI Explainability UX

  ### Explainability layers

  1. Simple explanation
     “I highlighted these points because they appear repeatedly and relate to your question.”
  2. Source explanation
     “These sections were used.”
  3. Reasoning structure
     “The AI compared extracted sections and found a contradiction.”
  4. Technical trace
     advanced provenance and execution stages

  ### Rule

  Explainability should scale with user need.
  Most users need clarity, not technical trace.

  ———

  ## 18. Child / Simple-User Usability Principles

  If a child or non-technical adult should succeed, the system must follow:

  - obvious next step
  - forgiving mistakes
  - minimal jargon
  - visual reassurance
  - direct feedback
  - predictable placement of controls
  - simple verbs
  - visible cause and effect
  - no hidden danger
  - one-click recovery

  ### Language rules

  Prefer:

  - “Ask”
  - “Show”
  - “Find”
  - “Compare”
  - “Make”
  - “Explain”

  Avoid:

  - “orchestrate”
  - “semantic retrieval”
  - “context propagation”
  - “provenance lineage”
    as primary UX language

  ———

  ## 19. Enterprise-User Power Tools

  Power tools must exist without dominating baseline UX.

  ### Power tool surfaces

  - graph explorer
  - advanced compare controls
  - provenance viewer
  - task execution timeline
  - metric filtering
  - multi-session workspace tabs
  - docked widgets
  - advanced scope controls
  - export chains
  - intelligence filters

  ### Rule

  Power tools live behind:

  - advanced mode
  - analyst mode
  - expandable sections
  - explicit “show advanced”

  ———

  ## 20. Accessibility-First UX

  ### Core requirements

  - keyboard-first navigation support
  - screen-reader understandable structure
  - visible focus states
  - reduced motion support
  - readable contrast
  - plain-language microcopy
  - no reliance on color alone
  - large enough targets for touch and low precision users

  ### UX accessibility rule

  Accessibility is not separate from simplicity.
  The more understandable the interface, the more accessible it becomes.

  ———

  # User Modes

  ## Novice Mode

  ### Visible complexity

  - very low
  - one main panel focus
  - simplified right panel
  - activity rail mostly hidden or summarized

  ### Available controls

  - upload
  - ask
  - summarize
  - compare
  - generate slides
  - show sources

  ### Intelligence depth

  - summary only
  - simple risks
  - main entities
  - top dates/numbers

  ### Dashboard density

  - low
  - large cards
  - few actions

  ### AI interaction style

  - guiding
  - proactive
  - friendly
  - one-step-at-a-time

  ———

  ## Professional Mode

  ### Visible complexity

  - medium
  - stable shell visible
  - some secondary actions shown

  ### Available controls

  - all common document workflows
  - tabs
  - contextual suggestions
  - export actions
  - evidence review

  ### Intelligence depth

  - medium
  - grouped insights
  - visible risks
  - selected evidence
  - basic timeline and metrics

  ### Dashboard density

  - medium
  - useful status + active work + recommendations

  ### AI interaction style

  - concise
  - practical
  - task-oriented

  ———

  ## Analyst Mode

  ### Visible complexity

  - high but structured
  - multiple panels and filters visible
  - richer dock usage

  ### Available controls

  - advanced compare
  - graph navigation
  - provenance
  - execution/task detail
  - scoped analysis and filters
  - cross-document exploration

  ### Intelligence depth

  - deep
  - entities, relationships, timelines, metrics, provenance, graph overlays

  ### Dashboard density

  - high
  - dense information, filters, live activity

  ### AI interaction style

  - precise
  - terse
  - evidence-heavy
  - traceable

  ———

  ## Executive Mode

  ### Visible complexity

  - low-medium
  - strategic summaries
  - minimal operational detail

  ### Available controls

  - ask high-level questions
  - view summaries
  - view risks
  - view metrics
  - generate briefing / slides / report

  ### Intelligence depth

  - top-line insights
  - strategic risks
  - KPIs
  - short timelines
  - evidence on demand only

  ### Dashboard density

  - low-medium
  - briefing-oriented

  ### AI interaction style

  - concise
  - outcome-focused
  - non-technical
  - confidence-aware

  ———

  # Additional UX Systems

  ## 1. Workspace Simplification Logic

  - if no document loaded, show single next step
  - if one document loaded, bias to ask/summarize/extract
  - if two documents loaded, bias to compare
  - if insights exist, bias to review risks/metrics/timeline
  - if outputs exist, bias to open/download/share/export
  - if user appears idle, suggest one meaningful next step

  ## 2. AI-Generated UX Assistance

  The AI can generate:

  - suggested next actions
  - simplified summaries
  - “what this means” explanations
  - smart labels for technical outputs
  - gentle recovery suggestions
  - mini guided walkthroughs based on current workspace state

  ## 3. Smart Defaults System

  Defaults should minimize setup.

  - infer mode from action and assets
  - infer scope from active document/session
  - open most likely useful panel automatically
  - summarize first, expand later
  - preserve last successful workspace layout per mode
  - default to safest/simple explanation layer

  ## 4. Guided Workflows

  Examples:

  - Upload -> Summarize -> Ask -> Find risks -> Export
  - Open two files -> Compare -> Show differences -> Generate report
  - Upload report -> Extract KPIs -> Build executive summary -> Create slides

  Guided workflows should feel like rails, not forms.

  ## 5. Visual Intelligence Simplification

  - show grouped cards first
  - use human labels: “People”, “Organizations”, “Important dates”, “Potential issues”
  - replace raw structures with digestible clusters
  - allow “See all details” expansion

  ## 6. Human-Friendly AI Explanations

  Templates:

  - “I found…”
  - “This matters because…”
  - “I used these parts of the document…”
  - “You may want to…”
  - “I’m less certain here because…”

  ## 7. Fear / Friction Reduction UX

  - no destructive-feeling language
  - preserve user state on failure
  - always provide back path
  - no blank states after errors
  - show that AI is working, not frozen
  - show “you can try again safely”

  ## 8. Interactive Learning UX

  - learn-by-doing prompts
  - explain controls at moment of first use
  - celebrate first successful workflows subtly
  - remember dismissed hints
  - expose advanced capability only after basic success

  ## 9. Context-Sensitive UI

  The UI changes based on:

  - assets loaded
  - current mode
  - user level/mode
  - active task
  - confidence state
  - device size

  Example:
  If the active object is a compare session, the command bar and right panel should prefer:

  - differences
  - contradictions
  - changed metrics
  - evidence pairs

  ## 10. One-Click Intelligence Flows

  Core one-click actions:

  - Summarize this
  - Find risks
  - Show key dates
  - Extract important numbers
  - Compare these

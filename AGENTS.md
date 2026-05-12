# KENCE.ai Engineering Rules

## Core Rules

- additive changes only unless explicitly requested
- do not rewrite legacy pages unless requested
- do not modify backend contracts
- preserve runnable state after every step
- avoid broad refactors
- preserve shell-first migration strategy
- preserve future intelligence-layer compatibility

## Current Phase

PHASE 1 — Shared UI System + Design Tokens Foundation

## Current Constraints

- no Zustand yet
- no shell implementation yet
- no routing rewrites
- no business/domain logic in shared primitives
- no aggressive legacy migration

## Implementation Style

- composition-first
- semantic token usage
- accessibility baseline required
- dark/light compatibility required
- future workspace-shell compatibility required

## Response Style

Keep responses short:
- changed files
- purpose
- build status
- regressions avoided

Avoid long explanations unless requested.
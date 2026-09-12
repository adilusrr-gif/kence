# P0-02 Stage E.1 — Read-Only Migration Reconciliation Analysis — 2026-08-05

Continuation of `docs/ALEMBIC_SCHEMA_RECONCILIATION_2026-08-04.md`. Stage E
diagnostic execution (`alembic upgrade head` against a disposable restore)
is **PASS**, and confirms P0-02 remains **OPEN**. This document is Stage E.1:
read-only analysis only. No DDL, no `stamp`, no code change, no production
access. All evidence below is either read directly from the disposable
`kence-restore-postgres` container (still running, untouched since the
Stage E failure) or from static inspection of the repository.

Raw evidence: `ops/schema_audit/evidence/stage_e1_upgrade_head_attempt.log`,
`ops/schema_audit/evidence/stage_e1_drift_matrix_raw.txt`.

## 1. Stage E evidence summary

| Fact | Value |
|---|---|
| Target | `127.0.0.1:15432`, db `kenceai`, container `kence-restore-postgres` (disposable, project `kenceai_restore_test`) |
| Command | `DATABASE_URL=... alembic upgrade head` |
| Exit code | `1` |
| Revisions attempted | `398a7bf8d359` (0001, no-op) → `02805ff7fe64` (0002) → `bdac53748917` (0003) → `a3d1dc26da57` (0004, **failed**) |
| Failure | `psycopg2.errors.DuplicateColumn: column "org_id" of relation "chat_messages" already exists`, statement `ALTER TABLE chat_messages ADD COLUMN org_id INTEGER` |
| Post-failure `alembic current` | empty (no revision stamped) |
| Post-failure `alembic_version` table | does not exist (`to_regclass` → NULL) |
| Post-failure `uq_session_share_user`/`uq_session_share_org` | do not exist |
| Conclusion | The entire 0001→0004 attempt rolled back atomically — **zero net schema change** from the invocation |

`alembic/env.py:70-78` runs the whole `run_migrations_online()` inside one
`with context.begin_transaction():` block, with no `transaction_per_migration`.
This is the direct, code-level cause of the all-or-nothing rollback — same
mechanism the original audit observed in its ALEMBIC-ONLY test (§3.2), just
triggered by a different migration (0004 here vs 0002 there), because this
run started from a database that already has `create_all()`-provisioned
tables/columns rather than a truly empty one.

## 2. Revision-by-revision drift matrix

Columns/FKs/indexes below are read directly from the disposable restore
(`stage_e1_drift_matrix_raw.txt`). "Observed" = executed in this session's
transcript before rollback. "Projected" = not reached (transaction aborted
before it), inferred from static comparison of the migration file against
the model and the restored schema — flagged explicitly, never asserted as
fact.

| Rev | Migration | Ran in Stage E? | Target objects | Restored-DB actual state | Classification |
|---|---|---|---|---|---|
| 0001 | `398a7bf8d359` baseline | Observed, no-op | (none — `pass`) | n/a | `not_applicable` |
| 0002 | `02805ff7fe64` workspace_share_partial_unique | Observed, succeeded (then rolled back with the rest) | `uq_session_share_user`, `uq_session_share_org` on `workspace_shares` | Both **absent** post-rollback; `workspace_shares` has 0 rows (no dedup risk) | `missing` — confirmed absent both before and after this Stage E attempt; migration itself is correct and idempotent (`CREATE UNIQUE INDEX IF NOT EXISTS`), it just never got a chance to commit |
| 0003 | `bdac53748917` agent_task_org_id_not_null | Observed, succeeded (then rolled back) | `agent_tasks.org_id NOT NULL` | Already `is_nullable = NO` (matches model, matches `create_all()`+prior history) | `pre-existing_from_create_all`, `exact_match` — the backfill UPDATEs are no-ops (no NULL rows), the `ALTER COLUMN SET NOT NULL` is a harmless no-op on an already-NOT-NULL column |
| 0004 | `a3d1dc26da57` chat_message_add_org_id | Observed, **failed** | `chat_messages.org_id` (nullable, FK→organizations, no ondelete), `ix_chat_messages_org_id` | Column exists: `integer`, `is_nullable=YES`, FK `NO ACTION` — **identical** to what the migration would create. Index `ix_chat_messages_org_id` also already exists, identical definition | `pre-existing_from_create_all`, `exact_match` on definition — the crash is **not** a definitional drift, it is the migration statement's lack of an existence guard (`op.add_column` unconditional, unlike 0006/0007) |
| 0005 | `c9e2f1a3b4d5` usage_logs_add_org_id | **Not reached** (transaction aborted at 0004) | `usage_logs.org_id` (migration specifies `ondelete="SET NULL"`), 3 indexes | Column exists: `integer`, nullable, FK **`NO ACTION`** (not SET NULL). All 3 indexes (`ix_usage_logs_org_event`, `ix_usage_logs_org_created`, `ix_usage_logs_org_id`) already exist, identical definitions | **Projected**: would fail identically to 0004 (`DuplicateColumn` on `op.add_column`) — same unguarded pattern. **Additional finding**: even if this migration somehow ran, its `ondelete="SET NULL"` would never apply here, because `add_column` errors before that clause is ever reached — **migration 0005 as currently written cannot fix drift #2 on any already-`create_all()`-bootstrapped database**, which is every real deployment (`create_all()` always runs first, unconditionally, at every app startup). This is `unsafe_to_assume` fixed by 0005 alone — confirmed by code reading, not by execution |
| 0006 | `d4f7a1b2c3e6` create_translation_jobs | **Not reached** | `translation_jobs` table + 7 indexes | Table exists, all columns/indexes match model exactly | `exact_match`, migration is guarded (`if "translation_jobs" in inspector.get_table_names(): return`) — **projected to succeed as a no-op** if reached |
| 0007 | `e5b9c2d47a10` create_library_document_content | **Not reached** | `library_document_content` table + unique index, backfill INSERT | Table exists, columns/index match model exactly; 0 rows (no library docs with a live session to backfill from in this dataset) | `exact_match`, migration is guarded identically to 0006, backfill uses a `LEFT JOIN ... WHERE c.id IS NULL` guard — **projected to succeed as a no-op** if reached |
| n/a | `_ensure_schema_upgrades()` (`main.py:64-144`, not an Alembic revision) | Not part of this Alembic chain at all | `document_library.{doc_kind,direction,issuer,doc_number,doc_date,session_id}`, `knowledge_graph_nodes.session_id`, `agent_tasks.session_id`, 3 FK `ondelete` recreations | All columns present; `document_library.doc_kind` has **server_default** `'document'::character varying` (confirmed again here — matches original audit drift #4: the *model* only has a Python-side `default=`, not `server_default`, so `create_all()` alone would not produce this default; only `_ensure_schema_upgrades()`'s `ADD COLUMN ... DEFAULT 'document'` did) | `pre-existing_from_create_all`-plus-`_ensure_schema_upgrades()` — third schema authority, confirmed still active and still the sole source of this specific server-default and of `ix_kg_nodes_session_id`/`ix_agent_tasks_session_id` |

No enums, extensions (besides built-in `plpgsql`), triggers, functions, or RLS
policies exist in the restored copy — unchanged from the original Stage A
finding, re-confirmed directly rather than assumed from the 2026-08-04 report.

## 3. Root cause

- **Why production-derived databases have no `alembic_version`**: no
  environment has ever had `alembic upgrade` (or `stamp`) run to completion
  against it through the CLI. The schema was provisioned entirely by
  mechanism (2) `Base.metadata.create_all()` (idempotent, additive-only,
  runs unconditionally at every app startup, `main.py:52-56`) plus mechanism
  (3) `_ensure_schema_upgrades()` (ad-hoc raw DDL, also unconditional at
  startup, `main.py:64-144`). Mechanism (1), the Alembic chain, has existed
  in the repository the whole time but was never the thing that actually
  built any running database.
- **Which objects were created by `create_all()`**: all 23 base tables and
  their SQLAlchemy-model-declared columns/indexes/FKs — i.e., everything
  observed as `pre-existing_from_create_all` in §2 (agent_tasks.org_id,
  chat_messages.org_id + index, usage_logs.org_id + 3 indexes,
  translation_jobs, library_document_content, and their indexes).
- **Which Alembic objects are absent despite equivalent columns existing**:
  only the two `workspace_shares` partial unique indexes (0002) and the
  `usage_logs_org_id_fkey` `ON DELETE SET NULL` (0005's intent) — these are
  the only two objects across the entire 7-migration chain that **cannot**
  be produced by `create_all()` at all (partial unique indexes and
  non-default `ondelete` are not expressible via the current SQLAlchemy
  model declarations — `WorkspaceShare`'s own docstring in `models.py:277-279`
  says so explicitly). Every other migration's target object already exists
  via `create_all()`/`_ensure_schema_upgrades()` acting independently of
  Alembic.
- **Whether any database has already applied the historical revisions**:
  no. Zero evidence anywhere (production or this restore) of `alembic
  upgrade` ever succeeding. The two objects that only Alembic could have
  created are absent; everything else that IS present is fully explained by
  create_all()/`_ensure_schema_upgrades()` without invoking Alembic at all.
- **Whether historical migration files may safely remain immutable**: yes,
  with one caveat. 0001, 0002, 0006, 0007 are safe as-is (0001 is a no-op;
  0002 is correct and idempotent, just never applied; 0006/0007 are
  correctly guarded). 0003 is safe as-is (its ALTER is a harmless no-op on
  already-NOT-NULL data). **0004 and 0005 are not safe to run unmodified
  against any `create_all()`-bootstrapped database** — not because their
  intent is wrong, but because they lack an existence guard that 0006/0007
  already demonstrate is the established pattern in this same file set.
  Editing them in place would violate "historical migrations are immutable."
  The correct fix is a NEW forward migration that supersedes what 0004/0005
  attempt, not an edit of 0004/0005 themselves.
- **Whether the outer transaction is intentional**: functionally yes — it
  is what makes a partial failure roll back completely rather than leaving
  the schema half-migrated with no record of where it stopped. This Stage E
  run is direct proof it works exactly that way (zero net change after the
  0004 failure). Per your explicit instruction, `transaction_per_migration`
  is **not** proposed as a fix — it would trade this clean, whole rollback
  for silent partial application, which is strictly worse for a schema this
  entangled with three overlapping authorities.

## 4. Recommended remediation architecture (design only, not implemented)

**Alembic becomes the only production schema authority.** Concretely:

1. **Remove `_ensure_schema_upgrades()` and the runtime `create_tables()`
   call from `main.py`'s startup path** (outside isolated test/dev — e.g.
   gate both behind an explicit `ALLOW_RUNTIME_SCHEMA_BOOTSTRAP` env flag
   that defaults false in any environment with `DATABASE_URL` pointing at a
   real Postgres, and is only ever true for the SQLite-backed test suite,
   which the code already special-cases — `_ensure_schema_upgrades()`'s own
   except-block comment acknowledges "SQLite (tests) lacks ADD COLUMN IF NOT
   EXISTS"). This is the step that actually stops the three-authority
   problem from continuing to exist, not just documents it.
2. **A fail-closed legacy-adoption procedure**, run once, explicitly, by an
   operator — never automatic, never at app startup:
   - Compute a **complete schema fingerprint** of the target database:
     every table × column × type × nullability × default × every FK (with
     `ondelete`) × every index (including partial/expression predicates,
     verbatim from `pg_indexes.indexdef`) × every unique/check constraint ×
     sequences × enums/extensions/triggers/functions/RLS — i.e., exactly the
     categories enumerated in this document's §2 header, machine-comparable
     (a JSON structure, not prose), not just "table/column exists".
   - Compare that fingerprint against the fingerprint **head** (`e5b9c2d47a10`
     plus the two forward-only repair migrations from `docs/
     ALEMBIC_SCHEMA_RECONCILIATION_2026-08-04.md` §7.1/§7.2) would produce on
     a truly clean database (i.e., `alembic upgrade head` from empty —
     which itself first requires fixing 0001 to actually create the schema
     instead of being a no-op, see step 3 below).
   - **Exact match** on every category → safe to `stamp` at that revision.
     **Any difference** (even a column-ordering-only difference, though this
     document's §2/original Stage A already found column ordering to be the
     only currently-known cosmetic-only class) → abort loudly, report the
     exact differences, persist zero DDL. A blind `stamp head` is never
     performed, matching your instruction explicitly.
3. **Fix Alembic's ability to bootstrap a truly empty database from
   scratch** (currently disproven, original audit §3.2) — this requires
   0001 to stop being a no-op and instead literally build the baseline
   schema (everything `create_all()` currently builds), OR — the safer
   alternative, given "historical migrations remain immutable" — introduce a
   **new squashed baseline** migration chained after the current head, whose
   `upgrade()` builds the complete schema from nothing (idempotent, guarded
   like 0006/0007), and treat 0001–0007 as a historical record that is only
   ever relevant to an environment that already has data (via the
   fingerprint-and-stamp adoption path in step 2), never executed start-to-
   finish on an empty database again. **This is the "new squashed baseline
   plus bridge" option** from your question in §4 of the request — it is the
   one this analysis recommends, because it does not require editing or
   reasoning about whether 0003/0004/0005's backfill UPDATE statements are
   safe to run against a hypothetical empty database with no `organizations`/
   `users` rows yet (they are not obviously safe in that order — 0003's
   backfill joins `users`/`org_memberships`, which do not exist before 0001
   in a true from-scratch run today).
4. **New forward migrations, not edits**: a migration correcting 0004/0005's
   lack of guards (idempotent add-column, matching the 0006/0007 pattern)
   plus the two repair migrations from the original document (§7.1
   workspace_shares indexes, §7.2 `usage_logs` FK → `SET NULL`, per your
   already-confirmed decision) — all chained after whatever revision the
   squashed baseline (step 3) lands on, never inserted into or rewriting
   0001–0007.
5. Simple `if "table" in inspector.get_table_names(): return`-style guards
   (0006/0007's current pattern) are correct for **table**-level existence
   but are explicitly **insufficient** for column/constraint/index-level
   changes per your instruction — the fingerprint comparison in step 2 is
   the actual safety mechanism; per-migration guards are a secondary,
   defense-in-depth convenience, not the source of truth for "is this safe
   to apply."

**Exact safe adoption revision, based on this drift matrix**: there is no
existing revision in the current chain that the restored (or production)
database can be honestly stamped at yet, because revision e5b9c2d47a10
(current head) implies the two Alembic-only objects (workspace_shares
partial unique indexes, usage_logs FK SET NULL) exist — and they do not.
The database can only be honestly stamped once (a) the new guarded
replacement for 0004/0005's intent runs, (b) the repair migrations for
§7.1/§7.2 run, and (c) the fingerprint comparison in step 2 shows exact
equivalence to what the full corrected chain (new baseline + repairs) would
produce from empty. Until then, **any stamp is a blind stamp**, prohibited
by your instruction.

## 5. Future disposable test matrix (to pass before any GO)

| Case | Setup | Required outcome |
|---|---|---|
| A — empty Postgres | Fresh disposable DB, no tables | `alembic upgrade head` (post-remediation chain) succeeds unaided |
| B — fresh production restore, no `alembic_version` | Exactly this Stage E's starting state | Adoption procedure (§4 step 2) runs, fingerprint matches, stamps correctly; `alembic upgrade head` from that stamp then succeeds (likely a no-op if already at head) |
| C — already-versioned database | A DB previously adopted per (B) | Plain `alembic upgrade head` succeeds, no adoption procedure re-triggered |
| D — deliberately incompatible unversioned database | Disposable DB seeded with a synthetic drift (e.g. `usage_logs.org_id` as `bigint` instead of `integer`, or a missing index) not matching the fingerprint | Adoption procedure fails closed, reports the exact field(s) that differ, persists zero DDL — verified by re-running the fingerprint check and confirming no schema change occurred |
| E — crash during adoption | Kill the adoption process mid-fingerprint-comparison or mid-stamp (before commit) | Both the reconciliation DDL (if any was about to run) and the version stamp roll back together — no partially-adopted state |
| F — application startup | Any of the above states, backend container started normally | Zero implicit schema creation — `create_tables()`/`_ensure_schema_upgrades()` calls removed/gated per §4 step 1, startup only reads `alembic_version` to confirm it's at the expected revision (fails loudly to start if not, rather than silently `create_all()`-ing) |

For every successful case (A/B/C), verify: `alembic current == head`; exactly
one `alembic_version` row; every constraint/index from the fingerprint
present with byte-identical `pg_get_constraintdef`/`indexdef`; zero duplicate
columns/indexes; zero catalog drift versus the fingerprint; full backend test
suite (133/133 per the original audit) passes against the resulting schema.

## 6. Rollback approach

- Every new forward migration (0004/0005 replacement, §7.1, §7.2) ships a
  real `downgrade()` — additive-only changes (new guarded column-adds,
  `CREATE UNIQUE INDEX CONCURRENTLY`, FK constraint replacement) have
  straightforward inverses (`DROP INDEX CONCURRENTLY`, restore prior FK),
  matching the pattern the original document already committed to in §7.1/§9.
- The adoption procedure (§4 step 2) is itself transactional: fingerprint
  comparison and stamp happen in one transaction; any DDL needed to close a
  gap happens in its own preflight-checked, abort-on-mismatch transaction
  before the stamp — never partially committed (this is what test case E
  verifies).
- No downgrade path is proposed for `_ensure_schema_upgrades()`'s removal
  itself beyond "re-add the flag/code from version control" — this is a
  code change with a normal git revert, not a data migration, so it carries
  no data-loss risk either direction.

## 7. Acceptance gates (restated precisely for this analysis)

- Every category in the §2 drift matrix reaches `exact_match` or
  `not_applicable` — no `missing`, no `name_exists_but_definition_differs`,
  no `unsafe_to_assume` remaining.
- Test matrix cases A–F (§5) all pass on disposable infrastructure.
- `_ensure_schema_upgrades()` and unconditional `create_tables()` are gated
  out of any real-Postgres startup path (§4 step 1), verified by starting
  the backend against an intentionally-unmigrated disposable DB and
  confirming it refuses to start rather than silently bootstrapping it.
- Full backend test suite green against the fully-remediated schema.
- A second, independent read-only 3-way comparison (production vs.
  MODEL-ONLY vs. remediated-chain-from-empty) shows zero unexplained drift,
  re-run fresh at that time (schema/data may have moved since this pass).

## 8. Explicit list of unresolved decisions

1. **Squashed baseline vs. edited-0001 bootstrap** (§4 step 3) — this
   analysis recommends the squashed-baseline-plus-bridge approach and gives
   the reason (0003's backfill isn't safely orderable against a truly empty
   `users`/`org_memberships`), but this is a recommendation, not yet a
   decision you've confirmed.
2. **Exact mechanism for gating `_ensure_schema_upgrades()`/`create_tables()`
   at startup** (§4 step 1) — an env flag was proposed as one option; a
   separate CLI-only bootstrap command is another; not decided.
3. **Whether the adoption procedure (§4 step 2) is a one-off manual script
   or a permanent, re-runnable operational tool** — needed at least once for
   the current production database, but its long-term home (throwaway
   script vs. `ops/`-tracked tool) isn't decided.
4. **Fingerprint format/storage** — proposed as "a JSON structure", but
   whether it's checked into the repo (versioned alongside each migration,
   so `alembic upgrade head`'s expected end-state is always concretely
   diffable) or generated on demand from `target_metadata` + raw catalog
   queries at adoption time isn't decided.
5. **Timing relative to Revision 6** — this Stage E.1 analysis, and the
   remediation it recommends, is itself a prerequisite chain of work
   (new migrations, adoption tooling, startup-gating change) that has not
   been scoped for effort/duration the way P0-01/P0-02 were in the original
   roadmap audit — no estimate is given here, and none should be assumed.

Revision 6 implementation remains **NO-GO**. P0-02 remains **OPEN** until a
newly restored disposable copy passes the full approved remediation
procedure and every acceptance gate in §7, confirmed by a fresh Stage E-style
diagnostic run at that time — not by re-reading this document.

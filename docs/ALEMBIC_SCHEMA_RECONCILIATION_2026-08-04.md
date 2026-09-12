# Alembic / Production Schema Reconciliation — 2026-08-04

Read-only audit (Stages A–C) plus text-only remediation proposals (Stage D). **No DDL or DML was ever executed against production** (`kence-postgres`). All schema-building and mutation work happened in a fully isolated, disposable Postgres instance (`kence-schema-audit-pg`, project `kenceai_schema_audit`, fresh volume, loopback port `35432`, throwaway credentials) that shares no volume, network, or container with production. Raw evidence referenced throughout is saved under `ops/schema_audit/evidence/`. No repair migration was created, no `alembic stamp` was run anywhere, no historical migration was edited, and nothing was committed or pushed.

## 1. Scope and constraints honored

- Production touched only via read-only `SELECT`, `pg_get_constraintdef()`, `pg_dump --schema-only --no-owner --no-privileges`, and catalog views (`pg_class`, `pg_policies`, `pg_extension`, `pg_proc`, `pg_trigger`, `pg_tables`, `pg_stat_user_tables`).
- All schema construction (four states below) happened against `kence-schema-audit-pg`, never `kence-postgres`.
- No `alembic upgrade`/`downgrade`/`stamp` was ever run with `DATABASE_URL` pointed at production.
- No historical migration file was edited.
- `git` state unchanged since P0-01: branch `master-clean`, HEAD `65a31d5f467b2cb7a0b694ece668383b9ae1005d`.

## 2. Stage A — baseline evidence

### 2.1 Alembic revision chain

Confirmed single linear chain (every `down_revision` used exactly once), head `e5b9c2d47a10`:

| order | revision | file | down_revision |
|---|---|---|---|
| 1 | `398a7bf8d359` | `0001_baseline_schema.py` | `None` |
| 2 | `02805ff7fe64` | `0002_workspace_share_partial_unique.py` | `398a7bf8d359` |
| 3 | `bdac53748917` | `0003_agent_task_org_id_not_null.py` | `02805ff7fe64` |
| 4 | `a3d1dc26da57` | `0004_chat_message_add_org_id.py` | `bdac53748917` |
| 5 | `c9e2f1a3b4d5` | `0005_usage_logs_add_org_id.py` | `a3d1dc26da57` |
| 6 | `d4f7a1b2c3e6` | `0006_create_translation_jobs.py` | `c9e2f1a3b4d5` |
| 7 | `e5b9c2d47a10` | `0007_create_library_document_content.py` | `d4f7a1b2c3e6` |

**No multiple heads, no branches.**

### 2.2 Production `alembic_version`

Direct read-only `SELECT * FROM alembic_version;` against `kence-postgres`:

```
ERROR:  relation "alembic_version" does not exist
```

The table does not exist. Production has never been tracked by the Alembic CLI in its current state (or was tracked once and the table was later lost — see §4's architectural finding for why this is plausible either way).

### 2.3 Production catalog inventory (read-only)

- **PostgreSQL 16.13**.
- **23 tables**, full schema captured via `pg_dump --schema-only --no-owner --no-privileges` → `ops/schema_audit/evidence/prod_schema.sql` (1,842 lines).
- **RLS**: `SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND (relrowsecurity OR relforcerowsecurity);` → **0 rows**. `SELECT * FROM pg_policies;` → **0 rows**. No RLS anywhere.
- **Triggers**: `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal;` → **0 rows**.
- **Extensions**: `SELECT extname FROM pg_extension;` → only `plpgsql` (built-in).
- **Custom types/enums**: none (`pg_type` query returned only the implicit per-table composite/array types Postgres always creates).
- **Functions**: `SELECT proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public';` → **0 rows**.
- **Owners/grants**: single owning role `kence` for every table; `SELECT c.relname FROM pg_class c ... WHERE c.relacl IS NOT NULL` → **0 rows** (no explicit grants beyond default owner privileges); `SELECT rolname FROM pg_roles WHERE rolname NOT LIKE 'pg_%';` → only `kence`.

## 3. Stage B — four schema states, built and captured

### 3.1 PRODUCTION
Already covered in §2.3.

### 3.2 ALEMBIC-ONLY — `alembic upgrade head`, no app startup involved

Executed against a freshly created, completely empty disposable database, using the actual `backend/alembic/` directory bind-mounted into a throwaway container built from the real `docai-backend:latest` image (so the exact same Alembic/SQLAlchemy versions and migration code run) — **no** `create_tables()`, **no** `_ensure_schema_upgrades()`, no backend app import beyond what Alembic itself needs.

**Notable side-finding**: the deployed `docai-backend:latest` image does not contain `alembic.ini`/`backend/alembic/` at all — only `app/` and `requirements.txt` were copied in the Dockerfile. Migrations cannot be run from the container as shipped; they require the repo checkout's `alembic/` directory to be supplied separately (as done here via bind mount).

**Result — full traceback in `ops/schema_audit/evidence/alembic_only_run.log`**:
```
INFO  [alembic.runtime.migration] Running upgrade  -> 398a7bf8d359, 0001_baseline_schema
INFO  [alembic.runtime.migration] Running upgrade 398a7bf8d359 -> 02805ff7fe64, 0002_workspace_share_partial_unique
...
sqlalchemy.exc.ProgrammingError: (psycopg2.errors.UndefinedTable) relation "workspace_shares" does not exist
LINE 2:         DELETE FROM workspace_shares
```

Exactly as predicted: migration 0002 fails immediately because `workspace_shares` (like every other base table) was never created — migration 0001 is a documented no-op ("existing schema was created via `create_all()`").

**Post-failure state, read-only checked**:
```sql
SELECT * FROM alembic_version;   -- ERROR: relation "alembic_version" does not exist
SELECT tablename FROM pg_tables WHERE schemaname='public';  -- 0 rows
```

**The entire database is left completely empty — not even `alembic_version` exists.** This is because `backend/alembic/env.py` wraps the whole `upgrade head` run in one outer transaction (`context.begin_transaction()`, no `transaction_per_migration=True`), so migration 0002's failure rolls back migration 0001's no-op too. Schema dump: `ops/schema_audit/evidence/alembic_only_schema.sql` (0 objects).

**Finding**: the Alembic migration chain, unaided, **cannot provision a new environment from scratch** — it structurally depends on something else (in practice, `create_all()`) having already created the base tables.

### 3.3 APP-BOOTSTRAPPED — ALEMBIC-ONLY database + one real invocation of `_ensure_schema_upgrades()`

Took the ALEMBIC-ONLY database exactly as it stood (empty) and invoked the real, unmodified `app.main._ensure_schema_upgrades()` function against it (imported and called directly, `DATABASE_URL` pointed at the disposable DB) — no mocking.

**Result**: ran to completion with `INFO` logs only (no visible errors, because every statement block is wrapped in `try/except Exception: logger.debug(...)`, and debug-level logs aren't shown at the default level). Read-only check afterward:
```sql
SELECT tablename FROM pg_tables WHERE schemaname='public';  -- 0 rows, still
```
Schema dump (`ops/schema_audit/evidence/app_bootstrapped_schema.sql`) is **byte-identical** to the ALEMBIC-ONLY dump except for `pg_dump`'s random per-run `\restrict`/`\unrestrict` session tokens.

**Finding**: `_ensure_schema_upgrades()`'s per-block exception handling **silently swallows** every "relation does not exist" error when run against a database that was never bootstrapped by `create_all()`. Zero net effect — proving this function provides no fallback bootstrap capability of its own; it is purely an additive patcher over an already-`create_all()`-provisioned schema.

### 3.4 MODEL-ONLY — `Base.metadata.create_all()` only

Fresh disposable database, `create_tables()` called directly (no Alembic anywhere).

**Result**: 23 tables created — matching production's table count exactly. Full dump: `ops/schema_audit/evidence/model_only_schema.sql` (1,835 lines). Catalog checks repeated for this state (RLS/policies/triggers/extensions/functions all **0**, matching production).

### 3.5 PRODUCTION vs MODEL-ONLY — the real comparison

Full diff (sorted, `--no-owner --no-privileges` boilerplate and per-run `\restrict` tokens excluded — nothing else normalized) in `ops/schema_audit/evidence/prod_vs_model_only.diff`. Three real findings plus one cosmetic-only class of difference:

1. **`document_library.doc_kind`**: production has `DEFAULT 'document'::character varying NOT NULL` (a real server-side default); MODEL-ONLY has `NOT NULL` with **no server default** (the model only sets a Python-side `default=`, not `server_default`).
2. **`ix_kg_nodes_session_id`**: present in production, **absent** in MODEL-ONLY (the model has no `index=True` on `knowledge_graph_nodes.session_id`; this index exists only via `_ensure_schema_upgrades()`'s raw `CREATE INDEX IF NOT EXISTS`).
3. **Column ordering only** (`agent_tasks.session_id`, `document_library`'s trailing columns): cosmetic — caused by `ALTER TABLE ADD COLUMN` always appending at the end (how these columns were actually added historically) vs. `CREATE TABLE`'s declared field order (how `create_all()` lays them out). No functional difference; PostgreSQL does not care about column order for any of the constructs in this schema. Listed here so it is not mistaken for something hidden.
4. **Not visible in this diff, but confirmed separately via `pg_get_constraintdef`**: `usage_logs.org_id`'s FK has no `ON DELETE` clause in **both** production and MODEL-ONLY (`FOREIGN KEY (org_id) REFERENCES organizations(id)`, no `SET NULL`) — i.e. production and the model **agree** with each other here; the disagreement is against migration 0005 specifically (see drift register).

### 3.6 `_ensure_schema_upgrades()` idempotency proof (dedicated experiment, MODEL-ONLY base)

Built on top of §3.4's MODEL-ONLY database (real tables exist, so the function's statements have real targets — running this against the near-empty ALEMBIC-ONLY state would only prove idempotency vacuously). Seeded one representative row into every table the function touches:

```sql
INSERT INTO organizations ...; INSERT INTO users ...; INSERT INTO doc_sessions ...;
INSERT INTO document_library ...; INSERT INTO knowledge_graph_nodes ...;
INSERT INTO agent_tasks ...; INSERT INTO graph_extraction_jobs ...; INSERT INTO workspace_shares ...;
```

**Step 0 (pre)**: schema dump (`idempotency_step0_pre.sql`) + per-table row count and an `md5(string_agg(md5(row::text)))` content checksum per table (`idempotency_step0_data.txt`).

**Run 1**: `_ensure_schema_upgrades()` invoked for real. Logged:
```
Schema upgrades applied
knowledge_graph_nodes session_id FK set to ON DELETE SET NULL
graph_extraction_jobs/workspace_shares session_id FKs set to ON DELETE CASCADE
```
**Step 0 → Step 1 schema diff** (`idempotency_step0_pre.sql` vs `idempotency_step1_post_run1.sql`): exactly **one** real change —
```diff
+CREATE INDEX ix_kg_nodes_session_id ON public.knowledge_graph_nodes USING btree (session_id);
```
The three `DROP CONSTRAINT`+`ADD CONSTRAINT` FK-recreation statements executed real DDL but produced **no net schema difference**, because the model already defines those exact FKs with those exact `ondelete` values — confirmed by the diff showing nothing for them.

**Step 0 → Step 1 data diff** (`idempotency_step0_data.txt` vs `idempotency_step1_data.txt`): **empty** — all 5 seeded tables' row counts and content checksums identical before and after. No data was lost or altered by the DROP+ADD CONSTRAINT cycle.

**Run 2**: `_ensure_schema_upgrades()` invoked again, identical log lines.

**Step 1 → Step 2 schema diff** (`idempotency_step1_post_run1.sql` vs `idempotency_step2_post_run2.sql`): **empty** (`diff` exit code 0).
**Step 1 → Step 2 data diff** (`idempotency_step1_data.txt` vs `idempotency_step2_data.txt`): **empty** (`diff` exit code 0).

**Conclusion, evidenced**: `_ensure_schema_upgrades()` **is idempotent** against an already-bootstrapped schema — the second run changes nothing, in schema or data. This claim is backed by the four diff files above, all committed to `ops/schema_audit/evidence/`, not asserted from reading the code alone.

Separately (§3.5, finding 1): the function is **not** capable of retroactively adding `document_library.doc_kind`'s server-side default to an environment where the model already created that column without one — `ADD COLUMN IF NOT EXISTS` is a true no-op once the column exists, regardless of its default. Confirmed empirically: `idempotency_step2_post_run2.sql` still shows `doc_kind character varying(32) NOT NULL` with no `DEFAULT` clause, even after two runs.

## 4. Architectural finding — three overlapping schema authorities

1. **Alembic migrations** (`backend/alembic/versions/`) — 5 of 7 files assume their target tables already exist (no existence guards); only 0006/0007 are defensively idempotent.
2. **`Base.metadata.create_all()`** — called unconditionally every app startup (`main.py:_init_db` → `create_tables()`). Additive-only; never alters existing tables.
3. **Raw hand-written DDL in `main.py::_ensure_schema_upgrades()`** (lines 64–144) — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `DROP CONSTRAINT`+`ADD CONSTRAINT` (three FK recreations with `ondelete` values not specified anywhere else), run unconditionally every startup, entirely outside Alembic's tracking.

§3.2–3.6 empirically prove: (1) is not self-sufficient without (2) having run first; (3) provides zero value without (2) either (§3.3) but is safely idempotent once (2) has run (§3.6); and production's actual schema (23 tables, correct `org_id` columns, `translation_jobs`/`library_document_content` present) is consistent with (2)+(3) having run repeatedly, while (1) specifically shows a gap only at migration 0002's objects — see drift register.

## 5. Drift register

| # | Object | Expected (migration) | Production | ALEMBIC-ONLY | MODEL-ONLY (+idempotent run) | Model | Probable cause | Severity | Data risk | Recommended fix |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `workspace_shares` unique indexes `uq_session_share_user` / `uq_session_share_org` | Both present (migration 0002, `CREATE UNIQUE INDEX IF NOT EXISTS ... WHERE ...`) | **Both absent** (verified: only 4 plain non-unique indexes exist) | N/A (table doesn't exist in this state) | Both absent (SQLAlchemy can't express partial unique indexes via `__table_args__`; comment-only in the model) | Comment-only reference, not enforced | Migration 0002 was never actually executed against production via the Alembic CLI (consistent with `alembic_version` not existing at all) | **Medium** | None currently — 0 rows in `workspace_shares`, 0 duplicates for either predicate (verified live, §6) | Forward-only repair migration: `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS` for both, with an in-migration preflight duplicate check that aborts loudly if violated |
| 2 | `usage_logs_org_id_fkey` `ON DELETE` behavior | `SET NULL` (migration 0005 explicit `ondelete="SET NULL"`) | **`NO ACTION`** (plain, verified via `pg_get_constraintdef`) | N/A | `NO ACTION` (matches production — model has no `ondelete` specified either) | No `ondelete` specified | Model was never updated to match migration 0005's stated intent; whatever provisioned production followed the model/`create_all()` path, not the migration's exact FK spec | **Low–Medium** | None — FK already enforced, orphans structurally impossible (confirmed 0, §6) | Decision needed (Stage D): (a) forward migration to `DROP`+`ADD` the FK with `ON DELETE SET NULL` to match original intent [recommended], or (b) declare `NO ACTION` intentional and update migration 0005's docstring + the model to agree |
| 3 | `ix_kg_nodes_session_id` | Not from any migration — sole authority is `_ensure_schema_upgrades()` | Present | N/A | Absent in pure MODEL-ONLY; **present** after one `_ensure_schema_upgrades()` run, confirmed unchanged after a second run | No `index=True` on this column | Index is created only by mechanism (3); model was never updated to declare it | **Low** (informational/process, not a current defect — production already correct) | None | Recommend eventually migrating this into a tracked Alembic migration so Alembic alone can reproduce it (matches roadmap P0-02 recommendation); not urgent |
| 4 | `document_library.doc_kind` server default | Not from any migration — mechanism (3) sets `DEFAULT 'document'` when it *creates* the column | Has server default `'document'::character varying` | N/A | **No server default**, proven to persist even after two `_ensure_schema_upgrades()` runs (§3.6) — `ADD COLUMN IF NOT EXISTS` cannot retrofit a default onto a column the model already created without one | Python-side `default="document"` only, no `server_default` | Production's column predates the model including it (created by mechanism 3's `ADD COLUMN ... DEFAULT`); on any fresh install today, `create_all()` creates the column first (no default) and mechanism (3) permanently no-ops on it | **Low** — ORM inserts always supply the value; only a raw/direct SQL `INSERT` omitting `doc_kind` would behave differently (fails fresh-install, succeeds in production) | None | Add `server_default="document"` to the model column — cheap, safe, closes the gap for any future fresh install |
| 5 | `alembic_version` table | Should exist, pointing at `e5b9c2d47a10` | **Does not exist** | Does not exist after failed run | N/A | N/A | Direct consequence of #1 — a real `alembic upgrade` run through the CLI would create/populate this table; its total absence combined with #1's specific gap is the strongest evidence Alembic's CLI was never run to completion against this database | **Informational** (umbrella finding, not separately actionable) | None | **Not fixed by `stamp`** — see §7.3 gating conditions; not proposed as remediation here at all |
| 6 | Column ordering (`agent_tasks.session_id`, `document_library` trailing columns) | N/A | Trailing (appended via historical `ALTER TABLE`) | N/A | Declared position (via `CREATE TABLE`) | — | `ALTER TABLE ADD COLUMN` always appends; `create_all()` uses declaration order | **None — cosmetic only** | None | No action — documented so it isn't mistaken for a hidden/omitted difference |

## 6. Stage C — data safety analysis (read-only against production)

```sql
-- workspace_shares duplicate check for uq_session_share_user
SELECT session_id, shared_with, count(*) FROM workspace_shares
WHERE shared_with IS NOT NULL GROUP BY session_id, shared_with HAVING count(*) > 1;
-- 0 rows

-- workspace_shares duplicate check for uq_session_share_org
SELECT session_id, org_id, count(*) FROM workspace_shares
WHERE shared_with IS NULL GROUP BY session_id, org_id HAVING count(*) > 1;
-- 0 rows

-- workspace_shares total rows
SELECT count(*) FROM workspace_shares;  -- 0

-- usage_logs.org_id orphan check
SELECT count(*) FROM usage_logs u LEFT JOIN organizations o ON u.org_id=o.id
WHERE u.org_id IS NOT NULL AND o.id IS NULL;  -- 0
```

**Table sizes** (re-checked at Stage C time, `pg_stat_user_tables`): `doc_sessions` 10MB/0 rows, `agent_tasks` 3.2MB/466 rows, `knowledge_graph_nodes` 872KB/1,755 rows, `usage_logs` 480KB/1,001 rows, `audit_events` 488KB/984 rows, `document_library` 112KB/0 rows, `translation_jobs` 216KB/0 rows, `chat_messages` 368KB/0 rows. All small — at this scale `CREATE INDEX CONCURRENTLY` lock time is negligible; no maintenance window is required for either currently-known drift. Sizes should be re-confirmed again immediately before Stage E if time has passed.

**Design note for the eventual repair migration**: `CREATE INDEX CONCURRENTLY` cannot run inside Alembic's default transactional migration wrapper — it needs `postgresql_concurrently=True` on `op.create_index()` combined with Alembic's `autocommit_block()` (or an equivalent non-transactional context) for that migration.

## 7. Stage D — remediation proposals (text only, no migration file created)

### 7.1 Drift #1 — missing `workspace_shares` unique indexes
Propose a forward-only repair migration (new revision, `down_revision = e5b9c2d47a10`):
- Preflight: re-run the exact §6 duplicate-detection queries inside the migration; if either returns rows, **abort loudly** (raise, do not silently delete/dedupe — deleting rows is a data-changing decision that belongs to a human, not an automated migration).
- `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_session_share_user ON workspace_shares (session_id, shared_with) WHERE shared_with IS NOT NULL;`
- `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_session_share_org ON workspace_shares (session_id, org_id) WHERE shared_with IS NULL;`
- Migration must run in `autocommit_block()` (required for `CONCURRENTLY`).
- Downgrade: `DROP INDEX CONCURRENTLY IF EXISTS` for both.

### 7.2 Drift #2 — `usage_logs.org_id` FK `ondelete` mismatch
Presented as a decision, not decided here:
- **(a) [recommended]** Forward migration: `ALTER TABLE usage_logs DROP CONSTRAINT usage_logs_org_id_fkey, ADD CONSTRAINT usage_logs_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL;` — matches migration 0005's original, documented intent; avoids org-deletion being unexpectedly blocked by `usage_logs` rows.
- **(b)** Declare `NO ACTION` intentional; update migration 0005's docstring and the `UsageLog.org_id` model column to stop claiming `SET NULL`.
- No data risk either way (§6 confirms 0 orphans, and this FK is already enforced).

### 7.3 Drift #5 — missing `alembic_version` table
**`stamp` is not proposed as remediation anywhere in this document** — it executes no migration SQL and would not fix drift #1, #2, #3, or #4. Per the explicit gating for this task, stamping production may only even be *proposed* (as a separate, future task) once **all** of the following hold:
1. Every repair procedure above has been validated end-to-end on a restored production clone (Stage E — not run in this pass).
2. Production shows **no unexplained drift** from the exact repository HEAD, re-confirmed by re-running this same 3-way comparison after the repairs land.
3. Every object created by `_ensure_schema_upgrades()` (drift #3, #4, and the three FK recreations) is either represented by a forward migration or explicitly, in writing, classified as intentionally outside Alembic.
4. The exact target revision hash to stamp is recorded in that future task.

### 7.4 Drifts #3 and #4 — `_ensure_schema_upgrades()`-only objects
Not remediated by a migration in this pass. §3.6 already answers whether the function is "safely idempotent" with evidence (yes, once bootstrapped). Recommended structural direction (matches the roadmap's own P0-02 suggestion): migrate `_ensure_schema_upgrades()`'s statements into proper tracked Alembic migrations over time (add `server_default` to the model for drift #4; add a real migration creating `ix_kg_nodes_session_id` for drift #3) so Alembic becomes the sole schema authority. Not urgent — both are low severity and production is already correct.

### 7.5 Column ordering (drift #6)
No fix proposed — cosmetic only, documented in §5 so it isn't mistaken for something hidden.

**Historical migrations are never edited. `stamp` is never used as remediation. Every proposed fix above is forward-only.**

## 8. Proposed rollout plan (for when a specific remediation is approved — not executed in this pass)

1. Take a fresh backup via `ops/backup/backup.sh` (P0-01 tooling) immediately before any production change.
2. Draft the approved repair migration(s) (§7.1 and/or §7.2, per user decision).
3. **Stage E** (separately gated, not run here): restore that backup into an isolated DB (`ops/backup/restore.sh`), apply the repair migration there only, verify constraints/indexes/counts/integrity, run the backend test suite against the restored+repaired copy, re-run this document's 3-way comparison to confirm convergence with zero unexplained remaining drift.
4. Only after Stage E passes cleanly: schedule a production window (none of the currently-known drifts require downtime given table sizes in §6, but confirm sizes again at that time), apply the approved migration(s) to production with `alembic upgrade` (never `stamp`) using the standard `ops/backup/backup.sh` pre-flight backup as the safety net.
5. Immediately after: re-run the read-only Stage A/B checks against production to confirm the specific drift(s) are gone and nothing new appeared.
6. Only after that clean re-check, and after §7.3's four conditions are separately satisfied, consider (as its own future task) recording production's true state via `alembic_version`.

## 9. Rollback / forward-fix strategy

- All proposed repair migrations are additive (new indexes, FK constraint replacement) — no data is deleted, no column is dropped. Standard Alembic `downgrade()` is sufficient (`DROP INDEX CONCURRENTLY`, restore prior FK definition) and is part of the migration file itself once drafted.
- If a repair migration fails partway in production despite the Stage E clone test passing (e.g. concurrent write introduced a duplicate between backup time and rollout time), the preflight check in §7.1 aborts before any DDL runs — no partial state to roll back.
- If the FK-replacement migration (§7.2) needs to be reverted, `downgrade()` restores the original `NO ACTION` FK — no data loss either direction.
- The pre-rollout backup (step 1, §8) is the ultimate rollback path for anything unforeseen.

## 10. Acceptance checklist

- [x] Production not modified (only read-only `SELECT`/`pg_dump --schema-only` executed against `kence-postgres`, confirmed via container status unchanged throughout)
- [x] Alembic revision chain unambiguously determined — single linear chain, head `e5b9c2d47a10`, no branches
- [x] Production schema and each disposable state (ALEMBIC-ONLY, APP-BOOTSTRAPPED, MODEL-ONLY) compared, with raw diff files saved
- [x] Every drift found is listed in §5 with object/expected/production/state/model/cause/severity/risk/fix
- [x] Data-integrity conflicts checked for every drift implying a new constraint (§6, query output included, not asserted)
- [ ] Remediation tested on a disposable production clone — **not done in this pass** (Stage E, gated on separate approval)
- [ ] Clean DB successfully migrates to HEAD via Alembic alone — **disproven**, not achieved (§3.2); this is itself a finding, not a pending checkbox to later satisfy via the same mechanism — see §4/§7.4 for the structural recommendation
- [x] Historical migrations not rewritten
- [x] Neither `stamp` nor `upgrade` was ever run against production
- [x] No secrets appear in this file or in any evidence file under `ops/schema_audit/evidence/`

## 11. Machine-readable drift list

See `ops/schema_audit/evidence/drift_register.json`.

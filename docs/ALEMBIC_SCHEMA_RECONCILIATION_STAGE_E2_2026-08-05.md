# P0-02 Stage E.2 — Final Executable Remediation Plan (design only)

Builds on `docs/ALEMBIC_SCHEMA_RECONCILIATION_2026-08-04.md` (Stages A–D) and
`docs/ALEMBIC_SCHEMA_RECONCILIATION_STAGE_E1_2026-08-05.md` (Stage E/E.1
diagnostic + drift matrix). **Analysis and plan only — nothing in this
document has been executed.** No DDL, no `stamp`, no code edit, no service
restart, no commit/push, no production access occurred while producing it.

## 0. Architecture decision (requirement 8)

**Chosen: squashed baseline + bridge. Rejected: legacy adoption on top of the
existing incremental chain.**

Reason, grounded in the Stage E.1 evidence, not preference: to make
`alembic upgrade head` work unaided against a **truly empty** database
(test case A), *something* has to actually create the 23 base tables before
migration `0002` can touch `workspace_shares` — today `0001` is a literal
`pass` (`398a7bf8d359_0001_baseline_schema.py:26-27`), which is exactly why
the original audit's ALEMBIC-ONLY test failed there. Making the *existing*
chain self-sufficient from empty would require either:

- editing `0001` to build the pre-0002 schema (an edit to a historical file
  regardless — and a fragile one, since it means reconstructing what the
  schema looked like on 2026-06-06 before `0002`/`0003`/`0004` ran *the same
  day*, per their `Create Date` headers — real archaeology, not a mechanical
  fix), **or**
- adding existence guards to `0002`/`0004`/`0005` so they tolerate both an
  empty and a pre-populated starting point (edits to three historical
  files, each independently reasoned about).

Both paths require editing historical migrations. **Squashed baseline +
bridge requires editing zero of them.** One new migration (`0008`) becomes
the sole thing that ever executes DDL going forward; `0001`–`0007` stay in
`versions/` untouched, forever, as an accurate historical record of intent
that is simply never replayed again. This satisfies requirement 3
(immutability) in its *strongest* form — no exception clause needs to be
invoked for any file, not even `0001`.

**The bridge**, precisely: for a database verified to be genuinely empty
(`SELECT count(*) FROM pg_tables WHERE schemaname='public'` = 0 **and**
`to_regclass('public.alembic_version')` IS NULL — both checked, never
assumed), run `alembic stamp e5b9c2d47a10` (pure bookkeeping, zero DDL — safe
specifically *because* emptiness was just verified, not blind) and then
`alembic upgrade head`, which from that stamped position executes **only**
`0008`. `0008`'s `upgrade()` builds the complete schema in one idempotent
pass. This is the only role of "bridge": it lets a fresh install skip
straight to the one correct, guarded migration instead of replaying seven
files, two of which (`0004`, `0005`) are proven-broken against a
`create_all()`-shaped starting point and the rest of which assume data
relationships (`0003`'s backfill) that only make sense once other tables
have real rows.

## 1. Alembic as sole schema authority (requirement 1)

`backend/app/main.py::_init_db()` (lines 52-61) currently always calls
`create_tables()` then `_ensure_schema_upgrades()`. Change:

```python
def _init_db():
    try:
        from app.core.database import create_tables, engine
        if engine.url.get_backend_name() == "sqlite":
            # Test suite only — SQLite has no ADD COLUMN IF NOT EXISTS and no
            # partial-unique-index syntax; create_all() is the only thing
            # that has ever built its schema, and that stays true here.
            create_tables()
        else:
            _verify_schema_at_expected_revision()
        logger.info("DB tables ready")
        _migrate_users_from_json()
        _ensure_default_org()
    except Exception as e:
        logger.warning("DB init failed — running without persistent DB: %s", e)
```

`_ensure_schema_upgrades()` is deleted entirely from the runtime path (its
logic is absorbed into `0008`, §3). `_verify_schema_at_expected_revision()`
(new, small): reads the single row of `alembic_version`, compares it to the
migration chain's actual head (resolved via Alembic's
`ScriptDirectory.from_config(...).get_current_head()` at import time — not
a hand-maintained string constant, so it can never silently drift from the
real `versions/` directory) — mismatch or missing table → raise, backend
**fails to start**, with a message pointing at the migration runbook. This
is what closes test case F ("clean application startup performs no implicit
production schema creation").

This is the concrete reason the backend-shipped image currently has no
`alembic/` directory at all (Stage A/B evidence, original document §3.2) —
that gap must also close as part of this work: the deployment image needs
`alembic.ini` + `alembic/` available wherever `_verify_schema_at_expected_
revision()`'s head-resolution runs, or migrations need to be applied as a
separate deploy step before the app container starts (either is workable;
this plan does not decide the deployment-tooling half, see §8 unresolved
decisions).

## 2. Preserve the single outer transaction (requirement 2)

Unchanged: `alembic/env.py:70-78`'s `with context.begin_transaction():
context.run_migrations()` stays exactly as-is. This is *why* Stage E's
failure produced zero net schema change instead of a half-migrated database,
and per your explicit instruction `transaction_per_migration` is not
proposed anywhere in this plan. The one deliberate, narrow exception is
inside `0008` itself, for the `CREATE UNIQUE INDEX CONCURRENTLY` statements
(§3) — `CONCURRENTLY` cannot run inside any transaction, so that one
operation uses Alembic's own `op.get_context().autocommit_block()` to step
outside the ambient transaction *for those two statements only*. Everything
else in `0008`, and the surrounding `alembic upgrade` invocation as a whole,
remains covered by the single outer transaction. If the `autocommit_block`
portion fails, it is independently re-runnable (`IF NOT EXISTS`, with the
same preflight duplicate check as the original document's §7.1) without
needing the outer transaction to have rolled it back — it was never part of
that transaction to begin with, by design, and this is documented in the
migration's own docstring so a future reader isn't surprised by the
exception.

## 3. Migration `0008` — file-by-file content (requirement 6, 9)

New file: `backend/alembic/versions/<new_hash>_0008_squashed_baseline_and_
repairs.py`, `down_revision = 'e5b9c2d47a10'`.

```python
def upgrade() -> None:
    bind = op.get_bind()

    # 1. Complete current schema, idempotently. Driven by the ORM model —
    #    the single source of truth — not a hand-maintained parallel
    #    description of tables/columns that could drift from it.
    from app.core.database import Base
    Base.metadata.create_all(bind=bind, checkfirst=True)

    # 2. document_library.doc_kind server-side default (drift #4, confirmed
    #    present in production/restore but absent from a create_all()-only
    #    build because the model only declares a Python-side default=).
    op.execute("ALTER TABLE document_library ALTER COLUMN doc_kind SET DEFAULT 'document'")

    # 3. usage_logs.org_id FK ON DELETE SET NULL (drift #2, §7.2, confirmed
    #    decision: option (a)).
    op.execute("ALTER TABLE usage_logs DROP CONSTRAINT IF EXISTS usage_logs_org_id_fkey")
    op.execute(
        "ALTER TABLE usage_logs ADD CONSTRAINT usage_logs_org_id_fkey "
        "FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL"
    )

    # 4. Defensive FK-ondelete reconciliation for any adopted legacy database
    #    that did NOT already receive _ensure_schema_upgrades()'s historical
    #    fix (Stage E.1 confirmed the current restore/production DB already
    #    has these three correct — this block is a no-op there, but future
    #    adoption targets are not guaranteed to be in that state).
    for stmt in [
        ("knowledge_graph_nodes", "knowledge_graph_nodes_session_id_fkey",
         "FOREIGN KEY (session_id) REFERENCES doc_sessions(session_id) ON DELETE SET NULL"),
        ("graph_extraction_jobs", "graph_extraction_jobs_session_id_fkey",
         "FOREIGN KEY (session_id) REFERENCES doc_sessions(session_id) ON DELETE CASCADE"),
        ("workspace_shares", "workspace_shares_session_id_fkey",
         "FOREIGN KEY (session_id) REFERENCES doc_sessions(session_id) ON DELETE CASCADE"),
    ]:
        table, name, definition = stmt
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {name}")
        op.execute(f"ALTER TABLE {table} ADD CONSTRAINT {name} {definition}")

    # 5. workspace_shares partial unique indexes (drift #1, §7.1) — the one
    #    genuinely non-transactional piece. Preflight duplicate check first
    #    (abort loudly, apply nothing, if violated — never silently dedupe).
    dup_user = bind.execute(sa.text("""
        SELECT session_id, shared_with FROM workspace_shares
        WHERE shared_with IS NOT NULL
        GROUP BY session_id, shared_with HAVING count(*) > 1
    """)).fetchall()
    dup_org = bind.execute(sa.text("""
        SELECT session_id, org_id FROM workspace_shares
        WHERE shared_with IS NULL
        GROUP BY session_id, org_id HAVING count(*) > 1
    """)).fetchall()
    if dup_user or dup_org:
        raise RuntimeError(
            f"workspace_shares has {len(dup_user)+len(dup_org)} duplicate "
            "group(s) — aborting before creating unique indexes. Resolve "
            "manually; this migration does not delete rows."
        )

    with op.get_context().autocommit_block():
        op.execute(
            "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_session_share_user "
            "ON workspace_shares (session_id, shared_with) WHERE shared_with IS NOT NULL"
        )
        op.execute(
            "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_session_share_org "
            "ON workspace_shares (session_id, org_id) WHERE shared_with IS NULL"
        )


def downgrade() -> None:
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS uq_session_share_org")
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS uq_session_share_user")
    op.execute(
        "ALTER TABLE usage_logs DROP CONSTRAINT IF EXISTS usage_logs_org_id_fkey"
    )
    op.execute(
        "ALTER TABLE usage_logs ADD CONSTRAINT usage_logs_org_id_fkey "
        "FOREIGN KEY (org_id) REFERENCES organizations(id)"
    )
    op.execute("ALTER TABLE document_library ALTER COLUMN doc_kind DROP DEFAULT")
    # create_all()'s additions are not reverted — downgrading table/column
    # creation from a squashed baseline is out of scope (matches the
    # existing project convention: 0006/0007's downgrade() only drops what
    # they themselves are certain they created).
```

**Companion, non-migration code change** (tracked here for completeness,
not executed): `DocumentLibrary.doc_kind` in `models.py` should also gain
`server_default=sa.text("'document'")` so the SQLite test path
(`create_all()`, §1) and `0008`'s Postgres path agree structurally. Without
this, a future SQLite test database still lacks the server default that
production/restore already has — a small, currently-latent inconsistency,
not a new one introduced by this plan.

**Resolution of requirement 6** (duplicate-column paths in `0004`/`0005`):
neither file is executed by either the bridge path (§0) or the fingerprint-
adoption path (§4) going forward. Their `DuplicateColumn` failure mode is
retired by removing them from the live execution path entirely — not by
adding a guard that would *weaken* what they check. `create_all(checkfirst=
True)` in `0008` performs the equivalent column creation correctly, driven
by the model, with no possibility of the "already exists" crash because
`checkfirst` is exactly SQLAlchemy's own guard for this, verified against
the live catalog at run time rather than hand-written per column.

## 4. Fail-closed legacy adoption (requirement 4)

For an unversioned database that is **not** empty (production, or any
restore of it — test case B) — never a blind stamp:

1. **Generate the golden fingerprint**: run `0008`'s `upgrade()` against a
   disposable, genuinely empty database (the same kind of stack
   `ops/backup/restore.sh` already knows how to spin up), then capture its
   complete catalog state — every category from Stage E.1 §2's header
   (tables × columns × types × nullability × defaults × PK/FK incl.
   `ondelete` × unique/check constraints × indexes incl. partial/expression
   predicates verbatim from `pg_indexes.indexdef` × sequences × enums/
   extensions/triggers/functions/RLS) — as a structured (JSON) fingerprint.
   Generated fresh from the actual migration code every time the adoption
   tool runs, never a hand-maintained static file that could drift from
   what `0008` actually does.
2. **Fingerprint the adoption target** (the real legacy database, read-only)
   the same way.
3. **Compare, field by field.** Any difference at all — not just missing
   objects, full definitional equality per requirement 4's "never
   column-only guards or IF NOT EXISTS masking" — aborts the procedure,
   prints the exact differences, persists **zero DDL**. This is what test
   case D verifies.
4. **Exact match** → `alembic stamp <0008's revision id>`. Nothing else
   executes — the target database's actual DDL state already equals what
   `0008` would have produced, so there is nothing to reconcile, only
   bookkeeping to record.
5. If step 3 finds a difference, remediation is a **human decision**,
   explicitly out of this tool's scope (fix the environment to match, or
   conclude `0008` itself needs to change and this whole plan needs
   re-verification) — the tool's only job is to detect and refuse, never to
   auto-correct.

Applying this to the concrete Stage E.1 evidence: today's restored/
production database, if fingerprinted *before* any remediation, would show
exactly two definitional gaps versus `0008`'s golden fingerprint —
`uq_session_share_user`/`uq_session_share_org` absent, and
`usage_logs_org_id_fkey.delete_rule = NO ACTION` instead of `SET NULL` — so
step 3 would correctly **refuse to stamp** as-is. The adoption procedure is
therefore not the thing that closes those two gaps on a legacy database —
for an *existing* legacy database, the two DDL statements from `0008` (§3,
items 3 and 5) must be applied directly (once, by a human, on that specific
database, exactly as narrowly scoped as the original document's §7.1/§7.2
already proposed) **before** fingerprinting/stamping, or the adoption tool
must run `0008` itself against it (via a normal, non-bridge `alembic
upgrade` from a stamp at `e5b9c2d47a10`) rather than a bare stamp. This
plan's test matrix (§6, case B) exercises exactly this: adopt-by-running-
0008, not adopt-by-bare-stamp, for the one database we've actually measured.

## 5. Supporting both bootstrap cases (requirement 7)

| Case | Mechanism |
|---|---|
| Completely empty database | Verify emptiness → `alembic stamp e5b9c2d47a10` → `alembic upgrade head` (runs only `0008`, real DDL, full outer transaction) |
| Production restore without `alembic_version` | Fingerprint (§4) → if it already matches `0008`'s golden state, bare stamp; if it doesn't (current reality, per Stage E.1), `alembic stamp e5b9c2d47a10` then `alembic upgrade head` (runs `0008` for real, same as the empty case — `0008` is idempotent either way) |

Both converge on the identical final state: `alembic_version` = `0008`'s
revision id, schema fingerprint identical, regardless of starting point.
This is the practical payoff of squashing — there is exactly one target to
verify against, not "empty" and "legacy" as two different destinations that
happen to need to agree.

## 6. Test matrix A–F — exact procedure per case

All on disposable infrastructure (`ops/backup/restore.sh`-style isolated
stacks, never `kence-postgres`).

| Case | Setup | Procedure | Pass criteria |
|---|---|---|---|
| **A** — empty | Fresh disposable Postgres, zero tables | Verify empty → stamp `e5b9c2d47a10` → `upgrade head` | `alembic current` = `0008` id; full fingerprint match; 133/133 backend tests green against it |
| **B** — legacy restore | Restore of today's actual backup (as used in Stage E) | Fingerprint (finds the 2 known gaps) → since not exact match, run `alembic stamp e5b9c2d47a10` + `upgrade head` (not bare stamp) → re-fingerprint | Post-run fingerprint exact match; `alembic current` = `0008` id; **only** the two targeted objects (`uq_session_share_user`, `uq_session_share_org`, `usage_logs_org_id_fkey`) changed — verified by diffing this run's `pg_dump --schema-only` against Stage E.1's pre-run capture, confirming no other object moved |
| **C** — already versioned | Take case A or B's output, run `alembic upgrade head` again | No-op expected | `alembic current` unchanged; zero DDL executed (verified via `pg_stat_statements` or a before/after schema diff showing empty) |
| **D** — deliberately incompatible | Disposable DB seeded with a synthetic drift not matching `0008`'s golden fingerprint (e.g. `usage_logs.org_id` as `bigint`) | Run the fingerprint step only (§4 steps 1-3) | Aborts, reports the exact field (`usage_logs.org_id: expected integer, found bigint`), zero DDL persisted — re-fingerprint the target afterward and confirm it is byte-identical to before the attempt |
| **E** — crash mid-adoption | Kill the process between fingerprint-compare and stamp-commit (test-only fault injection) | Re-run the adoption procedure from scratch | Either the stamp never committed (retry proceeds normally) or it fully committed (retry sees `alembic current` already correct, no-ops) — never a torn/partial state; this holds by construction because `alembic stamp` is itself one transactional metadata write, and the exact-match precondition means no DDL is ever in flight when a stamp is attempted |
| **F** — startup | Start `docai-backend` against each of A/B/C's resulting database | `_verify_schema_at_expected_revision()` (§1) passes silently | Against a deliberately *wrong* revision (e.g. point it at a DB stamped at `e5b9c2d47a10` without `0008` applied), startup **fails loudly** instead of silently calling `create_all()` |

## 7. Rollback approach

- `0008.downgrade()` reverses everything it can safely reverse without
  destroying data (drops the two new indexes, restores the prior
  `usage_logs` FK, drops the `doc_kind` default) — it does not attempt to
  drop tables/columns `create_all()` added, matching the existing project
  convention (`0006`/`0007` downgrade the same conservative way).
- The bridge stamp (`alembic stamp e5b9c2d47a10` on a verified-empty DB) has
  no meaningful "rollback" beyond `DROP TABLE alembic_version` — nothing
  else was touched at that point.
- Legacy adoption (§4): if the fingerprint comparison aborts, zero DDL ran —
  there is nothing to roll back by definition. If `0008` runs for real
  against a legacy target (§5, case B) and fails partway, the single outer
  transaction (§2) rolls it back completely, same guarantee Stage E already
  demonstrated empirically.
- Application-code rollback (`_init_db()`/`_ensure_schema_upgrades()`
  removal) is an ordinary git revert — no data-migration risk either
  direction.

## 8. Numeric acceptance gates (requirement 10)

1. `alembic current` prints exactly `0008`'s revision id — for cases A, B,
   and C.
2. `SELECT count(*) FROM alembic_version` = **1** (never 0, never >1) after
   any successful run.
3. Zero unexplained rows in a fresh fingerprint diff (§4) between the
   remediated database and `0008`'s golden fingerprint, across every
   category listed in §4 step 1 — **0** differences, not "only cosmetic
   ones."
4. `uq_session_share_user` and `uq_session_share_org` both exist with the
   exact predicate clauses shown in §3 (verified via `pg_get_indexdef`, not
   name-existence alone).
5. `usage_logs_org_id_fkey`'s `pg_get_constraintdef` contains `ON DELETE SET
   NULL` — exact string match, not "a delete rule exists."
6. **0** duplicate columns and **0** duplicate indexes anywhere in the
   schema (a generic `information_schema` self-join check, not scoped only
   to the tables this plan touches).
7. Case D (§6) persists **0** DDL statements — verified by an unchanged
   `pg_stat_user_tables`/schema dump before vs. after the aborted attempt.
8. Full backend test suite: **133/133** passing (the number the original
   roadmap audit already established as the current baseline,
   `ENABLE_METRICS=false pytest -q`) against every one of cases A/B/C's
   resulting schema — not just against production's current, unremediated
   shape.
9. Case F (§6): backend startup against a deliberately-wrong revision exits
   non-zero / raises before serving traffic — **0** requests served against
   an unverified schema.
10. Case E (§6): after a fault-injected crash and retry, exactly one of
    {stamp never applied, stamp fully applied} is observed — **never** a
    partially-applied state, checked via `alembic_version` row count (gate
    2) immediately after the injected crash, before any retry.

## 9. Unresolved decisions carried forward

1. Whether `alembic.ini`/`alembic/` ship inside `docai-backend:latest` going
   forward, or migrations run as a separate pre-deploy step with the repo
   checkout mounted (as Stage E/E.1 did manually) — `_verify_schema_at_
   expected_revision()` (§1) needs the migration chain's head resolvable at
   startup either way; the deployment-tooling side of that isn't decided
   here.
2. Exact naming/location for the golden-fingerprint generator and the
   adoption CLI (§4) — proposed as new tooling, not yet placed in `ops/` or
   given a final interface.
3. Whether `0008`'s two "extra" DDL items (§3, items 3 and 5) get applied to
   the *current* production database via the bridge-through-`0008` path
   (§5, case B) as this plan's actual production remediation step, or via a
   narrower one-off script first with `0008` adopted afterward purely as
   bookkeeping — both are consistent with this design; which one is used
   for the real database is a deployment decision, not an architectural one.

## Recommendation and verdict

**Recommendation**: adopt squashed baseline + bridge exactly as specified in
§0–§8. It is the only one of the two named options that requires editing no
historical migration file, converges every starting state (empty, legacy-
unversioned, already-versioned) onto one identical, fingerprint-verified
target, and retires `0004`/`0005`'s duplicate-column failure mode by removal
from the execution path rather than by weakening their checks — satisfying
requirements 1–10 as written, with the three items in §9 left explicitly
open rather than silently decided.

**Verdict: NOT READY for implementation.** This is a design; `0008` has not
been written as an executable file, the fingerprint tool does not exist, and
none of test cases A–F have been run. P0-02 remains **OPEN**. Revision 6
(knowledge-graph editing) implementation remains **NO-GO**. Waiting for a
separate, explicit GO before any file is created, any migration is written,
or any command touches even the disposable restore stack again.

# P0-02 Stage E.2 Revision 2 — Final Corrected Remediation Plan (design only)

Supersedes `docs/ALEMBIC_SCHEMA_RECONCILIATION_STAGE_E2_2026-08-05.md` (Revision
1), which is **not approved** — ten mandatory corrections were issued against
it and are applied below. Builds on the same evidence base as Revision 1:
`docs/ALEMBIC_SCHEMA_RECONCILIATION_2026-08-04.md` (Stages A–D) and
`docs/ALEMBIC_SCHEMA_RECONCILIATION_STAGE_E1_2026-08-05.md` (Stage E/E.1
diagnostic + drift matrix). **Analysis and plan only.** No DDL, no `stamp`, no
`upgrade`, no code edit, no file move, no Docker/compose edit, no service
restart, no commit/push, no production or restore-stack access occurred while
producing this document.

Status carried forward unchanged: **P0-02 OPEN. Revision 6 NO-GO.** This
document does not change that status; it is not itself the GO.

## 0. What changed from Revision 1, and why

| # | Revision 1 defect | Correction applied here |
|---|---|---|
| 1 | Implied `alembic stamp` + `alembic upgrade head` share one transaction | They don't — removed entirely. The bootstrap path no longer stamps at all (§4); the adoption path stamps via `MigrationContext` bound to the *same connection* as the reconciliation DDL, inside one explicit transaction (§5), never the `alembic stamp` CLI |
| 2 | `autocommit_block()` + `CREATE INDEX CONCURRENTLY` + `IF NOT EXISTS` in the adoption path | Removed everywhere. Adoption runs in a declared maintenance/quiesced window; both partial unique indexes are created with ordinary transactional `CREATE UNIQUE INDEX` (no `CONCURRENTLY`), inside the same transaction as everything else. `IF NOT EXISTS` is gone too — by the time DDL runs, the fingerprint match already proved the objects don't exist, so a guard would only mask a real bug |
| 3 | `Base.metadata.create_all()` called from inside a migration | B0 (§1) is authored as explicit, frozen `op.create_table()`/`op.create_index()`/`op.execute()` calls — a static description independent of the live ORM model at migration-run time. The ORM is used only once, offline, to *generate* the initial draft of B0's text (§3), never referenced at migration runtime |
| 4 | Squashed baseline chained after `e5b9c2d47a10`, reached via a stamp+upgrade "bridge" | Real squashed-root architecture: B0 is a genuinely new root (`down_revision = None`), 0001–0007 are moved out of the active `version_locations` scan path into an immutable archive, and a completely empty database reaches head through a single ordinary `alembic upgrade head` — no `stamp` step exists in that path at all |
| 5 | Adoption procedure was a multi-step external description, not a single-connection program | §5 specifies one Python program, one SQLAlchemy connection, one explicit transaction, covering lock → identity/quiescence → fingerprint → reconcile → re-verify → stamp → commit |
| 6 | Compared the legacy restore directly against the target fingerprint and treated the "3 known diffs" as an implicit allowance | Two independent, named fingerprints (§6): **accepted-legacy** (frozen, static, describes today's actual restore including its 3 known gaps) and **target-B0** (derived live from B0's own code, never hand-maintained). The tool never compares legacy-vs-target-and-permits-a-known-diff-set; it requires exact equality against accepted-legacy first, then exact equality against target-B0 after reconciliation — no fuzzy "is this diff on the allowlist" logic anywhere |
| 7 | `0008.downgrade()` partially reverted (indexes/FK/default only), silent about the rest | B0 is declared **explicitly irreversible** (§7) — `downgrade()` raises, does not pretend to drop 23 tables of production data. Rollback is transaction-abort (pre-commit) or verified backup restore (post-commit), stated honestly, not disguised as a schema downgrade |
| 8 | Deployment left as "unresolved decision" | §8 resolves it concretely against this repo's actual `docker-compose.yml`/`Dockerfile`: alembic ships in the image, a profile-gated one-shot `migrate` service runs it, startup does zero DDL and fails closed on any revision mismatch |
| 9 | Test matrix A–F | Extended to A–H (§10), adding the 0007-legacy case (G) and repeated-invocation idempotency (H) explicitly requested |
| 10 | Acceptance gates present but keyed to the rejected architecture | Restated (§11) against this corrected design |

## 1. Chosen architecture

**Real squashed-baseline root, no bridge, no runtime `create_all()`.**

- A new revision **B0** becomes the sole active migration. `down_revision =
  None` — it is a genuine new root, not a continuation of
  `e5b9c2d47a10`/0007.
- `0001`–`0007` are preserved byte-for-byte but relocated out of the directory
  Alembic actually scans for revisions (`backend/alembic/versions/`) into a
  sibling archive directory that is never passed to `version_locations`. They
  become inert historical record — present in the repository, absent from
  every `ScriptDirectory` walk, never executed again, never deleted.
- B0's `upgrade()` is **frozen, explicit DDL** — no reference to
  `app.models`/`Base.metadata` at migration runtime. It builds the complete,
  fully-corrected end state directly: all 23 tables with their real columns/
  types/nullability/defaults/FKs/indexes, **plus** the objects that today only
  exist via Alembic (the two `workspace_shares` partial unique indexes) or
  only via `_ensure_schema_upgrades()` (`document_library.doc_kind`'s server
  default, `ix_kg_nodes_session_id`, and the three `ON DELETE` FK
  recreations), **plus** the corrected `usage_logs_org_id_fkey` (`SET NULL`).
  A fresh install run through `alembic upgrade head` alone lands at the fully
  remediated state in one step — there is no follow-up reconciliation step
  for a genuinely empty database, because there is nothing left to reconcile.
- Because B0 only ever runs against a database it itself is building from
  nothing (verified empty — see §4), none of its DDL needs `CONCURRENTLY` or
  `IF NOT EXISTS`: there are no concurrent readers/writers to protect against
  on a database with no application pointed at it yet, and no pre-existing
  objects to guard against colliding with.
- Legacy, already-populated databases (production, its restores) are never
  fed through B0's `upgrade()` directly. They go through the separate,
  single-transaction **adoption program** (§5), which performs only the
  narrow, already-verified-safe delta (the 3 known gaps) as ordinary
  transactional DDL, then stamps B0 — never re-running `create_table` against
  tables that already hold data.

## 2. Active versus archived migration layout

```
backend/alembic/
├── alembic.ini                       (unchanged: script_location = alembic,
│                                       version_locations left at its default,
│                                       i.e. exactly "alembic/versions" — the
│                                       archive directory below is therefore
│                                       invisible to Alembic without any
│                                       config edit)
├── env.py                            (unchanged — see §4, transaction
│                                       boundaries stay exactly as today)
├── versions/                         ← ACTIVE, scanned by Alembic
│   └── <hash>_b0_squashed_baseline.py   (the only file here after the move)
└── versions_archive/                 ← INERT, never scanned, never imported
    ├── README.md                     (new — explains: historical record only,
    │                                   preserved for audit/archaeology,
    │                                   permanently excluded from
    │                                   version_locations, never delete)
    ├── 398a7bf8d359_0001_baseline_schema.py
    ├── 02805ff7fe64_0002_workspace_share_partial_unique.py
    ├── bdac53748917_0003_agent_task_org_id_not_null.py
    ├── a3d1dc26da57_0004_chat_message_add_org_id.py
    ├── c9e2f1a3b4d5_0005_usage_logs_add_org_id.py
    ├── d4f7a1b2c3e6_0006_create_translation_jobs.py
    └── e5b9c2d47a10_0007_create_library_document_content.py
```

This is a **plain `git mv`** of 7 files plus one new README — no content
byte in any of the 7 changes. `alembic.ini` needs **no edit**: its
`version_locations` key is absent today, which means Alembic's default (the
single `%(script_location)s/versions` directory) already applies; moving the
7 files to a sibling directory that was never in that default is sufficient
by itself to make Alembic stop seeing them. (If a future maintainer ever adds
an explicit `version_locations` line, it must list only `versions/` — noted
in the archive `README.md` as a tripwire.)

Confirmed by direct inspection this session: `backend/alembic.ini` currently
has no `version_locations` key, so this mechanism works exactly as described
against the real file, not a hypothetical one.

## 3. Exact files to create/change (none executed — listed for the GO decision)

| # | Path | Action | Notes |
|---|---|---|---|
| 1 | `backend/alembic/versions_archive/` | create dir + move 7 files in | plain `git mv`, zero content change |
| 2 | `backend/alembic/versions_archive/README.md` | create | states immutability + exclusion-from-scanning rationale |
| 3 | `backend/alembic/versions/<hash>_b0_squashed_baseline.py` | create | the only active migration; content spec in §1; authored by hand from a one-time offline capture (§3.1), not generated at runtime |
| 4 | `ops/schema_audit/fingerprint.py` | create | read-only catalog-fingerprint tool, used both to derive target-B0 (live, from a disposable empty DB run of B0) and, once, to help a human author `legacy_accepted.json` (item 5) |
| 5 | `ops/schema_audit/fingerprints/legacy_accepted.json` | create, committed, frozen | static snapshot of today's actual restore/production shape including its 3 known gaps (§6) — a historical fact, not regenerated per run |
| 6 | `ops/schema_audit/adopt_legacy_schema.py` | create | the single-connection, single-transaction adoption program (§5) |
| 7 | `backend/app/main.py` | edit | delete `_ensure_schema_upgrades()` (lines 64–144 today); rewrite `_init_db()` (lines 52–61 today) per §8 |
| 8 | `backend/app/models/models.py` | edit | `DocumentLibrary.doc_kind` gains `server_default=sa.text("'document'")` (1 line, `models.py:215` today) so SQLite tests and B0's Postgres path agree structurally |
| 9 | `backend/Dockerfile` | edit | add `COPY alembic.ini .` and `COPY alembic/ ./alembic/` (today's image has neither — confirmed this session, only `app/` and `requirements.txt` are copied); add a build step writing the resolved head to `app/_expected_schema_revision.txt` (§8) |
| 10 | `docker-compose.yml` | edit | add a `migrate` service, `profiles: ["migrate"]`, not started by plain `docker-compose up` (§8) |

**§3.1 — how B0's frozen DDL text is produced (procedure, not yet run):**
generate a draft via `alembic revision --autogenerate` pointed at a disposable
database built by the *current* `create_tables()` + `_ensure_schema_upgrades()`
(so the autogenerate diff captures every object those two mechanisms actually
produce today, matching production), hand-review every generated `op.*` call
against the drift register (§6 of the 2026-08-04 document) and the model, add
the two `workspace_shares` indexes and the `usage_logs` FK fix by hand (
autogenerate cannot see partial-unique-index or non-default-`ondelete` intent
reliably), delete the autogenerate boilerplate that references
`sa.orm`/`Base`, and freeze the result as static text. This is authoring, not
execution — no command in this paragraph touches a real or disposable
database until the GO is given.

## 4. Exact transaction boundaries

| Path | Boundary |
|---|---|
| **Empty-DB bootstrap** (`alembic upgrade head`) | Exactly one transaction, unchanged mechanism from `env.py:77-78` (`with context.begin_transaction(): context.run_migrations()`). B0's DDL *and* the `alembic_version` row insert are both part of Alembic's normal `upgrade` behavior inside this single transaction — this is ordinary, already-true Alembic semantics, not a new claim. No separate `stamp` invocation exists on this path at all, so correction #1's concern does not arise here — there is nothing to wrongly claim is transactional with something else, because there is only the one thing |
| **Legacy adoption** (`adopt_legacy_schema.py`) | Exactly one transaction, detailed in §5, spanning advisory-lock acquisition through the final `alembic_version` stamp. One `engine.connect()`, one `connection.begin()`, one `COMMIT` or one `ROLLBACK` — never a subprocess call to the `alembic` CLI, never a second connection |
| **Already-versioned re-run** (`alembic upgrade head` when current == B0) | Alembic's normal no-op path — opens a transaction, finds nothing to run, commits trivially. No adoption program invoked |
| **Repeated adoption invocation** | The program's own precondition check (§5 step 3) runs and fails/refuses *before* opening the reconciliation transaction — see case H (§10) |

No step anywhere spans two connections, two processes, or relies on two
separate commands each committing independently.

## 5. Legacy adoption — single program, single connection, single transaction

New file: `ops/schema_audit/adopt_legacy_schema.py`. Invoked once per target,
manually, by an operator, never at application startup. Pseudocode (design
only — not implemented):

```python
LOCK_KEY = 0x4B41_4441_5054_0001  # reserved constant; do not reuse elsewhere

def adopt(database_url: str, expect_db_name: str, expect_host: str) -> None:
    engine = create_engine(database_url)
    with engine.connect() as conn:                       # ONE connection
        with conn.begin():                                # ONE transaction
            # 1. Advisory lock, transaction-scoped — auto-releases on
            #    commit OR rollback, no separate unlock call needed, so a
            #    crash mid-run cannot leak the lock.
            conn.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": LOCK_KEY})

            # 2. Identity check — refuses to run against the wrong database
            #    (operator-supplied expectation vs. what the connection
            #    actually landed on).
            row = conn.execute(text(
                "SELECT current_database(), inet_server_addr()::text"
            )).one()
            if (row[0], row[1]) != (expect_db_name, expect_host):
                raise AdoptionAborted(f"connected to {row}, expected "
                                       f"({expect_db_name}, {expect_host})")

            # 3. Precondition on starting revision — unversioned or an
            #    explicitly supported legacy tag only.
            current = _read_alembic_version_or_none(conn)   # None | str
            if current not in (None, "e5b9c2d47a10"):        # 0007's hash
                if current == B0_REVISION:
                    log("already adopted at B0 — no action taken")
                    return                                   # safe refusal, case H
                raise AdoptionAborted(f"unsupported starting revision {current}")

            # 4. Write-quiescence check — refuses if anything besides this
            #    session is connected to the target database. Operationally,
            #    the app must already be stopped before this runs; this is
            #    the technical verification of that precondition, not a
            #    substitute for it.
            others = conn.execute(text("""
                SELECT count(*) FROM pg_stat_activity
                WHERE datname = current_database() AND pid <> pg_backend_pid()
            """)).scalar()
            if others:
                raise AdoptionAborted(f"{others} other backend(s) connected — "
                                       "stop the application before adopting")

            # 5. Fingerprint target, compare against the FROZEN accepted-
            #    legacy fingerprint (§6) — exact equality, every category.
            actual = fingerprint(conn)
            accepted = json.load(open("ops/schema_audit/fingerprints/legacy_accepted.json"))
            diff = compare(actual, accepted)
            if diff:
                raise AdoptionAborted(f"does not match accepted legacy shape: {diff}")

            # 6. Preflight duplicate check (same queries as the original
            #    2026-08-04 §7.1 proposal) — abort loudly, never delete rows.
            if _has_duplicate_shares(conn):
                raise AdoptionAborted("workspace_shares has duplicate groups — "
                                       "resolve manually, no rows will be deleted")

            # 7. Reconcile — ONLY the 3 known-approved deltas, ordinary
            #    transactional DDL, no CONCURRENTLY, no IF NOT EXISTS (the
            #    fingerprint match in step 5 already proved these are absent;
            #    a guard here would only mask a real bug).
            conn.execute(text(
                "CREATE UNIQUE INDEX uq_session_share_user "
                "ON workspace_shares (session_id, shared_with) "
                "WHERE shared_with IS NOT NULL"))
            conn.execute(text(
                "CREATE UNIQUE INDEX uq_session_share_org "
                "ON workspace_shares (session_id, org_id) "
                "WHERE shared_with IS NULL"))
            conn.execute(text(
                "ALTER TABLE usage_logs DROP CONSTRAINT usage_logs_org_id_fkey"))
            conn.execute(text(
                "ALTER TABLE usage_logs ADD CONSTRAINT usage_logs_org_id_fkey "
                "FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL"))

            # 8. Re-fingerprint (reads this transaction's own uncommitted
            #    DDL — ordinary Postgres read-your-own-writes) and compare
            #    against the TARGET-B0 fingerprint (§6) — exact equality.
            after = fingerprint(conn)
            target = json.load(open("ops/schema_audit/fingerprints/b0_target.json"))
            diff2 = compare(after, target)
            if diff2:
                raise AdoptionAborted(f"post-reconciliation state still differs "
                                       f"from target-B0: {diff2}")

            # 9. Stamp B0 — via MigrationContext bound to THIS connection,
            #    never the `alembic stamp` CLI (a separate process/
            #    transaction, which is exactly correction #1's mistake).
            mc = MigrationContext.configure(conn)
            script = ScriptDirectory.from_config(alembic_cfg)
            mc.stamp(script, B0_REVISION)

            # 10. Exactly one row, final check before commit.
            n = conn.execute(text("SELECT count(*) FROM alembic_version")).scalar()
            if n != 1:
                raise AdoptionAborted(f"alembic_version has {n} rows after stamp")

        # `with conn.begin()` exits here → COMMIT only if every step above
        # returned normally. Any exception anywhere above → ROLLBACK,
        # advisory lock releases with it, zero net effect.
```

Every one of steps 1–10 executes on the same `conn` inside the same `with
conn.begin():` block. `AdoptionAborted` is a plain exception — it is never
caught internally to "continue anyway"; it propagates out of the `with`
block, which rolls back.

## 6. Two fingerprints — defined and kept separate

| Fingerprint | Nature | Source | Contents relative to target-B0 |
|---|---|---|---|
| **accepted-legacy** (`ops/schema_audit/fingerprints/legacy_accepted.json`) | Frozen, static, committed to the repo | Authored once from Stage E.1's confirmed drift matrix (`docs/ALEMBIC_SCHEMA_RECONCILIATION_STAGE_E1_2026-08-05.md` §2) — it describes a specific historical fact about today's restore, not a moving target, so it is not regenerated per adoption run | Identical to target-B0 in every category **except** exactly 3 fields: `uq_session_share_user` absent, `uq_session_share_org` absent, `usage_logs_org_id_fkey` delete-rule `NO ACTION` instead of `SET NULL` |
| **target-B0** (`ops/schema_audit/fingerprints/b0_target.json`) | Derived, live | Generated by running B0's `upgrade()` against a disposable, genuinely empty database and fingerprinting the result, every time it needs regenerating (e.g. whenever B0's text changes) — never hand-maintained, so it cannot silently drift from what B0 actually does | The canonical target — this is what "fully remediated" means, operationally |

**Why two, and why frozen vs. derived differ**: the adoption tool's step 5
compares the *real* legacy database against accepted-legacy, not against
target-B0. This is the correction for Revision 1's flaw — Revision 1 in
effect diffed legacy directly against target and then treated "the diff
equals the 3 known items" as implicit permission to proceed, which is a
sliding-window check that would silently widen its own tolerance if a 4th,
unnoticed difference ever appeared (it would still "diff against target,"
just with a bigger diff, and nothing in Revision 1's logic distinguished
"the diff I expected" from "a diff I've never seen"). Requiring **exact**
equality against a **specific, frozen, named** accepted-legacy snapshot
closes that gap: any database that isn't *exactly* today's known shape —
including one with an additional, unanticipated drift — fails at step 5,
full stop, before any DDL runs. The second check (step 8, against target-B0)
is a different, independent question — "did the reconciliation actually
converge on the real target" — and is intentionally not skipped just because
step 5 already passed.

## 7. Rollback — resolved honestly

**B0 is explicitly irreversible. No partial or disguised downgrade exists.**

```python
def downgrade() -> None:
    raise NotImplementedError(
        "B0 is an irreversible squashed baseline. Dropping the 23 tables it "
        "creates would destroy production data with no legitimate use case "
        "for that operation via `alembic downgrade`. Recovery is: (a) if B0 "
        "has not yet committed, the transaction never applied — nothing to "
        "undo; (b) if it has committed, restore from a verified pg_dump via "
        "ops/backup/restore.sh, the same tooling already used to produce "
        "every disposable copy in this audit — not a schema-level downgrade."
    )
```

- **Before commit** (either path, §4): rollback is transaction abort. Nothing
  was ever visible outside the transaction, so there is nothing to reverse —
  this holds by ordinary Postgres atomicity, not by any code in this plan.
- **After commit, empty-DB bootstrap path**: this only ever runs against a
  database with no data yet (verified per §4's Section for that path — see
  §10 case A), so "rollback" there has no data-loss stakes; if truly needed,
  `DROP DATABASE`/recreate is equivalent to a downgrade and safe precisely
  because nothing of value exists yet.
- **After commit, legacy adoption path**: the only two DDL changes applied
  (2 indexes + 1 FK) are each individually, safely reversible on their own —
  `DROP INDEX uq_session_share_user/org`, restore the prior FK definition —
  but this plan does **not** wire that into `alembic downgrade` (which would
  imply the whole of B0 is revertible, which it is not, since it also
  implicitly "owns" 23 tables' worth of pre-existing data by virtue of the
  stamp). If a post-commit revert of *just* the reconciliation DDL is ever
  needed, it is a manual, narrowly-scoped operator action (2 `DROP INDEX` +
  1 FK restore), explicitly out of `alembic downgrade`'s scope, and is not
  needed for this plan to be GO-able — noted here so it isn't mistaken for a
  silent gap.
- **Application-code changes** (`main.py`, `models.py`, `Dockerfile`,
  `docker-compose.yml`): ordinary `git revert`, no data-migration risk either
  direction, same as Revision 1.

An incomplete downgrade — one that reverts *some* of B0's objects and
silently leaves the rest, without saying so — is exactly what Revision 1 did
and exactly what is prohibited here. This plan instead declares B0
irreversible outright, which is the honest description of what dropping a
squashed 23-table baseline actually means.

## 8. Deployment — resolved against this repo's actual configuration

Confirmed this session, directly: `backend/Dockerfile` copies only `app/`
and `requirements.txt` — no `alembic.ini`, no `alembic/`. `docker-compose.yml`
runs a single `backend` service from `docai-backend:latest` with no separate
migration step. This is the actual gap being closed, not a hypothetical one.

1. **Image packaging** — `backend/Dockerfile` gains:
   ```dockerfile
   COPY alembic.ini .
   COPY alembic/ ./alembic/
   RUN python -c "from alembic.config import Config; from alembic.script import ScriptDirectory; \
       print(ScriptDirectory.from_config(Config('alembic.ini')).get_current_head())" \
       > app/_expected_schema_revision.txt
   ```
   The `versions_archive/` directory does not need to be excluded via
   `.dockerignore` for correctness (Alembic already ignores it per §2), but
   excluding it anyway keeps the image smaller — a one-line `.dockerignore`
   addition, not load-bearing.

2. **One-shot deployment job** — `docker-compose.yml` gains a profile-gated
   service that is never started by a plain `docker-compose up`:
   ```yaml
   migrate:
     image: docai-backend:latest
     container_name: kence-migrate
     profiles: ["migrate"]
     environment:
       - DATABASE_URL=postgresql://kence:${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}@postgres:5432/kenceai
     entrypoint: ["alembic", "upgrade", "head"]
     depends_on:
       postgres:
         condition: service_healthy
   ```
   Operator sequence for a deploy: `docker-compose --profile migrate run --rm
   migrate` (exits 0/non-zero, runs to completion or fails visibly) **then**
   `docker-compose up -d backend`. The `backend` service itself never runs
   migrations.

3. **Startup does zero DDL for Postgres** — `_init_db()` (`main.py:52-61`
   today) becomes:
   ```python
   def _init_db():
       try:
           from app.core.database import engine
           if engine.url.get_backend_name() == "sqlite":
               from app.core.database import create_tables
               create_tables()          # test suite only, unchanged behavior
           else:
               _verify_schema_at_expected_revision()
           logger.info("DB tables ready")
           _migrate_users_from_json()
           _ensure_default_org()
       except Exception as e:
           logger.warning("DB init failed — running without persistent DB: %s", e)


   def _verify_schema_at_expected_revision():
       from sqlalchemy import text
       from app.core.database import engine
       expected = (Path(__file__).resolve().parent / "_expected_schema_revision.txt").read_text().strip()
       with engine.connect() as conn:
           rows = conn.execute(text("SELECT version_num FROM alembic_version")).fetchall()
       if len(rows) != 1:
           raise RuntimeError(f"alembic_version has {len(rows)} row(s), expected exactly 1")
       if rows[0][0] != expected:
           raise RuntimeError(f"DB at revision {rows[0][0]}, image expects {expected} — "
                               "run the migrate job before starting this build")
   ```
   `_ensure_schema_upgrades()` (today's `main.py:64-144`) is **deleted**, not
   gated behind a flag — its entire effect is now inside B0/the adoption
   program.
4. **"Build-pinned head"**: `_expected_schema_revision.txt` is generated
   once, at image build time, from the exact `versions/` directory baked
   into that image (step 1) — so two containers built from the same image
   always agree on the expected revision without needing to re-resolve it
   (or import `alembic`'s `ScriptDirectory`) on every hot-path startup.

## 9. Executable order per starting state (design — not run)

**Empty database:**
1. Build/pull the image (alembic + `_expected_schema_revision.txt` baked in).
2. `docker-compose --profile migrate run --rm migrate` → plain `alembic
   upgrade head` → Alembic sees no `alembic_version` table, walks from `base`
   to B0 (the only revision in `versions/`), runs B0's frozen DDL, inserts
   the version row — all inside the one transaction from `env.py` (§4).
3. `docker-compose up -d backend` → `_verify_schema_at_expected_revision()`
   passes (revision matches, exactly one row) → starts serving.

**Unversioned legacy restore (today's actual production/restore shape):**
1. Stop the application against that database (write-quiescence
   precondition).
2. `python ops/schema_audit/adopt_legacy_schema.py --database-url ... \
   --expect-db-name kenceai --expect-host <restore-host>` → executes §5
   end-to-end inside one transaction → commits only if every check passes.
3. Re-start the application (or, for the real production case, this is a
   scheduled maintenance-window operation gated on a separate future
   approval, not this plan) → `_verify_schema_at_expected_revision()` passes.

**Old-versioned database already stamped at 0007 (`e5b9c2d47a10`) — case G:**
Same program, same flow as the unversioned case — step 3 of §5's pseudocode
explicitly allow-lists `e5b9c2d47a10` alongside `None` as an accepted
starting point, because Stage E.1 confirmed the *object-level* state of such
a database is identical to today's unversioned restore (the version row
itself never implied any extra object actually got created — 0002's index
and 0005's FK intent never ran either way). The adoption program does not
special-case this beyond the precondition allowlist; the fingerprint/
reconcile/re-verify/stamp sequence is byte-identical to the unversioned case.

**Already-B0-versioned database (repeat run):**
`alembic upgrade head` → Alembic finds current == head → no-op. Running
`adopt_legacy_schema.py` again against it hits step 3's `current ==
B0_REVISION` branch → logs "already adopted" → returns without opening the
reconciliation transaction at all (case H, §10 below).

## 10. Disposable test matrix A–H

All on disposable infrastructure only (`ops/backup/restore.sh`-style isolated
stacks), never `kence-postgres`.

| Case | Setup | Procedure | Pass criteria |
|---|---|---|---|
| **A** — empty | Fresh disposable Postgres, zero tables | Plain `alembic upgrade head`, no stamp | `alembic current` = B0's id; target-B0 fingerprint match; 133/133 backend tests green |
| **B** — unversioned legacy restore | Restore of today's actual backup | `adopt_legacy_schema.py` full flow | Post-run target-B0 fingerprint exact match; exactly 1 `alembic_version` row = B0; `pg_dump --schema-only` diff vs. pre-run shows **only** the 3 approved objects changed |
| **C** — already B0-versioned | Case A or B's output | `alembic upgrade head` again | No-op; zero DDL executed (schema dump before/after identical) |
| **D** — deliberately incompatible legacy | Disposable DB seeded with a synthetic drift not matching `legacy_accepted.json` (e.g. `usage_logs.org_id` as `bigint`) | Run `adopt_legacy_schema.py` | Aborts at step 5 (accepted-legacy comparison), reports the exact field, **zero DDL persisted**, zero rows in `alembic_version`, re-fingerprint confirms byte-identical to before the attempt |
| **E** — failure injected at each step | Fault-injection harness kills the process immediately after each of steps 1–10 in §5, one run per step | Either the transaction never committed (retry from scratch behaves like a fresh case B run) or it fully committed (retry sees case H's "already adopted" branch) — verified via `alembic_version` row count immediately after each injected kill, before any retry: **never** 0 rows post-DDL-but-pre-stamp, **never** partial index/FK state (a Postgres transaction rollback guarantees this structurally; the test exists to catch a code bug that accidentally opened a second connection/transaction, which would break the guarantee) |
| **F** — application startup | Start `docai-backend` against each of A/B/C's resulting DB, and separately against a DB deliberately stamped at the wrong revision | Cases A/B/C: `_verify_schema_at_expected_revision()` passes silently, zero DDL executed by startup (verified via statement-level connection logging during boot). Wrong-revision case: startup raises before serving any request |
| **G** — legacy DB stamped at 0007 | Disposable DB built to match production's actual object-level shape, with `alembic_version` manually seeded to `e5b9c2d47a10` (simulating a hypothetical environment where the old CLI chain once ran) | `adopt_legacy_schema.py` (precondition allowlist accepts this starting revision) | Same pass criteria as case B — converges on B0, target-B0 fingerprint exact match |
| **H** — repeated adoption | Run `adopt_legacy_schema.py` a second time against case B's or G's already-adopted output | Step 3's `current == B0_REVISION` branch | Logs "already adopted", exits 0, opens **no** reconciliation transaction, zero DDL, `alembic_version` unchanged (still exactly 1 row, still B0) |

## 11. Numeric acceptance gates

1. `alembic current` prints exactly B0's revision id — cases A, B, C, G.
2. `SELECT count(*) FROM alembic_version` = **1**, never 0, never >1, after
   any successful run (A/B/C/G) and re-checked after every injected failure
   in case E before any retry.
3. Target-B0 fingerprint diff = **0** differences across every category
   (tables/columns/types/nullability/defaults/FK+ondelete/indexes incl.
   partial predicates/unique/check constraints/sequences/enums/extensions/
   triggers/functions/RLS) for cases A, B, C, G's resulting schema.
4. `uq_session_share_user` and `uq_session_share_org` both exist with the
   exact predicate clauses from §5, verified via `pg_get_indexdef`, not
   name-existence alone — exactly **2** such indexes, not more.
5. `usage_logs_org_id_fkey`'s `pg_get_constraintdef` contains `ON DELETE SET
   NULL` — exact string match.
6. **0** duplicate columns and **0** duplicate indexes anywhere in the
   schema, generic `information_schema` self-join check.
7. Case D persists **0** DDL statements, case E's every injected kill point
   persists **0** partial DDL — both verified by unchanged
   `pg_stat_user_tables`/schema dump before vs. after.
8. Full backend test suite: **133/133** passing against every one of cases
   A/B/C/G's resulting schema, `ENABLE_METRICS=false pytest -q`.
9. Case F: startup against a deliberately-wrong revision exits non-zero /
   raises before serving traffic — **0** requests served against an
   unverified schema. Startup against A/B/C/G executes **0** DDL statements
   (verified, not assumed).
10. Case H: second invocation performs **0** DDL, **0** transaction opened
    beyond the precondition check, `alembic_version` row count and value
    unchanged from before the repeat run.

## 12. Remaining risks / unresolved items

1. **B0's frozen DDL text does not exist yet.** §3.1 describes the
   authoring procedure; it has not been run. Until it is, every fingerprint
   comparison in this plan (§6) is itself unverified — `b0_target.json` can
   only be generated *after* B0 is written and run once against a disposable
   empty database.
2. **`legacy_accepted.json` does not exist yet** and, being frozen, carries
   a staleness risk: if production's actual schema has drifted further since
   Stage E.1's capture (2026-08-05), the file needs to be re-derived from a
   fresh read-only 3-way comparison immediately before it is authored — not
   copied mechanically from the Stage E.1 document without re-verification.
3. **Advisory lock key** (`0x4B4144415054_0001` placeholder in §5) needs a
   real, collision-checked constant reserved specifically for this tool
   before implementation — not decided here beyond "must be transaction-
   scoped (`pg_advisory_xact_lock`), never session-scoped."
4. **Write-quiescence check is best-effort**, not a guarantee — it detects
   *other* connections at the moment the transaction starts, but cannot
   prevent a new connection from appearing mid-run (Postgres's own MVCC/
   locking on the specific rows/tables being altered is the real safety net
   for that scenario, not this check; the check exists to catch the ordinary
   case of "someone forgot to stop the app first," not to replace
   transactional isolation).
5. **Production maintenance-window scheduling** for the real database is
   explicitly out of this plan's scope — this document specifies the
   *mechanism*, not the calendar decision of when it runs against
   `kence-postgres`, which remains a separate, future, explicitly-gated
   approval per your standing instruction.
6. **`ops/schema_audit/fingerprint.py`'s exact comparison semantics**
   (float/whitespace-insensitive `pg_get_indexdef` normalization, ordering
   of JSON keys, etc.) are not specified at the byte level in this document
   — needed before implementation, not an architectural gap.

## Recommendation and verdict

**Recommendation**: adopt this corrected design — real root-baseline B0,
zero runtime `create_all()`, single-connection/single-transaction adoption
with two independent frozen/derived fingerprints, honest irreversibility,
and a concrete deployment mechanism tied to this repo's actual
`Dockerfile`/`docker-compose.yml`. All ten corrections from your review are
applied and cross-referenced in §0.

**Verdict: NOT READY for implementation.** Nothing in §3's file list has been
created; `b0_target.json` and `legacy_accepted.json` cannot exist until B0's
text is authored and run once on disposable infrastructure; none of test
cases A–H have been executed. P0-02 remains **OPEN**. Revision 6
implementation remains **NO-GO**. Waiting for a separate, explicit GO before
any file is created, any migration is written, any Docker/compose file is
edited, or any command touches even the disposable restore stack again.

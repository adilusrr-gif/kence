# P0-02 Stage E.2 Revision 3 — Final Corrected Remediation Plan (design only)

Supersedes `docs/ALEMBIC_SCHEMA_RECONCILIATION_STAGE_E2_REV2_2026-08-05.md`
(Revision 2), whose final read-only implementation-readiness review found it
**NOT READY** — one proven, code-level defect (Item 2: `MigrationContext.
stamp()` cannot resolve an archived revision) and several specification gaps
(fingerprint completeness, manifest pinning, Unix-socket identity). This
document applies the eight corrections issued against that review. Builds on
the same evidence base as Revisions 1–2:
`docs/ALEMBIC_SCHEMA_RECONCILIATION_2026-08-04.md` (Stages A–D),
`docs/ALEMBIC_SCHEMA_RECONCILIATION_STAGE_E1_2026-08-05.md` (Stage E/E.1),
and the Alembic 1.18.4 source actually installed in
`backend/.venv/lib/python3.10/site-packages/alembic/` (traced, not assumed,
during the Rev2 review).

**Analysis and plan only.** No DDL, no `stamp`, no `upgrade`, no code edit,
no file move, no Docker/compose edit, no service restart, no commit/push, no
production or disposable-database access occurred while producing this
document. This is a **documentation-only GO for Revision 3** — it is
explicitly **not** a GO for Stage E.3 implementation.

Status carried forward unchanged: **Stage E.2 Rev2: NOT READY (superseded by
this document). P0-02: OPEN. Revision 6: NO-GO.** Production and disposable
databases remain untouched.

## 0. What changed from Revision 2, and why

| # | Revision 2 defect | Correction applied here |
|---|---|---|
| 1 | §5's `mc.stamp(script, B0_REVISION)` call raises `CommandError` for a database stamped at `e5b9c2d47a10`, because `ScriptDirectory._stamp_revs` tries to resolve that revision against a revision map that no longer contains it (proven via source trace: `runtime/migration.py:558-572` → `script/base.py:442-449` → `script/revision.py:607-658`) | §2's pseudocode reorders the sequence: full fingerprint/reconciliation/target-verification happens **first**, and only then a conditional, row-count-checked `DELETE FROM alembic_version WHERE version_num = :expected_legacy_revision` reduces `get_current_heads()` to `()` **before** a freshly-instantiated `MigrationContext` calls `.stamp()` — the exact same, already-proven-safe empty-heads path used for the unversioned case, never a resolution attempt against the archive |
| 2 | Case G tested only "does adoption succeed," not fine-grained failure points around the delete/stamp choreography | §7 case G now enumerates 5 explicit injection points (before delete / after delete before stamp / during stamp / after stamp before final verification / after final verification before commit), each with its own required post-rollback state |
| 3 | Write quiescence was "best-effort," relying only on `pg_stat_activity` | §3 makes it technical: mandatory app shutdown, a `pg_stat_activity` check scoped to the application role, then explicit `LOCK TABLE ... IN ACCESS EXCLUSIVE MODE` on both target tables, fixed order, bounded `lock_timeout`, no auto-retry, held until commit/rollback — `CREATE UNIQUE INDEX`'s own lock is now explicitly named as a backstop, not the mechanism |
| 4 | Fingerprint category list existed only in one acceptance-gate line, missing PK-as-such, index expressions, sequence ownership, and policies-as-a-category | §4 gives a complete, catalog-source-cited specification for both fingerprints, explicit OID exclusion, and deterministic canonical ordering (including carrying forward Stage A's finding that column *order* is cosmetic and must not be compared positionally) |
| 5 | Only a revision-id string was pinned; a mutated migration file with the same id would go undetected | §5 replaces the single expected-revision file with a build-time **manifest** (head + per-file SHA-256 + fingerprint-file hashes + fingerprint-format version), computed once at build and never recomputed-and-trusted from the same live files at verification time |
| 6 | `inet_server_addr()` returning `NULL` (Unix-socket) was left undefined | §6 makes it an unconditional abort — no Unix-socket mode is designed, tested, or approved by this document |
| 7 | B0's ORM-independence and `env.py`'s safety were asserted but not enforced by tooling | §7 adds a CI check that greps/AST-scans active migration files for forbidden imports, so the property is machine-verified going forward, not just documented |
| 8 | Acceptance gates didn't reflect the above | §9 restates them against this corrected design |

## 1. Chosen architecture (unchanged from Rev2, restated)

**Real squashed-baseline root, no bridge, no runtime `create_all()`.** B0 is
a genuine new root (`down_revision = None`); `0001`–`0007` are relocated,
byte-for-byte, out of `backend/alembic/versions/` (the only directory
Alembic's default `version_locations` scans) into
`backend/alembic/versions_archive/`, which is never referenced in
`alembic.ini` and is therefore invisible to every `ScriptDirectory` walk. An
empty database reaches head through a single, ordinary `alembic upgrade
head` — no stamp anywhere in that path. A legacy, already-populated database
(unversioned, or stamped at `e5b9c2d47a10`) is never fed through B0's
`upgrade()`; it is reconciled and re-stamped by the single-connection,
single-transaction adoption program specified in §2. Nothing in §0's
corrections changes this top-level shape — they fix the *mechanics* of the
adoption program and the completeness of its verification, not the
architecture itself.

## 2. Exact transaction pseudocode (design — not implemented)

New file: `ops/schema_audit/adopt_legacy_schema.py`. One process, one
`engine.connect()`, one `with conn.begin():` block, from advisory lock
through commit.

```python
LOCK_KEY = 0x4B41_4441_5054_0001   # reserved constant; do not reuse
LOCK_TIMEOUT = "5s"                 # operator-configurable via CLI flag


def adopt(database_url, expect_db_name, expect_host, app_role="kence"):
    engine = create_engine(
        database_url,
        connect_args={"application_name": "kenceai_schema_adoption"},
    )
    with engine.connect() as conn:                            # ONE connection
        with conn.begin():                                     # ONE transaction
            # 1. Advisory lock — transaction-scoped, auto-releases on
            #    commit OR rollback.
            conn.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": LOCK_KEY})

            # 2. Identity check — TCP only. inet_server_addr() is NULL for
            #    Unix-socket connections; this tool has no socket-mode
            #    verification designed, so NULL is an unconditional abort,
            #    never a silent pass (correction #6).
            db_name, server_addr = conn.execute(text(
                "SELECT current_database(), inet_server_addr()::text"
            )).one()
            if server_addr is None:
                raise AdoptionAborted(
                    "inet_server_addr() is NULL (Unix-socket connection) — "
                    "unsupported; this tool verifies TCP identity only")
            if (db_name, server_addr) != (expect_db_name, expect_host):
                raise AdoptionAborted(
                    f"connected to ({db_name}, {server_addr}), expected "
                    f"({expect_db_name}, {expect_host})")

            # 3. Read starting state via plain SQL only — never through
            #    Alembic's ScriptDirectory-bound APIs at this stage (that
            #    resolution only happens later, in step 11, after the
            #    starting state has already been normalized to "no rows").
            has_table = conn.execute(text(
                "SELECT to_regclass('public.alembic_version') IS NOT NULL"
            )).scalar()
            rows = (conn.execute(text("SELECT version_num FROM alembic_version"))
                        .fetchall()) if has_table else []

            if len(rows) == 0:
                starting_state = "UNVERSIONED"
            elif len(rows) == 1:
                current = rows[0][0]
                if current == B0_REVISION:
                    log("already adopted at B0 — no action taken")
                    return                                      # case H, zero lock/DDL work
                elif current == "e5b9c2d47a10":
                    starting_state = "LEGACY_0007"
                else:
                    raise AdoptionAborted(f"unsupported starting revision {current!r}")
            else:
                raise AdoptionAborted(
                    f"alembic_version has {len(rows)} rows — multiple heads "
                    "are not supported, aborting before any DDL")

            # 4. Quiescence, technical part 1: no other application-role
            #    backend holds an open transaction. This is a check, not
            #    the mechanism — the operator has already stopped the app
            #    (§3's operational precondition) before invoking this tool.
            others = conn.execute(text("""
                SELECT count(*) FROM pg_stat_activity
                WHERE datname = current_database() AND pid <> pg_backend_pid()
                  AND usename = :app_role AND state <> 'idle'
            """), {"app_role": app_role}).scalar()
            if others:
                raise AdoptionAborted(
                    f"{others} other '{app_role}' backend(s) with an open "
                    "transaction — stop the application before adopting")

            # 5. Quiescence, technical part 2: explicit locks, fixed order,
            #    bounded timeout, held until commit/rollback. This — not
            #    step 4 — is what actually prevents a write from landing
            #    between the duplicate preflight (step 7) and the index
            #    creation (step 8).
            conn.execute(text("SET LOCAL lock_timeout = :t"), {"t": LOCK_TIMEOUT})
            try:
                conn.execute(text("LOCK TABLE usage_logs IN ACCESS EXCLUSIVE MODE"))
                conn.execute(text("LOCK TABLE workspace_shares IN ACCESS EXCLUSIVE MODE"))
            except LockNotAvailable as e:
                raise AdoptionAborted(
                    f"could not acquire table locks within {LOCK_TIMEOUT}: {e} "
                    "— not retrying automatically, re-invoke after diagnosing")

            # 6. Accepted-legacy fingerprint — exact equality (§4).
            actual = fingerprint(conn)
            accepted = json.load(open("ops/schema_audit/fingerprints/legacy_accepted.json"))
            if (diff := compare(actual, accepted)):
                raise AdoptionAborted(f"does not match accepted legacy shape: {diff}")

            # 7. Duplicate preflight — AFTER the locks from step 5, so
            #    nothing can insert a new duplicate between this check and
            #    step 8's index creation. Abort loudly; never delete rows.
            if has_duplicate_shares(conn):
                raise AdoptionAborted(
                    "workspace_shares has duplicate groups — resolve "
                    "manually, no rows will be deleted")

            # 8. Reconciliation DDL — ordinary transactional statements,
            #    already covered by the ACCESS EXCLUSIVE locks from step 5.
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

            # 9. Complete target-B0 verification — BEFORE alembic_version
            #    is touched at all (correction #1's ordering requirement).
            after = fingerprint(conn)
            target = json.load(open("ops/schema_audit/fingerprints/b0_target.json"))
            if (diff2 := compare(after, target)):
                raise AdoptionAborted(
                    f"post-reconciliation state still differs from target-B0: {diff2}")

            # 10. ONLY NOW, and only for the LEGACY_0007 path, remove the
            #     old row — conditional on the exact expected value, never
            #     an unconditional DELETE, row count enforced.
            if starting_state == "LEGACY_0007":
                result = conn.execute(text(
                    "DELETE FROM alembic_version WHERE version_num = :rev"
                ), {"rev": "e5b9c2d47a10"})
                if result.rowcount != 1:
                    raise AdoptionAborted(
                        f"expected to delete exactly 1 row for e5b9c2d47a10, "
                        f"deleted {result.rowcount} — aborting, not stamping")
            # UNVERSIONED path: no delete — nothing to remove.

            # 11. MigrationContext instantiated fresh, AFTER any deletion,
            #     bound to the SAME connection. get_current_heads() re-reads
            #     the table live — this assertion is what proves the delete
            #     (or the unversioned start) actually produced an empty-heads
            #     state before stamping is attempted.
            mc = MigrationContext.configure(conn)
            heads = mc.get_current_heads()
            if heads != ():
                raise AdoptionAborted(
                    f"expected empty heads before stamping B0, found {heads}")

            script = ScriptDirectory.from_config(alembic_cfg)   # active versions/ only
            mc.stamp(script, B0_REVISION)

            # 12. Exactly one resulting row, equal to B0.
            final_rows = conn.execute(text(
                "SELECT version_num FROM alembic_version")).fetchall()
            if final_rows != [(B0_REVISION,)]:
                raise AdoptionAborted(
                    f"post-stamp alembic_version is {final_rows}, expected "
                    f"exactly [('{B0_REVISION}',)]")

            # 13. Repeat final target verification. Steps 10-12 only ever
            #     touch the bookkeeping table, never the application schema,
            #     so this is expected to be a no-op diff — checked anyway,
            #     exactly as required.
            final_fp = fingerprint(conn)
            if compare(final_fp, target):
                raise AdoptionAborted(
                    "target-B0 fingerprint changed after stamping — this "
                    "should be structurally impossible; aborting")

        # `with conn.begin()` exits here → COMMIT only if every assertion in
        # steps 1-13 passed. Any exception anywhere (including inside 10,
        # 11, 12, or 13) → ROLLBACK: the conditional DELETE, the stamp's
        # internal write, and every reconciliation DDL statement all revert
        # together; the ACCESS EXCLUSIVE locks and the advisory lock release
        # with the transaction; the original e5b9c2d47a10 row (if any) is
        # restored because its DELETE never committed.
```

## 3. Write quiescence — technical, not best-effort

**Operational precondition (outside the transaction, before the tool runs):**
`docker-compose stop backend` — this stops the API, and per
`docker-compose.yml`'s `TRANSLATION_WORKER_ENABLED=true`, the background
translation worker as well, since it runs inside the same `backend`
container (confirmed against the actual compose file). Any scheduler process
capable of writing to `workspace_shares`/`usage_logs` must be stopped the
same way before invoking the tool — this document does not identify a
separate scheduler process beyond the backend container itself.

**Technical verification, inside the transaction (§2 steps 4–5):**
1. `pg_stat_activity` check scoped to the application's Postgres role
   (`kence`, per `docker-compose.yml`'s `POSTGRES_USER` and Stage A's
   confirmed single-owning-role finding), excluding the tool's own backend
   PID, requiring zero other non-idle backends for that role.
2. Explicit `LOCK TABLE usage_logs IN ACCESS EXCLUSIVE MODE`, then
   `LOCK TABLE workspace_shares IN ACCESS EXCLUSIVE MODE` — **fixed
   alphabetical order** (`usage_logs` before `workspace_shares`), so that if
   any other process ever attempted to lock both tables concurrently (e.g.
   an operator's manual `psql` session), lock acquisition order can never
   invert and deadlock. `ACCESS EXCLUSIVE` is chosen because the FK
   replacement on `usage_logs` (step 8) requires it anyway — acquiring it
   upfront on both tables removes any lock-mode-upgrade race within the
   transaction.
3. `SET LOCAL lock_timeout = '5s'` before both `LOCK TABLE` statements — if
   a lock can't be acquired within that window (meaning something is still
   holding it, contradicting the stopped-application precondition), the
   statement raises, which propagates out of the `with conn.begin():` block
   and rolls back. **No automatic retry** — the tool exits, the operator
   diagnoses why a lock was still held, and re-invokes manually.
4. These locks are held for the remainder of the transaction — through the
   duplicate preflight, the reconciliation DDL, both fingerprint checks, the
   conditional delete, and the stamp — and release only at commit or
   rollback, by ordinary PostgreSQL transaction semantics (no explicit
   `UNLOCK` exists or is needed).

**Why `CREATE UNIQUE INDEX`'s own lock is a backstop, not the mechanism**:
a non-`CONCURRENTLY` `CREATE INDEX` takes a `SHARE` lock on its target table
(blocking writers, not readers) for the statement's duration — but by the
time step 8 runs, this transaction already holds `ACCESS EXCLUSIVE` (a
strictly stronger lock) from step 5, so `CREATE INDEX`'s own lock
acquisition is instant and redundant *in this design*. It is named
explicitly here because it is the second, independent layer: even if a
future edit ever removed or narrowed step 5's explicit locks by mistake,
`CREATE INDEX`/`ALTER TABLE ADD CONSTRAINT` would still take their own
locks and PostgreSQL would still refuse to build a unique index over data
that violates uniqueness — the statement would fail, the transaction would
roll back, and no corrupt or silently-wrong index could ever be committed.
The explicit `LOCK TABLE` step exists for operational clarity and fail-fast
behavior (a 5-second bounded wait with a clear error, instead of the
`CREATE INDEX` statement itself blocking indefinitely with no diagnostic),
not because the outcome would be unsafe without it.

## 4. Complete fingerprint specification

Both `legacy_accepted.json` and `b0_target.json` are produced by the same
tool, `ops/schema_audit/fingerprint.py`, against `schemaname = 'public'`
only (no other schema exists per Stage A). Every category below cites its
exact PostgreSQL catalog source, so the eventual implementation has no
ambiguity to resolve on its own.

| Category | Catalog source | Notes |
|---|---|---|
| Tables and columns | `information_schema.tables` (`table_type = 'BASE TABLE'`), `information_schema.columns` | Compared as a **name-keyed set per table**, not an ordinal-position list — Stage A (`docs/ALEMBIC_SCHEMA_RECONCILIATION_2026-08-04.md` §3.5, drift #3 in §5) already established that `ALTER TABLE ADD COLUMN`-appended vs. `CREATE TABLE`-declared column order is cosmetic-only; comparing by position would reintroduce that exact false positive |
| Types, length/precision, collation, identity/generated state | `information_schema.columns.data_type`, `character_maximum_length`, `numeric_precision`, `numeric_scale`, `collation_name`, `is_identity`, `identity_generation`, `is_generated`, `generation_expression` | Captured verbatim |
| Nullability and normalized defaults | `is_nullable`, `column_default` (equivalently `pg_get_expr(adbin, adrelid)` from `pg_attrdef`) | "Normalized" means whitespace-trimmed only — no semantic default-expression rewriting is attempted, since a hand-written normalizer is itself a bug surface; a spurious mismatch here fails closed, which is the correct default, not a defect |
| Primary keys | `information_schema.table_constraints` (`constraint_type = 'PRIMARY KEY'`) joined to `key_column_usage`, ordered by `ordinal_position` **within the constraint** (this ordering is semantically meaningful for composite keys, unlike table column order) | Explicitly named as its own category (Rev2 only had it folded into "constraints" implicitly) |
| Foreign keys, ON DELETE/ON UPDATE, MATCH, deferrability | `pg_constraint` (`contype = 'f'`), `pg_get_constraintdef(oid)` for the canonical definition string, plus `condeferrable`/`condeferred` captured as explicit booleans (not always visible in the def string) | |
| Unique and check constraints, including validation state | `pg_constraint` (`contype IN ('u','c')`), `pg_get_constraintdef(oid)`, plus `convalidated` (whether a `CHECK` has been validated against existing rows, relevant for any future `NOT VALID` constraint) | |
| Index uniqueness, expressions, predicates, included columns, opclasses, collation, sort/NULL ordering | `pg_get_indexdef(indexrelid, 0, false)` — the non-pretty-printed form, for deterministic whitespace regardless of `search_path`/client settings | A single canonical string captures uniqueness, the expression list, the `WHERE` predicate, `INCLUDE` columns, non-default opclasses/collations, and non-default `ASC`/`DESC`/`NULLS FIRST`/`LAST` — this is why one function call is used rather than assembling these sub-fields separately |
| Enums | `pg_type` (`typtype = 'e'`) joined to `pg_enum`, labels ordered by `enumsortorder` (semantically meaningful — not re-sorted alphabetically) | |
| Extensions | `pg_extension.extname`, `extversion` | |
| Sequences and ownership | `information_schema.sequences` for definition; ownership via `pg_depend` (`deptype = 'a'`) linking sequence OID to owning table/column, captured as **table.column**, never the OID itself | |
| RLS enable/force state | `pg_class.relrowsecurity`, `pg_class.relforcerowsecurity` | |
| Policies | `pg_policies` (`schemaname`, `tablename`, `policyname`, `permissive`, `roles`, `cmd`, `qual`, `with_check`) | Named as its own category, separate from RLS enable/force — Rev2 bundled these, this document does not |
| Triggers and functions | `pg_trigger` (`NOT tgisinternal`), `pg_get_triggerdef(oid)`; `pg_proc` joined to `pg_namespace` (`nspname = 'public'`), `pg_get_functiondef(oid)` | |

**Unstable identifiers excluded**: no OID (`oid`, `indexrelid`, `conrelid`,
`typrelid`, etc.) ever appears in a fingerprint — only names and the
canonical definition strings/booleans/derived values above. OIDs are
per-database, non-reproducible, and would make every fingerprint fail to
match trivially.

**Deterministic canonical form**: every list (tables, columns-within-a-table
as a set, indexes, constraints, triggers, policies) is sorted by name before
serialization; the whole structure is emitted as `json.dumps(obj,
sort_keys=True, ensure_ascii=True)`. `compare()` is a structural equality
check on the two parsed JSON objects, not a text diff of the serialized
strings (avoids any accidental sensitivity to key insertion order that
`sort_keys=True` should already prevent, but is stated explicitly to remove
ambiguity for the eventual implementer).

Both fingerprints use this exact same tool and schema — `legacy_accepted.
json` is a **frozen** one-time capture of today's actual restore (per
Rev2 §6's reasoning, unchanged: it describes a historical fact, not a moving
target), while `b0_target.json` is **derived**, regenerated from a live run
of B0 whenever B0's text changes.

## 5. Pin migration content — build-time manifest

Replaces Rev2 §8.4's single `_expected_schema_revision.txt` with a richer,
still build-time-only artifact.

**`ops/schema_audit/generate_manifest.py`** (new) runs once, at image build
time, over the exact files present in that build's context, and writes
**`app/_schema_manifest.json`**:

```json
{
  "alembic_head": "<B0_REVISION>",
  "migration_file_hashes": {
    "b0_squashed_baseline.py": "<sha256>"
  },
  "referenced_hashes": {
    "ops/schema_audit/fingerprints/legacy_accepted.json": "<sha256>",
    "ops/schema_audit/fingerprints/b0_target.json": "<sha256>"
  },
  "fingerprint_format_version": 1
}
```

`migration_file_hashes` covers every file under the **active**
`backend/alembic/versions/` directory at build time (today: just B0; the
schema generalizes to future added revisions without redesign).
`fingerprint_format_version` is an integer bumped whenever
`fingerprint.py`'s output shape changes, so a manifest built against an
older fingerprint format is detected as stale rather than silently compared
against a JSON structure it no longer matches.

**The critical property** (per your correction #5): the migration job and
application startup **read this baked-in file and recompute the hash of the
live files present in the running container, then compare the two** — they
never compute-and-trust a hash from the same files they're validating
without an independent, earlier-computed reference. Concretely, at startup:

```python
def _verify_schema_at_expected_revision():
    manifest = json.loads((APP_DIR / "_schema_manifest.json").read_text())
    for rel_path, expected_hash in manifest["migration_file_hashes"].items():
        actual_hash = sha256((VERSIONS_DIR / rel_path).read_bytes()).hexdigest()
        if actual_hash != expected_hash:
            raise RuntimeError(
                f"{rel_path} hash mismatch: image manifest expects "
                f"{expected_hash}, found {actual_hash} — migration file "
                "was modified after the image was built")
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT version_num FROM alembic_version")).fetchall()
    if rows != [(manifest["alembic_head"],)]:
        raise RuntimeError(f"DB at {rows}, image expects "
                            f"{manifest['alembic_head']!r}")
```

Because `_schema_manifest.json` is itself a build-time artifact baked into
an image layer, this catches a migration file being altered *after* the
image was built (e.g. a volume mount shadowing `alembic/versions/`, or an
exec'd-in edit) — a purely-runtime recomputation of "does this file's hash
equal itself" would trivially always pass and catch nothing, which is
exactly why the manifest must travel with the image as a separate, earlier
artifact rather than being regenerated at verification time. (This does not
protect against someone tampering with `_schema_manifest.json` itself
inside a running container — that residual risk is noted in §10.)

The `migrate` one-shot job performs the same file-hash check before running
`alembic upgrade head`/before invoking the adoption tool, so a corrupted or
tampered image is caught before any DDL runs, not only at `backend`
startup.

## 6. Unix-socket identity — fail closed, unconditionally

Production adoption is TCP-only (matches `docker-compose.yml`'s network
topology — `postgres:5432` inside the compose network). §2 step 2 checks
`inet_server_addr()`; if it is `NULL` (meaning the connection is, or
appears to be, over a Unix socket rather than TCP/IP — the only way
PostgreSQL returns `NULL` for this function), the tool **aborts
unconditionally**, regardless of what `--expect-host` was supplied. No
Unix-socket verification mode is designed, specified, or tested by this
document; per your instruction, host verification is never left undefined —
"undefined" here is resolved as "refuse," not "skip the check." A future
Unix-socket mode, if ever needed, would require its own explicit design
(e.g. comparing a supplied expected socket path against
`current_setting('unix_socket_directories')` or an equivalent
server-side-verifiable value) and is out of scope here.

## 7. Preserve frozen B0 — restated, now enforced by CI

B0's `upgrade()` contains only explicit, frozen `op.create_table()` /
`op.create_index()` / `op.execute()` calls, authored once offline (Rev2
§3.1's autogenerate-then-freeze procedure, unchanged) — it never imports
`app.models` or references `Base.metadata` at migration-run time.

**Why this is safe despite `env.py` importing the ORM**: confirmed by
reading the actual `backend/alembic/env.py` (lines 21-24, `target_metadata =
Base.metadata`) during the Rev2 review — that import exists solely to
support the `alembic revision --autogenerate` command, which diffs the live
database against `target_metadata`. The code path exercised by `alembic
upgrade head` (`context.run_migrations()`, `runtime/migration.py:574` et
seq.) never reads `target_metadata` — it walks the revision scripts and
calls each one's `upgrade()` function directly. `env.py`'s ORM import is
therefore an authoring-time convenience with zero runtime effect on what DDL
actually executes; this document states that conclusion explicitly rather
than leaving it implicit, per your instruction.

**New: `ops/schema_audit/check_frozen_migrations.py`** (new, CI-wired) —
scans every `.py` file in `backend/alembic/versions/` (the **active**
directory only; `versions_archive/` is exempt, since those files are
historical record, never executed, and were written before this rule
existed) for forbidden patterns: `from app.models`, `from app.core.database
import Base`, `Base.metadata`, `.create_all(`. Any match fails the check.
Wired into CI (and optionally a pre-commit hook) so this property is
machine-verified on every future migration, not only true by construction
of B0 at the moment it's authored.

## 8. Exact file-by-file future implementation order

Dependency-respecting order for when Stage E.3 is separately GO'd — nothing
below is created by this document.

1. `ops/schema_audit/fingerprint.py` — full spec per §4.
2. `ops/schema_audit/check_frozen_migrations.py` — CI guard per §7, in place
   *before* B0 is authored so B0's authoring is checked from the start.
3. Author `backend/alembic/versions/<hash>_b0_squashed_baseline.py` via the
   offline autogenerate-then-freeze procedure (Rev2 §3.1, unchanged).
4. `backend/alembic/versions_archive/` + `README.md`, `git mv` the 7
   existing files in.
5. Run B0 once against a disposable, genuinely empty database → generate
   `ops/schema_audit/fingerprints/b0_target.json` via `fingerprint.py`.
6. Author `ops/schema_audit/fingerprints/legacy_accepted.json` from a
   **fresh** read-only 3-way capture (re-verified against the actual
   restore/production state at that time, not copied mechanically from
   Stage E.1's document — per Rev2 §12 risk 2, unchanged).
7. `ops/schema_audit/generate_manifest.py` — build-time manifest generator
   per §5.
8. `ops/schema_audit/adopt_legacy_schema.py` — the full §2 pseudocode.
9. `backend/app/main.py` — delete `_ensure_schema_upgrades()`, rewrite
   `_init_db()`/add `_verify_schema_at_expected_revision()` per §5's
   manifest-checking version (supersedes Rev2 §8.3's revision-only check).
10. `backend/app/models/models.py` — `DocumentLibrary.doc_kind` gains
    `server_default=sa.text("'document'")`.
11. `backend/Dockerfile` — `COPY alembic.ini .`, `COPY alembic/ ./alembic/`,
    add the `generate_manifest.py` build step producing
    `app/_schema_manifest.json`.
12. `docker-compose.yml` — add the profile-gated `migrate` service (Rev2
    §8.2, unchanged), updated to run the manifest check before `alembic
    upgrade head`.
13. CI wiring: run `check_frozen_migrations.py` and a fingerprint
    round-trip smoke test (generate → compare against itself → expect zero
    diff) on every PR touching `backend/alembic/` or
    `ops/schema_audit/fingerprint.py`.

## 9. Disposable test matrix A–H

All on disposable infrastructure only, never `kence-postgres`.

| Case | Setup | Procedure | Pass criteria |
|---|---|---|---|
| **A** — empty | Fresh disposable Postgres, zero tables | Plain `alembic upgrade head` after the `migrate` job's manifest check passes | `alembic current` = B0's id; target-B0 fingerprint match; manifest hash check passes; 133/133 backend tests green |
| **B** — unversioned legacy restore | Restore of today's actual backup | Full §2 flow, `UNVERSIONED` branch (DELETE skipped) | Post-run target-B0 fingerprint exact match; exactly 1 `alembic_version` row = B0; schema dump diff vs. pre-run shows **only** the 3 approved objects changed; `pg_locks` empty for `usage_logs`/`workspace_shares` after commit |
| **C** — already B0-versioned | Case A or B's output | `alembic upgrade head` again | No-op; zero DDL executed |
| **D** — deliberately incompatible legacy | Disposable DB seeded with a synthetic drift not matching `legacy_accepted.json` | Run the adoption tool | Aborts at §2 step 6, reports the exact field, **zero DDL persisted**, `pg_locks` shows no residual lock on either table post-abort, zero rows in `alembic_version` change |
| **E** — failure injected, general path | Fault-injection at steps 1, 4, 5 (lock timeout), 6, 7, 8 for the **unversioned** path | Any kill before commit → full rollback, verified via unchanged schema dump and empty `pg_locks` for the two tables |
| **F** — application startup | Start `docai-backend` against A/B/C's resulting DB; separately against a DB with a tampered migration file (hash mismatch) and a DB stamped at the wrong revision | A/B/C: `_verify_schema_at_expected_revision()` passes silently, zero DDL executed by startup. Tampered-file case: startup raises on the hash check, before ever querying `alembic_version`. Wrong-revision case: startup raises on the revision check |
| **G** — legacy DB stamped at `e5b9c2d47a10` | Disposable DB built to match production's actual object-level shape, `alembic_version` seeded to `e5b9c2d47a10` | Full §2 flow, `LEGACY_0007` branch, **with 5 injected failure points**: (1) before §2 step 10's DELETE, (2) after DELETE but before step 11's `.stamp()` call, (3) between the `heads == ()` assertion and the post-stamp row check ("during stamp"), (4) after step 12's row check but before step 13's final fingerprint, (5) after step 13 passes but before the transaction commits | **After every one of the 5 injection points**: original `e5b9c2d47a10` row is present and unchanged (the DELETE never committed); zero partial DDL (schema dump identical to pre-run); original data in `usage_logs`/`workspace_shares` unchanged (row counts and checksums identical to pre-run); zero rows referencing B0 in `alembic_version`. On a clean (non-injected) run: converges on B0, target-B0 fingerprint exact match, identical pass criteria to case B |
| **H** — repeated adoption | Run the adoption tool again against case B's or G's already-adopted output | §2 step 3's `current == B0_REVISION` branch | Logs "already adopted", exits 0, **no lock acquired, no transaction beyond the initial connection/read**, zero DDL, `alembic_version` unchanged |

## 10. Rollback procedure

- **Before commit**, any path (empty-DB bootstrap or adoption): transaction
  abort. Nothing was ever visible outside the transaction — holds by
  ordinary PostgreSQL atomicity, demonstrated concretely by case G's 5
  injection points (§9), not merely asserted.
- **After commit, empty-DB bootstrap**: only ever runs against a database
  with no data yet (case A), so `DROP DATABASE`/recreate is an acceptable,
  safe "downgrade" precisely because nothing of value exists.
- **After commit, legacy adoption**: B0 itself remains **explicitly
  irreversible** (Rev2 §7, unchanged — `downgrade()` raises
  `NotImplementedError`, since dropping 23 tables of production data via
  `alembic downgrade` has no legitimate use case). Recovery after a
  committed adoption is restore from a verified `pg_dump` via
  `ops/backup/restore.sh` (P0-01 tooling), not a schema-level downgrade. If
  a narrow, post-commit revert of *only* the reconciliation DDL is ever
  needed, it is a manual operator action (2 `DROP INDEX` + restore the prior
  `usage_logs` FK) explicitly outside `alembic downgrade`'s scope — stated
  here so it isn't mistaken for a silent gap, unchanged from Rev2's
  reasoning.
- **Application-code changes** (`main.py`, `models.py`, `Dockerfile`,
  `docker-compose.yml`, the new `ops/schema_audit/*` tools): ordinary `git
  revert`, no data-migration risk either direction.
- **Manifest/image-level**: if a bad manifest or a bad B0 file is ever
  built into an image, rollback is redeploying the previous known-good
  image — the manifest check (§5) is specifically designed to make a bad
  image fail closed at the `migrate` job or at `backend` startup, before it
  can affect a real database.

## 11. Remaining risks / unresolved items

1. **Every file in §8 remains unwritten.** `b0_target.json` cannot exist
   until B0 is authored and run once; `legacy_accepted.json` needs a fresh
   capture, not a mechanical copy from Stage E.1; none of tests A–H have
   run. (Carried forward from Rev2 §12, still true.)
2. **Manifest tampering inside a running container is not defended
   against.** §5's hash check catches a migration file changed *after*
   build relative to the manifest, but if an attacker can modify files
   inside a running container at all, they could modify
   `_schema_manifest.json` itself to match. This is an image-integrity
   concern (read-only root filesystem, image signing) outside this
   document's scope — noted as a boundary, not a defect in this plan's own
   logic.
3. **`lock_timeout` value (5s, §3) is a placeholder**, not empirically
   tuned — needs validation against real table sizes at adoption time (Stage
   A's §6 already found current table sizes small enough that lock
   acquisition should be near-instant once the app is actually stopped, but
   this should be re-confirmed, not assumed, immediately before any real
   adoption run).
4. **Advisory lock key** (`0x4B4144415054_0001`, §2) still needs a real,
   collision-checked reserved constant before implementation (unchanged
   open item from Rev2).
5. **Fingerprint normalization for defaults** (§4) is deliberately minimal
   (whitespace-trim only) to avoid a home-grown semantic normalizer
   becoming its own bug source — this means a functionally-identical but
   textually-different default expression (unlikely, but not provably
   impossible) would be flagged as a mismatch. This is a chosen fail-closed
   trade-off, not an oversight, but is worth re-confirming once
   `fingerprint.py` exists and is run against the real restore.
6. **Production maintenance-window scheduling** for the real database
   remains explicitly out of this plan's scope — a separate, future,
   explicitly-gated approval, unchanged from Rev1/Rev2.
7. **CI check (§7) is pattern-based** (import/attribute-name grep or simple
   AST scan) — it will not catch every conceivable indirection (e.g. a
   migration importing a helper module that itself imports `Base`). This is
   a reasonable, low-maintenance first layer, not a formal guarantee; noted
   so it isn't overstated.

## Recommendation and verdict

**Recommendation**: adopt this corrected design. The one proven code-level
defect from the Rev2 review (Item 2 — stamping over an archived revision) is
fixed by reordering the adoption sequence so `MigrationContext.stamp()` only
ever runs against a freshly-verified empty-heads state, never against a
revision the active `ScriptDirectory` cannot resolve. The specification gaps
(fingerprint completeness, content-pinning, Unix-socket identity, frozen-B0
enforcement) are closed with concrete, catalog-source-cited detail rather
than prose assertions.

**Verdict: NOT READY for Stage E.3 implementation.** This is a design
document; nothing in §8's file list has been created, no fingerprint has
been generated, no test in §9 has been run, and the Item-2 fix itself — while
proven sound against the actual installed Alembic source this session — has
not yet been exercised end-to-end against a real disposable database. P0-02
remains **OPEN**. Revision 6 implementation remains **NO-GO**. This document
is a documentation-only GO for Revision 3 as the proposed plan — it is not,
and does not substitute for, a separate explicit GO to begin Stage E.3
implementation, which must still be requested independently before any file
in §8 is created or any command touches even the disposable restore stack.

# P0-02 Stage E.3 — Implementation Record

Implements `docs/ALEMBIC_SCHEMA_RECONCILIATION_STAGE_E2_REV3_2026-08-05.md`
under the limited Stage E.3 GO (branch `p0-02-stage-e3`, disposable
PostgreSQL 16.13 only, production never touched). This document closes the
three gaps identified in the Rev3 final-readiness review: a standalone
acceptance-gates section, the literal migration-job entrypoint, and an
explicit deployment order — all three are below, now backed by real,
executed commands rather than prose descriptions.

## 1. Files created/changed/archived

See the Stage E.3 final report (chat) for the complete list with a
description of each. Summary: `ops/schema_audit/fingerprint.py`,
`check_frozen_migrations.py`, `generate_manifest.py`,
`adopt_legacy_schema.py` (new tools); `backend/alembic/versions/
bc59de168869_b0_squashed_baseline.py` + `b0_baseline.sql` (new, active);
`backend/alembic/versions_archive/` (0001-0007 relocated, byte-identical);
`backend/app/main.py`, `backend/app/models/models.py`,
`backend/Dockerfile`, `backend/.dockerignore`, `backend/verify_manifest.py`,
`docker-compose.yml` (changed); `ops/schema_audit/fingerprints/
{legacy_accepted,b0_target}.json` (generated, not hand-written).

## 2. Consolidated acceptance gates

| # | Gate | Evidence |
|---|---|---|
| 1 | Empty DB reaches head via plain `alembic upgrade head`, no stamp | Test A — real `alembic upgrade head` CLI invocation, `alembic current` = `bc59de168869 (head)`, no `stamp` command anywhere in the path |
| 2 | Unversioned accepted-legacy DB atomically adopts B0 | Test B — `adopt_legacy_schema.py` full run, outcome `adopted: UNVERSIONED -> bc59de168869` |
| 3 | `e5b9c2d47a10` DB atomically replaces its version with B0 | Test G — same tool, `LEGACY_0007` branch, outcome `adopted: LEGACY_0007 -> bc59de168869`, plus 6-point failure injection (below) |
| 4 | Unknown/multiple revision rows fail before DDL | Precondition check (adoption tool step 3) — covered by Test D's abort path (aborts even earlier, at fingerprint check, for the case tested) and by code path for the >1-row / unsupported-revision branches, which raise before any lock/fingerprint/DDL step runs |
| 5 | Exactly one B0 version row after success | Tests A, B, G — `SELECT * FROM alembic_version` = exactly `bc59de168869`, verified directly each time |
| 6 | Zero target-fingerprint differences | Tests A, B, G — `fingerprint.py compare` against `b0_target.json` → `MATCH: zero differences` (identical SHA-256: `57f30a63ae5b2a7372a6aeb009b01aed65f4f4448ab7504082f80b228bbdd0e7`) in all three cases |
| 7 | Exactly two correct partial unique indexes | Verified via `pg_get_indexdef`-sourced fingerprint entries `uq_session_share_user`/`uq_session_share_org` with exact `WHERE` predicates, in every passing test |
| 8 | `usage_logs_org_id_fkey` has exact `ON DELETE SET NULL` | Verified via `pg_get_constraintdef`-sourced fingerprint entry, exact string match, in every passing test |
| 9 | Zero partial changes at every failure point | Test E (16 checkpoints, unversioned path) + Test G (6 checkpoints, legacy-0007 path) — identical pre/post SHA-256 fingerprint and identical data checksums after every single injected failure |
| 10 | Zero runtime PostgreSQL DDL paths | `backend/app/main.py::_init_db` — Postgres branch calls only `_verify_schema_at_expected_revision()` (reads only: file hashes + one `SELECT`); `_ensure_schema_upgrades()` deleted entirely, not gated |
| 11 | Frozen-migration import guard passes, including indirect-import negative fixtures | `check_frozen_migrations.py` — clean against the real `versions/` dir; validated against constructed direct-import and indirect-import (through a local helper module) fixtures, both correctly detected with full import chains reported |
| 12 | Build-pinned manifest verification passes and tampering tests fail closed | `verify_manifest.py` / `_verify_schema_at_expected_revision()` — real container run passes on a clean image; wrong-revision, zero-row, and tampered-migration-file cases (Test F) all raise before any DB or DDL work |
| 13 | Startup mismatch tests fail closed | Test F, all 3 negative cases, run against the actual built image (`docai-backend:p002-test`), not just the Python function in isolation |
| 14 | No production access occurred | See git/process log in the final report — every command in this document targets disposable containers (`kence-p002-*`) or the repository's own evidence files; `kence-postgres`/`kence-backend` were never connected to; `kence-restore-postgres` was identified as off-limits by the permission system itself and not used, superseded by re-deriving the same evidence from the already-existing `ops/schema_audit/evidence/prod_schema.sql` capture |
| 15 | 100% of tests A-H pass on disposable PostgreSQL 16 | See §4 |
| 16 | Full relevant backend suite passes on A/B/C/G resulting schemas | See the final report's suite-count section — required against all four, not only A, per this GO's explicit correction to the Rev3 review's gap |

## 3. Exact migration-job entrypoint and deployment order

**Entrypoint** (`docker-compose.yml`, service `migrate`, profile-gated):
```yaml
entrypoint: ["/bin/sh", "-c"]
command:
  - "python verify_manifest.py && alembic upgrade head"
```
Literal, tested sequence — `verify_manifest.py` re-hashes every file listed
in `app/_schema_manifest.json["migration_file_hashes"]` against what's
actually on disk in the container and exits non-zero (never invoking
`alembic`) on any mismatch. Only if that passes does `alembic upgrade head`
run. Validated end-to-end this session against a real built image
(`docai-backend:p002-test`) and a disposable Postgres 16 container on a
private Docker network — output:
```
OK: manifest verified, expected head bc59de168869
INFO  [alembic.runtime.migration] Running upgrade  -> bc59de168869, b0_squashed_baseline
```

**Deployment order** (operator sequence, validated piece-by-piece this
session, not yet run as one continuous live deploy since that requires the
separate production GO):
1. Pre-build: `python ops/schema_audit/generate_manifest.py --output backend/app/_schema_manifest.json` (from repo root) — must run BEFORE the image build; `backend/Dockerfile`'s `COPY app/` picks up the already-generated file.
2. `docker build -f backend/Dockerfile -t docai-backend:<tag> backend/`.
3. `docker-compose --profile migrate run --rm migrate` — verifies manifest, then runs `alembic upgrade head`. For a fresh/empty database this is the entire deploy. For a legacy, unversioned or `e5b9c2d47a10`-stamped database, this step is **not** sufficient by itself — see step 3a.
   - 3a. **Legacy adoption (only if the target database is not already at B0 or empty)**: stop the application (`docker-compose stop backend`), then run `python ops/schema_audit/adopt_legacy_schema.py --database-url ... --admin-database-url ... --expect-db-name ... --expect-host ... --expect-pg-major 16 --app-role kence` manually, once, as an explicit operator action — never wired into the `migrate` service, on purpose (so it can never fire unattended in a pipeline). Confirmed this session (Tests B, G) that both starting states converge on identical output.
4. `docker-compose up -d backend` — `_verify_schema_at_expected_revision()` runs at startup, confirmed (Test F) to pass silently on success and fail closed on any revision/manifest mismatch.

## 4. Test matrix A-H — final status

All 8 cases executed on disposable PostgreSQL 16.13 containers this
session; see the chat-delivered final report for the full command/output
transcript of each. Summary result: **8/8 PASS** — full detail, per-case
evidence, and the 22-point failure-injection breakdown (16 on the
unversioned path, 6 on the `e5b9c2d47a10` path) are in that report, not
duplicated here to avoid the two documents drifting out of sync.

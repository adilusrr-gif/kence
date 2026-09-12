# Archived migrations (0001-0007) — historical record, never executed

These 7 files are the original incremental Alembic chain
(`398a7bf8d359` → `e5b9c2d47a10`). They are preserved here **byte-for-byte
unchanged** as a historical record of intent, and are **permanently
excluded** from Alembic's active `version_locations`.

`backend/alembic.ini` has no `version_locations` key, so Alembic's default
(`%(script_location)s/versions`, i.e. `backend/alembic/versions/` only)
already applies — this directory is a plain sibling that Alembic never
scans, no configuration edit needed. **If a future maintainer ever adds an
explicit `version_locations` line to `alembic.ini`, it must list only
`versions/` — never include this directory.** Adding it back into scope
would reintroduce the exact problem this archive exists to avoid: Alembic
attempting to resolve `versions_archive/` revisions during `stamp()`/
`upgrade()` against a chain whose sole active root is now `bc59de168869`
(B0, `backend/alembic/versions/bc59de168869_b0_squashed_baseline.py`).

Why these files stopped being executed (evidence, not opinion):
`docs/ALEMBIC_SCHEMA_RECONCILIATION_2026-08-04.md`,
`docs/ALEMBIC_SCHEMA_RECONCILIATION_STAGE_E1_2026-08-05.md`,
`docs/ALEMBIC_SCHEMA_RECONCILIATION_STAGE_E2_REV3_2026-08-05.md` — in
summary: `0001` was a documented no-op (schema was actually built by
`Base.metadata.create_all()`), `0004`/`0005` lacked existence guards and
crash with `DuplicateColumn` against any `create_all()`-bootstrapped
database (which is every real deployment), and `0003`'s backfill isn't
safely orderable against a truly empty database. B0 supersedes all of this
by building the complete, corrected end state directly, in one file, driven
by frozen static SQL rather than by replaying this chain.

Do not delete these files. Do not edit them. Do not move them back into
`versions/`.

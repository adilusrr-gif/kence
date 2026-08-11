# KENCE.AI — Disaster Recovery Runbook

Status: baseline implementation (P0-01). Covers backup and an isolated
restore drill. Does **not** yet cover a one-command production-restore
procedure, off-host copies, or scheduled/automated backups — see
[Known limitations](#known-limitations).

## 1. Scope

**Backed up by this tooling:**
- PostgreSQL `kenceai` database (container `kence-postgres`) — all relational data.
- Neo4j `neo4j` database (container `kence-neo4j`) — the knowledge graph.
- `backend/uploads/`, `backend/chroma_db/`, `backend/data/`, `backend/org_storage/` — bind-mounted files.

**Explicitly out of scope (not backed up, and why):**
- **Ollama model weights** (`/usr/share/.ollama/models`, host path) — fully derived, re-obtainable via `ollama pull qwen3.5:122b` / `ollama pull bge-m3`.
- **Backend/frontend Docker images** (`docai-backend:latest`, `docai-frontend:latest`) — rebuildable from git (`docker compose build`) at the commit recorded in each backup's manifest.
- **Secrets (`.env`)** — never included in any backup artifact. Must be preserved separately by an operator (see [Secrets handling](#7-secrets-handling)).

## 2. Data map / source of truth

| Store | What it holds | Source of truth or derived? | Regenerable? |
|---|---|---|---|
| Postgres `kenceai` | `organizations`, `users`, `doc_sessions` (sessions), `chat_messages` (messages), `document_library` (documents), `library_document_content`, `knowledge_graph_nodes` (pointers into Neo4j, not the graph itself) | Source of truth | No |
| Neo4j `neo4j` db | Actual knowledge-graph nodes/relationships, extracted from documents via LLM | Source of truth | No — extraction is LLM-driven, non-deterministic, and no rebuild script exists |
| `backend/uploads/` | Original uploaded documents | Source of truth | No |
| `backend/chroma_db/` | Per-session (`{session_id}/`) and per-library-doc (`library/{id}/`) vector stores (chunks + embeddings) | Derived — in theory rebuildable from Postgres `markdown_text` + Ollama re-embedding | In theory yes; in practice **no rebuild script exists today** — treated as source of truth |
| `backend/data/` | Legacy `users.json` store | Source of truth (legacy, superseded by `users` table) | No |
| `backend/org_storage/` | Currently unused in application code (verified: zero references in `app/`) | N/A | N/A — backed up anyway, cost is negligible (KB-scale) |
| Ollama model weights | LLM/embedding model weights | Fully derived | Yes — `ollama pull` |
| Backend/frontend images | Application code | Derived from git | Yes — rebuild from source |

No `chunk` table exists in Postgres — chunks exist only inside ChromaDB.

## 3. Backup order (as implemented in `backup.sh`)

1. Postgres dump (`pg_dump -Fc` + plain `.sql.gz`) — captured first since it's the most valuable, cheapest-to-restore artifact; a failure later in the run still leaves this safely captured.
2. Postgres row counts (read-only `SELECT count(*)`), for later verification.
3. Alembic head (derived from `backend/alembic/versions/*.py`, no `alembic` CLI invoked) and applied revision (read-only `SELECT version_num FROM alembic_version` — expected to return "not found" on this system today, see [Known limitations](#known-limitations)).
4. Neo4j export — zero-downtime, via APOC `apoc.export.cypher.all(null, {stream:true, ...})`, invoked over the HTTP transactional endpoint (`http://127.0.0.1:7474/db/neo4j/tx/commit`), not `cypher-shell`. A pure read transaction; no container stop, no config change. (`cypher-shell --format plain` was tried first and rejected — its tabular output mixes CSV quote-doubling and backslash escaping ambiguously, which corrupted the export on the first real drill; the HTTP endpoint returns unambiguous JSON, decoded exactly with Python's `json` module, which also sidesteps a separate locale issue — see limitations below.)
5. Neo4j node/relationship counts (read-only Cypher).
6. Bind-mount files (`uploads`, `chroma_db`, `data`, `org_storage`) — `tar czf` directly on the host filesystem, no container access needed.
7. Manifest (`manifest.json`) — timestamp, git commit/branch, Alembic head/applied, component versions, image tags, all counts, artifact list.
8. SHA-256 checksums for every artifact (`SHA256SUMS`).
9. Integrity checks: `pg_restore --list` on the custom-format dump, `gzip -t` on the plain dump, `tar -tzf` on each archive, non-empty check on the Neo4j export, full checksum verification. A failure here leaves the partial backup on disk for inspection — nothing is auto-deleted.

## 4. Restore order (as implemented in `restore.sh` / `verify_restore.sh`)

1. Verify the backup directory's SHA-256 checksums before touching anything.
2. Stand up an isolated, disposable Compose stack: project `kenceai_restore_test`, containers `kence-restore-postgres` / `kence-restore-neo4j`, fresh named volumes, fresh network, loopback ports `15432` / `17474` / `17687`, throwaway random passwords generated for this stack only (never reused from production `.env`).
3. Restore Postgres (`pg_restore --clean --if-exists -1`).
4. Restore Neo4j (replay the single `.cypher` export via `cypher-shell -f`; schema/constraints are embedded at the top of the export and replay before data).
5. Extract the file archives into a scratch directory (no container involved — this baseline verifies the storage layer only, not a full backend/frontend/Ollama smoke test).
6. `verify_restore.sh` compares Postgres/Neo4j counts and file listings between the backup manifest and the restored instance, and checks both restore containers report `healthy`.
7. `restore.sh --teardown` tears down the `kenceai_restore_test` project (`docker compose down -v` — this can only ever affect `kenceai_restore_test_*` resources, never the production `kenceai_*` project) and removes the scratch directory.

## 5. Commands

```bash
# Backup (read-only against production)
ops/backup/backup.sh
# -> prints the backup directory, e.g. /home/ai/kence_backups/20260804T120000Z

# Restore into an isolated disposable stack
ops/backup/restore.sh /home/ai/kence_backups/20260804T120000Z

# Verify the restore reproduced the data
ops/backup/verify_restore.sh /home/ai/kence_backups/20260804T120000Z

# Tear down the disposable stack when done
ops/backup/restore.sh --teardown
```

## 6. Prerequisites

- Docker + Compose v2 plugin (`docker compose version`).
- Repo root `.env` present and readable, containing `POSTGRES_PASSWORD`, `NEO4J_PASSWORD`.
- `python3`, `openssl`, standard coreutils (`tar`, `sha256sum`, `gzip`, `column`).
- Free disk: current combined data size is well under 1GB (Postgres 117.6MB volume, Neo4j 542.3MB volume, bind-mount files ~19MB); this host has 1.3TB free.
- User must be able to run `docker exec`/`docker cp` against `kence-postgres` and `kence-neo4j` (i.e. in the `docker` group or root).

## 7. Secrets handling

- `backup.sh`/`restore.sh` read `POSTGRES_PASSWORD`/`NEO4J_PASSWORD` from the repo-root `.env` (already gitignored) via `source`, and never print or log them.
- No backup artifact (dump, manifest, checksums, report) ever contains a password or connection string.
- The disposable restore stack uses freshly generated random credentials (`openssl rand -hex 24`), written only to `/home/ai/kence_backups/.restore_test/.env.restore` and `restore_info.json` (mode 600) — never the production secrets.
- **Known gap:** `.env` and all backups currently live on this single host with no offsite/second-location copy. If this host is lost, both the data and the means to restore it are lost together. This is a real, currently-unaddressed single point of failure — the recommendation is to keep a copy of `.env` (or the values needed to reconstruct it) in an offline password manager/secret store, separate from this host, as a follow-up action.

## 8. RPO / RTO

- **RPO**: bounded only by how recently `backup.sh` was last run manually. There is no scheduling yet (deferred — see [Known limitations](#known-limitations)), so RPO today is effectively "however long since the last manual run," not a fixed number. Once a schedule exists, RPO becomes the schedule interval.
- **RTO**: the wall-clock time to run `restore.sh` + `verify_restore.sh` end-to-end. This is **measured, not estimated** — see `docs/BACKUP_RESTORE_TEST_REPORT_2026-08-04.md` for the actual timed drill.

## 9. Rollback

- **Restore drill rollback**: `ops/backup/restore.sh --teardown`. Non-destructive to production by construction — it only ever operates on `kenceai_restore_test_*` volumes/containers/network, which share no name, volume, or network with the production `kenceai` project.
- **Real production-restore scenario (out of scope for this baseline):** restoring backed-up data *into* production (e.g. after real data loss) would mean stopping `kence-postgres`/`kence-neo4j` and restoring into the existing `postgres_data`/`neo4j_data` volumes (or swapping volumes), which is materially higher-risk than this drill and is **not built or tested here**. This baseline proves the backups are restorable and internally consistent in isolation — a true prod-recovery runbook is a separate, future piece of work that should be developed and tested (ideally on a maintenance window) before it's ever relied upon.

## 10. Known limitations

- **Neo4j restore is a Cypher replay, not a binary load.** `neo4j-admin database dump` cannot run against a live/mounted database in Neo4j 5.18 Community ("not possible to dump a database that is mounted in a running Neo4j server" — no live-dump path exists at all in this edition). The zero-downtime alternative (APOC cypher export) is not guaranteed to be perfectly transactionally consistent under concurrent writes, and replay is slower than a binary load for large graphs. Acceptable at current graph size (1,730 nodes / 1,714 relationships in the environment this was built against); revisit if the graph grows substantially.
- **Cyrillic/Kazakh text corruption risk in Neo4j operations.** `cypher-shell` inside the Neo4j container has no locale configured by default; without explicitly forcing `LANG=C.UTF-8`/`LC_ALL=C.UTF-8` on every invocation, all non-ASCII output (the norm for this product's entity labels) is silently mangled to `?`. `restore.sh` still uses `cypher-shell -f` to replay the export (feeding it a clean UTF-8 file, not parsing its tabular output, so this is safe) and always sets these env vars regardless. `backup.sh`'s export itself no longer uses `cypher-shell` at all (see above) — the HTTP endpoint has no locale dependency. This was found and fixed during implementation (the first real drill run), not a theoretical risk.
- **ChromaDB is file-copied only**, not internally verified for consistency beyond `tar` archive integrity (no per-collection validation).
- **`alembic_version` table does not exist in production** (confirmed live: `relation "alembic_version" does not exist`) — matches a separately tracked issue (P0-02) about the live schema never having been stamped. The backup manifest records this as `"NOT_FOUND"` rather than failing.
- **No offsite/second-host backup copy** (see [Secrets handling](#7-secrets-handling)).
- **No scheduling** (cron/systemd timer) — backups are manually invoked only, in this pass.
- **No Chroma rebuild script** — if ChromaDB backups were ever lost independently of Postgres, there is currently no automated way to regenerate vectors from the source text, even though it's theoretically possible.
- **Restore drill does not boot backend/frontend/Ollama** — it verifies the storage layer (Postgres, Neo4j, files) only, not a full end-to-end application smoke test.

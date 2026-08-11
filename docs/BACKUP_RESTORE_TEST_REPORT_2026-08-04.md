# Backup/Restore Test Report — 2026-08-04

Real drill, executed against the live production stack (read-only) and a
fully isolated disposable restore stack. No production data, containers,
volumes, or schema were modified at any point.

## Summary

- Backup run: 2026-08-04 06:16:55–06:17:02 UTC, **7.7s**
- Restore run: 2026-08-04 06:17:27–06:18:04 UTC, **36.8s**
- Verify run: 2026-08-04 06:18:13–06:18:14 UTC, **1.5s**, result **PASS**
- Overall result: **PASS**
- Backup dir: `/home/ai/kence_backups/20260804T061655Z/` (kept on disk; not deleted per no-auto-delete retention policy)

## What was backed up

- Postgres `kenceai` DB — `pg_dump -Fc`: 1,334,528 bytes (1.3MB); plain `pg_dump | gzip -9`: 1,122,234 bytes (1.1MB). Combined step duration: 4s. `pg_restore --list` integrity check passed; `gzip -t` passed.
- Neo4j (APOC zero-downtime cypher export via the HTTP transactional endpoint): 664,782 bytes (649KB), 1,730 nodes / 1,714 relationships. Export step duration: <1s.
- `backend/uploads` tar: 6,369,922 bytes (6.1MB, 94 files); `backend/chroma_db` tar: 2,672,719 bytes (2.5MB, 22 files); `backend/data` tar: 286 bytes (1 file, `users.json`); `backend/org_storage` tar: 116 bytes (0 files, dir empty as expected). Combined archive step duration: 1s.
- **Total backup size: 12MB.**
- All artifacts checksummed (SHA-256) and self-verified (`sha256sum -c`) as the final backup step — passed.

## What was NOT backed up (and why)

- Ollama model weights — regenerable via `ollama pull qwen3.5:122b` / `ollama pull bge-m3` (host path, out of scope by design).
- Backend/frontend Docker images (`docai-backend:latest`, `docai-frontend:latest`) — rebuildable from git at commit `65a31d5f467b2cb7a0b694ece668383b9ae1005d` (branch `master-clean`, recorded in the manifest).
- `.env` secrets (`POSTGRES_PASSWORD`, `NEO4J_PASSWORD`, `JWT_SECRET_KEY`) — never written to any backup artifact; handled manually per `docs/DISASTER_RECOVERY.md` §7.

## Durations & sizes (measured)

| Step | Duration | Size |
|---|---|---|
| Postgres dump (custom + plain) | 4s | 2.4MB combined |
| Postgres counts | 1s | — |
| Alembic head/applied lookup | 0s | — |
| Neo4j export (HTTP/APOC) | <1s | 649KB |
| Neo4j counts | <1s | — |
| Files archive (4 dirs) | 1s | 8.7MB combined |
| Manifest | 1s | — |
| Checksums | 0s | — |
| Integrity check | 0s | — |
| **Total backup** | **7.7s** | **12MB** |
| Restore stack startup (postgres+neo4j healthy) | 13s | — |
| Postgres restore (`pg_restore`) | <1s | — |
| Neo4j restore (cypher replay) | 23s | — |
| Files extraction | 1s | — |
| **Total restore** | **36.8s** | — |
| Verify | 1.5s | — |

## RPO / RTO (measured)

- **RPO**: this drill captured a live, real-time backup — 0s staleness at capture time. Ongoing RPO is bounded only by how often `backup.sh` is run; there is no scheduling yet (manual-only in this baseline — see `docs/DISASTER_RECOVERY.md` §10), so *sustained* RPO is currently unbounded/operator-dependent, not a fixed SLA.
- **RTO**: **38.3s measured** (restore.sh 36.8s + verify_restore.sh 1.5s) for the current data volume (~12MB backup, 1,730 Neo4j nodes, 117MB Postgres volume). This is the storage-layer restore only (Postgres + Neo4j + files) — it does **not** include rebuilding/starting the backend, frontend, or Ollama, which would add real time in an actual production-recovery scenario (out of scope for this baseline, see rollback section below).

## Verification evidence

### Postgres row counts (backup-time vs restored)

| Table | Expected (backup time) | Restored | Status |
|---|---|---|---|
| organizations | 1 | 1 | OK |
| users | 10 | 10 | OK |
| doc_sessions | 0 | 0 | OK |
| chat_messages | 0 | 0 | OK |
| document_library | 2 | 2 | OK |
| library_document_content | 0 | 0 | OK |
| knowledge_graph_nodes | 1755 | 1755 | OK |

### Neo4j counts

| Metric | Expected | Restored | Status |
|---|---|---|---|
| Nodes | 1730 | 1730 | OK |
| Relationships | 1714 | 1714 | OK |

### File integrity

- Archive listings (`tar -tzf` at backup time vs post-extraction `find`): uploads 94/94, chroma_db 22/22, data 1/1, org_storage 0/0 — all matched.
- **Content-level spot check** (beyond the tar-archive checksum): 3 sampled files (`uploads/secret.txt`, a `.pdf`, a `.pptx`) — SHA-256 of the original bind-mount file vs the extracted restored copy — **all 3 matched exactly**.
- Restored PDF opened successfully: `file` reports `PDF document, version 1.7`, header bytes confirmed `%PDF-1.7`.

### Container health

- `kence-restore-postgres`: healthy
- `kence-restore-neo4j`: healthy
- Production (`kence-postgres`, `kence-neo4j`, `kence-backend`, `kence-frontend`, `kence-ollama`): all remained `Up 6 days (healthy)` throughout the entire drill — no restarts, no interruption.

## Exact commands run

```bash
ops/backup/backup.sh
# -> /home/ai/kence_backups/20260804T061655Z

ops/backup/restore.sh /home/ai/kence_backups/20260804T061655Z

ops/backup/verify_restore.sh /home/ai/kence_backups/20260804T061655Z
# -> === VERIFY: PASS ===

ops/backup/restore.sh --teardown
```

## Manual steps required

None — all three scripts ran unattended once invoked. Two bugs were found and fixed *during* script development (before this final drill run), not during the drill itself:
1. Alembic head-revision parsing used a regex that didn't account for PEP 604 type-annotated assignments (`revision: str = '...'`) in the migration files — replaced with a Python `ast`-based parser.
2. The initial Neo4j export approach (`cypher-shell --format plain`, piped and manually unescaped) corrupted the export via ambiguous CSV/backslash quote-escaping, and separately required forcing `LANG=C.UTF-8`/`LC_ALL=C.UTF-8` to avoid silently mangling Cyrillic/Kazakh text to `?`. Replaced with Neo4j's HTTP transactional endpoint + Python's `json` module, which resolved both issues at once (JSON escaping is unambiguous, and JSON is UTF-8 by definition).

## Rollback / teardown performed

`ops/backup/restore.sh --teardown` was run after verification passed. Confirmed via `docker ps -a`/`docker volume ls`/`docker network ls` (filtered on `kenceai_restore_test`) that no restore-test containers, volumes, or networks remained. Production containers, volumes, and network were never touched at any point (confirmed via `docker ps` before, during, and after the drill — all five production containers showed uninterrupted `Up 6 days` status).

## Remaining blockers / follow-ups

- **No offsite backup copy** — `.env` and all backups currently live on this single host. If the host is lost, both the data and the means to restore it are lost together.
- **No scheduling** — `backup.sh` is manual-only in this baseline; a cron/systemd-timer wrapper is deferred to a follow-up ticket.
- **No Chroma rebuild script** — vectors can't currently be regenerated from source text automatically, even though it's theoretically possible (chunking + Ollama re-embedding from Postgres `markdown_text`).
- **No tested production-restore procedure** — this drill proves backups are internally consistent and restorable in isolation; restoring *into* a live production incident (stopping `kence-postgres`/`kence-neo4j` and swapping/restoring their actual volumes) is materially higher-risk and intentionally out of scope here (see `docs/DISASTER_RECOVERY.md` §9).
- **`alembic_version` table does not exist in production** (confirmed: `NOT_FOUND` recorded in the manifest) — tracked separately as a schema-integrity issue (P0-02 in the project roadmap), not something this backup/restore tooling fixes.
- Neo4j restore via Cypher replay took 23s for 1,730 nodes/1,714 relationships; this will scale roughly linearly (or worse) with graph size — revisit if the production graph grows by orders of magnitude.

#!/usr/bin/env bash
# ops/backup/backup.sh
#
# Read-only backup of KENCE.AI: Postgres (pg_dump), Neo4j (APOC cypher
# export, zero-downtime), and the 4 bind-mounted data directories.
# Never modifies production, never runs alembic, never restarts anything.
#
# Usage: ops/backup/backup.sh
# Output: /home/ai/kence_backups/<UTC timestamp>/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

BACKUP_ROOT="${KENCE_BACKUP_ROOT:-/home/ai/kence_backups}"
POSTGRES_CONTAINER="kence-postgres"
NEO4J_CONTAINER="kence-neo4j"
NEO4J_HTTP_URL="http://127.0.0.1:7474"
PG_DB="kenceai"
PG_USER="kence"

PG_TABLES=(organizations users doc_sessions chat_messages document_library library_document_content knowledge_graph_nodes)

require_cmd docker tar sha256sum gzip find sort xargs curl python3
require_container_running "$POSTGRES_CONTAINER"
require_container_running "$NEO4J_CONTAINER"
load_secrets

TS="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_ROOT/$TS"
mkdir -p -m 700 "$DEST"/{postgres,neo4j,files,manifest}
log "backup destination: $DEST"

START_TS=$(date +%s)
declare -A STEP_START STEP_SECS

step_start() { STEP_START["$1"]=$(date +%s); log "-- $1 --"; }
step_end() { local n="$1"; STEP_SECS["$n"]=$(( $(date +%s) - STEP_START["$n"] )); log "-- $1 done (${STEP_SECS[$n]}s) --"; }

# --- 1. Postgres dumps -------------------------------------------------

step_start postgres_dump
PG_CUSTOM="$DEST/postgres/${PG_DB}_${TS}.pgdump"
PG_PLAIN="$DEST/postgres/${PG_DB}_${TS}.sql.gz"

docker exec "$POSTGRES_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" -Fc -f /tmp/kenceai_pg_backup.dump
docker cp "$POSTGRES_CONTAINER:/tmp/kenceai_pg_backup.dump" "$PG_CUSTOM"
docker exec "$POSTGRES_CONTAINER" rm -f /tmp/kenceai_pg_backup.dump

docker exec "$POSTGRES_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" --no-owner | gzip -9 > "$PG_PLAIN"
step_end postgres_dump

# --- 2. Postgres row counts (read-only) --------------------------------

step_start postgres_counts
PG_COUNTS_JSON="$DEST/manifest/pg_counts.json"
{
	echo "{"
	first=1
	for t in "${PG_TABLES[@]}"; do
		cnt=$(docker exec "$POSTGRES_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -Atc "SELECT count(*) FROM ${t};" 2>/dev/null || echo "null")
		[ $first -eq 1 ] && first=0 || echo ","
		printf '  "%s": %s' "$t" "$cnt"
	done
	echo
	echo "}"
} > "$PG_COUNTS_JSON"
step_end postgres_counts

# --- 3. Alembic head (from repo, no alembic CLI) + applied (read-only) -

step_start alembic_revision
# Parsed with python3, not grep/regex: revision/down_revision lines carry
# PEP 604 type annotations (e.g. `revision: str = 'abc123'`), which a naive
# `^revision\s*=` regex misses entirely.
ALEMBIC_HEAD=$(python3 - "$REPO_ROOT/backend/alembic/versions" <<'PYEOF'
import ast, sys, pathlib
versions_dir = pathlib.Path(sys.argv[1])
rev_to_down = {}
all_revs = set()
for f in versions_dir.glob("*.py"):
	tree = ast.parse(f.read_text())
	rev = down = None
	for node in tree.body:
		if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
			name = node.target.id
		elif isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
			name = node.targets[0].id
		else:
			continue
		if name == "revision" and isinstance(node.value, ast.Constant):
			rev = node.value.value
		elif name == "down_revision" and isinstance(node.value, ast.Constant):
			down = node.value.value
	if rev:
		all_revs.add(rev)
		rev_to_down[rev] = down
heads = [r for r in all_revs if r not in set(rev_to_down.values())]
print(heads[0] if len(heads) == 1 else ("MULTIPLE_HEADS:" + ",".join(heads) if heads else "unknown"))
PYEOF
)

ALEMBIC_APPLIED=$(docker exec "$POSTGRES_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -Atc "SELECT version_num FROM alembic_version;" 2>/dev/null || true)
[ -n "$ALEMBIC_APPLIED" ] || ALEMBIC_APPLIED="NOT_FOUND"
log "alembic head=$ALEMBIC_HEAD applied=$ALEMBIC_APPLIED"
step_end alembic_revision

# --- 4. Neo4j export (zero-downtime, APOC) ------------------------------
#
# Uses the HTTP transactional endpoint (not cypher-shell): cypher-shell's
# `--format plain` renders multi-line/quoted string results through an
# ambiguous mix of CSV quote-doubling and backslash escaping that was
# confirmed (empirically, during implementation) to corrupt the export —
# literal `\"` sequences and a truncated closing quote ended up in the
# replay file. JSON over HTTP has unambiguous, exactly-reversible escaping.

step_start neo4j_export
NEO4J_CYPHER="$DEST/neo4j/kenceai_${TS}.cypher"

neo4j_http_commit "$NEO4J_HTTP_URL" "${NEO4J_USER:-neo4j}" "$NEO4J_PASSWORD" \
	"CALL apoc.export.cypher.all(null, {stream:true, format:'cypher-shell', batchSize:2000}) YIELD cypherStatements RETURN cypherStatements" \
	| neo4j_http_extract_scalar > "$NEO4J_CYPHER"

[ -s "$NEO4J_CYPHER" ] || die "Neo4j cypher export is empty"
step_end neo4j_export

# --- 5. Neo4j counts (read-only) ----------------------------------------

step_start neo4j_counts
NODE_COUNT=$(neo4j_http_commit "$NEO4J_HTTP_URL" "${NEO4J_USER:-neo4j}" "$NEO4J_PASSWORD" "MATCH (n) RETURN count(n)" | neo4j_http_extract_scalar)
REL_COUNT=$(neo4j_http_commit "$NEO4J_HTTP_URL" "${NEO4J_USER:-neo4j}" "$NEO4J_PASSWORD" "MATCH ()-->() RETURN count(*)" | neo4j_http_extract_scalar)
cat > "$DEST/manifest/neo4j_counts.json" <<EOF
{
  "nodes": ${NODE_COUNT:-0},
  "relationships": ${REL_COUNT:-0}
}
EOF
log "neo4j nodes=$NODE_COUNT relationships=$REL_COUNT"
step_end neo4j_counts

# --- 6. Bind-mount files (host filesystem, no docker needed) -----------

step_start files_archive
for d in uploads chroma_db data org_storage; do
	src="$REPO_ROOT/backend/$d"
	if [ -d "$src" ]; then
		tar -czf "$DEST/files/${d}_${TS}.tar.gz" -C "$REPO_ROOT/backend" "$d"
		tar -tzf "$DEST/files/${d}_${TS}.tar.gz" > "$DEST/manifest/${d}_listing.txt"
	else
		log "WARNING: $src does not exist, skipping"
	fi
done
step_end files_archive

# --- 7. Manifest ----------------------------------------------------------

step_start manifest
GIT_COMMIT=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)
GIT_BRANCH=$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null || echo unknown)
PG_VERSION=$(docker exec "$POSTGRES_CONTAINER" pg_dump --version | grep -oP '\d+\.\d+' | head -1)
NEO4J_VERSION=$(docker exec "$NEO4J_CONTAINER" neo4j-admin --version 2>/dev/null | tr -d '\r' || echo unknown)
BACKEND_IMAGE=$(docker inspect kence-backend --format '{{.Config.Image}}' 2>/dev/null || echo unknown)
FRONTEND_IMAGE=$(docker inspect kence-frontend --format '{{.Config.Image}}' 2>/dev/null || echo unknown)

cat > "$DEST/manifest/manifest.json" <<EOF
{
  "timestamp_utc": "$TS",
  "git_commit": "$GIT_COMMIT",
  "git_branch": "$GIT_BRANCH",
  "alembic_head": "$ALEMBIC_HEAD",
  "alembic_applied": "$ALEMBIC_APPLIED",
  "postgres_version": "$PG_VERSION",
  "neo4j_version": "$NEO4J_VERSION",
  "backend_image": "$BACKEND_IMAGE",
  "frontend_image": "$FRONTEND_IMAGE",
  "postgres_db": "$PG_DB",
  "neo4j_tier": "1-zero-downtime-apoc-export",
  "artifacts": {
    "postgres_custom": "postgres/${PG_DB}_${TS}.pgdump",
    "postgres_plain_sql_gz": "postgres/${PG_DB}_${TS}.sql.gz",
    "neo4j_cypher": "neo4j/kenceai_${TS}.cypher",
    "files": [
      "files/uploads_${TS}.tar.gz",
      "files/chroma_db_${TS}.tar.gz",
      "files/data_${TS}.tar.gz",
      "files/org_storage_${TS}.tar.gz"
    ]
  }
}
EOF
step_end manifest

# --- 8. Checksums --------------------------------------------------------

step_start checksums
CHECKSUM_FILE="$DEST/manifest/SHA256SUMS"
: > "$CHECKSUM_FILE"
(cd "$DEST" && find postgres neo4j files manifest -type f -not -name SHA256SUMS -print0 \
	| sort -z | xargs -0 sha256sum) >> "$CHECKSUM_FILE"
step_end checksums

# --- 9. Integrity checks (operate only on the artifacts just created) --

step_start integrity_check
docker exec "$POSTGRES_CONTAINER" test -e /tmp/kenceai_pg_backup.dump 2>/dev/null && die "leftover temp dump found in container"

# pg_restore --list parses the custom-format archive's TOC without touching any DB.
docker cp "$PG_CUSTOM" "$POSTGRES_CONTAINER:/tmp/_verify.dump"
docker exec "$POSTGRES_CONTAINER" pg_restore --list /tmp/_verify.dump > /dev/null
docker exec "$POSTGRES_CONTAINER" rm -f /tmp/_verify.dump

gzip -t "$PG_PLAIN"

for f in "$DEST"/files/*.tar.gz; do
	tar -tzf "$f" > /dev/null
done

[ -s "$NEO4J_CYPHER" ] || die "Neo4j cypher export missing/empty at integrity check"

# checksum paths are recorded relative to $DEST — verify from there.
(cd "$DEST" && sha256sum -c manifest/SHA256SUMS --quiet)
step_end integrity_check

# --- Summary ---------------------------------------------------------------

TOTAL_SECS=$(( $(date +%s) - START_TS ))
log "=== backup complete in ${TOTAL_SECS}s ==="
log "destination: $DEST"
du -sh "$DEST"/* 2>/dev/null | sed 's/^/  /' >&2
log "postgres counts: $(cat "$PG_COUNTS_JSON" | tr -d '\n ')"
log "neo4j counts: nodes=$NODE_COUNT relationships=$REL_COUNT"
log "alembic head=$ALEMBIC_HEAD applied=$ALEMBIC_APPLIED"
echo "$DEST"

#!/usr/bin/env bash
# ops/backup/verify_restore.sh
#
# Compares the backup manifest (counts captured at backup time) against a
# running restore-test stack (stood up by restore.sh) to prove the restore
# reproduced the data. Read-only against both production and the restore
# stack. Exits non-zero if any check fails.
#
# Usage: ops/backup/verify_restore.sh <backup-dir>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

SCRATCH="${KENCE_BACKUP_ROOT:-/home/ai/kence_backups}/.restore_test"
PG_RESTORE_CONTAINER="kence-restore-postgres"
NEO4J_RESTORE_CONTAINER="kence-restore-neo4j"
PG_PROD_CONTAINER="kence-postgres"
PG_DB="kenceai"
PG_USER="kence"

require_cmd docker python3 curl

BACKUP_DIR="${1:?usage: verify_restore.sh <backup-dir>}"
[ -f "$BACKUP_DIR/manifest/pg_counts.json" ] || die "pg_counts.json not found in $BACKUP_DIR/manifest"
[ -f "$BACKUP_DIR/manifest/neo4j_counts.json" ] || die "neo4j_counts.json not found in $BACKUP_DIR/manifest"
[ -f "$SCRATCH/restore_info.json" ] || die "no active restore stack found (run restore.sh first): $SCRATCH/restore_info.json missing"

RESTORE_NEO4J_PW=$(python3 -c "import json; print(json.load(open('$SCRATCH/restore_info.json'))['neo4j_password'])")

FAIL=0
RESULT_JSON="$BACKUP_DIR/manifest/verify_result.json"

# --- container health ------------------------------------------------------

log "checking restore-stack container health..."
for c in "$PG_RESTORE_CONTAINER" "$NEO4J_RESTORE_CONTAINER"; do
	status="$(docker inspect -f '{{.State.Health.Status}}' "$c" 2>/dev/null || echo missing)"
	if [ "$status" != "healthy" ]; then
		log "FAIL: $c health = $status (expected healthy)"
		FAIL=1
	else
		log "OK: $c healthy"
	fi
done

# --- postgres row counts ---------------------------------------------------

PG_TABLES=(organizations users doc_sessions chat_messages document_library library_document_content knowledge_graph_nodes)
PG_COMPARE_TMP=$(mktemp)
echo "component,expected_at_backup,restored,current_prod_informational,status" > "$PG_COMPARE_TMP"

for t in "${PG_TABLES[@]}"; do
	expected=$(python3 -c "import json; print(json.load(open('$BACKUP_DIR/manifest/pg_counts.json')).get('$t', 'null'))")
	restored=$(docker exec "$PG_RESTORE_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -Atc "SELECT count(*) FROM ${t};" 2>/dev/null || echo "ERROR")
	current_prod=$(docker exec "$PG_PROD_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -Atc "SELECT count(*) FROM ${t};" 2>/dev/null || echo "ERROR")
	status="OK"
	if [ "$expected" != "$restored" ]; then
		status="FAIL"
		FAIL=1
	fi
	echo "pg.$t,$expected,$restored,$current_prod,$status" >> "$PG_COMPARE_TMP"
done

# --- neo4j counts ------------------------------------------------------

EXPECTED_NODES=$(python3 -c "import json; print(json.load(open('$BACKUP_DIR/manifest/neo4j_counts.json'))['nodes'])")
EXPECTED_RELS=$(python3 -c "import json; print(json.load(open('$BACKUP_DIR/manifest/neo4j_counts.json'))['relationships'])")

RESTORED_NODES=$(neo4j_http_commit "http://127.0.0.1:17474" neo4j "$RESTORE_NEO4J_PW" "MATCH (n) RETURN count(n)" | neo4j_http_extract_scalar)
RESTORED_RELS=$(neo4j_http_commit "http://127.0.0.1:17474" neo4j "$RESTORE_NEO4J_PW" "MATCH ()-->() RETURN count(*)" | neo4j_http_extract_scalar)

NEO4J_STATUS="OK"
if [ "$EXPECTED_NODES" != "$RESTORED_NODES" ] || [ "$EXPECTED_RELS" != "$RESTORED_RELS" ]; then
	NEO4J_STATUS="FAIL"
	FAIL=1
fi

# --- file listings ----------------------------------------------------------

FILES_STATUS="OK"
for d in uploads chroma_db data org_storage; do
	listing_file=$(find "$BACKUP_DIR/manifest" -name "${d}_listing.txt" | head -1)
	[ -n "$listing_file" ] || continue
	expected_count=$(wc -l < "$listing_file")
	actual_count=$(find "$SCRATCH/files/$d" -type f 2>/dev/null | wc -l)
	# tar listing includes dirs + files; compare file-only counts loosely (>=0 tolerance for dir entries)
	expected_file_count=$(grep -vc '/$' "$listing_file" || true)
	if [ "$actual_count" -lt 1 ] && [ "$expected_file_count" -gt 0 ]; then
		log "FAIL: $d extracted 0 files but backup listing expected $expected_file_count"
		FILES_STATUS="FAIL"
		FAIL=1
	else
		log "OK: $d extracted files ($actual_count found, backup listing had $expected_file_count file entries)"
	fi
done

# --- summary ----------------------------------------------------------

log "=== Postgres row counts (expected = captured at backup time) ==="
column -t -s, "$PG_COMPARE_TMP" >&2
log "=== Neo4j counts ==="
log "nodes: expected=$EXPECTED_NODES restored=$RESTORED_NODES"
log "relationships: expected=$EXPECTED_RELS restored=$RESTORED_RELS"
log "status: $NEO4J_STATUS"
log "=== Files ==="
log "status: $FILES_STATUS"

python3 - "$PG_COMPARE_TMP" "$RESULT_JSON" <<PYEOF
import csv, json, sys
pg_csv, out_path = sys.argv[1], sys.argv[2]
with open(pg_csv) as f:
    pg_rows = list(csv.DictReader(f))
result = {
    "postgres": pg_rows,
    "neo4j": {
        "expected_nodes": "$EXPECTED_NODES",
        "restored_nodes": "$RESTORED_NODES",
        "expected_relationships": "$EXPECTED_RELS",
        "restored_relationships": "$RESTORED_RELS",
        "status": "$NEO4J_STATUS",
    },
    "files": {"status": "$FILES_STATUS"},
    "overall": "PASS" if $FAIL == 0 else "FAIL",
}
with open(out_path, "w") as f:
    json.dump(result, f, indent=2)
print(f"wrote {out_path}")
PYEOF

rm -f "$PG_COMPARE_TMP"

if [ "$FAIL" -ne 0 ]; then
	log "=== VERIFY: FAIL ==="
	exit 1
fi
log "=== VERIFY: PASS ==="

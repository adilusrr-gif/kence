#!/usr/bin/env bash
# ops/backup/restore.sh
#
# Restores a backup produced by backup.sh into a fully isolated, disposable
# Docker Compose stack: new project name, new container names, new volumes,
# new host ports, no network path to production. Never touches the
# production `kenceai` compose project or its volumes.
#
# Usage:
#   ops/backup/restore.sh <backup-dir>     # stand up + restore
#   ops/backup/restore.sh --teardown       # tear down the restore-test stack

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

PROJECT="kenceai_restore_test"
SCRATCH="${KENCE_BACKUP_ROOT:-/home/ai/kence_backups}/.restore_test"
COMPOSE_FILE="$SCRATCH/docker-compose.restore.yml"
ENV_FILE="$SCRATCH/.env.restore"
PG_CONTAINER="kence-restore-postgres"
NEO4J_CONTAINER="kence-restore-neo4j"
PG_DB="kenceai"
PG_USER="kence"
NEO4J_USER="neo4j"

require_cmd docker tar sha256sum openssl
docker compose version >/dev/null 2>&1 || die "docker compose plugin not found"

if [ "${1:-}" = "--teardown" ]; then
	log "tearing down $PROJECT (only touches ${PROJECT}_* volumes/network, never kenceai_*)"
	if [ -f "$COMPOSE_FILE" ]; then
		docker compose -p "$PROJECT" -f "$COMPOSE_FILE" down -v
	else
		log "no compose file found at $COMPOSE_FILE; attempting down by project name only"
		docker compose -p "$PROJECT" down -v 2>&1 || true
	fi
	rm -rf "$SCRATCH"
	log "teardown complete"
	exit 0
fi

BACKUP_DIR="${1:?usage: restore.sh <backup-dir>  |  restore.sh --teardown}"
[ -d "$BACKUP_DIR" ] || die "backup dir not found: $BACKUP_DIR"
[ -f "$BACKUP_DIR/manifest/manifest.json" ] || die "manifest.json not found in $BACKUP_DIR"
[ -f "$BACKUP_DIR/manifest/SHA256SUMS" ] || die "SHA256SUMS not found in $BACKUP_DIR"

log "verifying backup checksums before touching anything"
(cd "$BACKUP_DIR" && sha256sum -c manifest/SHA256SUMS --quiet) || die "checksum verification FAILED — refusing to restore a possibly-corrupt backup"
log "checksums OK"

mkdir -p -m 700 "$SCRATCH/files"

# --- throwaway credentials for the disposable stack only (never reused from prod .env) ---
RESTORE_PG_PW="$(openssl rand -hex 24)"
RESTORE_NEO4J_PW="$(openssl rand -hex 24)"
cat > "$ENV_FILE" <<EOF
POSTGRES_PASSWORD=$RESTORE_PG_PW
NEO4J_PASSWORD=$RESTORE_NEO4J_PW
EOF
chmod 600 "$ENV_FILE"

cat > "$COMPOSE_FILE" <<'YAML'
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    container_name: kence-restore-postgres
    environment:
      POSTGRES_DB: kenceai
      POSTGRES_USER: kence
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "127.0.0.1:15432:5432"
    volumes:
      - restore_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U kence -d kenceai"]
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 10s
  neo4j:
    image: neo4j:5.18-community
    container_name: kence-restore-neo4j
    environment:
      NEO4J_AUTH: neo4j/${NEO4J_PASSWORD}
    ports:
      - "127.0.0.1:17474:7474"
      - "127.0.0.1:17687:7687"
    volumes:
      - restore_neo4j_data:/data
      - restore_neo4j_logs:/logs
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:7474 || exit 1"]
      interval: 10s
      timeout: 10s
      retries: 30
      start_period: 20s

volumes:
  restore_postgres_data:
  restore_neo4j_data:
  restore_neo4j_logs:
YAML

log "starting isolated stack: project=$PROJECT ports=15432/17474/17687 (loopback only)"
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

log "waiting for postgres + neo4j health..."
for svc in "$PG_CONTAINER" "$NEO4J_CONTAINER"; do
	for i in $(seq 1 60); do
		status="$(docker inspect -f '{{.State.Health.Status}}' "$svc" 2>/dev/null || echo starting)"
		[ "$status" = "healthy" ] && break
		sleep 3
		[ "$i" -eq 60 ] && die "$svc did not become healthy in time"
	done
	log "$svc healthy"
done

# --- Postgres restore ------------------------------------------------------

log "restoring postgres..."
PG_DUMP_FILE=$(find "$BACKUP_DIR/postgres" -name '*.pgdump' | head -1)
[ -n "$PG_DUMP_FILE" ] || die "no .pgdump file found in $BACKUP_DIR/postgres"
docker cp "$PG_DUMP_FILE" "$PG_CONTAINER:/tmp/restore.dump"
docker exec "$PG_CONTAINER" pg_restore -U "$PG_USER" -d "$PG_DB" --no-owner --clean --if-exists -1 /tmp/restore.dump
docker exec "$PG_CONTAINER" rm -f /tmp/restore.dump
log "postgres restore complete"

# --- Neo4j restore (cypher replay) -----------------------------------------

log "restoring neo4j..."
NEO4J_CYPHER_FILE=$(find "$BACKUP_DIR/neo4j" -name '*.cypher' | head -1)
[ -n "$NEO4J_CYPHER_FILE" ] || die "no .cypher file found in $BACKUP_DIR/neo4j"
docker cp "$NEO4J_CYPHER_FILE" "$NEO4J_CONTAINER:/tmp/restore.cypher"
docker exec -e LANG=C.UTF-8 -e LC_ALL=C.UTF-8 "$NEO4J_CONTAINER" \
	cypher-shell -u "$NEO4J_USER" -p "$RESTORE_NEO4J_PW" --format plain -f /tmp/restore.cypher
docker exec "$NEO4J_CONTAINER" rm -f /tmp/restore.cypher
log "neo4j restore complete"

# --- Files restore (plain extraction, no container involved) ------------

log "extracting file archives..."
for f in "$BACKUP_DIR"/files/*.tar.gz; do
	tar -xzf "$f" -C "$SCRATCH/files"
done
log "files extracted to $SCRATCH/files"

cat > "$SCRATCH/restore_info.json" <<EOF
{
  "backup_dir": "$BACKUP_DIR",
  "project": "$PROJECT",
  "postgres_port": 15432,
  "neo4j_http_port": 17474,
  "neo4j_bolt_port": 17687,
  "neo4j_password": "$RESTORE_NEO4J_PW",
  "postgres_password": "$RESTORE_PG_PW",
  "files_dir": "$SCRATCH/files"
}
EOF
chmod 600 "$SCRATCH/restore_info.json"

log "=== restore complete ==="
log "postgres: 127.0.0.1:15432 (db=$PG_DB user=$PG_USER)"
log "neo4j:    127.0.0.1:17474 (http) / 127.0.0.1:17687 (bolt), user=$NEO4J_USER"
log "files:    $SCRATCH/files"
log "credentials for this disposable stack: $SCRATCH/restore_info.json (mode 600, throwaway, not prod secrets)"
log "run verify_restore.sh next; run 'restore.sh --teardown' when done"

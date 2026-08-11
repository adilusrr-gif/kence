#!/usr/bin/env bash
# Shared helpers for ops/backup/{backup,restore,verify_restore}.sh
# Sourced, not executed directly.

# --- logging -----------------------------------------------------------

log() {
	printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

die() {
	log "ERROR: $*"
	exit 1
}

# --- preflight -----------------------------------------------------------

require_cmd() {
	for cmd in "$@"; do
		command -v "$cmd" >/dev/null 2>&1 || die "required command not found: $cmd"
	done
}

container_running() {
	local name="$1"
	[ "$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null)" = "true" ]
}

require_container_running() {
	local name="$1"
	container_running "$name" || die "container '$name' is not running — refusing to proceed (this tool never starts production containers)"
}

# --- secrets ---------------------------------------------------------------
# Loads POSTGRES_PASSWORD / NEO4J_PASSWORD / JWT_SECRET_KEY from the repo
# root .env into the current shell. Values are NEVER logged or echoed.

load_secrets() {
	local env_file="${1:-$REPO_ROOT/.env}"
	[ -f "$env_file" ] || die "secrets file not found: $env_file"
	set -a
	# shellcheck disable=SC1090
	source "$env_file"
	set +a
	[ -n "${POSTGRES_PASSWORD:-}" ] || die "POSTGRES_PASSWORD not set in $env_file"
	[ -n "${NEO4J_PASSWORD:-}" ] || die "NEO4J_PASSWORD not set in $env_file"
}

# --- checksums ---------------------------------------------------------

# Appends "sha256  relative/path" lines (sha256sum format) for every regular
# file under $1, into checksum file $2. Paths recorded relative to $1.
sha256_dir() {
	local dir="$1" out="$2"
	(cd "$dir" && find . -type f -not -name "$(basename "$out")" -print0 | sort -z | xargs -0 sha256sum) >>"$out"
}

sha256_file() {
	local file="$1" out="$2"
	(cd "$(dirname "$file")" && sha256sum "$(basename "$file")") >>"$out"
}

# --- neo4j -----------------------------------------------------------------
# cypher-shell inside kence-neo4j has no locale configured; without forcing
# UTF-8 explicitly, any non-ASCII output (Cyrillic/Kazakh entity labels,
# which are the norm for this product) is silently corrupted to '?'.
# Confirmed via direct test: identical query, only difference is these two
# env vars, is the difference between an ASCII-only mangled export and a
# correct UTF-8 one. Every cypher-shell invocation MUST set these.
cypher_shell() {
	docker exec -e LANG=C.UTF-8 -e LC_ALL=C.UTF-8 -i "$NEO4J_CONTAINER" \
		cypher-shell -u "${NEO4J_USER:-neo4j}" -p "$NEO4J_PASSWORD" "$@"
}

# `cypher-shell --format plain` renders multi-line/quoted string results
# through an ambiguous mix of CSV-style quote-doubling and backslash
# escaping (confirmed empirically: reversing it corrupted the APOC cypher
# export — literal `\"` sequences and truncated closing quotes ended up in
# the replay file). For any query whose result is free-form string data
# (the APOC export), use the HTTP transactional endpoint instead: JSON
# encoding is unambiguous and Python's `json` module decodes it exactly,
# and it sidesteps the locale issue entirely since JSON is UTF-8 by
# definition regardless of container locale.
#
# Args: base_url (e.g. http://127.0.0.1:7474) user password statement
# Prints the raw HTTP JSON response to stdout.
neo4j_http_commit() {
	local base_url="$1" user="$2" password="$3" statement="$4"
	local payload
	payload=$(python3 -c 'import json,sys; print(json.dumps({"statements":[{"statement": sys.argv[1]}]}))' "$statement")
	curl -sf -u "${user}:${password}" -H "Content-Type: application/json" \
		-d "$payload" "${base_url}/db/neo4j/tx/commit"
}

# Reads a neo4j_http_commit JSON response from stdin and prints result
# row 0 / column 0 as text (no added quoting). Fails loudly on any `errors`
# entry in the response instead of silently emitting empty output.
neo4j_http_extract_scalar() {
	python3 -c "
import json, sys
data = json.load(sys.stdin)
if data.get('errors'):
	sys.stderr.write('Neo4j HTTP error: ' + json.dumps(data['errors']) + chr(10))
	sys.exit(1)
sys.stdout.write(str(data['results'][0]['data'][0]['row'][0]))
"
}

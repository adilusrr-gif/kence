"""Pre-flight manifest check for the one-shot `migrate` deployment job.

Run BEFORE `alembic upgrade head` (see the `migrate` service entrypoint in
docker-compose.yml). Re-hashes the migration files actually present in this
container and compares against the build-pinned manifest
(app/_schema_manifest.json, produced by ops/schema_audit/generate_manifest.py
as a pre-build step — see backend/Dockerfile's comment above the `COPY app/`
line). Exits non-zero, printing the mismatch, without ever invoking Alembic,
if anything doesn't match — this is what makes "verify build-pinned
manifest -> run alembic upgrade head" an actual ordered pair of steps
rather than two independent commands that happen to be listed together.

Only checks `migration_file_hashes` — the manifest's `referenced_hashes`
(the fingerprint JSON files) are not shipped in this image (the `migrate`
job only ever runs a plain `alembic upgrade head`, which never reads them;
only ops/schema_audit/adopt_legacy_schema.py does, and that tool is run
from a repo checkout, not from inside this container, where it performs
its own, more complete manifest verification — see that file's
`_verify_manifest()`).
"""
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MANIFEST_PATH = HERE / "app" / "_schema_manifest.json"
VERSIONS_DIR = HERE / "alembic" / "versions"


def main() -> int:
    if not MANIFEST_PATH.is_file():
        print(f"FAIL: {MANIFEST_PATH} not found", file=sys.stderr)
        return 1

    manifest = json.loads(MANIFEST_PATH.read_text())
    problems = []

    for rel_name, expected_hash in manifest["migration_file_hashes"].items():
        path = VERSIONS_DIR / rel_name
        if not path.is_file():
            problems.append(f"missing migration file {path}")
            continue
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != expected_hash:
            problems.append(f"{rel_name}: expected {expected_hash}, found {actual}")

    if problems:
        print("FAIL: manifest verification failed:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    print(f"OK: manifest verified, expected head {manifest['alembic_head']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Build-time manifest generator.

Run ONCE, at image build time (see backend/Dockerfile), against the exact
files present in that build's context. Writes `app/_schema_manifest.json`,
which the migration job and application startup verify against at RUNTIME
by re-hashing the live files present in the running container — never by
recomputing-and-trusting a hash from the same files being validated. See
docs/ALEMBIC_SCHEMA_RECONCILIATION_STAGE_E2_REV3_2026-08-05.md §5 for the
full rationale (this is what avoids the circular-trust problem: a purely
runtime "does this file's hash equal itself" check would always pass and
catch nothing).

Usage:
    python ops/schema_audit/generate_manifest.py --output backend/app/_schema_manifest.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_ROOT = REPO_ROOT / "backend"
ACTIVE_VERSIONS_DIR = BACKEND_ROOT / "alembic" / "versions"
FINGERPRINTS_DIR = REPO_ROOT / "ops" / "schema_audit" / "fingerprints"

from fingerprint import FINGERPRINT_FORMAT_VERSION  # noqa: E402


def _sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _alembic_head() -> str:
    sys.path.insert(0, str(BACKEND_ROOT))
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
    script = ScriptDirectory.from_config(cfg)
    heads = script.get_heads()
    if len(heads) != 1:
        raise RuntimeError(
            f"expected exactly 1 active head, found {heads} — "
            "manifest generation refuses to proceed with ambiguous heads"
        )
    return heads[0]


def build_manifest() -> dict:
    head = _alembic_head()

    migration_file_hashes = {}
    for py_file in sorted(ACTIVE_VERSIONS_DIR.glob("*.py")):
        migration_file_hashes[py_file.name] = _sha256_file(py_file)

    # Static SQL referenced by active migrations (currently: B0's baseline).
    referenced_hashes = {}
    for sql_file in sorted(ACTIVE_VERSIONS_DIR.glob("*.sql")):
        referenced_hashes[f"backend/alembic/versions/{sql_file.name}"] = _sha256_file(sql_file)

    for fp_file in ("legacy_accepted.json", "b0_target.json"):
        path = FINGERPRINTS_DIR / fp_file
        if path.is_file():
            referenced_hashes[f"ops/schema_audit/fingerprints/{fp_file}"] = _sha256_file(path)

    return {
        "alembic_head": head,
        "migration_file_hashes": migration_file_hashes,
        "referenced_hashes": referenced_hashes,
        "fingerprint_format_version": FINGERPRINT_FORMAT_VERSION,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    manifest = build_manifest()
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(manifest, f, sort_keys=True, indent=2)
        f.write("\n")
    print(f"wrote {out_path}: head={manifest['alembic_head']} "
          f"migrations={list(manifest['migration_file_hashes'])} "
          f"referenced={list(manifest['referenced_hashes'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

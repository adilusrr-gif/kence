"""Legacy schema adoption — single connection, single transaction.

Adopts an unversioned or `e5b9c2d47a10`-stamped legacy database onto B0
(the squashed baseline, docs/ALEMBIC_SCHEMA_RECONCILIATION_STAGE_E2_REV3_
2026-08-05.md). Invoked once per target, manually, by an operator, during a
declared maintenance window — never at application startup, never
automatically.

Quiescence has two distinct layers, deliberately not conflated (per
Rev3 §3 / the Stage E.3 GO's item 3):

  1. GLOBAL OPERATIONAL QUIESCENCE — stopping every inventoried mutating
     service (the `backend` container: API + in-process background tasks +
     the translation worker, all in one process per docker-compose.yml) —
     is an operational precondition performed by the operator BEFORE
     invoking this tool. This script cannot itself stop a container; it can
     only verify the *effect* of that precondition having been done.

  2. TECHNICAL, IN-DATABASE PROTECTION — this script provides two
     independent, verifiable layers, neither of which is "just a
     point-in-time check":
       a. A connection-admission control window: `ALTER DATABASE ... WITH
          ALLOW_CONNECTIONS false`, set via a short-lived administrative
          connection BEFORE this tool's main connection begins its work,
          and verified in effect (`pg_database.datallowconn`) before
          proceeding. Empirically confirmed this session (disposable
          PostgreSQL 16.13): an already-open connection survives this flip;
          brand-new connection attempts — including as a superuser — are
          rejected outright. This is real admission control, not a
          snapshot.
       b. Explicit `LOCK TABLE ... IN ACCESS EXCLUSIVE MODE` on both
          target tables, fixed order, transaction-local timeout, held for
          the remainder of the transaction. This is what actually prevents
          a write from landing between the duplicate preflight and the
          reconciliation DDL — not the `pg_stat_activity` checks, which
          exist only to catch the ordinary case of "forgot to stop the
          app first" and are deliberately re-run both before AND after the
          locks are acquired (a single point-in-time query before locking
          cannot, by itself, prove no new session joined in the interval
          between that query and the lock actually being granted).

If the admission-control connection cannot be established (missing
privilege, unreachable maintenance database, etc.), this tool aborts before
touching the target database at all — it does not fall back to relying on
`pg_stat_activity` alone. See `_set_allow_connections`.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection
from sqlalchemy.exc import DBAPIError

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_ROOT = REPO_ROOT / "backend"

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(BACKEND_ROOT))

import fingerprint as fp  # noqa: E402

SUPPORTED_LEGACY_REVISION = "e5b9c2d47a10"
# Reserved constant for pg_advisory_xact_lock. Do not reuse for any other
# advisory lock in this codebase.
LOCK_KEY = 0x4B41_4441_5054_0001

# Fixed lock order (alphabetical) — never change without updating every
# caller/test that depends on this specific order.
TARGET_TABLES_IN_LOCK_ORDER = ["usage_logs", "workspace_shares"]


class AdoptionAborted(Exception):
    """Raised for any condition that must stop the adoption before commit.
    Always propagates out of the transaction context, causing a rollback."""


class FailureInjected(Exception):
    """Test-only: raised by --fail-after to simulate a crash at a named
    checkpoint. Never triggered by a real invocation (the flag defaults to
    None). Propagates exactly like any other mid-transaction failure."""


def _maybe_inject(fail_after: str | None, checkpoint: str) -> None:
    if fail_after == checkpoint:
        raise FailureInjected(f"test-injected failure after checkpoint '{checkpoint}'")


def _set_allow_connections(admin_url: str, target_db: str, allow: bool) -> None:
    """Short-lived administrative connection to the `postgres` maintenance
    database — deliberately NOT part of the main adoption transaction/
    connection. Raises AdoptionAborted (not a bare DBAPI error) if this
    cannot be done, since the caller must treat "no admission control
    available" as a hard stop, not a silent downgrade to the weaker
    pg_stat_activity-only check.
    """
    try:
        admin_engine = create_engine(admin_url)
        with admin_engine.connect() as admin_conn:
            admin_conn = admin_conn.execution_options(isolation_level="AUTOCOMMIT")
            admin_conn.execute(
                text(
                    f"ALTER DATABASE {target_db} WITH ALLOW_CONNECTIONS "
                    f"{'true' if allow else 'false'}"
                )
            )
    except DBAPIError as e:
        raise AdoptionAborted(
            f"could not set ALLOW_CONNECTIONS={allow} on database "
            f"'{target_db}' via administrative connection: {e}. Refusing to "
            "proceed without technical connection-admission control — this "
            "is a hard blocker, not something this tool weakens by falling "
            "back to pg_stat_activity alone."
        ) from e


def _verify_admission_control_in_effect(admin_url: str, target_db: str, expect_false: bool) -> None:
    admin_engine = create_engine(admin_url)
    with admin_engine.connect() as admin_conn:
        row = admin_conn.execute(
            text("SELECT datallowconn FROM pg_database WHERE datname = :d"),
            {"d": target_db},
        ).one()
    actual = row[0]
    expected = not expect_false
    if actual != expected:
        raise AdoptionAborted(
            f"admission control verification failed: pg_database.datallowconn "
            f"= {actual}, expected {expected} for database '{target_db}'"
        )


def _read_alembic_version_rows(conn: Connection) -> list[str]:
    has_table = conn.execute(
        text("SELECT to_regclass('public.alembic_version') IS NOT NULL")
    ).scalar()
    if not has_table:
        return []
    rows = conn.execute(text("SELECT version_num FROM alembic_version")).fetchall()
    return [r[0] for r in rows]


def _check_app_role_activity(conn: Connection, app_role: str, context: str) -> None:
    others = conn.execute(
        text(
            """
            SELECT count(*) FROM pg_stat_activity
            WHERE datname = current_database() AND pid <> pg_backend_pid()
              AND usename = :app_role AND state <> 'idle'
            """
        ),
        {"app_role": app_role},
    ).scalar()
    if others:
        raise AdoptionAborted(
            f"{others} other '{app_role}' backend(s) with an open transaction "
            f"({context}) — stop the application before adopting"
        )


def _acquire_target_locks(conn: Connection, lock_timeout: str) -> None:
    conn.execute(text("SET LOCAL lock_timeout = :t"), {"t": lock_timeout})
    try:
        for table in TARGET_TABLES_IN_LOCK_ORDER:
            conn.execute(text(f"LOCK TABLE {table} IN ACCESS EXCLUSIVE MODE"))
    except DBAPIError as e:
        raise AdoptionAborted(
            f"could not acquire table locks within {lock_timeout}: {e} — "
            "not retrying automatically, re-invoke after diagnosing"
        ) from e


def _has_duplicate_shares(conn: Connection) -> bool:
    dup_user = conn.execute(
        text(
            """
            SELECT 1 FROM workspace_shares WHERE shared_with IS NOT NULL
            GROUP BY session_id, shared_with HAVING count(*) > 1 LIMIT 1
            """
        )
    ).first()
    dup_org = conn.execute(
        text(
            """
            SELECT 1 FROM workspace_shares WHERE shared_with IS NULL
            GROUP BY session_id, org_id HAVING count(*) > 1 LIMIT 1
            """
        )
    ).first()
    return bool(dup_user or dup_org)


def _load_json(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


def _sha256_file(path: Path) -> str:
    import hashlib

    return hashlib.sha256(path.read_bytes()).hexdigest()


def _verify_manifest(manifest_path: Path, context: str) -> dict:
    """Re-hash the live files on disk and compare against the build-pinned
    manifest. Raises AdoptionAborted on any mismatch — this is the same
    check application startup performs (see backend/app/main.py), run here
    too so the adoption tool never trusts migration content that has
    drifted from what was approved at build time.
    """
    manifest = _load_json(manifest_path)
    for rel_name, expected_hash in manifest["migration_file_hashes"].items():
        actual_path = BACKEND_ROOT / "alembic" / "versions" / rel_name
        if not actual_path.is_file():
            raise AdoptionAborted(f"[{context}] manifest references missing file {actual_path}")
        actual_hash = _sha256_file(actual_path)
        if actual_hash != expected_hash:
            raise AdoptionAborted(
                f"[{context}] {rel_name} hash mismatch: manifest expects "
                f"{expected_hash}, found {actual_hash}"
            )
    for rel_path, expected_hash in manifest["referenced_hashes"].items():
        actual_path = REPO_ROOT / rel_path
        if not actual_path.is_file():
            raise AdoptionAborted(f"[{context}] manifest references missing file {actual_path}")
        actual_hash = _sha256_file(actual_path)
        if actual_hash != expected_hash:
            raise AdoptionAborted(
                f"[{context}] {rel_path} hash mismatch: manifest expects "
                f"{expected_hash}, found {actual_hash}"
            )
    return manifest


def adopt(
    *,
    database_url: str,
    admin_database_url: str,
    expect_db_name: str,
    expect_host: str,
    expect_pg_major: int,
    app_role: str = "kence",
    lock_timeout: str = "5s",
    manifest_path: Path,
    legacy_fingerprint_path: Path,
    target_fingerprint_path: Path,
    alembic_ini_path: Path,
    fail_after: str | None = None,
) -> str:
    """Returns a human-readable outcome string. Raises AdoptionAborted or
    FailureInjected on any abort/injected failure (both leave zero net
    effect on the target database — see module docstring)."""

    # Manifest verification, pass 1 — before anything else, refuse to trust
    # migration content that has already drifted from what was built.
    _verify_manifest(manifest_path, "pre-adoption")
    _maybe_inject(fail_after, "manifest_verified_pre")

    target_db = expect_db_name

    # The main connection must be established FIRST, while connections are
    # still allowed — confirmed empirically this session that an
    # already-open connection survives the ALLOW_CONNECTIONS flip below,
    # while brand-new attempts (including this same connection, if opened
    # AFTER the flip) are rejected outright. Opening it after would simply
    # lock this tool out of the database it is trying to adopt.
    engine = create_engine(
        database_url, connect_args={"application_name": "kenceai_schema_adoption"}
    )
    with engine.connect() as conn:  # ONE connection for all adoption work
        # Connection-admission control window opens here — using a
        # short-lived administrative connection, separate from `conn`
        # above, which is left untouched and still fully usable.
        _set_allow_connections(admin_database_url, target_db, allow=False)
        try:
            _verify_admission_control_in_effect(admin_database_url, target_db, expect_false=True)
            _maybe_inject(fail_after, "admission_control_engaged")

            with conn.begin():  # ONE transaction
                # 1. Advisory lock — transaction-scoped, auto-releases on
                #    commit OR rollback.
                conn.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": LOCK_KEY})
                _maybe_inject(fail_after, "advisory_lock_acquired")

                # 2. Identity: database name, TCP-only (never Unix socket),
                #    PostgreSQL major version.
                db_name, server_addr, server_version_num = conn.execute(
                    text(
                        "SELECT current_database(), inet_server_addr()::text, "
                        "current_setting('server_version_num')"
                    )
                ).one()
                if server_addr is None:
                    raise AdoptionAborted(
                        "inet_server_addr() is NULL (Unix-socket connection) — "
                        "unsupported; this tool verifies TCP identity only"
                    )
                # inet_server_addr()::text includes a /32 (or /128) netmask
                # suffix (it's an `inet` value); strip it for a plain-address
                # comparison against --expect-host.
                server_addr = server_addr.split("/")[0]
                if (db_name, server_addr) != (expect_db_name, expect_host):
                    raise AdoptionAborted(
                        f"connected to ({db_name}, {server_addr}), expected "
                        f"({expect_db_name}, {expect_host})"
                    )
                actual_major = int(server_version_num) // 10000
                if actual_major != expect_pg_major:
                    raise AdoptionAborted(
                        f"PostgreSQL major version {actual_major} does not match "
                        f"expected {expect_pg_major} (disposable test infrastructure "
                        "must match the production major version)"
                    )
                _maybe_inject(fail_after, "identity_verified")

                # 3. Starting-revision precondition — plain SQL only, never
                #    through Alembic's ScriptDirectory-bound APIs.
                rows = _read_alembic_version_rows(conn)
                if len(rows) == 0:
                    starting_state = "UNVERSIONED"
                elif len(rows) == 1:
                    current = rows[0]
                    b0_revision = _resolve_b0_revision(alembic_ini_path)
                    if current == b0_revision:
                        return "already-adopted: no action taken"  # case H
                    elif current == SUPPORTED_LEGACY_REVISION:
                        starting_state = "LEGACY_0007"
                    else:
                        raise AdoptionAborted(f"unsupported starting revision {current!r}")
                else:
                    raise AdoptionAborted(
                        f"alembic_version has {len(rows)} rows — multiple heads "
                        "are not supported, aborting before any DDL"
                    )
                _maybe_inject(fail_after, "precondition_checked")

                # 4. Quiescence technical part 1 — BEFORE locks.
                _check_app_role_activity(conn, app_role, context="before locks")
                _maybe_inject(fail_after, "app_role_checked_before_locks")

                # 5. Quiescence technical part 2 — explicit fixed-order
                #    locks, bounded timeout.
                _acquire_target_locks(conn, lock_timeout)
                _maybe_inject(fail_after, "locks_acquired")

                # 5b. Recheck app-role activity AFTER locks are held — closes
                #     the window between the step-4 snapshot and the lock
                #     actually being granted.
                _check_app_role_activity(conn, app_role, context="after locks")
                _maybe_inject(fail_after, "app_role_rechecked_after_locks")

                # 6. Accepted-legacy fingerprint — exact equality.
                actual_fp = fp.fingerprint(conn)
                accepted_fp = _load_json(legacy_fingerprint_path)
                diff = fp.compare(actual_fp, accepted_fp)
                if diff:
                    raise AdoptionAborted(f"does not match accepted legacy shape: {diff}")
                _maybe_inject(fail_after, "legacy_fingerprint_verified")

                # 7. Duplicate preflight — AFTER locks, so nothing can
                #    insert a new duplicate between this check and step 8.
                if _has_duplicate_shares(conn):
                    raise AdoptionAborted(
                        "workspace_shares has duplicate groups — resolve "
                        "manually, no rows will be deleted"
                    )
                _maybe_inject(fail_after, "duplicate_preflight_passed")

                # 8. Reconciliation DDL.
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX uq_session_share_user "
                        "ON workspace_shares (session_id, shared_with) "
                        "WHERE shared_with IS NOT NULL"
                    )
                )
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX uq_session_share_org "
                        "ON workspace_shares (session_id, org_id) "
                        "WHERE shared_with IS NULL"
                    )
                )
                conn.execute(
                    text("ALTER TABLE usage_logs DROP CONSTRAINT usage_logs_org_id_fkey")
                )
                conn.execute(
                    text(
                        "ALTER TABLE usage_logs ADD CONSTRAINT usage_logs_org_id_fkey "
                        "FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL"
                    )
                )
                _maybe_inject(fail_after, "reconciliation_ddl_applied")

                # 9. Complete target-B0 verification — BEFORE alembic_version
                #    is touched at all.
                after_fp = fp.fingerprint(conn)
                target_fp = _load_json(target_fingerprint_path)
                diff2 = fp.compare(after_fp, target_fp)
                if diff2:
                    raise AdoptionAborted(
                        f"post-reconciliation state still differs from target-B0: {diff2}"
                    )
                _maybe_inject(fail_after, "before_delete")  # test G point 1

                # 10. ONLY NOW, and only for LEGACY_0007, remove the old row.
                if starting_state == "LEGACY_0007":
                    result = conn.execute(
                        text("DELETE FROM alembic_version WHERE version_num = :rev"),
                        {"rev": SUPPORTED_LEGACY_REVISION},
                    )
                    if result.rowcount != 1:
                        raise AdoptionAborted(
                            f"expected to delete exactly 1 row for "
                            f"{SUPPORTED_LEGACY_REVISION}, deleted "
                            f"{result.rowcount} — aborting, not stamping"
                        )
                _maybe_inject(fail_after, "after_delete_before_stamp")  # test G point 2

                # 11. Fresh MigrationContext, same connection. Empty-heads
                #     assertion, then stamp B0 via the ACTIVE ScriptDirectory
                #     (which does not need to resolve any archived revision
                #     — heads is empty at this point for both starting states).
                from alembic.config import Config
                from alembic.runtime.migration import MigrationContext
                from alembic.script import ScriptDirectory

                mc = MigrationContext.configure(conn)
                heads = mc.get_current_heads()
                if heads != ():
                    raise AdoptionAborted(
                        f"expected empty heads before stamping B0, found {heads}"
                    )
                _maybe_inject(fail_after, "empty_heads_confirmed")  # test G "during stamp" (before)

                cfg = Config(str(alembic_ini_path))
                script = ScriptDirectory.from_config(cfg)
                b0_revision = script.get_current_head()
                mc.stamp(script, b0_revision)
                _maybe_inject(fail_after, "stamped")  # test G "during stamp" (after)

                # 12. Exactly one resulting row, equal to B0.
                final_rows = conn.execute(
                    text("SELECT version_num FROM alembic_version")
                ).fetchall()
                if final_rows != [(b0_revision,)]:
                    raise AdoptionAborted(
                        f"post-stamp alembic_version is {final_rows}, expected "
                        f"exactly [('{b0_revision}',)]"
                    )
                _maybe_inject(fail_after, "after_stamp_before_final_fingerprint")  # test G point 4

                # 13. Repeat final target-fingerprint AND manifest
                #     verification, both before commit.
                final_fp = fp.fingerprint(conn)
                if fp.compare(final_fp, target_fp):
                    raise AdoptionAborted(
                        "target-B0 fingerprint changed after stamping — this "
                        "should be structurally impossible; aborting"
                    )
                _verify_manifest(manifest_path, "post-adoption")
                _maybe_inject(fail_after, "final_verification_passed")  # test G point 5

            # `with conn.begin()` exits here -> COMMIT only if every
            # assertion above passed, and no injected failure fired.
            return f"adopted: {starting_state} -> {b0_revision}"
        finally:
            # Admission control is always restored, success or failure —
            # otherwise a failed/aborted run would leave the database
            # permanently unreachable by the application.
            _set_allow_connections(admin_database_url, target_db, allow=True)


def _resolve_b0_revision(alembic_ini_path: Path) -> str:
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config(str(alembic_ini_path))
    script = ScriptDirectory.from_config(cfg)
    return script.get_current_head()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", required=True)
    parser.add_argument("--admin-database-url", required=True, help="connects to the postgres maintenance DB")
    parser.add_argument("--expect-db-name", required=True)
    parser.add_argument("--expect-host", required=True)
    parser.add_argument("--expect-pg-major", type=int, required=True)
    parser.add_argument("--app-role", default="kence")
    parser.add_argument("--lock-timeout", default="5s")
    parser.add_argument("--manifest", type=Path, default=BACKEND_ROOT / "app" / "_schema_manifest.json")
    parser.add_argument(
        "--legacy-fingerprint",
        type=Path,
        default=REPO_ROOT / "ops" / "schema_audit" / "fingerprints" / "legacy_accepted.json",
    )
    parser.add_argument(
        "--target-fingerprint",
        type=Path,
        default=REPO_ROOT / "ops" / "schema_audit" / "fingerprints" / "b0_target.json",
    )
    parser.add_argument("--alembic-ini", type=Path, default=BACKEND_ROOT / "alembic.ini")
    parser.add_argument(
        "--fail-after",
        default=None,
        help="TEST ONLY: raise a synthetic failure immediately after the named checkpoint",
    )
    args = parser.parse_args()

    try:
        outcome = adopt(
            database_url=args.database_url,
            admin_database_url=args.admin_database_url,
            expect_db_name=args.expect_db_name,
            expect_host=args.expect_host,
            expect_pg_major=args.expect_pg_major,
            app_role=args.app_role,
            lock_timeout=args.lock_timeout,
            manifest_path=args.manifest,
            legacy_fingerprint_path=args.legacy_fingerprint,
            target_fingerprint_path=args.target_fingerprint,
            alembic_ini_path=args.alembic_ini,
            fail_after=args.fail_after,
        )
        print(f"ADOPTION RESULT: {outcome}")
        return 0
    except (AdoptionAborted, FailureInjected) as e:
        print(f"ADOPTION ABORTED: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

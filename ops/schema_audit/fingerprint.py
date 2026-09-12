"""Deterministic PostgreSQL catalog fingerprint tool.

Captures the complete schema shape needed to verify a legacy database
against a known-accepted shape, and a reconciled database against B0's
target shape, per
docs/ALEMBIC_SCHEMA_RECONCILIATION_STAGE_E2_REV3_2026-08-05.md §4.

Design rules (from that document, restated here as the load-bearing
contract for this module — do not weaken without updating both):

- Only the `public` schema is inspected (matches every prior audit finding:
  no other schema exists in this project).
- No PostgreSQL OID ever appears in the output — only names and canonical
  definition strings/booleans/derived values, so a fingerprint is
  reproducible across independently-created databases.
- Columns are compared as a name-keyed mapping, never an ordinal-position
  list — Stage A (docs/ALEMBIC_SCHEMA_RECONCILIATION_2026-08-04.md §3.5,
  drift #6) established that ALTER-TABLE-appended vs. CREATE-TABLE-declared
  column order is cosmetic-only and must never cause a false mismatch.
- Default-expression normalization is whitespace-trim only — no semantic
  rewriting of SQL text. A functionally-identical but textually-different
  default is a deliberate fail-closed mismatch, not a bug in this tool.
- Output is canonical JSON: every list sorted by name, `sort_keys=True`.
- `alembic_version` is explicitly excluded from every category. It is
  Alembic's own bookkeeping table, not part of the application schema being
  verified, and its presence/row-value is exactly what an adoption run is
  in the middle of changing — including it would make the "verify target
  reached" check (run *before* the version row is touched, per
  docs/ALEMBIC_SCHEMA_RECONCILIATION_STAGE_E2_REV3_2026-08-05.md §2 step 9)
  spuriously fail for the unversioned path, where the table does not exist
  yet at that point in the transaction. Confirmed as a real failure mode
  this session, not a theoretical one — see the B0-authoring notes in
  ops/schema_audit/fingerprints/README.md.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Connection

FINGERPRINT_FORMAT_VERSION = 1

# Alembic's own bookkeeping table — excluded from every category. See the
# module docstring for why.
_EXCLUDED_TABLES = {"alembic_version"}


def _norm(value: Any) -> Any:
    """Whitespace-trim only. No semantic normalization — see module docstring."""
    if isinstance(value, str):
        return value.strip()
    return value


def _rows(conn: Connection, sql: str, **params: Any) -> list[dict[str, Any]]:
    result = conn.execute(text(sql), params)
    return [dict(r._mapping) for r in result]


def _fp_tables_and_columns(conn: Connection) -> dict[str, Any]:
    tables: dict[str, Any] = {}
    table_rows = _rows(
        conn,
        """
        SELECT c.relname AS table_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY c.relname
        """,
    )
    for t in table_rows:
        table_name = t["table_name"]
        if table_name in _EXCLUDED_TABLES:
            continue
        col_rows = _rows(
            conn,
            """
            SELECT column_name, data_type, character_maximum_length,
                   numeric_precision, numeric_scale, collation_name,
                   is_identity, identity_generation, is_generated,
                   generation_expression, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = :table
            ORDER BY column_name
            """,
            table=table_name,
        )
        columns = {}
        for c in col_rows:
            col_name = c.pop("column_name")
            columns[col_name] = {k: _norm(v) for k, v in c.items()}
        tables[table_name] = {"columns": columns}
    return tables


def _fp_primary_keys(conn: Connection) -> dict[str, Any]:
    rows = _rows(
        conn,
        """
        SELECT tc.table_name, tc.constraint_name, kcu.column_name,
               kcu.ordinal_position
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY tc.table_name, kcu.ordinal_position
        """,
    )
    pks: dict[str, Any] = {}
    for r in rows:
        if r["table_name"] in _EXCLUDED_TABLES:
            continue
        entry = pks.setdefault(
            r["table_name"], {"name": r["constraint_name"], "columns": []}
        )
        entry["columns"].append(r["column_name"])
    return pks


def _fp_foreign_keys(conn: Connection) -> dict[str, Any]:
    rows = _rows(
        conn,
        """
        SELECT cl.relname AS table_name, con.conname,
               pg_get_constraintdef(con.oid) AS def,
               con.condeferrable, con.condeferred
        FROM pg_constraint con
        JOIN pg_class cl ON cl.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE n.nspname = 'public' AND con.contype = 'f'
        ORDER BY cl.relname, con.conname
        """,
    )
    fks: dict[str, Any] = {}
    for r in rows:
        if r["table_name"] in _EXCLUDED_TABLES:
            continue
        fks.setdefault(r["table_name"], {})[r["conname"]] = {
            "def": _norm(r["def"]),
            "deferrable": r["condeferrable"],
            "deferred": r["condeferred"],
        }
    return fks


def _fp_unique_check_constraints(conn: Connection) -> dict[str, Any]:
    rows = _rows(
        conn,
        """
        SELECT cl.relname AS table_name, con.conname, con.contype,
               pg_get_constraintdef(con.oid) AS def, con.convalidated
        FROM pg_constraint con
        JOIN pg_class cl ON cl.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE n.nspname = 'public' AND con.contype IN ('u', 'c')
        ORDER BY cl.relname, con.conname
        """,
    )
    out: dict[str, Any] = {}
    for r in rows:
        if r["table_name"] in _EXCLUDED_TABLES:
            continue
        out.setdefault(r["table_name"], {})[r["conname"]] = {
            "type": r["contype"],
            "def": _norm(r["def"]),
            "validated": r["convalidated"],
        }
    return out


def _fp_indexes(conn: Connection) -> dict[str, Any]:
    rows = _rows(
        conn,
        """
        SELECT cl.relname AS table_name, ci.relname AS index_name,
               pg_get_indexdef(ix.indexrelid, 0, false) AS def
        FROM pg_index ix
        JOIN pg_class cl ON cl.oid = ix.indrelid
        JOIN pg_class ci ON ci.oid = ix.indexrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE n.nspname = 'public' AND cl.relkind = 'r'
        ORDER BY cl.relname, ci.relname
        """,
    )
    out: dict[str, Any] = {}
    for r in rows:
        if r["table_name"] in _EXCLUDED_TABLES:
            continue
        out.setdefault(r["table_name"], {})[r["index_name"]] = _norm(r["def"])
    return out


def _fp_enums(conn: Connection) -> dict[str, Any]:
    rows = _rows(
        conn,
        """
        SELECT t.typname AS enum_name, e.enumlabel, e.enumsortorder
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
        ORDER BY t.typname, e.enumsortorder
        """,
    )
    out: dict[str, Any] = {}
    for r in rows:
        out.setdefault(r["enum_name"], []).append(r["enumlabel"])
    return out


def _fp_extensions(conn: Connection) -> dict[str, Any]:
    rows = _rows(conn, "SELECT extname, extversion FROM pg_extension ORDER BY extname")
    return {r["extname"]: r["extversion"] for r in rows}


def _fp_sequences(conn: Connection) -> dict[str, Any]:
    seq_rows = _rows(
        conn,
        """
        SELECT sequence_name FROM information_schema.sequences
        WHERE sequence_schema = 'public' ORDER BY sequence_name
        """,
    )
    owners = {
        r["sequence_name"]: {
            "owner_table": r["owner_table"],
            "owner_column": r["owner_column"],
        }
        for r in _rows(
            conn,
            """
            SELECT s.relname AS sequence_name, t.relname AS owner_table,
                   a.attname AS owner_column
            FROM pg_class s
            JOIN pg_depend d ON d.objid = s.oid AND d.deptype = 'a'
            JOIN pg_class t ON t.oid = d.refobjid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
            JOIN pg_namespace n ON n.oid = s.relnamespace
            WHERE s.relkind = 'S' AND n.nspname = 'public'
            ORDER BY s.relname
            """,
        )
    }
    out: dict[str, Any] = {}
    for r in seq_rows:
        name = r["sequence_name"]
        owner = owners.get(name, {"owner_table": None, "owner_column": None})
        if owner.get("owner_table") in _EXCLUDED_TABLES:
            continue
        out[name] = owner
    return out


def _fp_rls(conn: Connection) -> dict[str, Any]:
    rows = _rows(
        conn,
        """
        SELECT c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY c.relname
        """,
    )
    return {
        r["table_name"]: {
            "enabled": r["relrowsecurity"],
            "forced": r["relforcerowsecurity"],
        }
        for r in rows
        if r["table_name"] not in _EXCLUDED_TABLES
    }


def _fp_policies(conn: Connection) -> dict[str, Any]:
    rows = _rows(
        conn,
        """
        SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
        FROM pg_policies WHERE schemaname = 'public'
        ORDER BY tablename, policyname
        """,
    )
    out: dict[str, Any] = {}
    for r in rows:
        if r["tablename"] in _EXCLUDED_TABLES:
            continue
        out.setdefault(r["tablename"], {})[r["policyname"]] = {
            "permissive": r["permissive"],
            "roles": sorted(r["roles"]) if r["roles"] else r["roles"],
            "cmd": r["cmd"],
            "qual": _norm(r["qual"]),
            "with_check": _norm(r["with_check"]),
        }
    return out


def _fp_triggers(conn: Connection) -> dict[str, Any]:
    rows = _rows(
        conn,
        """
        SELECT cl.relname AS table_name, tg.tgname, pg_get_triggerdef(tg.oid) AS def
        FROM pg_trigger tg
        JOIN pg_class cl ON cl.oid = tg.tgrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE NOT tg.tgisinternal AND n.nspname = 'public'
        ORDER BY cl.relname, tg.tgname
        """,
    )
    out: dict[str, Any] = {}
    for r in rows:
        if r["table_name"] in _EXCLUDED_TABLES:
            continue
        out.setdefault(r["table_name"], {})[r["tgname"]] = _norm(r["def"])
    return out


def _fp_functions(conn: Connection) -> dict[str, Any]:
    rows = _rows(
        conn,
        """
        SELECT p.proname,
               pg_get_function_identity_arguments(p.oid) AS args,
               pg_get_functiondef(p.oid) AS def
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
        ORDER BY p.proname, args
        """,
    )
    return {f"{r['proname']}({r['args']})": _norm(r["def"]) for r in rows}


def fingerprint(conn: Connection) -> dict[str, Any]:
    """Compute the complete deterministic catalog fingerprint on `conn`.

    Safe to call mid-transaction — every query here is a plain read against
    system catalogs / information_schema, visible within the caller's own
    transaction per ordinary PostgreSQL read-your-own-writes semantics.
    """
    return {
        "fingerprint_format_version": FINGERPRINT_FORMAT_VERSION,
        "tables": _fp_tables_and_columns(conn),
        "primary_keys": _fp_primary_keys(conn),
        "foreign_keys": _fp_foreign_keys(conn),
        "unique_check_constraints": _fp_unique_check_constraints(conn),
        "indexes": _fp_indexes(conn),
        "enums": _fp_enums(conn),
        "extensions": _fp_extensions(conn),
        "sequences": _fp_sequences(conn),
        "rls": _fp_rls(conn),
        "policies": _fp_policies(conn),
        "triggers": _fp_triggers(conn),
        "functions": _fp_functions(conn),
    }


def canonical_json(fp: dict[str, Any]) -> str:
    return json.dumps(fp, sort_keys=True, ensure_ascii=True, indent=2)


def sha256_of(fp: dict[str, Any]) -> str:
    compact = json.dumps(fp, sort_keys=True, ensure_ascii=True, separators=(",", ":"))
    return hashlib.sha256(compact.encode("utf-8")).hexdigest()


_MISSING = object()


def _deep_diff(actual: Any, expected: Any, path: str) -> dict[str, Any]:
    """Recursive structural diff, keyed by dotted path, leaves only at the
    point of actual divergence (never dumps a whole unchanged subtree)."""
    diffs: dict[str, Any] = {}
    if isinstance(actual, dict) and isinstance(expected, dict):
        keys = set(actual) | set(expected)
        for key in keys:
            a = actual.get(key, _MISSING)
            e = expected.get(key, _MISSING)
            sub_path = f"{path}.{key}" if path else str(key)
            if a is _MISSING:
                diffs[sub_path] = {"actual": "<MISSING>", "expected": e}
            elif e is _MISSING:
                diffs[sub_path] = {"actual": a, "expected": "<MISSING>"}
            else:
                diffs.update(_deep_diff(a, e, sub_path))
        return diffs
    if actual != expected:
        diffs[path] = {"actual": actual, "expected": expected}
    return diffs


def compare(actual: dict[str, Any], expected: dict[str, Any]) -> dict[str, Any]:
    """Structural diff, pinpointed by dotted path. Empty dict means exact
    match. Never dumps unchanged subtrees — only leaves that actually
    differ."""
    return _deep_diff(actual, expected, "")


def _main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_capture = sub.add_parser("capture", help="Capture a fingerprint from a live DB")
    p_capture.add_argument("--database-url", required=True)
    p_capture.add_argument("--output", required=True)

    p_compare = sub.add_parser("compare", help="Compare two fingerprint JSON files")
    p_compare.add_argument("left")
    p_compare.add_argument("right")

    args = parser.parse_args()

    if args.cmd == "capture":
        from sqlalchemy import create_engine

        engine = create_engine(args.database_url)
        with engine.connect() as conn:
            fp = fingerprint(conn)
        with open(args.output, "w") as f:
            f.write(canonical_json(fp))
            f.write("\n")
        print(f"wrote {args.output} sha256={sha256_of(fp)}")
        return 0

    if args.cmd == "compare":
        with open(args.left) as f:
            left = json.load(f)
        with open(args.right) as f:
            right = json.load(f)
        diff = compare(left, right)
        if diff:
            print(json.dumps(diff, indent=2, sort_keys=True))
            return 1
        print("MATCH: zero differences")
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(_main())

"""CI guard: active Alembic migrations must be frozen and ORM-independent.

Enforces docs/ALEMBIC_SCHEMA_RECONCILIATION_STAGE_E2_REV3_2026-08-05.md §7:
migrations under backend/alembic/versions/ (the ACTIVE directory only —
backend/alembic/versions_archive/ is historical record, exempt, never
executed) must never import the application's ORM models or
`Base.metadata`, and must never call `.create_all(`.

This is an AST/import-dependency check, not a regex grep, specifically so
that indirection is caught: a migration that imports a local helper module
which itself imports `app.models` is a violation, not just a migration that
imports `app.models` directly. The rule applied is: no import chain
starting from an active migration file may resolve to anything under the
`app` package (there is no legitimate reason for frozen migration DDL to
depend on runtime application code at all — not just the specific names
that happened to cause Revision 1's mistake).

Exit code 0 = clean. Exit code 1 = violation(s) found, printed to stderr.
"""
from __future__ import annotations

import ast
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_ROOT = REPO_ROOT / "backend"
ACTIVE_VERSIONS_DIR = BACKEND_ROOT / "alembic" / "versions"

FORBIDDEN_ROOT_PACKAGES = {"app"}
FORBIDDEN_ATTRIBUTE_ACCESS = {"metadata"}  # Base.metadata pattern, defense-in-depth
FORBIDDEN_CALL_NAMES = {"create_all"}


class Violation:
    def __init__(self, file: Path, line: int, message: str, via_chain: list[str]):
        self.file = file
        self.line = line
        self.message = message
        self.via_chain = via_chain

    def __str__(self) -> str:
        chain = " -> ".join(self.via_chain) if self.via_chain else ""
        chain_suffix = f" (import chain: {chain})" if chain else ""
        return f"{self.file}:{self.line}: {self.message}{chain_suffix}"


def _imported_module_names(tree: ast.AST) -> list[tuple[str, int]]:
    """Every dotted module name this file imports, with its line number."""
    names: list[tuple[str, int]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                names.append((alias.name, node.lineno))
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                names.append((node.module, node.lineno))
    return names


def _attribute_and_call_violations(tree: ast.AST, file: Path) -> list[Violation]:
    """Defense-in-depth: flag `Base.metadata` / `.create_all(` textually,
    in case an import is disguised (star-import, dynamic importlib, etc.)."""
    out: list[Violation] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and node.attr in FORBIDDEN_ATTRIBUTE_ACCESS:
            out.append(Violation(file, node.lineno, f"forbidden attribute access '.{node.attr}'", []))
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Attribute) and func.attr in FORBIDDEN_CALL_NAMES:
                out.append(Violation(file, node.lineno, f"forbidden call '.{func.attr}(...)'", []))
    return out


def _resolve_local_module(module_name: str) -> Path | None:
    """If `module_name` corresponds to a local .py file reachable from
    BACKEND_ROOT (the sys.path root per alembic/env.py's
    `sys.path.insert(0, .../backend)`), return that file's path. Returns
    None for stdlib/third-party modules (nothing under BACKEND_ROOT matches
    them), which is exactly what stops the walk from recursing into e.g.
    `sqlalchemy` or `alembic` internals.
    """
    parts = module_name.split(".")
    candidate_file = BACKEND_ROOT.joinpath(*parts).with_suffix(".py")
    if candidate_file.is_file():
        return candidate_file
    candidate_pkg = BACKEND_ROOT.joinpath(*parts, "__init__.py")
    if candidate_pkg.is_file():
        return candidate_pkg
    return None


def _scan_file(
    file: Path, visited: set[Path], chain: list[str]
) -> list[Violation]:
    if file in visited:
        return []
    visited.add(file)

    violations: list[Violation] = []
    try:
        source = file.read_text()
        tree = ast.parse(source, filename=str(file))
    except (SyntaxError, OSError) as e:
        return [Violation(file, 0, f"could not parse: {e}", chain)]

    violations.extend(_attribute_and_call_violations(tree, file))

    for module_name, lineno in _imported_module_names(tree):
        root_package = module_name.split(".")[0]
        if root_package in FORBIDDEN_ROOT_PACKAGES:
            violations.append(
                Violation(
                    file,
                    lineno,
                    f"imports forbidden package '{module_name}' "
                    "(active migrations must not depend on runtime app code)",
                    chain,
                )
            )
            continue

        # Not directly forbidden — but if it resolves to a local file,
        # recurse into it, so a helper module that itself imports `app.*`
        # is caught too (the indirection case).
        local_path = _resolve_local_module(module_name)
        if local_path is not None:
            violations.extend(
                _scan_file(local_path, visited, chain + [module_name])
            )

    return violations


def check_active_migrations() -> list[Violation]:
    if not ACTIVE_VERSIONS_DIR.is_dir():
        return [Violation(ACTIVE_VERSIONS_DIR, 0, "active versions directory not found", [])]

    all_violations: list[Violation] = []
    for py_file in sorted(ACTIVE_VERSIONS_DIR.glob("*.py")):
        if py_file.name == "__init__.py":
            continue
        visited: set[Path] = set()
        all_violations.extend(_scan_file(py_file, visited, [py_file.name]))
    return all_violations


def main() -> int:
    violations = check_active_migrations()
    if violations:
        print(
            f"FROZEN-MIGRATION GUARD: {len(violations)} violation(s) found "
            f"in {ACTIVE_VERSIONS_DIR}:",
            file=sys.stderr,
        )
        for v in violations:
            print(f"  {v}", file=sys.stderr)
        return 1
    print(f"FROZEN-MIGRATION GUARD: clean ({ACTIVE_VERSIONS_DIR})")
    return 0


if __name__ == "__main__":
    sys.exit(main())

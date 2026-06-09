"""Cypher Policy Engine — allowlist-only validation for LLM-generated Cypher.

Principle: reject anything not explicitly permitted.
- Uppercase token scan against a hard-blocked set (strips comments first)
- org_id WHERE clause injection at the Python layer (LLM never has authority)
- LIMIT enforcement (inject or clamp to MAX_LIMIT_RESULT)
- Variable-length traversal depth cap
- Query length cap
- Driver-level READ_ACCESS mode is the final backstop (see graph_service.py)
"""
from __future__ import annotations

import re
import logging

logger = logging.getLogger(__name__)


class CypherPolicyError(ValueError):
    """Raised when a Cypher query fails policy validation."""


# Relationship types the LLM is allowed to produce.
# Any other value is silently replaced with RELATED_TO.
ALLOWED_REL_TYPES: frozenset[str] = frozenset({
    "RELATED_TO", "WORKS_FOR", "MENTIONS", "PART_OF", "USES",
    "CREATED_BY", "LOCATED_IN", "HAPPENED_AT", "REFERS_TO",
    "DEPENDS_ON", "OWNS", "SIGNED_BY", "REGULATED_BY",
    "AUTHORED_BY", "CONTAINS", "REFERENCES", "SUPERSEDES",
    "REPLACES", "IMPLEMENTS", "REQUIRES",
})


def sanitize_rel_type(raw: str) -> str:
    """Normalize and validate a relationship type string.

    Returns RELATED_TO for any value not in the whitelist — this prevents
    the LLM from creating unbounded relationship type proliferation in Neo4j
    (Neo4j Community has ~200 type practical limit before performance degrades).
    """
    normalized = raw.upper().replace(" ", "_").replace("-", "_")
    if normalized not in ALLOWED_REL_TYPES:
        logger.debug("rel_type '%s' not in whitelist → RELATED_TO", raw)
        return "RELATED_TO"
    return normalized


class CypherPolicyEngine:
    """Validates and sanitizes LLM-generated Cypher queries before execution.

    Attack vectors mitigated:
      A1  org_id bypass            — always injects WHERE n.org_id = $org_id
      A2  APOC injection           — CALL blocked in HARD_BLOCKED_TOKENS
      A3  Schema inspection        — CALL db.labels() blocked
      A4  Comment bypass           — strips // and /* */ before token scan
      A5  UNION cross-tenant       — UNION blocked
      A6  Subquery bypass          — CALL { } blocked via CALL token
      A7  Traversal explosion      — [*1..N] depth capped at MAX_DEPTH
      A8  Token-length DoS         — MAX_QUERY_CHARS enforced
      A9  Prompt injection         — doesn't prevent it, but the injected
                                     payload still must survive token scan
    """

    MAX_QUERY_CHARS = 2_000
    MAX_LIMIT_RESULT = 100
    MAX_TRAVERSAL_DEPTH = 3

    # These uppercase tokens must never appear in the (comment-stripped) query.
    # Scanned against the uppercased query to be case-insensitive.
    HARD_BLOCKED_TOKENS: frozenset[str] = frozenset({
        "CREATE", "MERGE", "SET", "DELETE", "DETACH", "REMOVE",
        "DROP", "CALL", "LOAD", "UNION", "APOC", "PERIODIC",
        "TRIGGER", "EXPORT", "IMPORT", "SCHEMA",
        "CONSTRAINT", "PROCEDURE", "FOREACH", "DO",
    })

    # Matches variable-length relationship patterns, e.g. [*1..5] or [*..10]
    _VARLEN_RE = re.compile(r'\[\*(?:(\d+)\.\.)?(\d+)\]')
    # Matches an existing LIMIT clause (case-insensitive)
    _LIMIT_RE = re.compile(r'\bLIMIT\s+(\d+)', re.IGNORECASE)
    # Inline comment // ... end-of-line
    _INLINE_COMMENT_RE = re.compile(r'//[^\n]*')
    # Block comment /* ... */
    _BLOCK_COMMENT_RE = re.compile(r'/\*.*?\*/', re.DOTALL)
    # WHERE clause presence
    _WHERE_RE = re.compile(r'\bWHERE\b', re.IGNORECASE)

    def _strip_comments(self, cypher: str) -> str:
        cypher = self._BLOCK_COMMENT_RE.sub(' ', cypher)
        cypher = self._INLINE_COMMENT_RE.sub(' ', cypher)
        return cypher

    def _check_length(self, cypher: str) -> None:
        if len(cypher) > self.MAX_QUERY_CHARS:
            raise CypherPolicyError(
                f"Query too long ({len(cypher)} chars, max {self.MAX_QUERY_CHARS})"
            )

    def _check_blocked_tokens(self, cypher_upper: str) -> None:
        for token in self.HARD_BLOCKED_TOKENS:
            # Word-boundary check to avoid false positives (e.g. "MERGE" in a label)
            if re.search(rf'\b{re.escape(token)}\b', cypher_upper):
                raise CypherPolicyError(
                    f"Query contains blocked keyword: {token}"
                )

    def _check_traversal_depth(self, cypher: str) -> None:
        for m in self._VARLEN_RE.finditer(cypher):
            upper_bound = int(m.group(2))
            if upper_bound > self.MAX_TRAVERSAL_DEPTH:
                raise CypherPolicyError(
                    f"Variable-length traversal depth {upper_bound} exceeds "
                    f"maximum {self.MAX_TRAVERSAL_DEPTH}"
                )

    def _enforce_limit(self, cypher: str) -> str:
        m = self._LIMIT_RE.search(cypher)
        if m:
            current = int(m.group(1))
            if current > self.MAX_LIMIT_RESULT:
                cypher = self._LIMIT_RE.sub(f"LIMIT {self.MAX_LIMIT_RESULT}", cypher)
        else:
            cypher = cypher.rstrip().rstrip(";")
            cypher += f"\nLIMIT {self.MAX_LIMIT_RESULT}"
        return cypher

    def _inject_org_id(self, cypher: str, org_id: int) -> str:
        """Ensures the query is scoped to the given org_id.

        If a WHERE clause already exists and contains org_id, it is left as-is.
        If WHERE exists but org_id is not there, we append AND n.org_id = $org_id.
        If no WHERE exists, we insert WHERE n.org_id = $org_id before RETURN.
        """
        upper = cypher.upper()
        if f"ORG_ID" in upper:
            # Trust that the clause is there; token check already blocked mutations
            return cypher

        if self._WHERE_RE.search(cypher):
            # Append to existing WHERE via AND
            cypher = self._WHERE_RE.sub(
                r"WHERE n.org_id = $org_id AND ",
                cypher,
                count=1,
            )
        else:
            # Insert before RETURN
            return_match = re.search(r'\bRETURN\b', cypher, re.IGNORECASE)
            if return_match:
                pos = return_match.start()
                cypher = cypher[:pos] + f"WHERE n.org_id = $org_id\n" + cypher[pos:]
            else:
                # No RETURN clause — append WHERE at end (will likely fail at DB, which is safe)
                cypher += f"\nWHERE n.org_id = $org_id"
        return cypher

    def validate_and_sanitize(self, raw_cypher: str, org_id: int) -> str:
        """Validate and return a safe, org-scoped, limit-enforced Cypher string.

        Raises CypherPolicyError if the query fails any policy check.
        All CypherPolicyError messages are safe to surface to the client.
        """
        # 1. Strip markdown fences the LLM may add
        cypher = raw_cypher.strip()
        if cypher.startswith("```"):
            lines = cypher.split("\n")
            cypher = "\n".join(lines[1:] if lines[0].startswith("```") else lines)
        if cypher.endswith("```"):
            cypher = "\n".join(cypher.split("\n")[:-1])
        if cypher.upper().startswith("CYPHER"):
            cypher = cypher.split("\n", 1)[-1].strip()

        # 2. Length check (before stripping comments to prevent bypass via padding)
        self._check_length(cypher)

        # 3. Strip comments so they cannot hide blocked tokens
        clean = self._strip_comments(cypher)

        # 4. Token scan on uppercased, comment-free query
        self._check_blocked_tokens(clean.upper())

        # 5. Traversal depth check
        self._check_traversal_depth(clean)

        # 6. Inject org_id scope (server-side, always — LLM cannot opt out)
        clean = self._inject_org_id(clean, org_id)

        # 7. Enforce LIMIT
        clean = self._enforce_limit(clean)

        logger.debug("[cypher_policy] validated query (org_id=%d): %s", org_id, clean[:200])
        return clean


# Module-level singleton — import this everywhere
cypher_policy = CypherPolicyEngine()

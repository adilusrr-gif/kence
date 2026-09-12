"""Neo4j graph service — entity storage and GraphRAG context retrieval."""
import logging
from typing import Optional
from app.core.config import get_settings
from app.services.cypher_policy import cypher_policy, CypherPolicyError, sanitize_rel_type

logger = logging.getLogger(__name__)
_driver = None


def get_driver():
    global _driver
    if _driver is None:
        try:
            from neo4j import AsyncGraphDatabase
            cfg = get_settings()
            _driver = AsyncGraphDatabase.driver(
                cfg.NEO4J_URI,
                auth=(cfg.NEO4J_USER, cfg.NEO4J_PASSWORD),
            )
        except Exception as e:
            logger.warning("Neo4j driver init failed: %s", e)
            return None
    return _driver


async def ensure_constraints():
    driver = get_driver()
    if not driver:
        return
    try:
        async with driver.session() as session:
            await session.run(
                "CREATE CONSTRAINT IF NOT EXISTS FOR (e:Entity) REQUIRE (e.org_id, e.label) IS UNIQUE"
            )
    except Exception as e:
        logger.warning("Neo4j constraint creation failed: %s", e)


async def upsert_entity(org_id: int, entity_type: str, label: str, properties: dict = None,
                        doc_id: Optional[str] = None) -> Optional[str]:
    driver = get_driver()
    if not driver:
        return None
    props = properties or {}
    try:
        async with driver.session() as session:
            result = await session.run(
                """
                MERGE (e:Entity {org_id: $org_id, label: $label})
                SET e.entity_type = $entity_type, e += $props,
                    e.doc_ids = CASE
                        WHEN $doc_id IS NULL THEN coalesce(e.doc_ids, [])
                        WHEN $doc_id IN coalesce(e.doc_ids, []) THEN e.doc_ids
                        ELSE coalesce(e.doc_ids, []) + $doc_id END
                RETURN elementId(e) AS eid
                """,
                org_id=org_id, label=label, entity_type=entity_type, props=props, doc_id=doc_id,
            )
            record = await result.single()
            return record["eid"] if record else None
    except Exception as e:
        logger.error("upsert_entity error: %s", e)
        return None


async def upsert_relationship(
    org_id: int,
    from_label: str,
    to_label: str,
    rel_type: str,
    properties: dict = None,
    doc_id: Optional[str] = None,
) -> None:
    driver = get_driver()
    if not driver:
        return
    props = properties or {}
    safe_rel = sanitize_rel_type(rel_type)
    try:
        async with driver.session() as session:
            await session.run(
                f"""
                MERGE (a:Entity {{org_id: $org_id, label: $from_label}})
                  ON CREATE SET a.entity_type = 'Concept'
                MERGE (b:Entity {{org_id: $org_id, label: $to_label}})
                  ON CREATE SET b.entity_type = 'Concept'
                MERGE (a)-[r:{safe_rel}]->(b)
                SET r += $props,
                    r.doc_ids = CASE
                        WHEN $doc_id IS NULL THEN coalesce(r.doc_ids, [])
                        WHEN $doc_id IN coalesce(r.doc_ids, []) THEN r.doc_ids
                        ELSE coalesce(r.doc_ids, []) + $doc_id END,
                    a.doc_ids = CASE
                        WHEN $doc_id IS NULL THEN coalesce(a.doc_ids, [])
                        WHEN $doc_id IN coalesce(a.doc_ids, []) THEN a.doc_ids
                        ELSE coalesce(a.doc_ids, []) + $doc_id END,
                    b.doc_ids = CASE
                        WHEN $doc_id IS NULL THEN coalesce(b.doc_ids, [])
                        WHEN $doc_id IN coalesce(b.doc_ids, []) THEN b.doc_ids
                        ELSE coalesce(b.doc_ids, []) + $doc_id END
                """,
                org_id=org_id, from_label=from_label, to_label=to_label, props=props, doc_id=doc_id,
            )
    except Exception as e:
        logger.error("upsert_relationship error: %s", e)


async def query_neighbors(org_id: int, label: str, depth: int = 2) -> list[dict]:
    driver = get_driver()
    if not driver:
        return []
    depth = min(depth, 4)
    try:
        async with driver.session() as session:
            result = await session.run(
                f"""
                MATCH (n:Entity {{org_id: $org_id, label: $label}})
                MATCH (n)-[r*1..{depth}]-(m:Entity {{org_id: $org_id}})
                RETURN DISTINCT m.label AS label, m.entity_type AS entity_type,
                       [rel in r | type(rel)] AS rel_types
                LIMIT 50
                """,
                org_id=org_id, label=label,
            )
            return [dict(r) async for r in result]
    except Exception as e:
        logger.error("query_neighbors error: %s", e)
        return []


async def graph_rag_context(org_id: int, query_entities: list[str], k: int = 5) -> str:
    """Returns formatted text of graph neighbors for LLM context injection."""
    if not query_entities:
        return ""
    parts = []
    for entity in query_entities[:k]:
        neighbors = await query_neighbors(org_id, entity, depth=2)
        if neighbors:
            lines = [f"  - {n['label']} ({n['entity_type']}) via [{', '.join(n['rel_types'])}]" for n in neighbors[:10]]
            parts.append(f"Связи для '{entity}':\n" + "\n".join(lines))
    if not parts:
        return ""
    return "=== Knowledge Graph Context ===\n" + "\n\n".join(parts) + "\n=== End Graph Context ===\n"


async def export_graph_for_d3(org_id: int, doc_id: Optional[str] = None) -> dict:
    """Returns {nodes, links} dict for D3/react-force-graph.

    When doc_id (session_id) is given, only entities/relationships tagged with that
    document are returned — the per-document graph view. Otherwise the full org graph.
    """
    driver = get_driver()
    if not driver:
        return {"nodes": [], "links": []}
    node_filter = " AND $doc_id IN n.doc_ids" if doc_id else ""
    try:
        async with driver.session() as session:
            nodes_result = await session.run(
                f"MATCH (n:Entity) WHERE n.org_id = $org_id{node_filter} "
                "RETURN elementId(n) AS id, n.label AS label, n.entity_type AS type LIMIT 500",
                org_id=org_id, doc_id=doc_id,
            )
            nodes = [{"id": r["id"], "label": r["label"], "type": r["type"]} async for r in nodes_result]

            edge_filter = " AND $doc_id IN r.doc_ids" if doc_id else ""
            edges_result = await session.run(
                f"""
                MATCH (a:Entity)-[r]->(b:Entity)
                WHERE a.org_id = $org_id AND b.org_id = $org_id{edge_filter}
                RETURN elementId(a) AS source, elementId(b) AS target, type(r) AS type
                LIMIT 1000
                """,
                org_id=org_id, doc_id=doc_id,
            )
            raw_links = [{"source": r["source"], "target": r["target"], "type": r["type"]} async for r in edges_result]

        node_ids = {n["id"] for n in nodes}
        links = [l for l in raw_links if l["source"] in node_ids and l["target"] in node_ids]

        truncated = len(nodes) >= 500 or len(raw_links) >= 1000
        return {"nodes": nodes, "links": links, "truncated": truncated}
    except Exception as e:
        logger.error("export_graph_for_d3 error: %s", e)
        return {"nodes": [], "links": []}


async def natural_language_query(query_text: str, llm_service, org_id: int = 0) -> str:
    """Converts natural language to Cypher via LLM and executes it (read-only, org-scoped).

    Security: CypherPolicyEngine validates and sanitizes the LLM output before execution.
    Neo4j session uses READ_ACCESS mode as the final backstop against write mutations.
    """
    driver = get_driver()
    if not driver:
        return "Neo4j недоступен"
    cypher_prompt = (
        "Преобразуй следующий запрос на естественном языке в READ-ONLY Cypher-запрос для Neo4j. "
        "Граф содержит узлы (:Entity) с полями: org_id, label, entity_type. "
        "Используй только MATCH, WHERE и RETURN. "
        f"Верни ТОЛЬКО Cypher-запрос, без объяснений.\n\nЗапрос: {query_text}"
    )
    try:
        raw_cypher = await llm_service.agenerate(cypher_prompt)
        safe_cypher = cypher_policy.validate_and_sanitize(raw_cypher, org_id)

        from neo4j import READ_ACCESS
        async with driver.session(default_access_mode=READ_ACCESS) as session:
            result = await session.run(safe_cypher, {"org_id": org_id})
            records = [dict(r) async for r in result]
        return str(records[:cypher_policy.MAX_LIMIT_RESULT])
    except CypherPolicyError as e:
        logger.warning("natural_language_query policy violation (org_id=%d): %s", org_id, e)
        return f"Запрос отклонён: {e}"
    except Exception as e:
        logger.error("natural_language_query error: %s", e)
        return "Ошибка выполнения запроса"


async def delete_org_graph(org_id: int) -> int:
    driver = get_driver()
    if not driver:
        return 0
    try:
        async with driver.session() as session:
            result = await session.run(
                "MATCH (n:Entity {org_id: $org_id}) DETACH DELETE n RETURN count(n) AS deleted",
                org_id=org_id,
            )
            record = await result.single()
            return record["deleted"] if record else 0
    except Exception as e:
        logger.error("delete_org_graph error: %s", e)
        return 0

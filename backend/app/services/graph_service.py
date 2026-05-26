"""Neo4j graph service — entity storage and GraphRAG context retrieval."""
import logging
from typing import Optional
from app.core.config import get_settings

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


async def upsert_entity(org_id: int, entity_type: str, label: str, properties: dict = None) -> Optional[str]:
    driver = get_driver()
    if not driver:
        return None
    props = properties or {}
    try:
        async with driver.session() as session:
            result = await session.run(
                """
                MERGE (e:Entity {org_id: $org_id, label: $label})
                SET e.entity_type = $entity_type, e += $props
                RETURN elementId(e) AS eid
                """,
                org_id=org_id, label=label, entity_type=entity_type, props=props,
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
) -> None:
    driver = get_driver()
    if not driver:
        return
    props = properties or {}
    safe_rel = rel_type.upper().replace(" ", "_").replace("-", "_")
    try:
        async with driver.session() as session:
            await session.run(
                f"""
                MATCH (a:Entity {{org_id: $org_id, label: $from_label}})
                MATCH (b:Entity {{org_id: $org_id, label: $to_label}})
                MERGE (a)-[r:{safe_rel}]->(b)
                SET r += $props
                """,
                org_id=org_id, from_label=from_label, to_label=to_label, props=props,
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


async def export_graph_for_d3(org_id: int) -> dict:
    """Returns {nodes, links} dict for D3/react-force-graph."""
    driver = get_driver()
    if not driver:
        return {"nodes": [], "links": []}
    try:
        async with driver.session() as session:
            nodes_result = await session.run(
                "MATCH (n:Entity {org_id: $org_id}) RETURN elementId(n) AS id, n.label AS label, n.entity_type AS type LIMIT 500",
                org_id=org_id,
            )
            nodes = [{"id": r["id"], "label": r["label"], "type": r["type"]} async for r in nodes_result]

            edges_result = await session.run(
                """
                MATCH (a:Entity {org_id: $org_id})-[r]->(b:Entity {org_id: $org_id})
                RETURN elementId(a) AS source, elementId(b) AS target, type(r) AS type
                LIMIT 1000
                """,
                org_id=org_id,
            )
            links = [{"source": r["source"], "target": r["target"], "type": r["type"]} async for r in edges_result]

        return {"nodes": nodes, "links": links}
    except Exception as e:
        logger.error("export_graph_for_d3 error: %s", e)
        return {"nodes": [], "links": []}


async def natural_language_query(query_text: str, llm_service) -> str:
    """Converts natural language to Cypher via LLM and executes it."""
    driver = get_driver()
    if not driver:
        return "Neo4j недоступен"
    cypher_prompt = (
        f"Преобразуй следующий запрос на естественном языке в Cypher-запрос для Neo4j. "
        f"Граф содержит узлы (:Entity) с полями: org_id, label, entity_type. "
        f"Верни ТОЛЬКО Cypher-запрос, без объяснений.\n\nЗапрос: {query_text}"
    )
    try:
        cypher = await llm_service.agenerate(cypher_prompt)
        cypher = cypher.strip().strip("```").strip()
        async with driver.session() as session:
            result = await session.run(cypher)
            records = [dict(r) async for r in result]
        return str(records[:20])
    except Exception as e:
        logger.error("natural_language_query error: %s", e)
        return f"Ошибка выполнения запроса: {e}"


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

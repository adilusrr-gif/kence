"""Entity extraction from document text for Knowledge Graph construction."""
import json
import logging
from datetime import datetime, timezone
from app.core.database import SessionLocal
from app.models.models import GraphExtractionJob, KnowledgeGraphNode
from app.services import graph_service

logger = logging.getLogger(__name__)

_EXTRACTION_PROMPT = """Проанализируй текст и извлеки именованные сущности и связи между ними.

Верни ТОЛЬКО JSON в следующем формате (без markdown, без пояснений):
{{
  "entities": [
    {{"type": "Person|Organization|Concept|Event|Location|Technology|Document", "label": "название", "properties": {{}}}}
  ],
  "relationships": [
    {{"from": "название1", "to": "название2", "type": "RELATED_TO|WORKS_FOR|MENTIONS|PART_OF|USES", "properties": {{}}}}
  ]
}}

Текст:
{text}"""


async def extract_entities_from_text(text: str, llm_service) -> dict:
    prompt = _EXTRACTION_PROMPT.format(text=text[:8000])
    try:
        response = await llm_service.agenerate(prompt)
        # Strip markdown code blocks if present
        clean = response.strip()
        if clean.startswith("```"):
            clean = "\n".join(clean.split("\n")[1:])
        if clean.endswith("```"):
            clean = "\n".join(clean.split("\n")[:-1])
        return json.loads(clean)
    except (json.JSONDecodeError, Exception) as e:
        logger.error("Entity extraction parse error: %s", e)
        return {"entities": [], "relationships": []}


async def run_extraction_job(job_id: int, session_id: str, org_id: int, markdown_text: str, llm_service) -> None:
    """Async coroutine: extracts entities, upserts Neo4j, indexes PostgreSQL rows."""
    with SessionLocal() as db:
        job = db.query(GraphExtractionJob).filter_by(id=job_id).first()
        if not job:
            return
        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        db.commit()

    try:
        extracted = await extract_entities_from_text(markdown_text, llm_service)
        entities = extracted.get("entities", [])
        relationships = extracted.get("relationships", [])

        entity_ids: dict[str, str] = {}

        for ent in entities:
            neo4j_id = await graph_service.upsert_entity(
                org_id=org_id,
                entity_type=ent.get("type", "Concept"),
                label=ent["label"],
                properties=ent.get("properties", {}),
            )
            if neo4j_id:
                entity_ids[ent["label"]] = neo4j_id

        for rel in relationships:
            if rel.get("from") and rel.get("to"):
                await graph_service.upsert_relationship(
                    org_id=org_id,
                    from_label=rel["from"],
                    to_label=rel["to"],
                    rel_type=rel.get("type", "RELATED_TO"),
                    properties=rel.get("properties", {}),
                )

        # Index in PostgreSQL for fast lookup
        with SessionLocal() as db:
            for ent in entities:
                neo4j_id = entity_ids.get(ent["label"], "")
                node = KnowledgeGraphNode(
                    org_id=org_id,
                    session_id=session_id,
                    neo4j_id=neo4j_id,
                    entity_type=ent.get("type", "Concept"),
                    label=ent["label"],
                )
                db.merge(node) if hasattr(db, "merge") else db.add(node)

            job = db.query(GraphExtractionJob).filter_by(id=job_id).first()
            if job:
                job.status = "done"
                job.entity_count = len(entities)
                job.rel_count = len(relationships)
                job.finished_at = datetime.now(timezone.utc)
            db.commit()

    except Exception as e:
        logger.error("Extraction job %d failed: %s", job_id, e)
        with SessionLocal() as db:
            job = db.query(GraphExtractionJob).filter_by(id=job_id).first()
            if job:
                job.status = "failed"
                job.error = str(e)
                job.finished_at = datetime.now(timezone.utc)
            db.commit()

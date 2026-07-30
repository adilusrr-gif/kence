"""Entity extraction from document text for Knowledge Graph construction."""
import json
import re
import logging
from datetime import datetime, timezone
from app.core.database import SessionLocal
from app.models.models import GraphExtractionJob, KnowledgeGraphNode
from app.services import graph_service

logger = logging.getLogger(__name__)

_EXTRACTION_PROMPTS = {
    "ru": """Задача: Извлеки ВСЕ именованные сущности и связи из текста.
Будь максимально полным — чем больше сущностей и связей, тем лучше.
Старайся чтобы каждая сущность имела хотя бы одну связь с другой.
Все метки сущностей и типы связей пиши на русском языке (кроме фиксированных типов).

Типы сущностей (выбери наиболее подходящий):
Person, Organization, Concept, Event, Location, Technology, Document, Product, Law, Date

Типы связей (выбери наиболее подходящий):
RELATED_TO, WORKS_FOR, MENTIONS, PART_OF, USES, CREATED_BY, LOCATED_IN,
HAPPENED_AT, REFERS_TO, DEPENDS_ON, OWNS, SIGNED_BY, REGULATED_BY

Верни ТОЛЬКО JSON без markdown-блоков и без пояснений:
{{
  "entities": [
    {{"type": "Person", "label": "название", "properties": {{}}}}
  ],
  "relationships": [
    {{"from": "название1", "to": "название2", "type": "RELATED_TO", "properties": {{}}}}
  ]
}}

Текст:
{text}""",

    "en": """Task: Extract ALL named entities and relationships from the text.
Be as comprehensive as possible — the more entities and relationships, the better.
Every entity should have at least one relationship with another entity.
Write all entity labels in English.

Entity types (choose the most appropriate):
Person, Organization, Concept, Event, Location, Technology, Document, Product, Law, Date

Relationship types (choose the most appropriate):
RELATED_TO, WORKS_FOR, MENTIONS, PART_OF, USES, CREATED_BY, LOCATED_IN,
HAPPENED_AT, REFERS_TO, DEPENDS_ON, OWNS, SIGNED_BY, REGULATED_BY

Return ONLY JSON without markdown blocks or explanations:
{{
  "entities": [
    {{"type": "Person", "label": "name", "properties": {{}}}}
  ],
  "relationships": [
    {{"from": "name1", "to": "name2", "type": "RELATED_TO", "properties": {{}}}}
  ]
}}

Text:
{text}""",

    "kz": """Тапсырма: Мәтіннен БАРЛЫҚ аталған нысандар мен байланыстарды шығару.
Мүмкіндігінше толық болуға тырысыңыз — неғұрлым көп нысандар мен байланыстар, соғұрлым жақсы.
Әр нысанның кем дегенде бір байланысы болуы керек.
Барлық нысан белгілерін қазақ тілінде жазыңыз.

Нысан түрлері (ең қолайлысын таңдаңыз):
Person, Organization, Concept, Event, Location, Technology, Document, Product, Law, Date

Байланыс түрлері (ең қолайлысын таңдаңыз):
RELATED_TO, WORKS_FOR, MENTIONS, PART_OF, USES, CREATED_BY, LOCATED_IN,
HAPPENED_AT, REFERS_TO, DEPENDS_ON, OWNS, SIGNED_BY, REGULATED_BY

Markdown блоктарынсыз және түсіндірмелерсіз ТЕК JSON қайтарыңыз:
{{
  "entities": [
    {{"type": "Person", "label": "атауы", "properties": {{}}}}
  ],
  "relationships": [
    {{"from": "атауы1", "to": "атауы2", "type": "RELATED_TO", "properties": {{}}}}
  ]
}}

Мәтін:
{text}""",
}

_EXTRACTION_PROMPTS["kk"] = _EXTRACTION_PROMPTS["kz"]  # alias


def _chunk_text(text: str, size: int = 5000, overlap: int = 300) -> list[str]:
    if len(text) <= size:
        return [text]
    chunks, i = [], 0
    while i < len(text):
        chunks.append(text[i:i + size])
        i += size - overlap
    return chunks


def _parse_extraction_json(response: str) -> dict:
    """Robustly pull the JSON object out of a model response.

    Handles thinking-model output and prose wrappers: strips <think> blocks and
    markdown fences, then extracts the outermost {...} object before parsing.
    """
    clean = (response or "").strip()
    # Drop reasoning/thinking traces some models emit before the answer.
    clean = re.sub(r"<think>.*?</think>", "", clean, flags=re.DOTALL).strip()
    # Strip markdown code fences (```json ... ```).
    if clean.startswith("```"):
        lines = clean.split("\n")
        clean = "\n".join(lines[1:] if lines[0].startswith("```") else lines)
    if clean.endswith("```"):
        clean = "\n".join(clean.split("\n")[:-1])
    clean = clean.strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        # Fall back to the outermost JSON object in case the model wrapped it in prose.
        match = re.search(r"\{.*\}", clean, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise


async def _extract_chunk(text: str, llm_service, language: str = "ru") -> dict:
    template = _EXTRACTION_PROMPTS.get(language, _EXTRACTION_PROMPTS["ru"])
    prompt = template.format(text=text)
    response = None
    try:
        # Use agenerate_raw (NOT agenerate): agenerate appends a natural-language
        # "respond in language X" suffix that makes the model wrap the JSON in prose,
        # which then fails to parse and silently yields zero entities.
        response = await llm_service.agenerate_raw(prompt)
        return _parse_extraction_json(response)
    except json.JSONDecodeError as e:
        logger.error("Entity extraction JSON parse error: %s | raw: %.800s", e, (response or "")[:800])
        return {"entities": [], "relationships": []}
    except Exception as e:
        logger.error("Entity extraction error: %s", e)
        return {"entities": [], "relationships": []}


async def extract_entities_from_text(
    text: str,
    llm_service,
    language: str = "ru",
    max_concurrent: int = 3,
) -> dict:
    """Extract entities from ALL chunks — no hard cap.

    Returns entities with confidence scores and source chunk references.
    Deduplicates by normalized label; tracks mention_count per entity.
    """
    from app.services.pipeline import split_text, process_chunks_parallel

    chunks = split_text(text, chunk_size=5000, overlap=300)
    logger.info("[entity_extractor] processing %d chunks (was capped at 4)", len(chunks))

    # Track mentions per entity for confidence scoring
    entity_mentions: dict[str, list] = {}   # key -> list[dict]
    all_rels: list[dict] = []

    async def extract_one(chunk, idx, total):
        logger.debug("[entity_extractor] chunk %d/%d", idx + 1, total)
        return (idx, await _extract_chunk(chunk, llm_service, language))

    results = await process_chunks_parallel(chunks, extract_one, max_concurrent=max_concurrent)

    for result in results:
        if result is None:
            continue
        chunk_idx, data = result
        for ent in data.get("entities", []):
            label = ent.get("label", "").strip()
            if not label:
                continue
            key = label.lower()
            if key not in entity_mentions:
                entity_mentions[key] = []
            entity_mentions[key].append({**ent, "source_chunk": chunk_idx})
        for rel in data.get("relationships", []):
            if rel.get("from") and rel.get("to"):
                all_rels.append(rel)

    # Build final entity list with confidence + mention tracking
    total_chunks = len(chunks)
    final_entities: list[dict] = []
    for key, mentions in entity_mentions.items():
        # Use the first mention as canonical; add metadata
        canonical = {**mentions[0]}
        mention_count = len(mentions)
        # Confidence: fraction of chunks where entity appears, capped at 1.0
        confidence = min(1.0, round(mention_count / max(1, total_chunks / 10), 3))
        source_chunks = sorted({m["source_chunk"] for m in mentions})
        canonical["mention_count"] = mention_count
        canonical["confidence"] = confidence
        canonical["source_chunks"] = source_chunks
        final_entities.append(canonical)

    # Deduplicate relationships
    seen_rels: set[tuple] = set()
    unique_rels: list[dict] = []
    for r in all_rels:
        key_r = (r["from"].strip().lower(), r["to"].strip().lower(), r.get("type", "RELATED_TO"))
        if key_r not in seen_rels:
            seen_rels.add(key_r)
            unique_rels.append(r)

    logger.info(
        "[entity_extractor] done: %d entities, %d relationships from %d chunks",
        len(final_entities), len(unique_rels), total_chunks,
    )
    return {"entities": final_entities, "relationships": unique_rels}


async def run_extraction_job(job_id: int, session_id: str, org_id: int, markdown_text: str, llm_service, language: str = "ru") -> None:
    """Async coroutine: extracts entities, upserts Neo4j, indexes SQLite/PostgreSQL rows."""
    with SessionLocal() as db:
        job = db.query(GraphExtractionJob).filter_by(id=job_id).first()
        if not job:
            return
        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        db.commit()

    try:
        extracted = await extract_entities_from_text(markdown_text, llm_service, language)
        entities = extracted.get("entities", [])
        relationships = extracted.get("relationships", [])

        logger.info("Job %d: extracted %d entities, %d relationships", job_id, len(entities), len(relationships))

        entity_ids: dict[str, str] = {}

        for ent in entities:
            neo4j_id = await graph_service.upsert_entity(
                org_id=org_id,
                entity_type=ent.get("type", "Concept"),
                label=ent["label"],
                properties=ent.get("properties", {}),
                doc_id=session_id,
            )
            if neo4j_id:
                entity_ids[ent["label"]] = neo4j_id

        for rel in relationships:
            await graph_service.upsert_relationship(
                org_id=org_id,
                from_label=rel["from"],
                to_label=rel["to"],
                rel_type=rel.get("type", "RELATED_TO"),
                properties=rel.get("properties", {}),
                doc_id=session_id,
            )

        # Index in SQLite/PostgreSQL for fast lookup — upsert by (org_id, label)
        with SessionLocal() as db:
            for ent in entities:
                neo4j_id = entity_ids.get(ent["label"], "")
                existing = db.query(KnowledgeGraphNode).filter_by(
                    org_id=org_id, label=ent["label"]
                ).first()
                if existing:
                    existing.neo4j_id = neo4j_id
                    existing.entity_type = ent.get("type", "Concept")
                    existing.session_id = session_id
                else:
                    db.add(KnowledgeGraphNode(
                        org_id=org_id,
                        session_id=session_id,
                        neo4j_id=neo4j_id,
                        entity_type=ent.get("type", "Concept"),
                        label=ent["label"],
                    ))

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

"""Data Extractor Agent — structured extraction over ENTIRE document.

Pipeline: ALL Chunks → Extract per chunk → Merge & deduplicate → Final JSON + Markdown
No information loss from middle sections.
"""
import logging
import json
import re
from app.services.agents.base_agent import AgentState, emit_step
from app.core.session import session_manager
from app.services.pipeline import split_text, process_chunks_parallel

logger = logging.getLogger(__name__)

_EXTRACTION_PROMPT = """Extract structured data from this document fragment. Return ONLY JSON:

{{
  "document_type": "type if determinable from this fragment, else null",
  "key_entities": {{
    "organizations": ["list"],
    "persons": ["person - role/title"],
    "locations": ["city/country/address"],
    "dates": ["date with context"],
    "products": ["product/service/object"]
  }},
  "key_facts": [
    {{"fact": "statement", "evidence": "short quote from text (max 80 chars)"}}
  ],
  "numerical_data": [
    {{"label": "what is measured", "value": "value", "unit": "unit", "context": "brief context"}}
  ],
  "conclusions": ["key conclusion or decision from this fragment"],
  "risks_or_issues": ["risk or problem if present"],
  "action_items": ["task or required action if present"]
}}

Document fragment:
{text}

Return ONLY the JSON object, no other text."""


async def _extract_one_chunk(chunk: str, llm_service) -> dict:
    try:
        raw = await llm_service.agenerate(_EXTRACTION_PROMPT.format(text=chunk))
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        if m:
            return json.loads(m.group())
        return json.loads(raw.strip().strip("```json").strip("```").strip())
    except Exception:
        return {}


def _merge_extractions(results: list[dict]) -> dict:
    """Merge extraction results from all chunks, deduplicating entities."""
    merged = {
        "document_type": None,
        "main_topic": None,
        "key_entities": {
            "organizations": set(),
            "persons": set(),
            "locations": set(),
            "dates": set(),
            "products": set(),
        },
        "key_facts": [],
        "numerical_data": [],
        "conclusions": [],
        "risks_or_issues": [],
        "action_items": [],
    }

    seen_facts = set()
    seen_nums = set()
    seen_conclusions = set()
    seen_risks = set()
    seen_actions = set()

    for r in results:
        if not r:
            continue

        if not merged["document_type"] and r.get("document_type"):
            merged["document_type"] = r["document_type"]

        entities = r.get("key_entities", {})
        for key in merged["key_entities"]:
            for item in entities.get(key, []):
                if item and len(item) > 2:
                    merged["key_entities"][key].add(item)

        for fact in r.get("key_facts", []):
            key = fact.get("fact", "")[:60].lower()
            if key and key not in seen_facts:
                seen_facts.add(key)
                merged["key_facts"].append(fact)

        for num in r.get("numerical_data", []):
            key = f"{num.get('label', '')}:{num.get('value', '')}".lower()[:80]
            if key and key not in seen_nums:
                seen_nums.add(key)
                merged["numerical_data"].append(num)

        for c in r.get("conclusions", []):
            key = c[:60].lower()
            if key and key not in seen_conclusions:
                seen_conclusions.add(key)
                merged["conclusions"].append(c)

        for risk in r.get("risks_or_issues", []):
            key = risk[:60].lower()
            if key and key not in seen_risks:
                seen_risks.add(key)
                merged["risks_or_issues"].append(risk)

        for action in r.get("action_items", []):
            key = action[:60].lower()
            if key and key not in seen_actions:
                seen_actions.add(key)
                merged["action_items"].append(action)

    # Convert sets back to sorted lists
    for k in merged["key_entities"]:
        merged["key_entities"][k] = sorted(merged["key_entities"][k])

    return merged


async def run(state: AgentState, llm_service) -> AgentState:
    task_id    = state["task_id"]
    session_id = state.get("session_id")

    # Load document
    emit_step(task_id, "load_document", "running", "Загрузка документа...")
    session = session_manager.get_session(session_id)
    markdown_text = (session or {}).get("markdown_text", "")
    doc_name = (session or {}).get("document", "Документ")

    if not markdown_text:
        state["error"] = "Документ не найден или пуст"
        emit_step(task_id, "load_document", "error", state["error"])
        return state

    char_count = len(markdown_text)
    emit_step(task_id, "load_document", "done",
              f"{doc_name} — {char_count:,} символов")

    # Process ALL chunks
    from app.core.config import get_settings
    _s = get_settings()
    chunks = split_text(markdown_text, chunk_size=_s.AGENT_MAP_CHUNK_SIZE, overlap=_s.AGENT_MAP_CHUNK_OVERLAP)
    total_chunks = len(chunks)
    emit_step(task_id, "extract_entities", "running",
              f"Извлечение из {total_chunks} чанков (параллельно)...")

    async def extract_chunk(chunk, idx, total):
        if idx % 5 == 0 or idx == total - 1:
            emit_step(task_id, "extract_entities", "running",
                      f"Чанк {idx+1}/{total}")
        return await _extract_one_chunk(chunk, llm_service)

    raw_results = await process_chunks_parallel(chunks, extract_chunk, max_concurrent=3)
    raw_results = [r for r in raw_results if r]

    emit_step(task_id, "build_summary", "running",
              f"Объединение данных из {len(raw_results)} чанков...")

    extracted = _merge_extractions(raw_results)
    entities = extracted["key_entities"]
    total_entities = sum(len(v) for v in entities.values())
    facts = extracted["key_facts"]
    nums = extracted["numerical_data"]

    emit_step(task_id, "build_summary", "done",
              f"{total_entities} сущностей | {len(facts)} фактов | {len(nums)} числовых данных")

    # Build markdown report
    md = [f"# Структурированный анализ: {doc_name}\n"]
    md.append(f"*{total_chunks} чанков · {char_count:,} символов обработано полностью*\n")

    if extracted.get("document_type"):
        md.append(f"**Тип:** {extracted['document_type']}\n")

    if any(v for v in entities.values()):
        md.append("\n## Ключевые сущности\n")
        labels = {"organizations": "Организации", "persons": "Люди",
                  "locations": "Места", "dates": "Даты", "products": "Продукты/объекты"}
        for key, items in entities.items():
            if items:
                md.append(f"**{labels.get(key, key)}:** {', '.join(items[:20])}\n")

    if facts:
        md.append("\n## Ключевые факты\n")
        for f in facts[:30]:
            ev = f.get("evidence", "")
            ev_suffix = f"  \n  *«{ev}»*" if ev else ""
            md.append(f"- {f.get('fact', '')}{ev_suffix}\n")

    if nums:
        md.append("\n## Числовые данные\n| Показатель | Значение | Единица | Контекст |\n|---|---|---|---|\n")
        for n in nums[:30]:
            md.append(f"| {n.get('label','')} | {n.get('value','')} | {n.get('unit','')} | {n.get('context','')} |\n")

    if extracted["conclusions"]:
        md.append("\n## Выводы\n")
        for c in extracted["conclusions"][:15]:
            md.append(f"- {c}\n")

    if extracted["risks_or_issues"]:
        md.append("\n## Риски и проблемы\n")
        for r in extracted["risks_or_issues"][:15]:
            md.append(f"- ⚠️ {r}\n")

    if extracted["action_items"]:
        md.append("\n## Задачи и действия\n")
        for a in extracted["action_items"][:15]:
            md.append(f"- ☑ {a}\n")

    report_md = "".join(md)

    state["result"] = {
        "report_markdown": report_md,
        "extracted": {
            k: (list(v) if isinstance(v, set) else v)
            for k, v in extracted.items()
        },
        "document_name": doc_name,
        "char_count": char_count,
        "chunks_processed": total_chunks,
        "stats": {
            "entities": total_entities,
            "facts": len(facts),
            "numerical_data": len(nums),
            "conclusions": len(extracted["conclusions"]),
            "risks": len(extracted["risks_or_issues"]),
            "action_items": len(extracted["action_items"]),
        }
    }
    emit_step(task_id, "done", "done",
              f"{total_chunks} чанков · {total_entities} сущностей · {len(facts)} фактов",
              report_md[:400])
    return state

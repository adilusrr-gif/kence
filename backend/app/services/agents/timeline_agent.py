"""Timeline Engine Agent — extracts chronological events from ENTIRE document.

Pipeline: ALL Chunks → Extract dates/events per chunk → Sort → Deduplicate → Report
"""
import logging
import json
import re
from app.services.agents.base_agent import AgentState, emit_step
from app.services.pipeline import split_text, process_chunks_parallel

logger = logging.getLogger(__name__)

_TIMELINE_PROMPT = """Extract ALL dates, time periods, events, and milestones from this text.
Return ONLY JSON (no other text):

{{
  "events": [
    {{
      "date": "date or period (e.g. 2024-01-15, Q3 2023, 01.01.2024)",
      "date_sortable": "YYYY-MM-DD or YYYY-MM or YYYY (for sorting, use best estimate)",
      "event": "description of what happened",
      "type": "milestone|deadline|event|period|contract|payment|meeting|other",
      "evidence": "short quote from text (max 100 chars)"
    }}
  ]
}}

If no dates are found, return: {{"events": []}}

Text:
{text}"""


async def _extract_timeline_chunk(chunk: str, llm_service) -> list:
    try:
        raw = await llm_service.agenerate(_TIMELINE_PROMPT.format(text=chunk))
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        if m:
            data = json.loads(m.group())
            return data.get("events", [])
        return []
    except Exception as e:
        logger.warning("[timeline] chunk extraction failed: %s", e)
        return []


def _merge_and_sort_events(all_events: list[list]) -> list:
    """Flatten, deduplicate, and sort events chronologically."""
    flat = []
    seen = set()
    for events in all_events:
        if not events:
            continue
        for e in events:
            key = (e.get("date", ""), e.get("event", "")[:50].lower())
            if key not in seen and e.get("date") and e.get("event"):
                seen.add(key)
                flat.append(e)

    # Sort by date_sortable, put undated events at end
    def sort_key(e):
        ds = e.get("date_sortable", "")
        if ds and re.match(r'\d{4}', ds):
            return ds.ljust(10, "0")
        return "9999-99-99"

    return sorted(flat, key=sort_key)


async def run(state: AgentState, llm_service) -> AgentState:
    task_id    = state["task_id"]
    session_id = state.get("session_id")

    # Load document
    emit_step(task_id, "load_document", "running", "Загрузка документа...")
    from app.core.session import session_manager
    session = session_manager.get_session(session_id)
    markdown_text = (session or {}).get("markdown_text", "")
    doc_name = (session or {}).get("document", "Документ")

    if not markdown_text:
        state["error"] = "Документ не найден"
        emit_step(task_id, "load_document", "error", state["error"])
        return state

    char_count = len(markdown_text)
    emit_step(task_id, "load_document", "done", f"{doc_name} — {char_count:,} символов")

    # Extract events from ALL chunks
    chunks = split_text(markdown_text, chunk_size=5000, overlap=300)
    total_chunks = len(chunks)
    emit_step(task_id, "extract_events", "running",
              f"Извлечение событий из {total_chunks} чанков...")

    async def extract_one(chunk, idx, total):
        emit_step(task_id, "extract_events", "running", f"Чанк {idx+1}/{total}")
        return await _extract_timeline_chunk(chunk, llm_service)

    raw_results = await process_chunks_parallel(chunks, extract_one, max_concurrent=3)
    timeline = _merge_and_sort_events(raw_results)

    emit_step(task_id, "sort_timeline", "running",
              f"Сортировка {len(timeline)} событий...")

    # Build report
    date_range = {"from": None, "to": None}
    if timeline:
        dated = [e for e in timeline if e.get("date_sortable", "") and re.match(r'\d{4}', e.get("date_sortable", ""))]
        if dated:
            date_range["from"] = dated[0].get("date")
            date_range["to"] = dated[-1].get("date")

    md = [f"# Хронология: {doc_name}\n"]
    md.append(f"*{total_chunks} чанков · {len(timeline)} событий*\n")
    if date_range["from"] and date_range["to"]:
        md.append(f"**Период:** {date_range['from']} → {date_range['to']}\n")
    md.append("\n## Хронологическая шкала\n")

    type_emoji = {
        "milestone": "🏆", "deadline": "⏰", "payment": "💰",
        "contract": "📝", "meeting": "🤝", "period": "📅",
        "event": "📌", "other": "•",
    }

    current_year = None
    for e in timeline:
        year = (e.get("date_sortable") or "")[:4]
        if year and year != current_year and re.match(r'\d{4}', year):
            md.append(f"\n### {year}\n")
            current_year = year
        emoji = type_emoji.get(e.get("type", "other"), "•")
        evidence = e.get("evidence", "")
        line = f"- **{e['date']}** {emoji} {e['event']}"
        if evidence:
            line += f"  \n  *«{evidence}»*"
        md.append(line + "\n")

    report_md = "".join(md)

    emit_step(task_id, "sort_timeline", "done",
              f"{len(timeline)} событий, период: {date_range['from']} → {date_range['to']}")

    state["result"] = {
        "report_markdown": report_md,
        "timeline": timeline,
        "total_events": len(timeline),
        "date_range": date_range,
        "document_name": doc_name,
        "chunks_processed": total_chunks,
        "event_types": list({e.get("type", "other") for e in timeline}),
    }
    emit_step(task_id, "done", "done",
              f"{len(timeline)} событий из {total_chunks} чанков", report_md[:400])
    return state

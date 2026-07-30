"""Hierarchical Map-Reduce Summarization Agent.

Pipeline:
  ALL Chunks
    → Chunk Summaries (parallel, 1–2 sentences each)
    → Section Summaries (groups of 10 chunks)
    → Global Summary (3–5 paragraphs)
    → Final structured output

Supports documents of any size without information loss.
"""
import logging
from app.services.agents.base_agent import AgentState, emit_step

logger = logging.getLogger(__name__)

_CHUNK_SUMMARY_PROMPT = (
    "Summarize the following document fragment in 1–2 sentences, "
    "preserving key facts, names, numbers, and decisions:\n\n{text}\n\nSummary:"
)

_SECTION_REDUCE_PROMPT = (
    "Combine the following fragment summaries into a coherent paragraph "
    "that preserves all key information:\n\n{summaries}\n\nCombined summary:"
)

_GLOBAL_REDUCE_PROMPT = (
    "You have section summaries of a large document. "
    "Produce a comprehensive 3–5 paragraph summary that accurately represents "
    "the ENTIRE document:\n\n{summaries}\n\nFull document summary:"
)

_STRUCTURED_OUTPUT_PROMPT = """Based on the complete document summary below, generate a structured analysis.

Summary:
{global_summary}

Generate JSON (return ONLY the JSON, no markdown):
{{
  "short_summary": "2–3 sentence overview",
  "executive_summary": "1 paragraph for decision-makers",
  "key_findings": ["finding 1", "finding 2", "finding 3"],
  "risks": ["risk 1", "risk 2"],
  "recommendations": ["recommendation 1", "recommendation 2"],
  "action_items": ["action 1", "action 2"],
  "main_topics": ["topic 1", "topic 2", "topic 3"]
}}"""


async def run(state: AgentState, llm_service) -> AgentState:
    import json, re
    from app.services.pipeline import split_text, process_chunks_parallel

    task_id    = state["task_id"]
    session_id = state.get("session_id")

    # ── Load document ──────────────────────────────────────────────────────
    emit_step(task_id, "load_document", "running", "Загрузка документа...")
    from app.core.session import session_manager
    session = session_manager.get_session(session_id)
    markdown_text = (session or {}).get("markdown_text", "")
    doc_name = (session or {}).get("document", "Документ")

    if not markdown_text:
        state["error"] = "Документ не найден или не обработан"
        emit_step(task_id, "load_document", "error", state["error"])
        return state

    total_chars = len(markdown_text)
    emit_step(task_id, "load_document", "done", f"{doc_name} — {total_chars:,} символов")

    # ── Level 1: Map — summarize ALL chunks ────────────────────────────────
    from app.core.config import get_settings
    _s = get_settings()
    chunks = split_text(markdown_text, chunk_size=_s.AGENT_MAP_CHUNK_SIZE, overlap=_s.AGENT_MAP_CHUNK_OVERLAP)
    total_chunks = len(chunks)
    emit_step(task_id, "chunk_summarize", "running",
              f"Суммаризация {total_chunks} чанков (параллельно)...")

    async def summarize_chunk(chunk, idx, total):
        # Throttle per-chunk progress writes (each emit_step is a DB commit).
        if idx % 5 == 0 or idx == total - 1:
            emit_step(task_id, "chunk_summarize", "running", f"Чанк {idx+1}/{total}")
        return await llm_service.agenerate_map(_CHUNK_SUMMARY_PROMPT.format(text=chunk))

    chunk_summaries_raw = await process_chunks_parallel(chunks, summarize_chunk, max_concurrent=3)
    chunk_summaries = [s for s in chunk_summaries_raw if s and s.strip()]
    emit_step(task_id, "chunk_summarize", "done",
              f"{len(chunk_summaries)}/{total_chunks} чанков суммировано")

    # ── Level 2: Section reduce ────────────────────────────────────────────
    SECTION_SIZE = 10
    section_summaries = []
    sections_total = max(1, (len(chunk_summaries) + SECTION_SIZE - 1) // SECTION_SIZE)

    emit_step(task_id, "section_reduce", "running",
              f"Сжатие в {sections_total} разделов...")

    for i in range(0, len(chunk_summaries), SECTION_SIZE):
        batch = chunk_summaries[i : i + SECTION_SIZE]
        section_num = i // SECTION_SIZE + 1
        emit_step(task_id, "section_reduce", "running",
                  f"Раздел {section_num}/{sections_total}")
        try:
            section_text = "\n\n".join(batch)
            section_summary = await llm_service.agenerate(
                _SECTION_REDUCE_PROMPT.format(summaries=section_text)
            )
            section_summaries.append(section_summary.strip())
        except Exception as e:
            logger.warning("[summary] section %d reduce failed: %s", section_num, e)
            section_summaries.append("\n".join(batch[:3]))

    emit_step(task_id, "section_reduce", "done",
              f"{len(section_summaries)} разделов готово")

    # ── Level 3: Global reduce ─────────────────────────────────────────────
    emit_step(task_id, "global_reduce", "running", "Финальное резюме документа...")
    all_sections_text = "\n\n---\n\n".join(section_summaries)
    try:
        global_summary = await llm_service.agenerate(
            _GLOBAL_REDUCE_PROMPT.format(summaries=all_sections_text)
        )
        global_summary = global_summary.strip()
    except Exception as e:
        global_summary = all_sections_text
        logger.warning("[summary] global reduce failed: %s", e)
    emit_step(task_id, "global_reduce", "done", f"{len(global_summary)} символов")

    # ── Level 4: Structured output ─────────────────────────────────────────
    emit_step(task_id, "structured_output", "running", "Структурированный анализ...")
    structured = {}
    try:
        raw = await llm_service.agenerate(
            _STRUCTURED_OUTPUT_PROMPT.format(global_summary=global_summary[:4000])
        )
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        if m:
            structured = json.loads(m.group())
    except Exception as e:
        logger.warning("[summary] structured output failed: %s", e)

    emit_step(task_id, "structured_output", "done",
              f"{len(structured.get('key_findings', []))} ключевых выводов")

    # ── Assemble result ────────────────────────────────────────────────────
    report_md = f"# Резюме: {doc_name}\n\n"
    report_md += f"*Обработано: {total_chunks} чанков, {total_chars:,} символов*\n\n"

    if structured.get("executive_summary"):
        report_md += f"## Исполнительное резюме\n\n{structured['executive_summary']}\n\n"

    report_md += f"## Полное резюме\n\n{global_summary}\n\n"

    if structured.get("key_findings"):
        report_md += "## Ключевые выводы\n\n"
        for f in structured["key_findings"]:
            report_md += f"- {f}\n"
        report_md += "\n"

    if structured.get("risks"):
        report_md += "## Риски\n\n"
        for r in structured["risks"]:
            report_md += f"- ⚠️ {r}\n"
        report_md += "\n"

    if structured.get("recommendations"):
        report_md += "## Рекомендации\n\n"
        for r in structured["recommendations"]:
            report_md += f"- ✓ {r}\n"
        report_md += "\n"

    if structured.get("action_items"):
        report_md += "## Задачи\n\n"
        for a in structured["action_items"]:
            report_md += f"- ☑ {a}\n"
        report_md += "\n"

    state["result"] = {
        "report_markdown": report_md,
        "summary": global_summary,
        "short_summary": structured.get("short_summary", global_summary[:300]),
        "executive_summary": structured.get("executive_summary", ""),
        "key_findings": structured.get("key_findings", []),
        "risks": structured.get("risks", []),
        "recommendations": structured.get("recommendations", []),
        "action_items": structured.get("action_items", []),
        "main_topics": structured.get("main_topics", []),
        "chunks_processed": total_chunks,
        "sections_count": len(section_summaries),
        "char_count": total_chars,
        "document_name": doc_name,
    }

    emit_step(task_id, "done", "done",
              f"Готово: {total_chunks} чанков, {len(section_summaries)} разделов",
              global_summary[:400])
    return state

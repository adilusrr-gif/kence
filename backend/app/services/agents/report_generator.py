"""Report Generator Agent — structured multi-section report over ENTIRE document.

Uses:
- stratified_sample for outline planning (covers full doc)
- HybridRetriever for per-section content (RAG-based, not prefix-based)
- stratified_sample for executive summary
"""
import logging
from app.services.agents.base_agent import AgentState, emit_step
from app.services.pipeline import stratified_sample

logger = logging.getLogger(__name__)


async def run(state: AgentState, llm_service) -> AgentState:
    task_id    = state["task_id"]
    session_id = state.get("session_id")
    instructions = state.get("instructions", "Создай подробный отчёт по документу")

    emit_step(task_id, "outline", "running", "Создание структуры отчёта...")
    from app.core.session import session_manager
    session = session_manager.get_session(session_id)
    markdown_text = (session or {}).get("markdown_text", "")
    doc_name = (session or {}).get("document", "Документ")

    if not markdown_text:
        state["error"] = "Документ не найден"
        emit_step(task_id, "outline", "error", state["error"])
        return state

    char_count = len(markdown_text)
    emit_step(task_id, "outline", "running",
              f"{doc_name} — {char_count:,} символов")

    # ── Generate outline using stratified sample (covers full doc) ─────────
    try:
        import json
        # stratified_sample gives a cross-section: start, 25%, 50%, 75%, end
        outline_context = stratified_sample(markdown_text, target_chars=10000, n_parts=5)
        outline_prompt = (
            f"На основе следующей репрезентативной выборки документа составь план отчёта "
            f"(5-7 разделов) в формате JSON:\n"
            f'{{\"sections\": [\"Заголовок раздела 1\", \"Заголовок раздела 2\", ...]}}\n\n'
            f"Инструкции: {instructions}\n\n"
            f"Документ ({char_count:,} симв., стратифицированная выборка):\n{outline_context}"
        )
        outline_raw = await llm_service.agenerate(outline_prompt)
        clean = outline_raw.strip().strip("```json").strip("```").strip()
        import re
        m = re.search(r'\{.*\}', clean, re.DOTALL)
        if m:
            outline = json.loads(m.group())
        else:
            outline = json.loads(clean)
        sections = outline.get("sections", ["Введение", "Основные положения", "Анализ", "Выводы", "Рекомендации"])
        emit_step(task_id, "outline", "done", f"Разделов: {len(sections)}")
    except Exception as e:
        sections = ["Введение", "Основные положения", "Анализ", "Выводы", "Рекомендации"]
        emit_step(task_id, "outline", "error", f"Стандартная структура: {e}")

    # ── Write each section using RAG retrieval ─────────────────────────────
    written_sections = {}
    for section in sections:
        emit_step(task_id, "section_write", "running", f"Пишу раздел: {section}")
        try:
            # Use HybridRetriever to get relevant content for this section
            try:
                from app.services.retriever import HybridRetriever
                retriever = HybridRetriever(session_id)
                chunks = retriever.retrieve(section, k=6)
                section_context = "\n\n".join(c.page_content for c in chunks)
            except Exception:
                # Fallback: stratified sample for this section
                section_context = stratified_sample(markdown_text, target_chars=6000, n_parts=4)

            section_prompt = (
                f"Напиши раздел '{section}' для отчёта на основе контекста документа.\n\n"
                f"Инструкции: {instructions}\n\n"
                f"Контекст (релевантные фрагменты):\n{section_context}\n\n"
                f"Раздел '{section}':"
            )
            section_text = await llm_service.agenerate(section_prompt)
            written_sections[section] = section_text.strip()
            emit_step(task_id, "section_write", "done", f"'{section}' написан")
        except Exception as e:
            written_sections[section] = f"[Ошибка генерации: {e}]"
            emit_step(task_id, "section_write", "error", str(e))

    # ── Executive summary via stratified sample ────────────────────────────
    emit_step(task_id, "executive_summary", "running", "Исполнительное резюме...")
    executive_summary = ""
    try:
        exec_context = stratified_sample(markdown_text, target_chars=8000, n_parts=5)
        exec_prompt = (
            f"Напиши ИСПОЛНИТЕЛЬНОЕ РЕЗЮМЕ (3-4 предложения) документа '{doc_name}'.\n"
            f"Укажи: главную цель, ключевые результаты/выводы, критические детали.\n\n"
            f"Документ ({char_count:,} симв., стратифицированная выборка):\n{exec_context}"
            f"\n\nИсполнительное резюме:"
        )
        executive_summary = await llm_service.agenerate(exec_prompt)
        executive_summary = executive_summary.strip()
        emit_step(task_id, "executive_summary", "done", f"{len(executive_summary)} символов")
    except Exception as e:
        emit_step(task_id, "executive_summary", "error", str(e))

    # ── Assemble ───────────────────────────────────────────────────────────
    emit_step(task_id, "assemble", "running", "Сборка отчёта...")
    report_parts = [
        f"# Отчёт по документу: {doc_name}\n",
        f"*Объём: {char_count:,} символов | Инструкции: {instructions}*\n",
    ]
    if executive_summary:
        report_parts.append(f"\n## 📋 Исполнительное резюме\n\n{executive_summary}\n")
        report_parts.append("\n---\n")
    for section, content in written_sections.items():
        report_parts.append(f"\n## {section}\n\n{content}")

    full_report = "\n".join(report_parts)
    emit_step(task_id, "assemble", "done",
              f"Отчёт: {len(full_report):,} символов, {len(sections)} разделов")

    state["result"] = {
        "report_markdown": full_report,
        "executive_summary": executive_summary,
        "sections": list(written_sections.keys()),
        "document_name": doc_name,
        "char_count": char_count,
        "sections_count": len(sections),
    }
    emit_step(task_id, "done", "done",
              f"{len(sections)} разделов, {len(full_report):,} символов",
              full_report[:500])
    return state

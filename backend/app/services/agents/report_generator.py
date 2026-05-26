"""Report Generator Agent — creates a structured multi-section report."""
import logging
from app.services.agents.base_agent import AgentState, emit_step

logger = logging.getLogger(__name__)


async def run(state: AgentState, llm_service) -> AgentState:
    task_id = state["task_id"]
    session_id = state.get("session_id")
    instructions = state.get("instructions", "Создай подробный отчёт по документу")

    emit_step(task_id, "outline", "running", "Создание структуры отчёта...")
    from app.core.session import session_manager
    session = session_manager.get_session(session_id)
    markdown_text = (session or {}).get("markdown_text", "")
    if not markdown_text:
        state["error"] = "Документ не найден"
        emit_step(task_id, "outline", "error", state["error"])
        return state

    try:
        outline_prompt = (
            f"На основе следующего документа составь план отчёта (5-7 разделов) в формате JSON:\n"
            f"{{\"sections\": [\"Заголовок раздела 1\", \"Заголовок раздела 2\", ...]}}\n\n"
            f"Инструкции: {instructions}\n\nДокумент (первые 4000 символов):\n{markdown_text[:4000]}"
        )
        outline_raw = await llm_service.agenerate(outline_prompt)
        import json
        clean = outline_raw.strip().strip("```").strip()
        outline = json.loads(clean)
        sections = outline.get("sections", ["Введение", "Основные положения", "Анализ", "Выводы", "Рекомендации"])
        emit_step(task_id, "outline", "done", f"Разделов: {len(sections)}")
    except Exception as e:
        sections = ["Введение", "Основные положения", "Анализ", "Выводы"]
        emit_step(task_id, "outline", "error", f"Используется стандартная структура: {e}")

    # Write each section
    written_sections = {}
    for section in sections:
        emit_step(task_id, "section_write", "running", f"Пишу раздел: {section}")
        try:
            section_prompt = (
                f"Напиши раздел '{section}' для отчёта на основе документа.\n\n"
                f"Контекст документа:\n{markdown_text[:6000]}\n\n"
                f"Инструкции: {instructions}\n\nРаздел '{section}':"
            )
            section_text = await llm_service.agenerate(section_prompt)
            written_sections[section] = section_text
            emit_step(task_id, "section_write", "done", f"'{section}' написан")
        except Exception as e:
            written_sections[section] = f"[Ошибка генерации: {e}]"
            emit_step(task_id, "section_write", "error", str(e))

    # Assemble
    emit_step(task_id, "assemble", "running", "Сборка отчёта...")
    doc_name = (session or {}).get("document_name", "Документ")
    report_parts = [f"# Отчёт по документу: {doc_name}\n"]
    for section, content in written_sections.items():
        report_parts.append(f"\n## {section}\n\n{content}")
    full_report = "\n".join(report_parts)
    emit_step(task_id, "assemble", "done", f"Отчёт: {len(full_report)} символов")

    state["result"] = {
        "report_markdown": full_report,
        "sections": list(written_sections.keys()),
        "document_name": doc_name,
    }
    emit_step(task_id, "done", "done", "", full_report[:500] + "...")
    return state

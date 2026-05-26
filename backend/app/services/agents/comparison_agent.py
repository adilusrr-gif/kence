"""Comparison Agent — semantic + technical comparison of two documents in a session."""
import logging
from app.services.agents.base_agent import AgentState, emit_step
from app.services.comparison import ComparisonService

logger = logging.getLogger(__name__)


async def run(state: AgentState, llm_service) -> AgentState:
    task_id = state["task_id"]
    session_id = state.get("session_id")

    emit_step(task_id, "retrieve_doc1", "running", "Загрузка первого документа...")
    from app.core.session import session_manager
    session = session_manager.get_session(session_id)
    if not session:
        state["error"] = "Сессия не найдена"
        emit_step(task_id, "retrieve_doc1", "error", state["error"])
        return state

    text1 = session.get("markdown_text", "")
    text2 = session.get("markdown_text_2", "")
    emit_step(task_id, "retrieve_doc1", "done", f"{len(text1)} символов")

    emit_step(task_id, "retrieve_doc2", "running", "Загрузка второго документа...")
    if not text2:
        state["error"] = "Второй документ не найден. Загрузите два документа через Compare."
        emit_step(task_id, "retrieve_doc2", "error", state["error"])
        return state
    emit_step(task_id, "retrieve_doc2", "done", f"{len(text2)} символов")

    emit_step(task_id, "semantic_compare", "running", "Смысловое сравнение...")
    try:
        svc = ComparisonService()
        semantic_result = await svc.semantic_compare_async(text1, text2, llm_service)
        emit_step(task_id, "semantic_compare", "done", "Смысловое сравнение завершено")
    except Exception as e:
        semantic_result = {"error": str(e)}
        emit_step(task_id, "semantic_compare", "error", str(e))

    emit_step(task_id, "technical_extract", "running", "Техническое сравнение...")
    try:
        technical_result = await svc.technical_compare_async(text1, text2, llm_service)
        emit_step(task_id, "technical_extract", "done", "Техническое сравнение завершено")
    except Exception as e:
        technical_result = {"error": str(e)}
        emit_step(task_id, "technical_extract", "error", str(e))

    emit_step(task_id, "synthesize", "running", "Итоговый синтез...")
    try:
        synthesis_prompt = (
            f"Подведи итог сравнения двух документов на основе результатов:\n\n"
            f"Смысловое: {str(semantic_result)[:2000]}\n\n"
            f"Техническое: {str(technical_result)[:2000]}\n\n"
            "Дай краткое резюме в 3-5 предложений."
        )
        synthesis = await llm_service.agenerate(synthesis_prompt)
        state["result"] = {
            "semantic": semantic_result,
            "technical": technical_result,
            "synthesis": synthesis,
        }
        emit_step(task_id, "synthesize", "done", "", synthesis)
    except Exception as e:
        state["error"] = str(e)
        emit_step(task_id, "synthesize", "error", str(e))

    return state

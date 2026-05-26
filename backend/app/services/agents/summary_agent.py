"""Summary Agent — map-reduce summarization of a document."""
import logging
from app.services.agents.base_agent import AgentState, emit_step

logger = logging.getLogger(__name__)
CHUNK_SIZE = 4000


async def run(state: AgentState, llm_service) -> AgentState:
    task_id = state["task_id"]
    session_id = state.get("session_id")

    # Step 1: Load full text
    emit_step(task_id, "retrieve_full_text", "running", "Загрузка текста документа...")
    from app.core.session import session_manager
    session = session_manager.get_session(session_id)
    markdown_text = (session or {}).get("markdown_text", "")
    if not markdown_text:
        state["error"] = "Документ не найден или не обработан"
        emit_step(task_id, "retrieve_full_text", "error", state["error"])
        return state
    emit_step(task_id, "retrieve_full_text", "done", f"{len(markdown_text)} символов")

    # Step 2: Map — chunk summarize
    emit_step(task_id, "chunk_summarize", "running", "Суммаризация по частям...")
    chunks = [markdown_text[i:i + CHUNK_SIZE] for i in range(0, len(markdown_text), CHUNK_SIZE)]
    chunk_summaries = []
    for idx, chunk in enumerate(chunks[:8]):  # limit to 8 chunks
        try:
            summary = await llm_service.agenerate(
                f"Кратко суммируй следующий фрагмент документа (1-3 предложения):\n\n{chunk}"
            )
            chunk_summaries.append(summary)
            emit_step(task_id, "chunk_summarize", "running", f"Часть {idx + 1}/{min(len(chunks), 8)} обработана")
        except Exception as e:
            logger.error("chunk summarize error: %s", e)
    emit_step(task_id, "chunk_summarize", "done", f"{len(chunk_summaries)} частей суммировано")

    # Step 3: Reduce — merge summaries
    emit_step(task_id, "merge_summaries", "running", "Объединение резюме...")
    merged_input = "\n\n".join(chunk_summaries)
    try:
        final_summary = await llm_service.agenerate(
            f"На основе следующих резюме частей документа создай связное итоговое резюме (3-5 абзацев):\n\n{merged_input}"
        )
        state["result"] = {"summary": final_summary, "chunk_count": len(chunk_summaries)}
        emit_step(task_id, "merge_summaries", "done", "", final_summary)
    except Exception as e:
        state["error"] = str(e)
        emit_step(task_id, "merge_summaries", "error", str(e))

    return state

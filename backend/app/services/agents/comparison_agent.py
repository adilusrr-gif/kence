"""Comparison Agent — semantic + technical comparison of two documents in a session.

Fixed: was using non-existent ComparisonService.async_methods.
Now uses the synchronous comparator via asyncio.to_thread for non-blocking execution.
"""
import asyncio
import logging
from app.services.agents.base_agent import AgentState, emit_step

logger = logging.getLogger(__name__)


async def run(state: AgentState, llm_service) -> AgentState:
    task_id    = state["task_id"]
    session_id = state.get("session_id")

    # Load documents
    emit_step(task_id, "retrieve_doc1", "running", "Загрузка первого документа...")
    from app.core.session import session_manager
    session = session_manager.get_session(session_id)
    if not session:
        state["error"] = "Сессия не найдена"
        emit_step(task_id, "retrieve_doc1", "error", state["error"])
        return state

    text1 = session.get("markdown_text", "")
    emit_step(task_id, "retrieve_doc1", "done", f"{len(text1):,} символов")

    emit_step(task_id, "retrieve_doc2", "running", "Загрузка второго документа...")
    text2 = session.get("markdown_text_2", "")
    if not text2:
        state["error"] = "Второй документ не найден. Загрузите два документа через Compare."
        emit_step(task_id, "retrieve_doc2", "error", state["error"])
        return state
    emit_step(task_id, "retrieve_doc2", "done", f"{len(text2):,} символов")

    # We need file paths for the comparator methods that use Docling.
    # If comparison_docs are stored, use them; otherwise build in-memory comparison via LLM.
    comparison_docs = session.get("comparison_docs", {})
    doc1_path = comparison_docs.get("doc1")
    doc2_path = comparison_docs.get("doc2")

    semantic_result: dict = {}
    technical_result: dict = {}

    # Semantic comparison
    emit_step(task_id, "semantic_compare", "running", "Смысловое сравнение...")
    try:
        if doc1_path and doc2_path:
            from app.services.comparison import comparator
            semantic_result = await asyncio.to_thread(
                comparator.compare_semantic, doc1_path, doc2_path
            )
        else:
            # Fallback: LLM-based comparison on stored markdown
            from app.services.pipeline import stratified_sample
            s1 = stratified_sample(text1, 6000, 4)
            s2 = stratified_sample(text2, 6000, 4)
            answer = await llm_service.agenerate(
                f"Сравни два документа по смыслу. Опиши общие темы и различия.\n\n"
                f"Документ 1:\n{s1}\n\nДокумент 2:\n{s2}\n\nСравнение:"
            )
            semantic_result = {"comparison_type": "semantic_llm", "analysis": answer}
        emit_step(task_id, "semantic_compare", "done",
                  f"Похожих фрагментов: {len(semantic_result.get('similarities', []))}")
    except Exception as e:
        logger.error("[comparison_agent] semantic_compare failed: %s", e)
        semantic_result = {"error": str(e)}
        emit_step(task_id, "semantic_compare", "error", str(e))

    # Technical comparison
    emit_step(task_id, "technical_extract", "running", "Техническое сравнение...")
    try:
        if doc1_path and doc2_path:
            from app.services.comparison import comparator
            technical_result = await asyncio.to_thread(
                comparator.compare_technical_specs, doc1_path, doc2_path
            )
        else:
            from app.services.pipeline import stratified_sample
            s1 = stratified_sample(text1, 8000, 4)
            s2 = stratified_sample(text2, 8000, 4)
            answer = await llm_service.agenerate(
                f"Сравни технические характеристики двух документов.\n\n"
                f"Документ 1:\n{s1}\n\nДокумент 2:\n{s2}\n\nСравнение:"
            )
            technical_result = {"comparison_type": "technical_llm", "analysis": answer}
        emit_step(task_id, "technical_extract", "done",
                  f"Совпадение: {technical_result.get('match_percentage', '—')}%")
    except Exception as e:
        logger.error("[comparison_agent] technical_compare failed: %s", e)
        technical_result = {"error": str(e)}
        emit_step(task_id, "technical_extract", "error", str(e))

    # Synthesis
    emit_step(task_id, "synthesize", "running", "Итоговый синтез...")
    try:
        sem_summary = str(semantic_result.get("verdict") or semantic_result.get("analysis") or semantic_result)[:1500]
        tech_summary = str(technical_result.get("match_percentage") or technical_result.get("analysis") or technical_result)[:1500]
        synthesis_prompt = (
            f"Подведи итог сравнения двух документов:\n\n"
            f"Смысловое: {sem_summary}\n\n"
            f"Техническое: {tech_summary}\n\n"
            f"Дай краткое резюме в 3-5 предложений."
        )
        synthesis = await llm_service.agenerate(synthesis_prompt)
        state["result"] = {
            "semantic": semantic_result,
            "technical": technical_result,
            "synthesis": synthesis.strip(),
        }
        emit_step(task_id, "synthesize", "done", "", synthesis[:300])
    except Exception as e:
        logger.error("[comparison_agent] synthesize failed: %s", e)
        state["error"] = str(e)
        emit_step(task_id, "synthesize", "error", str(e))

    return state

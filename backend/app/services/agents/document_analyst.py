"""Document Analyst Agent — deep analytical Q&A on a single document."""
import logging
from app.services.agents.base_agent import AgentState, emit_step
from app.core.session import session_manager

logger = logging.getLogger(__name__)


async def run(state: AgentState, llm_service) -> AgentState:
    task_id = state["task_id"]
    session_id = state.get("session_id")
    question = state.get("question", "Summarize the document")
    org_id = state.get("org_id")

    # Step 1: Retrieve context
    emit_step(task_id, "retrieve_context", "running", "Поиск релевантных фрагментов...")
    chunks = []
    try:
        from app.services.retriever import HybridRetriever
        retriever = HybridRetriever(session_id)
        chunks = retriever.retrieve(question, k=6)
        context = "\n\n".join([c.page_content for c in chunks])
        state["context"] = context
        emit_step(task_id, "retrieve_context", "done", f"Найдено {len(chunks)} фрагментов")
    except Exception as e:
        context = ""
        state["context"] = ""
        emit_step(task_id, "retrieve_context", "error", str(e))

    # Step 2: Inject graph context if org_id present
    if org_id:
        emit_step(task_id, "inject_graph_context", "running", "Запрос к Knowledge Graph...")
        try:
            from app.services.graph_service import graph_rag_context
            entities = question.split()[:5]
            graph_ctx = await graph_rag_context(org_id, entities)
            state["graph_context"] = graph_ctx
            emit_step(task_id, "inject_graph_context", "done", f"Добавлен граф-контекст ({len(graph_ctx)} симв.)")
        except Exception as e:
            state["graph_context"] = ""
            emit_step(task_id, "inject_graph_context", "error", str(e))

    # Step 3: Generate analytical answer with key points
    emit_step(task_id, "call_llm", "running", "Генерация аналитического ответа...")
    full_context = (state.get("graph_context") or "") + "\n\n" + (state.get("context") or "")
    prompt = (
        f"Ты — аналитик документов. На основе контекста дай развёрнутый ответ на вопрос.\n\n"
        f"Контекст из документа:\n{full_context}\n\n"
        f"Вопрос: {question}\n\n"
        f"Требования к ответу:\n"
        f"1. Сначала дай прямой ответ (1-2 предложения)\n"
        f"2. Затем подробный анализ с ключевыми деталями\n"
        f"3. Если есть числа, даты, имена — укажи их точно\n"
        f"4. В конце добавь раздел **Ключевые факты:** (3-5 пунктов)\n\n"
        f"Ответ:"
    )
    try:
        answer = await llm_service.agenerate(prompt)
        emit_step(task_id, "call_llm", "done", f"{len(answer)} символов", answer)
    except Exception as e:
        state["error"] = str(e)
        emit_step(task_id, "call_llm", "error", str(e))
        return state

    # Step 4: Extract topic & confidence
    emit_step(task_id, "meta_analysis", "running", "Определяю темы и уверенность...")
    try:
        meta_prompt = (
            f"Проанализируй ответ и выдай JSON:\n"
            f"{{\"topics\": [\"тема1\", \"тема2\"], "
            f"\"confidence\": \"high|medium|low\", "
            f"\"answer_type\": \"factual|analytical|opinion|not_found\"}}\n\n"
            f"Контекст: {full_context[:1500]}\n"
            f"Вопрос: {question}\n"
            f"Ответ: {answer[:1000]}\n\nJSON:"
        )
        import json, re
        meta_raw = await llm_service.agenerate(meta_prompt)
        json_match = re.search(r'\{.*\}', meta_raw, re.DOTALL)
        meta = json.loads(json_match.group()) if json_match else {}
        emit_step(task_id, "meta_analysis", "done",
                  f"Темы: {', '.join(meta.get('topics', [])[:3])} | "
                  f"Уверенность: {meta.get('confidence', '—')}")
    except Exception:
        meta = {}
        emit_step(task_id, "meta_analysis", "done", "Метаданные недоступны")

    # Retrieve source snippets for transparency
    sources = [
        {"text": c.page_content[:200], "source": c.metadata.get("source", "")}
        for c in chunks
    ] if chunks else []

    state["result"] = {
        "answer": answer,
        "question": question,
        "topics": meta.get("topics", []),
        "confidence": meta.get("confidence", "medium"),
        "answer_type": meta.get("answer_type", "analytical"),
        "sources_used": len(sources),
        "sources": sources[:5],
    }
    return state

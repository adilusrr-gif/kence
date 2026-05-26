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

    # Step 3: Call LLM
    emit_step(task_id, "call_llm", "running", "Генерация ответа...")
    full_context = (state.get("graph_context") or "") + "\n\n" + (state.get("context") or "")
    prompt = (
        f"На основе следующего контекста из документа ответь на вопрос.\n\n"
        f"Контекст:\n{full_context}\n\n"
        f"Вопрос: {question}\n\nОтвет:"
    )
    try:
        answer = await llm_service.agenerate(prompt)
        state["result"] = {"answer": answer, "question": question}
        emit_step(task_id, "call_llm", "done", "", answer)
    except Exception as e:
        state["error"] = str(e)
        emit_step(task_id, "call_llm", "error", str(e))

    return state

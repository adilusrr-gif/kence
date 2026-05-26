"""Research Agent — multi-document corpus research from org library."""
import logging
from app.services.agents.base_agent import AgentState, emit_step

logger = logging.getLogger(__name__)


async def run(state: AgentState, llm_service) -> AgentState:
    task_id = state["task_id"]
    org_id = state.get("org_id")
    question = state.get("question", "Что содержится в корпусе документов?")

    if not org_id:
        state["error"] = "org_id обязателен для исследования корпуса"
        emit_step(task_id, "search_library", "error", state["error"])
        return state

    # Step 1: Search library
    emit_step(task_id, "search_library", "running", "Поиск в библиотеке организации...")
    from app.services.library_service import search_library
    try:
        docs = search_library(org_id, question[:50], tags=None)
        emit_step(task_id, "search_library", "done", f"Найдено {len(docs)} документов")
    except Exception as e:
        state["error"] = str(e)
        emit_step(task_id, "search_library", "error", str(e))
        return state

    if not docs:
        state["result"] = {"answer": "Библиотека организации пуста или не содержит подходящих документов."}
        emit_step(task_id, "done", "done", "", state["result"]["answer"])
        return state

    # Step 2: Select relevant docs (up to 5)
    emit_step(task_id, "select_relevant", "running", f"Отбор релевантных документов...")
    relevant = docs[:5]
    emit_step(task_id, "select_relevant", "done", f"Отобрано {len(relevant)} документов")

    # Step 3: Extract text from each
    emit_step(task_id, "parallel_retrieve", "running", "Чтение документов...")
    all_contexts = []
    for doc in relevant:
        try:
            file_path = doc.get("file_path", "")
            if file_path:
                import os
                if os.path.exists(file_path):
                    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                        text = f.read(3000)
                    all_contexts.append(f"=== {doc['name']} ===\n{text}")
        except Exception as e:
            logger.warning("Could not read library doc %s: %s", doc.get("name"), e)
    emit_step(task_id, "parallel_retrieve", "done", f"{len(all_contexts)} документов прочитано")

    # Step 4: Graph augmentation
    if org_id:
        emit_step(task_id, "graph_augment", "running", "Обогащение через Knowledge Graph...")
        try:
            from app.services.graph_service import graph_rag_context
            graph_ctx = await graph_rag_context(org_id, question.split()[:5])
            if graph_ctx:
                all_contexts.insert(0, graph_ctx)
            emit_step(task_id, "graph_augment", "done", "Граф-контекст добавлен")
        except Exception as e:
            emit_step(task_id, "graph_augment", "error", str(e))

    # Step 5: Synthesize
    emit_step(task_id, "cross_doc_synthesize", "running", "Синтез ответа из нескольких документов...")
    combined = "\n\n".join(all_contexts)
    try:
        answer = await llm_service.agenerate(
            f"На основе следующих документов из корпуса организации ответь на вопрос.\n\n"
            f"Контекст:\n{combined}\n\nВопрос: {question}\n\nОтвет:"
        )
        state["result"] = {
            "answer": answer,
            "documents_used": [d["name"] for d in relevant],
            "question": question,
        }
        emit_step(task_id, "cross_doc_synthesize", "done", "", answer)
    except Exception as e:
        state["error"] = str(e)
        emit_step(task_id, "cross_doc_synthesize", "error", str(e))

    return state

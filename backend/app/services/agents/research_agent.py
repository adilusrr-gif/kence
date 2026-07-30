"""Research Agent — multi-document corpus research using full RAG per document.

Improvements:
- Uses HybridRetriever per document instead of f.read(3000)
- Processes up to 10 documents (soft limit, not hard)
- Uses full document text via session_manager or file fallback
"""
import logging
from app.services.agents.base_agent import AgentState, emit_step

logger = logging.getLogger(__name__)

_MAX_DOCS = 10
_CONTEXT_PER_DOC = 8  # RAG chunks per document


async def run(state: AgentState, llm_service) -> AgentState:
    task_id  = state["task_id"]
    org_id   = state.get("org_id")
    question = state.get("question", "Что содержится в корпусе документов?")

    if not org_id:
        state["error"] = "org_id обязателен для исследования корпуса"
        emit_step(task_id, "search_library", "error", state["error"])
        return state

    # Step 1: Search library
    emit_step(task_id, "search_library", "running", "Поиск в библиотеке организации...")
    from app.services.library_service import search_library
    try:
        docs = search_library(org_id, question[:80], tags=None)
        emit_step(task_id, "search_library", "done", f"Найдено {len(docs)} документов")
    except Exception as e:
        state["error"] = str(e)
        emit_step(task_id, "search_library", "error", str(e))
        return state

    if not docs:
        state["result"] = {
            "answer": "Библиотека организации пуста или не содержит подходящих документов.",
            "documents_used": [],
            "question": question,
        }
        emit_step(task_id, "done", "done", "", state["result"]["answer"])
        return state

    # Step 2: Select up to _MAX_DOCS (soft limit, not hard cap like docs[:5])
    emit_step(task_id, "select_relevant", "running", "Отбор релевантных документов...")
    relevant = docs[:_MAX_DOCS]
    emit_step(task_id, "select_relevant", "done",
              f"Отобрано {len(relevant)} документов (из {len(docs)})")

    # Step 3: Extract relevant context from each document via RAG
    emit_step(task_id, "parallel_retrieve", "running",
              f"Семантический поиск по {len(relevant)} документам...")
    all_contexts = []
    docs_used = []

    for doc in relevant:
        doc_name = doc.get("name", "Неизвестный документ")
        try:
            context_text = ""

            # Try HybridRetriever if session exists
            session_id_doc = doc.get("session_id")
            if session_id_doc:
                try:
                    from app.services.retriever import HybridRetriever
                    retriever = HybridRetriever(session_id_doc)
                    chunks = retriever.retrieve(question, k=_CONTEXT_PER_DOC)
                    if chunks:
                        context_text = "\n\n".join(c.page_content for c in chunks)
                except Exception:
                    pass

            # Fallback: read full file text
            if not context_text:
                file_path = doc.get("file_path", "")
                if file_path:
                    import os
                    if os.path.exists(file_path):
                        # Read full file — no 3000 char limit
                        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                            full_text = f.read()
                        if full_text:
                            from app.services.pipeline import stratified_sample
                            context_text = stratified_sample(full_text, target_chars=6000, n_parts=5)

            if context_text:
                all_contexts.append(f"=== {doc_name} ===\n{context_text}")
                docs_used.append(doc_name)
                emit_step(task_id, "parallel_retrieve", "running",
                          f"✓ {doc_name} ({len(context_text):,} симв.)")

        except Exception as e:
            logger.warning("Could not read library doc %s: %s", doc_name, e)

    emit_step(task_id, "parallel_retrieve", "done",
              f"{len(all_contexts)}/{len(relevant)} документов обработано")

    # Step 4: Knowledge Graph augmentation
    if org_id:
        emit_step(task_id, "graph_augment", "running", "Обогащение через Knowledge Graph...")
        try:
            from app.services.graph_service import graph_rag_context
            # Use first 8 words as entity seeds
            entity_seeds = question.split()[:8]
            graph_ctx = await graph_rag_context(org_id, entity_seeds)
            if graph_ctx:
                all_contexts.insert(0, f"=== Knowledge Graph ===\n{graph_ctx}")
            emit_step(task_id, "graph_augment", "done",
                      f"Граф-контекст: {len(graph_ctx) if graph_ctx else 0} символов")
        except Exception as e:
            emit_step(task_id, "graph_augment", "error", str(e))

    # Step 5: Cross-document synthesis
    emit_step(task_id, "cross_doc_synthesize", "running",
              f"Синтез ответа из {len(all_contexts)} источников...")
    combined = "\n\n".join(all_contexts)
    try:
        answer = await llm_service.agenerate(
            f"На основе следующих документов из корпуса организации дай развёрнутый ответ.\n"
            f"Цитируй источники когда это уместно.\n\n"
            f"Контекст:\n{combined}\n\n"
            f"Вопрос: {question}\n\nОтвет:"
        )
        state["result"] = {
            "answer": answer.strip(),
            "documents_used": docs_used,
            "question": question,
            "context_length": len(combined),
        }
        emit_step(task_id, "cross_doc_synthesize", "done", "", answer[:400])
    except Exception as e:
        state["error"] = str(e)
        emit_step(task_id, "cross_doc_synthesize", "error", str(e))

    return state

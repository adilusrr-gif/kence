from langchain_ollama import OllamaLLM
from app.core.config import get_settings
from app.services.document import doc_processor
import asyncio
from typing import AsyncGenerator, List, Dict, Optional

settings = get_settings()


class LLMService:
    def __init__(self):
        self.llm = OllamaLLM(
            model=settings.LLM_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
            temperature=0.3,
            timeout=300,
        )
        self.llm_consult = OllamaLLM(
            model=settings.LLM_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
            temperature=0.7,
            timeout=300,
        )

    def _get_prompt(self, prompt_type: str) -> str:
        from app.services.ai_settings_service import get_prompt
        return get_prompt(prompt_type)

    def _build_context(self, docs, doc_context: Optional[str] = None) -> str:
        context = "\n\n".join([d.page_content for d in docs])
        if doc_context and doc_context.strip():
            context = f"[Описание документа: {doc_context}]\n\n{context}"
        return context

    def _inject_history(self, question: str, history: List[Dict[str, str]]) -> str:
        """Prepends formatted chat history to the question string."""
        if not history:
            return question
        from app.services.memory_service import format_history
        history_text = format_history(history, max_turns=3)
        return f"[История диалога]:\n{history_text}\n\n[Текущий вопрос]: {question}"

    # ── Synchronous chat ────────────────────────────────────────────────────

    def chat(
        self,
        question: str,
        session_id: str,
        doc_context: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> str:
        retriever = doc_processor.get_retriever(session_id)
        docs = retriever.invoke(question)
        context = self._build_context(docs, doc_context)
        q = self._inject_history(question, history or [])
        prompt_text = self._get_prompt("chat_prompt").format(context=context, question=q)
        return self.llm.invoke(prompt_text)

    # ── Streaming chat ──────────────────────────────────────────────────────

    async def chat_astream(
        self,
        question: str,
        session_id: str,
        doc_context: Optional[str] = None,
        mode: str = "precise",
        history: Optional[List[Dict[str, str]]] = None,
    ) -> AsyncGenerator[str, None]:
        retriever = doc_processor.get_retriever(session_id, mode=mode)
        docs = await asyncio.to_thread(retriever.invoke, question)
        context = self._build_context(docs, doc_context)
        q = self._inject_history(question, history or [])
        prompt_key = "consultation_prompt" if mode == "consultation" else "chat_prompt"
        prompt_text = self._get_prompt(prompt_key).format(context=context, question=q)
        llm = self.llm_consult if mode == "consultation" else self.llm
        async for chunk in llm.astream(prompt_text):
            yield chunk

    # ── Utility ─────────────────────────────────────────────────────────────

    def simple_chat(self, prompt: str) -> str:
        return self.llm.invoke(prompt)

    async def agenerate(self, prompt: str) -> str:
        return await asyncio.to_thread(self.simple_chat, prompt)

    def generate_presentation_structure(self, session_id: str) -> dict:
        retriever = doc_processor.get_retriever(session_id)
        docs = retriever.invoke("основное содержание документа")
        context = "\n\n".join([d.page_content for d in docs[:10]])
        prompt_text = self._get_prompt("presentation_prompt").format(context=context)
        response = self.llm.invoke(prompt_text)

        import json, re
        json_match = re.search(r'\{.*\}', response, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
        return {
            "title": "Презентация",
            "slides": [{"title": "Слайд 1", "points": ["Пункт 1"]}],
        }


llm_service = LLMService()

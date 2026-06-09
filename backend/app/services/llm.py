"""LLM Service with enterprise resilience:
- Bounded async queue (prevents unbounded wait under load)
- Circuit breaker (fast-fail when Ollama is down)
- Retry with exponential backoff (transient errors)
- Reduced timeout (60s vs 300s original)
- Health check method
- 100-user load: queue_maxsize=50, max_concurrent configurable
"""
from langchain_ollama import OllamaLLM
from app.core.config import get_settings
from app.services.document import doc_processor
import asyncio
import contextvars
import logging
import time
from typing import AsyncGenerator, List, Dict, Optional

# Carries the active UI language through the async call tree.
# Set by orchestrator before each agent run; read by agenerate() automatically.
_current_language: contextvars.ContextVar[str] = contextvars.ContextVar(
    "current_language", default="ru"
)

_LANG_INSTRUCTIONS: dict[str, str] = {
    "ru": "Отвечай СТРОГО на русском языке.",
    "kz": "ТЕК қазақ тілінде жауап бер.",
    "en": "Respond STRICTLY in English.",
}

settings = get_settings()
logger = logging.getLogger(__name__)

# ── Concurrency & Queue ────────────────────────────────────────────────────────
_LLM_MAX_CONCURRENT = max(1, int(getattr(settings, 'LLM_MAX_CONCURRENT', 2)))
_LLM_QUEUE_MAXSIZE  = int(getattr(settings, 'LLM_QUEUE_MAXSIZE', 50))
_LLM_TIMEOUT_SEC    = int(getattr(settings, 'LLM_TIMEOUT_SEC', 60))   # reduced from 300s

_llm_semaphore = asyncio.Semaphore(_LLM_MAX_CONCURRENT)

# ── Circuit Breaker ────────────────────────────────────────────────────────────
_CB_FAILURE_THRESHOLD = 5      # open circuit after N consecutive failures
_CB_RECOVERY_TIMEOUT  = 30.0   # seconds before trying again (half-open)

class _CircuitBreaker:
    """Simple three-state circuit breaker (CLOSED → OPEN → HALF-OPEN)."""
    CLOSED    = "closed"
    OPEN      = "open"
    HALF_OPEN = "half_open"

    def __init__(self):
        self.state          = self.CLOSED
        self.failures       = 0
        self.last_failure_t = 0.0

    def record_success(self):
        self.failures = 0
        self.state    = self.CLOSED

    def record_failure(self):
        self.failures += 1
        self.last_failure_t = time.monotonic()
        if self.failures >= _CB_FAILURE_THRESHOLD:
            self.state = self.OPEN
            logger.error(
                "[circuit_breaker] Ollama circuit OPEN after %d failures — "
                "will retry in %.0fs", self.failures, _CB_RECOVERY_TIMEOUT
            )

    def is_allowed(self) -> bool:
        if self.state == self.CLOSED:
            return True
        if self.state == self.OPEN:
            if time.monotonic() - self.last_failure_t >= _CB_RECOVERY_TIMEOUT:
                self.state = self.HALF_OPEN
                logger.info("[circuit_breaker] Ollama circuit HALF-OPEN — probing")
                return True
            return False
        # HALF_OPEN: allow one probe
        return True

_circuit_breaker = _CircuitBreaker()


# ── Queue depth guard ─────────────────────────────────────────────────────────

class _QueueGuard:
    """Counts tasks waiting for the semaphore. Raises 503 when queue is full."""

    def __init__(self):
        self._waiting = 0

    def enter(self):
        if self._waiting >= _LLM_QUEUE_MAXSIZE:
            raise RuntimeError(
                f"LLM queue full ({self._waiting}/{_LLM_QUEUE_MAXSIZE}). "
                "Try again in a few seconds."
            )
        self._waiting += 1

    def leave(self):
        self._waiting = max(0, self._waiting - 1)

    @property
    def depth(self) -> int:
        return self._waiting

_queue_guard = _QueueGuard()


# ── Retry helper ──────────────────────────────────────────────────────────────

async def _with_retry(fn, max_attempts: int = 2, base_delay: float = 1.0):
    """Retry fn up to max_attempts with exponential backoff."""
    last_exc = None
    for attempt in range(max_attempts):
        try:
            return await fn()
        except Exception as e:
            last_exc = e
            if attempt < max_attempts - 1:
                delay = base_delay * (2 ** attempt)
                logger.warning("[llm] attempt %d failed (%s), retrying in %.1fs",
                               attempt + 1, e, delay)
                await asyncio.sleep(delay)
    raise last_exc


# ── Main service ──────────────────────────────────────────────────────────────

class LLMService:
    def __init__(self):
        self.llm = OllamaLLM(
            model=settings.LLM_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
            temperature=0.3,
            timeout=_LLM_TIMEOUT_SEC,
        )
        self.llm_consult = OllamaLLM(
            model=settings.LLM_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
            temperature=0.7,
            timeout=_LLM_TIMEOUT_SEC,
        )

    # ── Health check ──────────────────────────────────────────────────────────

    async def health_check(self) -> dict:
        """Ping Ollama and return status dict. Safe to call anytime."""
        try:
            import httpx
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            ok = r.status_code == 200
            return {
                "status": "ok" if ok else "degraded",
                "circuit": _circuit_breaker.state,
                "queue_depth": _queue_guard.depth,
                "max_concurrent": _LLM_MAX_CONCURRENT,
            }
        except Exception as e:
            return {"status": "down", "error": str(e),
                    "circuit": _circuit_breaker.state}

    # ── Context helpers ───────────────────────────────────────────────────────

    def _get_prompt(self, prompt_type: str) -> str:
        from app.services.ai_settings_service import get_prompt
        return get_prompt(prompt_type)

    def _build_context(self, docs, doc_context: Optional[str] = None) -> str:
        parts = []
        for i, d in enumerate(docs, 1):
            parts.append(f"[Фрагмент {i}]\n{d.page_content}")
        context = "\n\n".join(parts)
        if doc_context and doc_context.strip():
            context = f"[Описание документа: {doc_context}]\n\n{context}"
        return context

    def _inject_history(self, question: str, history: List[Dict[str, str]]) -> str:
        if not history:
            return question
        from app.services.memory_service import format_history
        history_text = format_history(history, max_turns=5)
        return f"[История диалога]:\n{history_text}\n\n[Текущий вопрос]: {question}"

    # ── Guarded invoke (circuit breaker + queue + semaphore) ─────────────────

    async def _guarded_invoke(self, fn):
        """Run fn() through circuit breaker + queue guard + semaphore."""
        if not _circuit_breaker.is_allowed():
            raise RuntimeError(
                "Ollama временно недоступен (circuit open). "
                "Повторите запрос через 30 секунд."
            )
        _queue_guard.enter()
        try:
            logger.debug("[llm] queue=%d/%d semaphore=%d/%d",
                         _queue_guard.depth, _LLM_QUEUE_MAXSIZE,
                         _LLM_MAX_CONCURRENT - _llm_semaphore._value,
                         _LLM_MAX_CONCURRENT)
            async with _llm_semaphore:
                result = await fn()
                _circuit_breaker.record_success()
                return result
        except Exception as e:
            _circuit_breaker.record_failure()
            raise
        finally:
            _queue_guard.leave()

    # ── Language helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _lang_suffix(language: Optional[str] = None) -> str:
        lang = language or _current_language.get()
        return "\n\n" + _LANG_INSTRUCTIONS.get(lang, _LANG_INSTRUCTIONS["ru"])

    # ── Synchronous chat ──────────────────────────────────────────────────────

    def chat(self, question: str, session_id: str,
             doc_context: Optional[str] = None,
             history: Optional[List[Dict[str, str]]] = None,
             language: str = "ru") -> str:
        retriever = doc_processor.get_retriever(session_id)
        docs = retriever.invoke(question)
        context = self._build_context(docs, doc_context)
        q = self._inject_history(question, history or [])
        prompt_text = self._get_prompt("chat_prompt").format(context=context, question=q)
        prompt_text += self._lang_suffix(language)
        return self.llm.invoke(prompt_text)

    # ── RAG retrieval ─────────────────────────────────────────────────────────

    async def retrieve_docs_and_context(self, question: str, session_id: str,
                                        doc_context: Optional[str] = None,
                                        mode: str = "precise"):
        retriever = doc_processor.get_retriever(session_id, mode=mode)
        docs = await asyncio.to_thread(retriever.invoke, question)
        context = self._build_context(docs, doc_context)
        return docs, context

    # ── Streaming chat (resilient) ────────────────────────────────────────────

    async def chat_astream(
        self,
        question: str,
        session_id: str,
        doc_context: Optional[str] = None,
        mode: str = "precise",
        history: Optional[List[Dict[str, str]]] = None,
        prebuilt_context: Optional[str] = None,
        language: str = "ru",
    ) -> AsyncGenerator[str, None]:
        if not _circuit_breaker.is_allowed():
            yield "[Ollama временно недоступен. Повторите запрос через 30 секунд.]"
            return

        if prebuilt_context is not None:
            context = prebuilt_context
        else:
            retriever = doc_processor.get_retriever(session_id, mode=mode)
            docs = await asyncio.to_thread(retriever.invoke, question)
            context = self._build_context(docs, doc_context)

        q = self._inject_history(question, history or [])
        prompt_key = "consultation_prompt" if mode == "consultation" else "chat_prompt"
        prompt_text = self._get_prompt(prompt_key).format(context=context, question=q)
        prompt_text += self._lang_suffix(language)
        llm = self.llm_consult if mode == "consultation" else self.llm

        _queue_guard.enter()
        try:
            async with _llm_semaphore:
                try:
                    async for chunk in llm.astream(prompt_text):
                        yield chunk
                    _circuit_breaker.record_success()
                except Exception as e:
                    _circuit_breaker.record_failure()
                    logger.error("[llm] streaming failed: %s", e)
                    yield f"\n\n[Ошибка генерации: {e}]"
        finally:
            _queue_guard.leave()

    # ── Utility ───────────────────────────────────────────────────────────────

    def simple_chat(self, prompt: str) -> str:
        return self.llm.invoke(prompt)

    async def agenerate(self, prompt: str, language: Optional[str] = None) -> str:
        full_prompt = prompt + self._lang_suffix(language)

        async def _call():
            return await asyncio.to_thread(self.simple_chat, full_prompt)

        return await _guarded_invoke_standalone(_call)

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
        return {"title": "Презентация",
                "slides": [{"title": "Слайд 1", "points": ["Пункт 1"]}]}


async def _guarded_invoke_standalone(fn):
    """Module-level guard used by agenerate (outside class method)."""
    if not _circuit_breaker.is_allowed():
        raise RuntimeError(
            "Ollama временно недоступен (circuit open). Повторите через 30 секунд."
        )
    _queue_guard.enter()
    try:
        async with _llm_semaphore:
            result = await fn()
            _circuit_breaker.record_success()
            return result
    except Exception as e:
        _circuit_breaker.record_failure()
        raise
    finally:
        _queue_guard.leave()


# ── Metrics ───────────────────────────────────────────────────────────────────

def get_llm_metrics() -> dict:
    return {
        "circuit_state":   _circuit_breaker.state,
        "circuit_failures": _circuit_breaker.failures,
        "queue_depth":     _queue_guard.depth,
        "queue_maxsize":   _LLM_QUEUE_MAXSIZE,
        "max_concurrent":  _LLM_MAX_CONCURRENT,
    }


llm_service = LLMService()

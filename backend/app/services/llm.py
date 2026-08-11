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
import contextlib
import logging
import time
from typing import AsyncGenerator, List, Dict, Optional

# Carries the active UI language through the async call tree.
# Set by orchestrator before each agent run; read by agenerate() automatically.
_current_language: contextvars.ContextVar[str] = contextvars.ContextVar(
    "current_language", default="ru"
)

# Carries the call "lane" through the async call tree. The orchestrator sets this
# to "background" for agent tasks (see agents/orchestrator.py); everything else —
# interactive chat, translation, charts — keeps the default "interactive". Read by
# _guarded_invoke_standalone to throttle background fan-out via _agent_lane so it
# can never occupy all Ollama slots and starve interactive chat.
_call_lane: contextvars.ContextVar[str] = contextvars.ContextVar(
    "call_lane", default="interactive"
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

# Per-chunk stream timeout and non-streaming call timeout (Task 3: self-recovery
# after Ollama becomes unreachable mid-stream — see chat_astream/_guarded_invoke_standalone).
_LLM_STREAM_CHUNK_TIMEOUT_SEC = int(getattr(settings, 'LLM_STREAM_CHUNK_TIMEOUT_SEC', 90))
_LLM_CALL_TIMEOUT_SEC         = int(getattr(settings, 'LLM_CALL_TIMEOUT_SEC', 120))

_llm_semaphore = asyncio.Semaphore(_LLM_MAX_CONCURRENT)

# Background lane: caps how many of the _llm_semaphore slots agent (orchestrator)
# tasks may hold at once. Sized < _LLM_MAX_CONCURRENT so interactive chat always
# keeps the remaining slots reserved. Acquired only when _call_lane == "background".
_LLM_AGENT_MAX_CONCURRENT = max(
    1, min(int(getattr(settings, 'LLM_AGENT_MAX_CONCURRENT', 1)), _LLM_MAX_CONCURRENT)
)
_agent_lane = asyncio.Semaphore(_LLM_AGENT_MAX_CONCURRENT)

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
            temperature=0.2,
            timeout=_LLM_TIMEOUT_SEC,
            think=False,
	    reasoning=False
        )
        self.llm_consult = OllamaLLM(
            model=settings.LLM_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
            temperature=0.5,
            timeout=_LLM_TIMEOUT_SEC,
            think=False,
	    reasoning=False
        )
        # Summary map step: short (1–2 sentence) per-chunk summaries with a
        # capped output so the model can't ramble. Only used by summary_agent's
        # chunk-map — extraction/timeline/risk maps stay uncapped (their JSON can
        # be long and must not be truncated).
        self.llm_agent_map = OllamaLLM(
            model=settings.LLM_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
            temperature=0.2,
            timeout=_LLM_TIMEOUT_SEC,
            num_predict=settings.AGENT_SUMMARY_MAP_NUM_PREDICT,
            think=False,
            reasoning=False,
        )
        # Exact Answer mode: UNLIMITED output tokens (num_predict=-1) so a long
        # complete section is never cut off by a token cap. Temperature 0 for
        # verbatim reproduction.
        # NOTE: num_ctx is intentionally NOT set here. Ollama keys a loaded model
        # runner by its load-time options (num_ctx among them), so a num_ctx that
        # differs from the other instances (which use OLLAMA_CONTEXT_LENGTH=65536)
        # forces a full unload+reload of the 90 GB qwen3.5:122b MoE model on every
        # switch between exact and normal chat — 15–100s of thrash during which
        # requests time out. Keep num_ctx uniform (env default) so the model loads
        # once and stays resident.
        self.llm_exact = OllamaLLM(
            model=settings.LLM_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
            temperature=0.0,
            timeout=_LLM_TIMEOUT_SEC,
            num_predict=settings.EXACT_NUM_PREDICT,
            think=False,
	    reasoning=False
        )
        # Bound to the main event loop during app startup (see app.main
        # lifespan). Lets sync worker-thread code (simple_chat_guarded,
        # translation guarded chunks) bridge back into the guarded async
        # path via run_guarded_sync().
        self._main_loop: Optional[asyncio.AbstractEventLoop] = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._main_loop = loop

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
        # Route through the same semaphore/circuit-breaker/queue guard as the
        # streaming path so synchronous chat can't exceed Ollama's NUM_PARALLEL.
        # chat() is always invoked via asyncio.to_thread (see routes.chat), so
        # run_guarded_sync is called from a worker thread as required.
        async def _call():
            return await asyncio.to_thread(self.llm.invoke, prompt_text)
        return run_guarded_sync(_call)

    # ── RAG retrieval ─────────────────────────────────────────────────────────

    async def retrieve_docs_and_context(self, question: str, session_id: str,
                                        doc_context: Optional[str] = None,
                                        mode: str = "precise"):
        retriever = doc_processor.get_retriever(session_id, mode=mode)
        docs = await asyncio.to_thread(retriever.invoke, question)
        if mode == "exact":
            context = await asyncio.to_thread(
                self._build_exact_context, docs, session_id, doc_context
            )
        else:
            context = self._build_context(docs, doc_context)
        return docs, context

    def _build_exact_context(self, docs, session_id: str,
                             doc_context: Optional[str] = None) -> str:
        """Section-aware context: expand each retrieved fragment to its COMPLETE
        enclosing section using the full document text stored on the session."""
        from app.core.session import session_manager
        from app.services import section_retriever

        session = session_manager.get_session(session_id)
        full_text = (session or {}).get("markdown_text") or ""
        if not full_text:
            # No full text available — fall back to plain fragment context.
            return self._build_context(docs, doc_context)

        context = section_retriever.build_exact_context(
            full_text, docs,
            max_sections=settings.EXACT_MAX_SECTIONS,
            max_chars=settings.EXACT_MAX_CONTEXT_CHARS,
        )
        if doc_context and doc_context.strip():
            context = f"[Описание документа: {doc_context}]\n\n{context}"
        return context

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
        elif mode == "exact":
            retriever = doc_processor.get_retriever(session_id, mode=mode)
            docs = await asyncio.to_thread(retriever.invoke, question)
            context = await asyncio.to_thread(
                self._build_exact_context, docs, session_id, doc_context
            )
        else:
            retriever = doc_processor.get_retriever(session_id, mode=mode)
            docs = await asyncio.to_thread(retriever.invoke, question)
            context = self._build_context(docs, doc_context)

        q = self._inject_history(question, history or [])
        prompt_key = {
            "consultation": "consultation_prompt",
            "exact": "exact_prompt",
        }.get(mode, "chat_prompt")
        prompt_text = self._get_prompt(prompt_key).format(context=context, question=q)
        prompt_text += self._lang_suffix(language)
        llm = {
            "consultation": self.llm_consult,
            "exact": self.llm_exact,
        }.get(mode, self.llm)

        _queue_guard.enter()
        try:
            async with _llm_semaphore:
                from app.core import generation_registry
                generation_registry.mark_running(session_id)
                stream_iter = llm.astream(prompt_text).__aiter__()
                t_start = time.monotonic()
                chunk_count = 0
                char_count = 0
                logger.info(
                    "[llm.chat_astream] start session=%s mode=%s model=%s prompt_chars=%d",
                    session_id, mode, getattr(llm, "model", "?"), len(prompt_text),
                )
                try:
                    while True:
                        try:
                            chunk = await asyncio.wait_for(
                                stream_iter.__anext__(),
                                timeout=_LLM_STREAM_CHUNK_TIMEOUT_SEC,
                            )
                        except StopAsyncIteration:
                            break
                        chunk_count += 1
                        char_count += len(chunk)
                        if chunk_count == 1:
                            logger.info(
                                "[llm.chat_astream] first token after %.1fs session=%s repr=%r",
                                time.monotonic() - t_start, session_id, chunk[:80],
                            )
                        yield chunk
                    logger.info(
                        "[llm.chat_astream] done session=%s chunks=%d chars=%d elapsed=%.1fs",
                        session_id, chunk_count, char_count, time.monotonic() - t_start,
                    )
                    _circuit_breaker.record_success()
                except asyncio.TimeoutError:
                    _circuit_breaker.record_failure()
                    logger.error(
                        "[llm] stream stalled >%ds (session=%s) — Ollama не отвечает "
                        "(received %d chunks / %d chars after %.1fs)",
                        _LLM_STREAM_CHUNK_TIMEOUT_SEC, session_id,
                        chunk_count, char_count, time.monotonic() - t_start,
                    )
                    yield (
                        f"\n\n[Ошибка генерации: модель не отвечает "
                        f"(timeout {_LLM_STREAM_CHUNK_TIMEOUT_SEC}с). Повторите запрос позже.]"
                    )
                except Exception as e:
                    _circuit_breaker.record_failure()
                    logger.error(
                        "[llm] streaming failed: %s (session=%s, received %d chunks / %d chars after %.1fs)",
                        e, session_id, chunk_count, char_count, time.monotonic() - t_start,
                    )
                    yield f"\n\n[Ошибка генерации: {e}]"
                finally:
                    with contextlib.suppress(Exception):
                        await asyncio.wait_for(stream_iter.aclose(), timeout=1.0)
        finally:
            _queue_guard.leave()

    # ── Utility ───────────────────────────────────────────────────────────────

    def simple_chat(self, prompt: str) -> str:
        return self.llm.invoke(prompt)

    def simple_chat_guarded(self, prompt: str, timeout: Optional[float] = None) -> str:
        """Sync replacement for simple_chat() when calling from a worker
        thread (asyncio.to_thread) — goes through
        _llm_semaphore/_circuit_breaker/_queue_guard + an explicit timeout
        instead of an unguarded blocking call."""
        async def _call():
            return await asyncio.to_thread(self.simple_chat, prompt)
        return run_guarded_sync(_call, timeout)

    async def agenerate(self, prompt: str, language: Optional[str] = None) -> str:
        full_prompt = prompt + self._lang_suffix(language)

        async def _call():
            return await asyncio.to_thread(self.simple_chat, full_prompt)

        return await _guarded_invoke_standalone(_call)

    async def agenerate_map(self, prompt: str, language: Optional[str] = None) -> str:
        """Like agenerate(), but uses the output-capped map model. For short
        per-chunk summaries only (see self.llm_agent_map)."""
        full_prompt = prompt + self._lang_suffix(language)

        async def _call():
            return await asyncio.to_thread(self.llm_agent_map.invoke, full_prompt)

        return await _guarded_invoke_standalone(_call)

    async def agenerate_raw(self, prompt: str, timeout: Optional[float] = None) -> str:
        """Like agenerate(), but without the language suffix — for
        structured/JSON prompts (charts, presentations, comparisons) where
        appending a language instruction would corrupt the output."""
        async def _call():
            return await asyncio.to_thread(self.simple_chat, prompt)
        kwargs = {} if timeout is None else {"timeout": timeout}
        return await _guarded_invoke_standalone(_call, **kwargs)


async def _guarded_invoke_standalone(fn, timeout: float = _LLM_CALL_TIMEOUT_SEC):
    """Module-level guard used by agenerate/agenerate_raw (outside class method).

    Wraps fn() in an explicit timeout so a hung Ollama call can't hold the
    semaphore forever (Task 3) — same mechanism as chat_astream's per-chunk
    timeout, for non-streaming calls.
    """
    if not _circuit_breaker.is_allowed():
        raise RuntimeError(
            "Ollama временно недоступен (circuit open). Повторите через 30 секунд."
        )
    async with contextlib.AsyncExitStack() as stack:
        # Background agent tasks first pass through the narrower _agent_lane so
        # their chunk-extraction fan-out can never occupy every _llm_semaphore
        # slot and starve interactive chat. Interactive calls skip this lane.
        if _call_lane.get() == "background":
            await stack.enter_async_context(_agent_lane)
        _queue_guard.enter()
        try:
            async with _llm_semaphore:
                try:
                    result = await asyncio.wait_for(fn(), timeout=timeout)
                except asyncio.TimeoutError as e:
                    raise RuntimeError(
                        f"Ollama не ответил за {timeout:.0f}с — модель перегружена или недоступна."
                    ) from e
                _circuit_breaker.record_success()
                return result
        except Exception:
            _circuit_breaker.record_failure()
            raise
        finally:
            _queue_guard.leave()


def run_guarded_sync(coro_fn, timeout: Optional[float] = None):
    """Bridge a synchronous worker-thread call (asyncio.to_thread) into the
    guarded async path (_llm_semaphore/_queue_guard/_circuit_breaker) via
    run_coroutine_threadsafe.

    Must be called from a thread OTHER than the main event-loop thread
    (e.g. inside asyncio.to_thread) — calling it from the loop's own thread
    would deadlock waiting on its own result.
    """
    loop = llm_service._main_loop
    if loop is None:
        # Event loop not bound yet (e.g. unit tests calling the service
        # directly) — run the guarded coroutine on a fresh loop.
        kwargs = {} if timeout is None else {"timeout": timeout}
        return asyncio.run(_guarded_invoke_standalone(coro_fn, **kwargs))

    try:
        running = asyncio.get_running_loop()
    except RuntimeError:
        running = None
    if running is loop:
        raise RuntimeError(
            "run_guarded_sync() called from the event-loop thread — this "
            "would deadlock. Call it from asyncio.to_thread()."
        )

    kwargs = {} if timeout is None else {"timeout": timeout}
    fut = asyncio.run_coroutine_threadsafe(_guarded_invoke_standalone(coro_fn, **kwargs), loop)
    return fut.result()


# ── Metrics ───────────────────────────────────────────────────────────────────

def get_llm_metrics() -> dict:
    return {
        "circuit_state":   _circuit_breaker.state,
        "circuit_failures": _circuit_breaker.failures,
        "queue_depth":     _queue_guard.depth,
        "queue_maxsize":   _LLM_QUEUE_MAXSIZE,
        "max_concurrent":  _LLM_MAX_CONCURRENT,
        "active_count":    _LLM_MAX_CONCURRENT - _llm_semaphore._value,
        "agent_max_concurrent": _LLM_AGENT_MAX_CONCURRENT,
        "agent_active_count":   _LLM_AGENT_MAX_CONCURRENT - _agent_lane._value,
    }


llm_service = LLMService()

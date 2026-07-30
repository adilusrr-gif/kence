"""PR1 bottleneck fixes:
  1.1 Docling ingest offloaded off the event loop (dedicated thread pool)
  1.2 BM25 index cached per session instead of rebuilt every query
  1.3 Synchronous LLM calls routed through the concurrency guard
"""
import threading

import pytest


# ── 1.2 BM25 cache ────────────────────────────────────────────────────────────

def test_bm25_cache_builds_once_and_caches():
    from app.services import bm25_cache

    sid = "sess-cache-1"
    bm25_cache.invalidate(sid)
    calls = {"n": 0}

    def build():
        calls["n"] += 1
        return ("BM25_INDEX", ["chunk-a", "chunk-b"])

    first = bm25_cache.get_or_build(sid, build)
    second = bm25_cache.get_or_build(sid, build)

    assert first == ("BM25_INDEX", ["chunk-a", "chunk-b"])
    assert second is first          # same cached object
    assert calls["n"] == 1          # build_fn ran only once across two queries

    bm25_cache.invalidate(sid)


def test_bm25_cache_invalidate_forces_rebuild():
    from app.services import bm25_cache

    sid = "sess-cache-2"
    bm25_cache.invalidate(sid)
    calls = {"n": 0}

    def build():
        calls["n"] += 1
        return ("IDX", [])

    bm25_cache.get_or_build(sid, build)
    bm25_cache.invalidate(sid)
    bm25_cache.get_or_build(sid, build)

    assert calls["n"] == 2          # rebuilt after invalidation
    bm25_cache.invalidate(sid)


def test_bm25_cache_does_not_store_none():
    from app.services import bm25_cache

    sid = "sess-cache-3"
    bm25_cache.invalidate(sid)
    calls = {"n": 0}

    def build_none():
        calls["n"] += 1
        return None                 # BM25 unavailable (too few chunks / no dep)

    assert bm25_cache.get_or_build(sid, build_none) is None
    assert bm25_cache.get_or_build(sid, build_none) is None
    assert calls["n"] == 2          # None is never cached → rebuild attempted each time


# ── 1.1 Docling ingest offloaded off the event loop ───────────────────────────

async def test_doc_ingest_runs_off_event_loop():
    """The dedicated ingest pool must run work on a doc-ingest worker thread,
    not on the event-loop thread — so a large upload can't block everyone."""
    import asyncio
    from app.services import document

    main_thread = threading.current_thread().name

    def work():
        return threading.current_thread().name

    loop = asyncio.get_running_loop()
    worker_thread = await loop.run_in_executor(document.doc_executor, work)

    assert worker_thread != main_thread
    assert worker_thread.startswith("doc-ingest")


# ── 1.3 Synchronous chat routed through the guard ──────────────────────────────

def test_chat_routes_through_guard(monkeypatch):
    """LLMService.chat must call the LLM through run_guarded_sync (semaphore /
    circuit-breaker / queue) rather than llm.invoke() directly."""
    from app.services import llm as llm_mod

    class _FakeRetriever:
        def invoke(self, q):
            return []

    monkeypatch.setattr(llm_mod.doc_processor, "get_retriever", lambda sid, **kw: _FakeRetriever())
    monkeypatch.setattr(llm_mod.llm_service, "_get_prompt", lambda key: "{context}\n{question}")

    guard_calls = {"n": 0}

    def fake_guard(coro_fn, *a, **k):
        guard_calls["n"] += 1
        return "GUARDED_ANSWER"

    monkeypatch.setattr(llm_mod, "run_guarded_sync", fake_guard)

    answer = llm_mod.llm_service.chat("question?", "sess-1", language="ru")

    assert answer == "GUARDED_ANSWER"
    assert guard_calls["n"] == 1

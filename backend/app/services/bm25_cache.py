"""Per-session cache of the built BM25 index + chunk list.

retriever.HybridRetriever previously rebuilt the BM25 index from scratch on
EVERY query — fetching all chunks out of Chroma, tokenizing them, and
constructing a BM25Okapi each time (tens of MB allocated + CPU per chat turn).
This caches the built index per session_id behind a TTL + LRU max-entries cap,
and is invalidated explicitly when a session's document is (re)uploaded
(routes.upload_document) or the session is cleaned up (session.cleanup_session).

Only the query-independent work (chunk fetch, tokenization, index build) is
cached. The query-dependent scoring (bm25.get_scores) still runs per call, as
it must. Thread-safe: ingest runs on a separate thread pool (see document.py),
so build/invalidate may race with reads.

Implemented with stdlib (OrderedDict + monotonic TTL) to avoid an extra runtime
dependency.
"""
import logging
import time
from collections import OrderedDict
from threading import Lock
from typing import Callable, List, Optional, Tuple

from langchain_core.documents import Document as LCDocument

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_MAXSIZE = max(1, int(getattr(settings, "BM25_CACHE_MAXSIZE", 256)))
_TTL = int(getattr(settings, "BM25_CACHE_TTL_SEC", 1800))

# (BM25Okapi is duck-typed as object — rank_bm25 is an optional dependency.)
Bundle = Tuple[object, List[LCDocument]]

# session_id -> (expires_at_monotonic, bundle); ordered LRU (oldest first).
_cache: "OrderedDict[str, Tuple[float, Bundle]]" = OrderedDict()
_lock = Lock()


def _evict_locked() -> None:
    while len(_cache) > _MAXSIZE:
        _cache.popitem(last=False)  # drop least-recently-used


def get_or_build(
    session_id: str,
    build_fn: Callable[[], Optional[Bundle]],
) -> Optional[Bundle]:
    """Return the cached (bm25, chunks) bundle for session_id, building it via
    build_fn on a miss or after TTL expiry. build_fn must return a
    (BM25Okapi, list[LCDocument]) tuple, or None when BM25 is unavailable (too
    few chunks / dependency missing) — in which case nothing is cached."""
    now = time.monotonic()
    with _lock:
        entry = _cache.get(session_id)
        if entry is not None:
            expires_at, bundle = entry
            if expires_at > now:
                _cache.move_to_end(session_id)  # mark recently used
                return bundle
            del _cache[session_id]              # expired

    built = build_fn()
    if built is None:
        return None

    with _lock:
        _cache[session_id] = (time.monotonic() + _TTL, built)
        _cache.move_to_end(session_id)
        _evict_locked()
    return built


def invalidate(session_id: str) -> None:
    """Drop the cached index for a session (call after (re)upload / cleanup)."""
    with _lock:
        _cache.pop(session_id, None)

"""In-memory registry of active chat-generation tasks.

Backs three things (see chat-stability spec):
  - Task 1: cancellation — POST /api/chat/cancel/{session_id} looks up the
    asyncio.Task for a session and calls .cancel() on it.
  - Task 3: per-user concurrency limit — count_active_for_user() lets
    chat_stream reject a second concurrent generation from the same user.
  - Task 4: queue/status monitoring — get_status() reports queue position,
    active/running counts and an estimated wait time.

Single-process, in-memory by design (mirrors the existing asyncio.Semaphore
and circuit breaker in app.services.llm, which are also per-process).
"""
import asyncio
import time
from dataclasses import dataclass, field


@dataclass
class _Handle:
    task: asyncio.Task
    username: str
    session_id: str
    status: str = "queued"  # queued | running | cancelled | completed | failed
    started_at: float = field(default_factory=time.monotonic)


_active: dict[str, _Handle] = {}

# Exponential moving average of completed generation durations (seconds),
# used to estimate queue wait time. Seeded with a conservative default.
_avg_duration_sec = 20.0


def register(session_id: str, username: str, task: asyncio.Task) -> None:
    _active[session_id] = _Handle(task=task, username=username, session_id=session_id)


def mark_running(session_id: str) -> None:
    h = _active.get(session_id)
    if h:
        h.status = "running"


def finish(session_id: str) -> None:
    """Remove the handle and, if it completed normally, update the
    rolling average duration used for wait-time estimates."""
    h = _active.pop(session_id, None)
    if h and h.status == "running":
        _record_duration(time.monotonic() - h.started_at)


def _record_duration(seconds: float) -> None:
    global _avg_duration_sec
    _avg_duration_sec = 0.7 * _avg_duration_sec + 0.3 * seconds


def count_active_for_user(username: str) -> int:
    return sum(
        1 for h in _active.values()
        if h.username == username and h.status in ("queued", "running")
    )


def cancel(session_id: str, username: str, is_admin: bool = False) -> str:
    """Cancel the active generation for session_id.

    Returns "cancelled", "not_found", or "forbidden".
    """
    h = _active.get(session_id)
    if not h:
        return "not_found"
    if h.username != username and not is_admin:
        return "forbidden"
    if h.task and not h.task.done():
        h.task.cancel()
    h.status = "cancelled"
    return "cancelled"


def sweep_stale(max_running_sec: float) -> list[str]:
    """Watchdog safety net (Task 2): entries whose task is already done()
    (finish() was never called — a bug elsewhere) or that have been
    "running" longer than max_running_sec are force-removed. Returns the
    session_ids that were cleared."""
    now = time.monotonic()
    stale = []
    for session_id, h in list(_active.items()):
        done_but_present = h.task is not None and h.task.done()
        too_old = h.status == "running" and (now - h.started_at) > max_running_sec
        if done_but_present or too_old:
            stale.append(session_id)
            _active.pop(session_id, None)
    return stale


def get_registry_summary() -> dict:
    """Snapshot for GET /api/system/llm-status (Task 7)."""
    active = sum(1 for h in _active.values() if h.status == "running")
    queued = sum(1 for h in _active.values() if h.status == "queued")
    return {
        "active_generations": active,
        "queued_generations": queued,
        "registry_size": len(_active),
    }


def get_status(session_id: str) -> dict:
    """Queue/status snapshot for a session (Task 4)."""
    from app.services.llm import get_llm_metrics
    metrics = get_llm_metrics()

    h = _active.get(session_id)
    if not h:
        return {"session_id": session_id, "status": "idle", **metrics}

    queue_position = 0
    estimated_wait_sec = None
    if h.status == "queued":
        queue_position = sum(
            1 for o in _active.values()
            if o.status == "queued" and o.started_at <= h.started_at
        )
        concurrency = max(1, metrics["max_concurrent"])
        estimated_wait_sec = round((queue_position * _avg_duration_sec) / concurrency, 1)

    return {
        "session_id": session_id,
        "status": h.status,
        "elapsed_sec": round(time.monotonic() - h.started_at, 1),
        "queue_position": queue_position,
        "estimated_wait_sec": estimated_wait_sec,
        **metrics,
    }

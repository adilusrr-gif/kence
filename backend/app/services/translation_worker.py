"""Background translation worker (PART 2).

A single long-running asyncio task started in the app lifespan. It polls the
``translation_jobs`` table, claims one queued job at a time (atomic
queued→processing update), translates it chunk-by-chunk while persisting
progress, and marks it completed or failed. On failure it re-queues the job up
to ``max_retries`` with backoff.

Durability guarantees:
- Survives browser refresh — all state is in the DB and exposed via the status API.
- Survives backend restart — ``requeue_interrupted_jobs()`` (called at startup)
  resets any job stuck in 'processing' back to 'queued' so it resumes instead of
  being lost.

Runs on the background LLM lane (see llm._call_lane) so its chunk translations
can never occupy every Ollama slot and starve interactive chat.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.models.models import TranslationJob

logger = logging.getLogger(__name__)
settings = get_settings()

POLL_INTERVAL_SEC = 3.0
RETRY_BACKOFF_SEC = 5.0


def _now():
    return datetime.now(timezone.utc)


def requeue_interrupted_jobs() -> int:
    """Reset jobs left 'processing' by a previous process back to 'queued'.

    Called once at startup so an in-flight translation resumes after a backend
    restart instead of being silently dropped or marked failed.
    """
    try:
        with SessionLocal() as db:
            n = (
                db.query(TranslationJob)
                .filter(TranslationJob.status == "processing")
                .update(
                    {"status": "queued", "progress": 0, "done_chunks": 0, "started_at": None},
                    synchronize_session=False,
                )
            )
            if n:
                db.commit()
                logger.warning("[translation_worker] re-queued %d interrupted job(s) after restart", n)
            return n
    except Exception as e:
        logger.warning("[translation_worker] requeue_interrupted_jobs failed: %s", e)
        return 0


def _claim_next_job() -> Optional[int]:
    """Atomically claim the oldest queued job → return its id, or None.

    Uses a guarded UPDATE so two workers (or a worker + a racing request) can
    never grab the same job.
    """
    try:
        with SessionLocal() as db:
            job = (
                db.query(TranslationJob)
                .filter(TranslationJob.status == "queued")
                .order_by(TranslationJob.created_at.asc())
                .first()
            )
            if not job:
                return None
            updated = (
                db.query(TranslationJob)
                .filter(TranslationJob.id == job.id, TranslationJob.status == "queued")
                .update(
                    {"status": "processing", "started_at": _now(), "error": None},
                    synchronize_session=False,
                )
            )
            db.commit()
            return job.id if updated else None
    except Exception as e:
        logger.warning("[translation_worker] claim failed: %s", e)
        return None


def _load_job(job_id: int) -> Optional[dict]:
    with SessionLocal() as db:
        job = db.get(TranslationJob, job_id)
        if not job:
            return None
        return {
            "id": job.id,
            "source_text": job.source_text or "",
            "target_language": job.target_language,
            "retry_count": job.retry_count,
            "max_retries": job.max_retries,
        }


def _update_progress(job_id: int, done: int, total: int) -> None:
    pct = int(done * 100 / total) if total else 0
    try:
        with SessionLocal() as db:
            db.query(TranslationJob).filter(TranslationJob.id == job_id).update(
                {"progress": pct, "done_chunks": done, "total_chunks": total},
                synchronize_session=False,
            )
            db.commit()
    except Exception as e:
        logger.debug("[translation_worker] progress update failed for %s: %s", job_id, e)


def _mark_completed(job_id: int, translated: str) -> None:
    with SessionLocal() as db:
        db.query(TranslationJob).filter(TranslationJob.id == job_id).update(
            {
                "status": "completed",
                "translated_text": translated,
                "progress": 100,
                "finished_at": _now(),
                "error": None,
            },
            synchronize_session=False,
        )
        db.commit()


def _handle_failure(job_id: int, err: str) -> bool:
    """Mark failed or re-queue with backoff. Returns True if it will retry."""
    with SessionLocal() as db:
        job = db.get(TranslationJob, job_id)
        if not job:
            return False
        if job.retry_count < job.max_retries:
            job.retry_count += 1
            job.status = "queued"
            job.error = f"retry {job.retry_count}/{job.max_retries}: {err}"[:2000]
            job.progress = 0
            job.done_chunks = 0
            job.started_at = None
            db.commit()
            logger.warning("[translation_worker] job %s failed, re-queued (%d/%d): %s",
                           job_id, job.retry_count, job.max_retries, err)
            return True
        job.status = "failed"
        job.error = err[:2000]
        job.finished_at = _now()
        db.commit()
        logger.error("[translation_worker] job %s failed permanently: %s", job_id, err)
        return False


async def _process_job(job_id: int) -> None:
    job = _load_job(job_id)
    if not job:
        return

    from app.services.translation import translation_service
    from app.services import llm

    # Run on the background lane so interactive chat keeps its Ollama slots.
    token = llm._call_lane.set("background")
    try:
        async def _progress(done, total):
            await asyncio.to_thread(_update_progress, job_id, done, total)

        translated = await translation_service.translate_document_tracked(
            job["source_text"], job["target_language"], progress_cb=_progress
        )
        await asyncio.to_thread(_mark_completed, job_id, translated)
        logger.info("[translation_worker] job %s completed (%d chars)", job_id, len(translated))
    except Exception as e:
        will_retry = await asyncio.to_thread(_handle_failure, job_id, str(e))
        if will_retry:
            await asyncio.sleep(RETRY_BACKOFF_SEC)
    finally:
        llm._call_lane.reset(token)


async def worker_loop(stop_event: asyncio.Event) -> None:
    """Main poll loop. Cancellable via the lifespan shutdown."""
    logger.info("[translation_worker] started")
    while not stop_event.is_set():
        try:
            job_id = await asyncio.to_thread(_claim_next_job)
            if job_id is None:
                await asyncio.wait_for(stop_event.wait(), timeout=POLL_INTERVAL_SEC)
                continue
            await _process_job(job_id)
        except asyncio.TimeoutError:
            continue  # poll interval elapsed, loop again
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning("[translation_worker] loop error: %s", e)
            await asyncio.sleep(POLL_INTERVAL_SEC)
    logger.info("[translation_worker] stopped")

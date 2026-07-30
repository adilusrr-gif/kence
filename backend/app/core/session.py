import uuid
import time
import json
import logging
from typing import Dict, Optional
from pathlib import Path
import shutil

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class SessionManager:
    """
    Write-through кэш: активные сессии живут в памяти для скорости,
    метаданные персистируются в PostgreSQL при каждом обновлении.
    """

    def __init__(self):
        self._mem: Dict[str, dict] = {}
        # Must track settings.UPLOAD_DIR/CHROMA_DIR (not a hardcoded "./uploads")
        # so cleanup_session/store_html/load_html always agree with the paths
        # routes.py actually writes uploads/vector stores to.
        settings = get_settings()
        self.upload_dir = Path(settings.UPLOAD_DIR)
        self.chroma_dir = Path(settings.CHROMA_DIR)

    # ── helpers ────────────────────────────────────────────────────────────

    def _db(self):
        from app.core.database import SessionLocal
        return SessionLocal()

    def _to_row(self, session_id: str, data: dict):
        from app.models.models import DocSession
        # html_text intentionally not persisted — the HTML preview lives on disk
        # (uploads/{session_id}/preview.html, see store_html) since serializing
        # up to 15 MB into the row on every save bloated both RAM and Postgres.
        return DocSession(
            session_id=session_id,
            document_name=data.get("document"),
            has_vector_store=bool(data.get("vector_store")),
            preview=data.get("preview"),
            markdown_text=data.get("markdown_text"),
            presentation_plan=data.get("presentation_plan"),
            org_id=data.get("org_id"),
            owner_username=data.get("owner_username"),
        )

    def _html_path(self, session_id: str) -> Path:
        return self.upload_dir / session_id / "preview.html"

    def _from_row(self, row) -> dict:
        session_id = row.session_id
        # Verify ChromaDB actually exists on disk — DB flag may be stale after a crash
        chroma_ok = (self.chroma_dir / session_id).exists() if row.has_vector_store else False
        data = {
            "document": row.document_name,
            "vector_store": chroma_ok,
            "preview": row.preview,
            "markdown_text": row.markdown_text,
            "presentation_plan": row.presentation_plan,
            "created_at": row.created_at.timestamp() if row.created_at else time.time(),
            "last_activity": time.time(),
            "owner_username": row.owner_username,
            "org_id": row.org_id,
        }
        if self._html_path(session_id).exists():
            data["html_path"] = str(self._html_path(session_id))
        elif row.html_text:
            # Legacy session persisted before HTML moved to disk — keep the DB
            # copy so its preview still works; it ages out with the session.
            data["html_text"] = row.html_text
        return data

    # ── HTML preview (disk-backed) ─────────────────────────────────────────

    def store_html(self, session_id: str, html_text: str) -> None:
        """Persist the (possibly huge) HTML preview to disk instead of RAM/DB.
        Blocking file I/O — call via asyncio.to_thread from async handlers."""
        path = self._html_path(session_id)
        stored = False
        try:
            if html_text and len(html_text) < 15_000_000:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(html_text, encoding="utf-8")
                stored = True
            else:
                path.unlink(missing_ok=True)
        except Exception as e:
            logger.warning("[session] store_html failed for %s: %s", session_id, e)
        data = self._mem.get(session_id)
        if data is not None:
            data.pop("html_text", None)
            data["html_path"] = str(path) if stored else None

    def load_html(self, session_id: str) -> str:
        """Read the HTML preview back. Blocking file I/O — call via asyncio.to_thread."""
        data = self.get_session(session_id) or {}
        p = data.get("html_path")
        if p:
            try:
                return Path(p).read_text(encoding="utf-8")
            except Exception as e:
                logger.warning("[session] load_html failed for %s: %s", session_id, e)
                return ""
        return data.get("html_text") or ""

    # ── public API ─────────────────────────────────────────────────────────

    def create_session(self) -> str:
        session_id = str(uuid.uuid4())
        (self.upload_dir / session_id).mkdir(parents=True, exist_ok=True)

        data = {
            "created_at": time.time(),
            "last_activity": time.time(),
            "document": None,
            "vector_store": None,
            "preview": None,
            "markdown_text": None,
            "presentation_plan": None,
        }
        self._mem[session_id] = data

        try:
            from app.models.models import DocSession
            with self._db() as db:
                db.merge(self._to_row(session_id, data))
                db.commit()
        except Exception as e:
            logger.warning("[session] create_session DB persist failed for %s: %s", session_id, e)

        return session_id

    def get_session(self, session_id: str) -> Optional[dict]:
        if session_id in self._mem:
            self._mem[session_id]["last_activity"] = time.time()
            return self._mem[session_id]

        # Not in memory — try to restore from DB (e.g. after restart)
        try:
            from app.models.models import DocSession
            with self._db() as db:
                row = db.get(DocSession, session_id)
                if row:
                    data = self._from_row(row)
                    self._mem[session_id] = data
                    return data
        except Exception as e:
            logger.warning("[session] get_session DB restore failed for %s: %s", session_id, e)

        return None

    def save_session(self, session_id: str) -> None:
        """Persists current in-memory state to DB. Call after mutating session."""
        data = self._mem.get(session_id)
        if not data:
            return
        try:
            from app.models.models import DocSession
            from datetime import datetime, timezone
            with self._db() as db:
                row = db.get(DocSession, session_id)
                if row:
                    row.document_name      = data.get("document")
                    row.has_vector_store   = bool(data.get("vector_store"))
                    if row.preview != data.get("preview"):
                        row.preview = data.get("preview")
                    # Assign the big text columns only when actually changed —
                    # otherwise every save (chat clear, org update, …) rewrites
                    # up to 150k chars into Postgres for nothing.
                    if row.markdown_text != data.get("markdown_text"):
                        row.markdown_text = data.get("markdown_text")
                    if row.presentation_plan != data.get("presentation_plan"):
                        row.presentation_plan = data.get("presentation_plan")
                    row.last_activity      = datetime.now(timezone.utc)
                    if data.get("org_id") is not None:
                        row.org_id = data.get("org_id")
                    if data.get("owner_username") is not None:
                        row.owner_username = data.get("owner_username")
                else:
                    db.add(self._to_row(session_id, data))
                db.commit()
        except Exception as e:
            logger.warning("[session] save_session DB persist failed for %s: %s", session_id, e)

    def cleanup_session(self, session_id: str):
        for path in [self.upload_dir / session_id, self.chroma_dir / session_id]:
            if path.exists():
                shutil.rmtree(path)

        self._mem.pop(session_id, None)

        # Drop the cached BM25 index — its chunks no longer exist.
        try:
            from app.services import bm25_cache
            bm25_cache.invalidate(session_id)
        except Exception:
            pass

        try:
            from app.models.models import DocSession
            with self._db() as db:
                row = db.get(DocSession, session_id)
                if row:
                    db.delete(row)
                    db.commit()
        except Exception as e:
            logger.warning("[session] cleanup_session DB delete failed for %s: %s", session_id, e)

    def cleanup_expired(self, timeout: int = 3600):
        now = time.time()
        # Clean RAM sessions
        expired = [
            sid for sid, s in list(self._mem.items())
            if now - s.get("last_activity", now) > timeout
        ]
        for sid in expired:
            self.cleanup_session(sid)

        # Also clean DB sessions that were never loaded into RAM (e.g. from previous process)
        try:
            from app.models.models import DocSession
            from datetime import datetime, timezone
            cutoff = datetime.fromtimestamp(now - timeout, tz=timezone.utc)
            with self._db() as db:
                stale_rows = db.query(DocSession).filter(
                    DocSession.last_activity < cutoff,
                    ~DocSession.session_id.in_(list(self._mem.keys())),
                ).all()
                for row in stale_rows:
                    self.cleanup_session(row.session_id)
        except Exception as e:
            logger.warning("[session] cleanup_expired DB query failed: %s", e)


session_manager = SessionManager()

import uuid
import time
import json
import logging
from typing import Dict, Optional
from pathlib import Path
import shutil

logger = logging.getLogger(__name__)


class SessionManager:
    """
    Write-through кэш: активные сессии живут в памяти для скорости,
    метаданные персистируются в PostgreSQL при каждом обновлении.
    """

    def __init__(self):
        self._mem: Dict[str, dict] = {}
        self.upload_dir = Path("./uploads")
        self.chroma_dir = Path("./chroma_db")

    # ── helpers ────────────────────────────────────────────────────────────

    def _db(self):
        from app.core.database import SessionLocal
        return SessionLocal()

    def _to_row(self, session_id: str, data: dict):
        from app.models.models import DocSession
        return DocSession(
            session_id=session_id,
            document_name=data.get("document"),
            has_vector_store=bool(data.get("vector_store")),
            preview=data.get("preview"),
            markdown_text=data.get("markdown_text"),
            presentation_plan=data.get("presentation_plan"),
        )

    def _from_row(self, row) -> dict:
        return {
            "document": row.document_name,
            "vector_store": row.has_vector_store,
            "preview": row.preview,
            "markdown_text": row.markdown_text,
            "presentation_plan": row.presentation_plan,
            "created_at": row.created_at.timestamp() if row.created_at else time.time(),
            "last_activity": time.time(),
        }

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
            with self._db() as db:
                row = db.get(DocSession, session_id)
                if row:
                    row.document_name = data.get("document")
                    row.has_vector_store = bool(data.get("vector_store"))
                    row.preview = data.get("preview")
                    row.markdown_text = data.get("markdown_text")
                    row.presentation_plan = data.get("presentation_plan")
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
        expired = [
            sid for sid, s in list(self._mem.items())
            if now - s.get("last_activity", now) > timeout
        ]
        for sid in expired:
            self.cleanup_session(sid)


session_manager = SessionManager()

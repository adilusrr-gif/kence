import uuid
import time
from typing import Dict, Optional
from pathlib import Path
import shutil

class SessionManager:
    def __init__(self):
        self.sessions: Dict[str, dict] = {}
        self.upload_dir = Path("./uploads")
        self.chroma_dir = Path("./chroma_db")

    def create_session(self) -> str:
        session_id = str(uuid.uuid4())
        session_path = self.upload_dir / session_id
        session_path.mkdir(parents=True, exist_ok=True)

        self.sessions[session_id] = {
            "created_at": time.time(),
            "document": None,
            "vector_store": None,
            "last_activity": time.time()
        }
        return session_id

    def get_session(self, session_id: str) -> Optional[dict]:
        session = self.sessions.get(session_id)
        if session:
            session["last_activity"] = time.time()
        return session

    def cleanup_session(self, session_id: str):
        # Удаляем загруженный файл
        session_path = self.upload_dir / session_id
        if session_path.exists():
            shutil.rmtree(session_path)

        # Удаляем векторную БД сессии
        chroma_path = self.chroma_dir / session_id
        if chroma_path.exists():
            shutil.rmtree(chroma_path)

        if session_id in self.sessions:
            del self.sessions[session_id]

    def cleanup_expired(self, timeout: int = 3600):
        now = time.time()
        expired = [
            sid for sid, s in self.sessions.items()
            if now - s["last_activity"] > timeout
        ]
        for sid in expired:
            self.cleanup_session(sid)

session_manager = SessionManager()

"""
Semantic memory — persists chat history in PostgreSQL (chat_messages table).
Each session keeps a rolling window of the last MAX_HISTORY turns.
"""
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)

MAX_HISTORY = 20  # messages stored; 6 most recent sent to LLM


def add_message(session_id: str, role: str, content: str) -> None:
    try:
        from app.core.database import SessionLocal
        from app.models.models import ChatMessage
        with SessionLocal() as db:
            db.add(ChatMessage(session_id=session_id, role=role, content=content))
            db.commit()
    except Exception as e:
        logger.warning("memory add_message failed for %s: %s", session_id, e)


def get_history(session_id: str, limit: int = MAX_HISTORY) -> List[Dict[str, str]]:
    try:
        from app.core.database import SessionLocal
        from app.models.models import ChatMessage
        with SessionLocal() as db:
            rows = (
                db.query(ChatMessage)
                .filter(ChatMessage.session_id == session_id)
                .order_by(ChatMessage.created_at.desc())
                .limit(limit)
                .all()
            )
            return [{"role": r.role, "content": r.content} for r in reversed(rows)]
    except Exception as e:
        logger.warning("memory get_history failed for %s: %s", session_id, e)
        return []


def clear_history(session_id: str) -> None:
    try:
        from app.core.database import SessionLocal
        from app.models.models import ChatMessage
        with SessionLocal() as db:
            db.query(ChatMessage).filter(ChatMessage.session_id == session_id).delete()
            db.commit()
    except Exception as e:
        logger.warning("memory clear_history failed for %s: %s", session_id, e)


def format_history(messages: List[Dict[str, str]], max_turns: int = 3) -> str:
    """Format last max_turns exchanges (user+assistant pairs) as prompt text."""
    if not messages:
        return ""
    # Take last max_turns*2 messages
    recent = messages[-(max_turns * 2):]
    lines = []
    for m in recent:
        label = "Пользователь" if m["role"] == "user" else "Ассистент"
        # Truncate long assistant answers so they don't bloat the prompt
        content = m["content"][:600] + "…" if len(m["content"]) > 600 else m["content"]
        lines.append(f"{label}: {content}")
    return "\n".join(lines)

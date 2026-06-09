"""
Semantic memory — persists chat history in PostgreSQL (chat_messages table).
Enhanced with longer context window and conversation compression.
"""
import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

MAX_HISTORY = 30          # messages stored in DB (increased from 20)
MAX_TURNS_TO_LLM = 5      # turns sent to LLM (increased from 3)
MAX_MESSAGE_CHARS = 1500  # per message (increased from 600)


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


def get_history_count(session_id: str) -> int:
    try:
        from app.core.database import SessionLocal
        from app.models.models import ChatMessage
        with SessionLocal() as db:
            return db.query(ChatMessage).filter(
                ChatMessage.session_id == session_id
            ).count()
    except Exception:
        return 0


def clear_history(session_id: str) -> None:
    try:
        from app.core.database import SessionLocal
        from app.models.models import ChatMessage
        with SessionLocal() as db:
            db.query(ChatMessage).filter(ChatMessage.session_id == session_id).delete(synchronize_session=False)
            db.commit()
    except Exception as e:
        logger.warning("memory clear_history failed for %s: %s", session_id, e)


def format_history(
    messages: List[Dict[str, str]],
    max_turns: int = MAX_TURNS_TO_LLM,
    session_summary: Optional[str] = None,
) -> str:
    """Format last max_turns exchanges as prompt text.

    If session_summary is provided (LLM-compressed older turns), it is
    prepended so the LLM has broader conversation context.
    """
    if not messages:
        return ""

    lines = []

    # Prepend older-conversation summary if available
    if session_summary and session_summary.strip():
        lines.append(f"[Резюме предыдущего диалога]: {session_summary.strip()}")
        lines.append("")

    # Take last max_turns*2 messages (user+assistant pairs)
    recent = messages[-(max_turns * 2):]
    for m in recent:
        label = "Пользователь" if m["role"] == "user" else "Ассистент"
        content = m["content"]
        # Truncate very long messages but keep substantially more context than before
        if len(content) > MAX_MESSAGE_CHARS:
            content = content[:MAX_MESSAGE_CHARS] + "…"
        lines.append(f"{label}: {content}")

    return "\n".join(lines)


async def get_or_create_session_summary(
    session_id: str,
    llm_service,
    min_messages: int = 10,
) -> Optional[str]:
    """Compress older conversation turns into a short summary.

    Only runs if the session has > min_messages messages.
    Stores the summary in session manager for re-use.
    """
    try:
        from app.core.session import session_manager
        session = session_manager.get_session(session_id)
        if not session:
            return None

        # Return cached summary if available
        cached = session.get("conversation_summary")
        if cached:
            return cached

        total = get_history_count(session_id)
        if total < min_messages:
            return None

        # Get older messages (skip the most recent MAX_TURNS_TO_LLM*2)
        all_msgs = get_history(session_id, limit=MAX_HISTORY)
        older = all_msgs[: -(MAX_TURNS_TO_LLM * 2)]
        if not older:
            return None

        # Compress with LLM
        dialogue_text = "\n".join(
            f"{'User' if m['role']=='user' else 'AI'}: {m['content'][:300]}"
            for m in older
        )
        summary_prompt = (
            f"Summarize this conversation history concisely (3-5 sentences), "
            f"preserving key topics and decisions:\n\n{dialogue_text}\n\nSummary:"
        )
        summary = await llm_service.agenerate(summary_prompt)

        # Cache in session
        session["conversation_summary"] = summary.strip()
        session_manager.save_session(session_id)
        return summary.strip()

    except Exception as e:
        logger.warning("get_or_create_session_summary failed for %s: %s", session_id, e)
        return None

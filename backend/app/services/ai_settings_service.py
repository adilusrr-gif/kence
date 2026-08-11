import contextvars
import logging
from typing import Optional
from datetime import datetime

logger = logging.getLogger(__name__)
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.core.database import SessionLocal
from app.models.models import AIPrompt, UserPrompt, DocumentContext

# Carries the acting username through the async/thread call tree so get_prompt()
# can resolve a personal override without threading a `username` parameter
# through every intermediate call (llm.py's agenerate/chat_astream, comparison.py,
# presentation_builder.py, agents/orchestrator.py). Mirrors llm._current_language.
# Set once per request/task at the entry point (see api routes + orchestrator);
# asyncio.to_thread() and asyncio Tasks both propagate contextvars, so a single
# .set() at the top of a route handler is visible in everything it calls.
_current_username: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "prompt_username", default=None
)


def set_current_username(username: Optional[str]):
    """Sets _current_username and returns a reset token (contextvars.Token)."""
    return _current_username.set(username)


def reset_current_username(token) -> None:
    _current_username.reset(token)

DEFAULT_PROMPTS: dict[str, str] = {
    "chat_prompt": (
        "You are a document lookup assistant. Your ONLY job is to find and copy text from the document.\n\n"
        "STRICT RULES:\n"
        "- Find the part of the document that answers the question\n"
        "- Copy it EXACTLY, word for word, character for character\n"
        "- Do NOT rephrase, summarize, or explain anything\n"
        "- Do NOT add your own words\n"
        "- If the answer is a definition - copy the entire definition as written\n"
        "- If not found - say only: \"Не найдено в документе\"\n\n"
        "Document text:\n{context}\n\n"
        "Question: {question}\n\n"
        "Copy the exact matching text from the document above:"
    ),
    "exact_prompt": (
        "You are a precise document-answering assistant. The context below contains "
        "one or more sections of a document, given for grounding.\n\n"
        "STRICT RULES:\n"
        "- Find the exact place in the context that answers the question.\n"
        "- Answer using the document's EXACT wording — never paraphrase, summarize in "
        "your own words, or invent anything not present in the text.\n"
        "- Quote ONLY the specific sentence(s), clause(s), or list item(s) that "
        "directly answer the question — do NOT reproduce the entire section or "
        "unrelated surrounding text.\n"
        "- Exception: if the question asks about a whole list, table, or enumeration, "
        "reproduce that list/table/enumeration completely, item by item.\n"
        "- Preserve exact numbers, names, dates and formatting of whatever you quote.\n"
        "- Do NOT add commentary or explanations beyond the quoted answer.\n"
        "- If nothing in the context answers the question, reply only: "
        "\"Не найдено в документе\".\n\n"
        "Document sections:\n{context}\n\n"
        "Question: {question}\n\n"
        "Answer with the exact minimal quote from the document that answers the question:"
    ),
    "comparison_technical_prompt": (
        "Извлеки технические характеристики/спецификации из документа в формате JSON.\n\n"
        "Документ:\n{text}\n"
        "Формат ответа (строго JSON):\n"
        "{{\n"
        '"product_name": "Название товара/услуги",\n'
        '"specifications": [\n'
        '{{"parameter": "Параметр", "value": "Значение", "unit": "Единица"}}\n'
        "],\n"
        '"key_features": ["Особенность 1", "Особенность 2"]\n'
        "}}\n"
        'Если это не техническая спецификация, верни {{"error": "Not a technical specification"}}.'
    ),
    "comparison_semantic_prompt": (
        "Ты — аналитик документов.\n"
        "Кратко опиши ключевые темы, выводы и структуру документа.\n\n"
        "Документ:\n{text}\n\n"
        "Ответ:"
    ),
    "consultation_prompt": (
        "Ты — умный консультант по документам. Пользователь хочет обсудить содержание и получить экспертный совет.\n"
        "Используй предоставленный контекст как основу, но можешь рассуждать шире и приводить аналогии.\n"
        "Отвечай развёрнуто: объясняй, интерпретируй, предлагай выводы.\n"
        "Если в контексте нет прямого ответа — скажи об этом и предложи свою обоснованную интерпретацию.\n"
        "Форматируй ответ так, чтобы он был понятен: используй списки, выделения и абзацы по необходимости.\n\n"
        "Контекст:\n{context}\n\n"
        "Вопрос: {question}\n\n"
        "Ответ:"
    ),
}


def _db():
    return SessionLocal()


def _ensure_defaults(db) -> None:
    """Seed default prompt rows on first run only — must NOT overwrite admin edits."""
    for prompt_type, content in DEFAULT_PROMPTS.items():
        stmt = (
            pg_insert(AIPrompt)
            .values(prompt_type=prompt_type, content=content)
            .on_conflict_do_nothing(index_elements=["prompt_type"])
        )
        db.execute(stmt)
    db.commit()


# ── Prompts (global defaults, admin-editable) ──────────────────────────────────

def get_prompts() -> dict:
    """Global prompt values (the admin-editable fallback for users with no
    personal override). Used by the admin 'Global prompts' view."""
    try:
        with _db() as db:
            _ensure_defaults(db)
            rows = db.query(AIPrompt).all()
            result = dict(DEFAULT_PROMPTS)
            result.update({r.prompt_type: r.content for r in rows})
            return result
    except Exception as e:
        logger.warning("[ai_settings] get_prompts DB failed, using defaults: %s", e)
        return dict(DEFAULT_PROMPTS)


def get_prompt(prompt_type: str, username: Optional[str] = None) -> str:
    """Resolves the EFFECTIVE prompt for an LLM call: personal override (if the
    acting user has one) → global admin default → hardcoded default.

    `username` is optional — most call sites don't have it in scope (e.g. deep
    inside llm.py/comparison.py), so it falls back to the _current_username
    contextvar set by the API route/orchestrator entry point.
    """
    user = username or _current_username.get()
    if user:
        try:
            with _db() as db:
                row = db.query(UserPrompt).filter_by(username=user, prompt_type=prompt_type).first()
                if row:
                    return row.content
        except Exception as e:
            logger.warning("[ai_settings] get_prompt personal lookup failed for %s/%s: %s", user, prompt_type, e)
    try:
        with _db() as db:
            row = db.get(AIPrompt, prompt_type)
            if row:
                return row.content
    except Exception as e:
        logger.warning("[ai_settings] get_prompt DB failed for %s: %s", prompt_type, e)
    return DEFAULT_PROMPTS.get(prompt_type, "")


def update_prompt(prompt_type: str, content: str) -> bool:
    """Admin-only: updates the GLOBAL default. Users with a personal override
    are unaffected until they reset it."""
    if prompt_type not in DEFAULT_PROMPTS:
        return False
    with _db() as db:
        row = db.get(AIPrompt, prompt_type)
        if row:
            row.content = content
        else:
            db.add(AIPrompt(prompt_type=prompt_type, content=content))
        db.commit()
    return True


def reset_prompt(prompt_type: str) -> Optional[str]:
    if prompt_type not in DEFAULT_PROMPTS:
        return None
    content = DEFAULT_PROMPTS[prompt_type]
    update_prompt(prompt_type, content)
    return content


# ── Prompts (per-user overrides) ────────────────────────────────────────────

def get_user_prompts(username: str) -> dict:
    """Effective prompts for a specific user, with per-type metadata so the
    UI can show whether a value is personal or inherited from the global default."""
    global_prompts = get_prompts()
    try:
        with _db() as db:
            rows = db.query(UserPrompt).filter_by(username=username).all()
            personal = {r.prompt_type: r.content for r in rows}
    except Exception as e:
        logger.warning("[ai_settings] get_user_prompts failed for %s: %s", username, e)
        personal = {}
    return {
        pt: {
            "content": personal.get(pt, content),
            "is_personal": pt in personal,
            "global_content": content,
        }
        for pt, content in global_prompts.items()
    }


def update_user_prompt(username: str, prompt_type: str, content: str) -> bool:
    if prompt_type not in DEFAULT_PROMPTS:
        return False
    with _db() as db:
        row = db.query(UserPrompt).filter_by(username=username, prompt_type=prompt_type).first()
        if row:
            row.content = content
        else:
            db.add(UserPrompt(username=username, prompt_type=prompt_type, content=content))
        db.commit()
    return True


def delete_user_prompt(username: str, prompt_type: str) -> bool:
    """Removes the user's personal override — they revert to the global default."""
    with _db() as db:
        row = db.query(UserPrompt).filter_by(username=username, prompt_type=prompt_type).first()
        if not row:
            return False
        db.delete(row)
        db.commit()
        return True


def reset_all_prompts() -> None:
    with _db() as db:
        for prompt_type, content in DEFAULT_PROMPTS.items():
            row = db.get(AIPrompt, prompt_type)
            if row:
                row.content = content
            else:
                db.add(AIPrompt(prompt_type=prompt_type, content=content))
        db.commit()


# ── Document Contexts ─────────────────────────────────────────────────────────

def save_document_context(username: str, document_name: str, context: str) -> None:
    with _db() as db:
        stmt = (
            pg_insert(DocumentContext)
            .values(username=username, document_name=document_name, context=context)
            .on_conflict_do_update(
                index_elements=None,
                constraint="uq_user_doc_context",
                set_={"context": context, "updated_at": datetime.utcnow()},
            )
        )
        db.execute(stmt)
        db.commit()


def get_document_context(username: str, document_name: str) -> Optional[str]:
    try:
        with _db() as db:
            row = (
                db.query(DocumentContext)
                .filter_by(username=username, document_name=document_name)
                .first()
            )
            return row.context if row else None
    except Exception:
        return None


def delete_document_context(username: str, document_name: str) -> bool:
    with _db() as db:
        row = (
            db.query(DocumentContext)
            .filter_by(username=username, document_name=document_name)
            .first()
        )
        if not row:
            return False
        db.delete(row)
        db.commit()
        return True


def get_user_document_contexts(username: str) -> dict:
    try:
        with _db() as db:
            rows = db.query(DocumentContext).filter_by(username=username).all()
            return {r.document_name: {"context": r.context} for r in rows}
    except Exception:
        return {}

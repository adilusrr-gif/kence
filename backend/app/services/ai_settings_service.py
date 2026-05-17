import logging
from typing import Optional
from datetime import datetime

logger = logging.getLogger(__name__)
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.core.database import SessionLocal
from app.models.models import AIPrompt, DocumentContext

DEFAULT_PROMPTS: dict[str, str] = {
    "chat_prompt": (
        "Ты — полезный ассистент для работы с документами.\n"
        "Отвечай ТОЛЬКО на основе предоставленного контекста.\n"
        "Если ответа нет в контексте, скажи об этом честно.\n"
        "Форматируй ответ так, чтобы он был максимально понятен:\n"
        "- Если контекст содержит таблицу или вопрос требует сравнения/перечисления данных — "
        "используй Markdown-таблицу (| Столбец | Столбец |\\n|---|---|\\n| ... |).\n"
        "- Если вопрос требует списка — используй маркированный список.\n"
        "- В остальных случаях пиши связными абзацами.\n"
        "Не сокращай ответ до голых тезисов. Отвечай развёрнуто.\n\n"
        "Контекст:\n{context}\n\n"
        "Вопрос: {question}\n\n"
        "Ответ (на русском языке):"
    ),
    "presentation_prompt": (
        "На основе следующего документа создай структуру презентации.\n\n"
        "Документ:\n{context}\n\n"
        "Создай JSON-структуру презентации:\n"
        "- 5-8 слайдов\n"
        "- Каждый слайд: заголовок + 3-5 ключевых пунктов\n"
        "- Первый слайд — титульный\n"
        "- Последний — выводы\n\n"
        "Ответ строго в формате JSON:\n"
        "{{\n"
        '  "title": "Название презентации",\n'
        '  "slides": [\n'
        "    {{\n"
        '      "title": "Заголовок слайда",\n'
        '      "points": ["Пункт 1", "Пункт 2", "Пункт 3"]\n'
        "    }}\n"
        "  ]\n"
        "}}"
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
        "Ответ на русском языке:"
    ),
    "consultation_prompt": (
        "Ты — умный консультант по документам. Пользователь хочет обсудить содержание и получить экспертный совет.\n"
        "Используй предоставленный контекст как основу, но можешь рассуждать шире и приводить аналогии.\n"
        "Отвечай развёрнуто: объясняй, интерпретируй, предлагай выводы.\n"
        "Если в контексте нет прямого ответа — скажи об этом и предложи свою обоснованную интерпретацию.\n"
        "Форматируй ответ так, чтобы он был понятен: используй списки, выделения и абзацы по необходимости.\n\n"
        "Контекст:\n{context}\n\n"
        "Вопрос: {question}\n\n"
        "Ответ (на русском языке):"
    ),
}


def _db():
    return SessionLocal()


def _ensure_defaults(db) -> None:
    for prompt_type, content in DEFAULT_PROMPTS.items():
        stmt = (
            pg_insert(AIPrompt)
            .values(prompt_type=prompt_type, content=content)
            .on_conflict_do_update(
                index_elements=["prompt_type"],
                set_={"content": content},
                where=(AIPrompt.content != content),
            )
        )
        db.execute(stmt)
    db.commit()


# ── Prompts ───────────────────────────────────────────────────────────────────

def get_prompts() -> dict:
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


def get_prompt(prompt_type: str) -> str:
    try:
        with _db() as db:
            row = db.get(AIPrompt, prompt_type)
            if row:
                return row.content
    except Exception as e:
        logger.warning("[ai_settings] get_prompt DB failed for %s: %s", prompt_type, e)
    return DEFAULT_PROMPTS.get(prompt_type, "")


def update_prompt(prompt_type: str, content: str) -> bool:
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

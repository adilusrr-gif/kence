import json
from pathlib import Path
from typing import Optional
from datetime import datetime

DATA_DIR = Path("./data")
PROMPTS_FILE = DATA_DIR / "ai_prompts.json"
DOC_CONTEXTS_FILE = DATA_DIR / "doc_contexts.json"

DEFAULT_PROMPTS: dict[str, str] = {
    "chat_prompt": (
        "Ты — полезный ассистент для работы с документами.\n"
        "Отвечай ТОЛЬКО на основе предоставленного контекста.\n"
        "Если ответа нет в контексте, скажи об этом честно.\n\n"
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
}


def _load_prompts() -> dict:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if PROMPTS_FILE.exists():
        try:
            with open(PROMPTS_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
            merged = dict(DEFAULT_PROMPTS)
            merged.update(saved)
            return merged
        except Exception:
            pass
    return dict(DEFAULT_PROMPTS)


def _save_prompts(prompts: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(PROMPTS_FILE, "w", encoding="utf-8") as f:
        json.dump(prompts, f, ensure_ascii=False, indent=2)


def get_prompts() -> dict:
    return _load_prompts()


def get_prompt(prompt_type: str) -> str:
    return _load_prompts().get(prompt_type, DEFAULT_PROMPTS.get(prompt_type, ""))


def update_prompt(prompt_type: str, content: str) -> bool:
    if prompt_type not in DEFAULT_PROMPTS:
        return False
    prompts = _load_prompts()
    prompts[prompt_type] = content
    _save_prompts(prompts)
    return True


def reset_prompt(prompt_type: str) -> Optional[str]:
    if prompt_type not in DEFAULT_PROMPTS:
        return None
    prompts = _load_prompts()
    prompts[prompt_type] = DEFAULT_PROMPTS[prompt_type]
    _save_prompts(prompts)
    return DEFAULT_PROMPTS[prompt_type]


def reset_all_prompts() -> None:
    _save_prompts(dict(DEFAULT_PROMPTS))


# ── Document Contexts ──────────────────────────────────────────────────────

def _load_contexts() -> dict:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if DOC_CONTEXTS_FILE.exists():
        try:
            with open(DOC_CONTEXTS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_contexts(contexts: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(DOC_CONTEXTS_FILE, "w", encoding="utf-8") as f:
        json.dump(contexts, f, ensure_ascii=False, indent=2)


def save_document_context(username: str, document_name: str, context: str) -> None:
    all_contexts = _load_contexts()
    if username not in all_contexts:
        all_contexts[username] = {}
    all_contexts[username][document_name] = {
        "context": context,
        "updated_at": datetime.utcnow().isoformat(),
    }
    _save_contexts(all_contexts)


def get_document_context(username: str, document_name: str) -> Optional[str]:
    entry = _load_contexts().get(username, {}).get(document_name)
    return entry["context"] if entry else None


def delete_document_context(username: str, document_name: str) -> bool:
    all_contexts = _load_contexts()
    if username in all_contexts and document_name in all_contexts[username]:
        del all_contexts[username][document_name]
        _save_contexts(all_contexts)
        return True
    return False


def get_user_document_contexts(username: str) -> dict:
    return _load_contexts().get(username, {})

import json
import uuid
from typing import Optional
from app.core.session import session_manager

SLIDE_TYPES = {
    "title":   "Титульный",
    "content": "Контент (список)",
    "chart":   "График / Диаграмма",
    "image":   "Изображение + текст",
    "quote":   "Цитата / Выделение",
    "summary": "Выводы",
}

THEMES = {
    "corporate": {"bg": "#1A2744", "accent": "#3B82F6", "text": "#FFFFFF"},
    "light":     {"bg": "#FFFFFF", "accent": "#2563EB", "text": "#111827"},
    "dark":      {"bg": "#0F172A", "accent": "#60A5FA", "text": "#F1F5F9"},
    "green":     {"bg": "#064E3B", "accent": "#10B981", "text": "#FFFFFF"},
    "minimal":   {"bg": "#F8FAFC", "accent": "#6366F1", "text": "#0F172A"},
    "ocean":     {"bg": "#0C2340", "accent": "#38BDF8", "text": "#E0F2FE"},
    "sunset":    {"bg": "#1C0A00", "accent": "#F97316", "text": "#FFF7ED"},
}

_PLAN_PROMPT = """Ты генератор структуры презентаций. На основе текста документа создай план презентации в формате JSON.

Текст документа:
{text}

Пожелания пользователя: {user_instructions}
Количество слайдов (не считая title и summary): {content_slides}

Создай JSON-план со следующей структурой:
{{
  "title": "Название презентации",
  "slides": [
    {{
      "id": "уникальный-id",
      "type": "title|content|chart|quote|summary",
      "title": "Заголовок слайда",
      "points": ["пункт 1", "пункт 2"],
      "chart_type": "bar|line|pie (только для type=chart)",
      "data_hint": "описание данных для графика (только для type=chart)"
    }}
  ]
}}

Правила:
- Первый слайд всегда type=title, его points[0] — краткий подзаголовок презентации
- Последний слайд всегда type=summary с 4-5 ключевыми выводами из документа
- Общее количество слайдов: {content_slides} + 2 (title + summary)
- Включи 1-2 слайда type=chart если в документе есть числовые данные; data_hint должен содержать конкретные числа из текста
- Каждый пункт (points) — полное информативное предложение не менее 8 слов, не просто слово или фраза
- Для type=content: points — развёрнутые тезисы с конкретными фактами из документа
- Если указаны пожелания пользователя — обязательно учти их
- Ответь ТОЛЬКО валидным JSON без markdown-блоков"""


def generate_plan(session_id: str, llm_service, user_instructions: str = "", num_slides: int = 6) -> dict:
    session = session_manager.get_session(session_id)
    if not session:
        raise ValueError("Session not found")

    text = session.get("markdown_text", "")
    if not text:
        raise ValueError("No document in session")

    from app.services.pipeline import stratified_sample
    content_slides = max(2, min(num_slides, 12))
    snippet = stratified_sample(text, target_chars=12000, n_parts=5) if len(text) > 12000 else text
    instructions = user_instructions.strip() or "нет особых пожеланий"
    prompt = _PLAN_PROMPT.format(text=snippet, user_instructions=instructions, content_slides=content_slides)

    try:
        raw = llm_service.simple_chat(prompt)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        plan = json.loads(raw)
    except Exception:
        plan = _default_plan(session.get("document", "Документ"), text)

    for slide in plan.get("slides", []):
        if "id" not in slide or not slide["id"]:
            slide["id"] = str(uuid.uuid4())

    session["presentation_plan"] = plan
    return plan


def _default_plan(doc_name: str, text: str) -> dict:
    preview = text[:200].replace("\n", " ")
    return {
        "title": doc_name,
        "slides": [
            {"id": str(uuid.uuid4()), "type": "title",   "title": doc_name,          "points": []},
            {"id": str(uuid.uuid4()), "type": "content", "title": "Основные тезисы", "points": [preview[:100]]},
            {"id": str(uuid.uuid4()), "type": "summary", "title": "Выводы",          "points": ["Документ обработан успешно"]},
        ]
    }


def save_plan(session_id: str, plan: dict) -> dict:
    session = session_manager.get_session(session_id)
    if not session:
        raise ValueError("Session not found")
    for slide in plan.get("slides", []):
        if "id" not in slide or not slide["id"]:
            slide["id"] = str(uuid.uuid4())
    session["presentation_plan"] = plan
    return plan


def get_plan(session_id: str) -> Optional[dict]:
    session = session_manager.get_session(session_id)
    if not session:
        return None
    return session.get("presentation_plan")

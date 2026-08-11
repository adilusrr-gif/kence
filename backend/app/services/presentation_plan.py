import json
import uuid
from typing import Optional
from app.core.session import session_manager

SLIDE_TYPES = {
    "title":           "Титульный",
    "content":         "Контент (список)",
    "chart":           "График / Диаграмма",
    "kpi_row":         "KPI-метрики (карточки)",
    "big_number":      "Ключевая цифра (акцент)",
    "two_column":      "Сравнение (два столбца)",
    "section_divider": "Разделитель раздела",
    "image":           "Изображение + текст",
    "quote":           "Цитата / Выделение",
    "summary":         "Выводы",
}

THEMES = {
    "corporate": {"label": "Corporate", "bg": "#1A2744", "accent": "#3B82F6", "text": "#FFFFFF"},
    "light":     {"label": "Light",     "bg": "#FFFFFF", "accent": "#2563EB", "text": "#111827"},
    "dark":      {"label": "Dark",      "bg": "#0F172A", "accent": "#60A5FA", "text": "#F1F5F9"},
    "green":     {"label": "Green",     "bg": "#064E3B", "accent": "#10B981", "text": "#FFFFFF"},
    "minimal":   {"label": "Minimal",   "bg": "#F8FAFC", "accent": "#6366F1", "text": "#0F172A"},
    "ocean":     {"label": "Ocean",     "bg": "#0C2340", "accent": "#38BDF8", "text": "#E0F2FE"},
    "sunset":    {"label": "Sunset",    "bg": "#1C0A00", "accent": "#F97316", "text": "#FFF7ED"},
}

_PLAN_PROMPT = """Ты — дизайнер презентаций для топ-менеджмента (уровень совета директоров). На основе текста документа создай план презентации в формате JSON.

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
      "type": "title|content|chart|kpi_row|big_number|two_column|section_divider|quote|summary",
      "title": "Заголовок слайда",
      "points": ["тезис 1", "тезис 2"],
      "chart_type": "bar|line|pie (только для type=chart)",
      "data": {{"labels": ["A", "B"], "values": [1, 2], "unit": "млн ₽ (если применимо)"}}
    }}
  ]
}}

Правила:
- Первый слайд всегда type=title, его points[0] — краткий подзаголовок презентации
- Последний слайд всегда type=summary с 4-5 ключевыми выводами из документа
- Общее количество слайдов: {content_slides} + 2 (title + summary)
- Стиль пунктов (points) — как в презентации для совета директоров: короткий ударный тезис заголовочного типа, активный залог, конкретика вместо общих слов, максимум ~12 слов. НЕ пиши длинные полные предложения — пиши так, как звучит заголовок слайда, а не абзац.
- Используй разнообразие типов слайдов вместо сплошного content — это презентация для руководства, а не текстовый документ. Если в документе есть подходящие числа/факты, используй kpi_row (3-4 ключевые метрики) или big_number (одна главная цифра) вместо очередного content-слайда. Если есть сравнение (было/стало, до/после, вариант А/вариант Б) — используй two_column. Если презентация длинная (более 6 content-слайдов) — раздели её на смысловые блоки слайдами type=section_divider.
- Для type=kpi_row: заполни поле "data" (как для chart) — 3-4 реальные метрики с подписями, только цифры из текста документа.
- Для type=big_number: points[0] — главная цифра/показатель одной короткой фразой (например "+23% выручка год к году"), points[1..3] — короткие поясняющие тезисы.
- Для type=two_column: вместо "points" укажи "left_title", "left_points" (массив), "right_title", "right_points" (массив) — например "Было"/"Стало" или "Проблема"/"Решение".
- Для type=section_divider: title — название раздела, points[0] (необязательно) — краткий подзаголовок раздела.
- Если указаны пожелания пользователя — обязательно учти их
- Ответь ТОЛЬКО валидным JSON без markdown-блоков

Правило про цифры (обязательно к соблюдению): заполняй поле "data" (для type=chart и type=kpi_row) и любые цифры в points только реальными числами, которые буквально присутствуют в тексте документа — никогда не придумывай и не оценивай цифры. Создавай слайды type=chart/kpi_row, только если в документе действительно есть подходящие числа. Если подходящих числовых данных нет — используй type=content вместо chart/kpi_row."""


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
        raw = llm_service.simple_chat_guarded(prompt)
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

    _validate_chart_data(plan, snippet)

    session["presentation_plan"] = plan
    return plan


def _validate_chart_data(plan: dict, source_text: str) -> None:
    """Downgrade chart/kpi_row slides to content when data is missing/malformed, or
    when values can't be traced back to the source snippet (guards against the
    model inventing numbers despite the prompt rule)."""
    for slide in plan.get("slides", []):
        if slide.get("type") not in ("chart", "kpi_row"):
            continue
        data = slide.get("data") or {}
        labels = data.get("labels")
        values = data.get("values")
        valid = (
            isinstance(labels, list) and isinstance(values, list)
            and len(labels) > 0 and len(labels) == len(values)
        )
        if valid:
            valid = all(_value_grounded(v, source_text) for v in values)
        if not valid:
            slide["type"] = "content"
            slide.pop("data", None)
            slide.pop("chart_type", None)


def _value_grounded(value, source_text: str) -> bool:
    """Loose check that a numeric value appears verbatim in the source text,
    tolerant of '.' vs ',' decimal separators and thousands formatting."""
    try:
        num = float(value)
    except (TypeError, ValueError):
        return False
    candidates = {str(value)}
    if num == int(num):
        candidates.add(str(int(num)))
    else:
        candidates.add(f"{num:g}".replace(".", ","))
        candidates.add(f"{num:g}")
    return any(c and c in source_text for c in candidates)


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

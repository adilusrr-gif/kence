from .orchestrator import run_agent_task, get_agent_class

AGENT_TYPES = {
    "document_analyst": {
        "label": "Аналитик документа",
        "description": "Глубокий анализ с темами, фактами и уверенностью в ответе",
        "input_schema": {"session_id": "string", "question": "string"},
    },
    "data_extractor": {
        "label": "Извлечение данных",
        "description": "Структурированное извлечение сущностей, фактов, чисел и выводов из всего документа",
        "input_schema": {"session_id": "string"},
    },
    "timeline": {
        "label": "Хронология событий",
        "description": "Извлечение всех дат, событий и вех из документа — хронологическая шкала",
        "input_schema": {"session_id": "string"},
    },
    "risk_engine": {
        "label": "Оценка рисков",
        "description": "AI-анализ финансовых, юридических, операционных и других рисков (0–100)",
        "input_schema": {"session_id": "string"},
    },
    "summary": {
        "label": "Суммаризация",
        "description": "Краткое резюме документа по методу map-reduce",
        "input_schema": {"session_id": "string"},
    },
    "comparison": {
        "label": "Сравнение документов",
        "description": "Смысловое и техническое сравнение двух документов",
        "input_schema": {"session_id": "string"},
    },
    "report_generator": {
        "label": "Генератор отчёта",
        "description": "Структурированный многосекционный отчёт по документу",
        "input_schema": {"session_id": "string", "instructions": "string"},
    },
    "research": {
        "label": "Исследование корпуса",
        "description": "Анализ нескольких документов из библиотеки организации",
        "input_schema": {"org_id": "integer", "question": "string"},
    },
    "document_editor": {
        "label": "Редактор документа",
        "description": "Редактирует текст и таблицы, строит графики, экспортирует в DOCX",
        "input_schema": {"session_id": "string", "instructions": "string"},
    },
    "government_briefing": {
        "label": "Оперативная сводка",
        "description": "Государственная аналитическая сводка: резюме, риски, хронология, рекомендации, решения",
        "input_schema": {"session_id": "string"},
    },
    "compliance": {
        "label": "Проверка на соответствие НПА",
        "description": "Проверка текущего документа на соответствие НПА/закону из библиотеки: пункты, статус, рекомендации, оценка соответствия",
        "input_schema": {"session_id": "string", "library_doc_ids": "array", "direction": "string"},
    },
}

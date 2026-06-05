from .orchestrator import run_agent_task, get_agent_class

AGENT_TYPES = {
    "document_analyst": {
        "label": "Аналитик документа",
        "description": "Глубокий анализ содержимого одного документа",
        "input_schema": {"session_id": "string", "question": "string"},
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
}

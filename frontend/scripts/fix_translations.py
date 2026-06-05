"""Remove AI jargon from all 3 locales."""
import json

def deep_update(target, src):
    for k, v in src.items():
        if isinstance(v, dict) and k in target and isinstance(target[k], dict):
            deep_update(target[k], v)
        else:
            target[k] = v

RU = {
    "upload": {
        "stages": {
            "upload": "Загрузка",
            "parse": "Чтение документа",
            "extract": "Анализ содержания",
            "vectorize": "Подготовка поиска"
        }
    },
    "nav": {
        "workspace": "Работа с документом",
        "graph": "Связи и сущности",
        "agents": "Анализ",
        "executive": "Статистика",
        "aiSettings": "Настройки"
    },
    "landing": {
        "features": {
            "rag": {
                "label": "Вопросы по документу",
                "desc": "Задайте любой вопрос — система найдёт точный ответ"
            }
        },
        "activity": {
            "rag":      {"label": "Поиск по документам готов",   "meta": "Быстрый поиск по тексту"},
            "ollama":   {"label": "AI-помощник подключён",        "meta": "Готов отвечать на вопросы"},
            "pipeline": {"label": "Чтение документов готово",     "meta": "Поддержка всех форматов"},
            "local":    {"label": "Данные хранятся локально",     "meta": "Конфиденциальность гарантирована"}
        }
    },
    "agents": {
        "title": "Анализ документа",
        "subtitle": "Выберите что хотите получить из документа",
        "sessionIdLabel": "Документ (оставьте пустым — используется текущий)",
        "questionLabel": "Ваш вопрос",
        "instructionsLabel": "Уточнения (необязательно)"
    },
    "workspace": {
        "ai": "Умный помощник",
        "precise": "Точный ответ",
        "consultation": "Консультация",
        "visual": "Описание изображения",
        "preciseTitle": "Точные ответы строго на основе документа",
        "consultationTitle": "Широкий анализ с интерпретацией и выводами",
        "visualTitle": "Подробное описание изображения",
        "docContext": "О документе",
        "contextHint": "Расскажите что это за документ — помощник учтёт это при ответах",
        "greeting": "Привет! Загрузите документ и задайте любой вопрос — я отвечу на понятном языке.",
        "editWithAgent": "Улучшить с ИИ",
        "downloadDocx": "Скачать Word",
        "downloadPdf": "Скачать PDF",
        "agentEditHeader": "Улучшение документа с ИИ",
        "agentHint": "Опишите что улучшить — ИИ внесёт правки автоматически.",
        "agentPlaceholder": "Например: улучши структуру, исправь грамматику, добавь резюме",
        "agentRunning": "Обрабатывается…",
        "agentLaunch": "Запустить",
        "chartHintBadge": "График будет создан автоматически"
    }
}

EN = {
    "upload": {
        "stages": {
            "upload": "Uploading",
            "parse": "Reading document",
            "extract": "Analyzing content",
            "vectorize": "Preparing search"
        }
    },
    "nav": {
        "workspace": "Document",
        "graph": "Connections",
        "agents": "Analysis",
        "executive": "Statistics",
        "aiSettings": "Settings"
    },
    "landing": {
        "features": {
            "rag": {
                "label": "Ask Questions",
                "desc": "Ask anything — get precise answers from the document"
            }
        },
        "activity": {
            "rag":      {"label": "Document search ready",    "meta": "Fast full-text search"},
            "ollama":   {"label": "AI assistant connected",   "meta": "Ready to answer questions"},
            "pipeline": {"label": "Document reading ready",   "meta": "All formats supported"},
            "local":    {"label": "Data stored locally",      "meta": "Privacy guaranteed"}
        }
    },
    "agents": {
        "title": "Document Analysis",
        "subtitle": "Choose what you want to get from the document",
        "sessionIdLabel": "Document (leave blank to use current)",
        "questionLabel": "Your question",
        "instructionsLabel": "Instructions (optional)"
    },
    "workspace": {
        "ai": "Smart Assistant",
        "precise": "Precise Answer",
        "consultation": "Consultation",
        "visual": "Image Description",
        "preciseTitle": "Precise answers strictly from the document",
        "consultationTitle": "Broad analysis with interpretation and conclusions",
        "visualTitle": "Detailed image description",
        "docContext": "About Document",
        "contextHint": "Describe the document — the assistant will consider this when answering",
        "greeting": "Hello! Upload a document and ask any question — I will answer in plain language.",
        "editWithAgent": "Improve with AI",
        "downloadDocx": "Download Word",
        "downloadPdf": "Download PDF",
        "agentEditHeader": "Improve Document with AI",
        "agentHint": "Describe what to improve — AI will make the changes automatically.",
        "agentPlaceholder": "E.g.: improve structure, fix grammar, add summary",
        "agentRunning": "Processing…",
        "agentLaunch": "Run",
        "chartHintBadge": "Chart will be created automatically"
    }
}

KZ = {
    "upload": {
        "stages": {
            "upload": "Жүктеу",
            "parse": "Құжатты оқу",
            "extract": "Мазмұнды талдау",
            "vectorize": "Іздеуді дайындау"
        }
    },
    "nav": {
        "workspace": "Құжатпен жұмыс",
        "graph": "Байланыстар",
        "agents": "Талдау",
        "executive": "Статистика",
        "aiSettings": "Параметрлер"
    },
    "workspace": {
        "ai": "Ақылды көмекші",
        "precise": "Нақты жауап",
        "consultation": "Кеңес",
        "visual": "Суретті сипаттау",
        "greeting": "Сәлем! Кез келген сұрақ қойыңыз — қарапайым тілде жауап беремін.",
        "editWithAgent": "ЖИ-мен жақсарту",
        "downloadDocx": "Word жүктеу",
        "downloadPdf": "PDF жүктеу"
    }
}

for lang, data in [("ru", RU), ("en", EN), ("kz", KZ)]:
    path = f"D:/DocAI/frontend/public/locales/{lang}/translation.json"
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    deep_update(d, data)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    print(f"{lang}: OK")

print("All locales updated")

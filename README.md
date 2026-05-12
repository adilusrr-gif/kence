# DocuAI — AI-ассистент для документов (с Docling)

Веб-приложение для локальной работы с документами через LLM.

## Возможности

- 📄 **Docling парсер** — PDF, Word, Excel, PowerPoint, HTML, изображения, LaTeX
- 💬 **Чат с ИИ** — задавайте вопросы по содержанию документа
- 📊 **Генерация презентаций** — автоматическое создание PPTX
- 🔒 **Полностью локально** — данные не покидают вашу сеть
- 🧹 **Сессионное знание** — знание сбрасывается при загрузке нового документа

## Быстрый старт

### 1. Установка Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### 2. Загрузка моделей

```bash
ollama pull llama3
ollama pull nomic-embed-text
```

### 3. Запуск

```bash
cd docuai
docker-compose up --build
```

Откройте http://localhost:3000

## Поддерживаемые форматы (Docling)

| Формат | Описание |
|--------|----------|
| PDF | С таблицами, формулами, многостолбцовые |
| DOCX/DOC | Word документы |
| PPTX/PPT | PowerPoint презентации |
| XLSX/XLS | Excel таблицы |
| HTML/HTM | Веб-страницы |
| PNG/JPG/TIFF | Изображения (с OCR) |
| TEX | LaTeX документы |
| TXT | Текстовые файлы |

## Структура проекта

```
docuai/
├── backend/
│   ├── app/
│   │   ├── api/routes.py       # REST API
│   │   ├── core/
│   │   │   ├── config.py       # Настройки
│   │   │   └── session.py      # Менеджер сессий
│   │   └── services/
│   │       ├── document.py     # Docling парсер + RAG
│   │       ├── llm.py          # QA + генерация структуры
│   │       └── presentation.py # PPTX генератор
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env
├── frontend/
│   └── src/pages/
│       ├── UploadPage.jsx
│       ├── ChatPage.jsx
│       └── PresentationPage.jsx
└── docker-compose.yml
```

## API Endpoints

| Method | Endpoint | Описание |
|--------|----------|----------|
| POST | /api/sessions | Создать сессию |
| POST | /api/documents/upload | Загрузить документ |
| POST | /api/chat | Задать вопрос |
| POST | /api/presentations/generate | Сгенерировать презентацию |
| GET | /api/presentations/download/{id} | Скачать PPTX |

## Настройка

Отредактируйте `backend/.env`:

```env
LLM_MODEL=llama3
EMBEDDING_MODEL=nomic-embed-text
CHUNK_SIZE=1000
SESSION_TIMEOUT=3600
```

## Лицензия

MIT

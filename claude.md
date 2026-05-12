# DocuAI — План проекта

## 📋 Описание

**DocuAI** — AI-ассистент для работы с документами. Загружайте документ и взаимодействуйте с ним через интеллектуальный интерфейс: задавайте вопросы, переводите, сравнивайте, конвертируйте и генерируйте презентации.

**Стек:** FastAPI + Ollama (backend) · React + Vite (frontend) · Docker Compose · Docling (парсинг) · ChromaDB (векторный поиск)

---

## 🔧 Функции проекта

### 1. 💬 Точный ответ по документу (RAG-чат)

Пользователь загружает документ и задаёт вопросы — система находит релевантные фрагменты через векторный поиск и формирует точный ответ с помощью LLM.

| Компонент | Файл | Статус |
|-----------|------|--------|
| Backend API | `backend/app/api/routes.py` → `POST /api/chat` | ✅ Готово |
| Сервис LLM | `backend/app/services/llm.py` | ✅ Готово |
| Сервис документов | `backend/app/services/document.py` | ✅ Готово |
| Frontend страница | `frontend/src/pages/ChatPage.jsx` | ✅ Готово |

**Поддерживаемые форматы:** PDF, DOCX, PPTX, XLSX, HTML, TXT, PNG, JPG, TIFF, TEX

---

### 2. 🌐 Перевод на три языка (Казахский / Русский / Английский)

Перевод содержимого загруженного документа или ответов на казахский, русский и английский языки с помощью LLM.

| Компонент | Файл | Статус |
|-----------|------|--------|
| Backend API | `backend/app/api/routes.py` → `POST /api/translate` | ✅ Готово |
| Сервис перевода | `backend/app/services/translation.py` | ✅ Готово |
| Frontend UI (выбор языка) | `frontend/src/pages/ChatPage.jsx` — панель кнопок | ✅ Готово |

**Реализовано:**
- ✅ `backend/app/services/translation.py` — сервис перевода через Ollama
- ✅ Endpoint `POST /api/translate` с параметрами `session_id`, `target_language`
- ✅ Endpoint `POST /api/translate/text` — перевод произвольного текста
- ✅ Панель кнопок (🇰🇿 KZ / 🇷🇺 RU / 🇬🇧 EN) в чате — перевод документа одним кликом

---

### 3. ⚖️ Сравнение документов (смысловое и техническое)

Загрузка двух документов и их сравнение: **смысловое** (по содержанию, темам, выводам) и **техническое** (по структуре, форматированию, метаданным).

| Компонент | Файл | Статус |
|-----------|------|--------|
| Backend API | `backend/app/api/comparison_routes.py` | ✅ Готово |
| Сервис сравнения | `backend/app/services/comparison.py` | ✅ Готово |
| Frontend страница | `frontend/src/pages/ComparisonPage.jsx` | ✅ Готово |

**Endpoints:**
- `POST /api/compare/upload` — загрузка двух документов
- `POST /api/compare/semantic` — смысловое сравнение
- `POST /api/compare/technical` — техническое сравнение

---

### 4. 🔄 Изменение формата документа (конвертация)

Конвертация загруженного документа в другой формат (например, DOCX → PDF, PDF → TXT и т.д.).

| Компонент | Файл | Статус |
|-----------|------|--------|
| Backend API | `backend/app/api/routes.py` + новые endpoints | ✅ Готово |
| Сервис конвертации | `backend/app/services/converter.py` | ✅ Готово |
| Frontend UI | `frontend/src/pages/ConvertPage.jsx` | ✅ Готово |

**Реализовано:**
- ✅ `backend/app/services/converter.py` — конвертация через Docling
- ✅ Endpoint `POST /api/documents/convert?session_id=&target_format=`
- ✅ Endpoint `GET /api/documents/converted/{session_id}/{format}` — скачивание
- ✅ Поддерживаемые форматы: TXT · Markdown · DOCX
- ✅ Новая страница `/convert` с выбором формата и авто-скачиванием

---

### 5. 📊 Генерация презентации по документу

Автоматическое создание PPTX-презентации на основе содержимого документа. LLM анализирует текст и формирует структуру слайдов.

| Компонент | Файл | Статус |
|-----------|------|--------|
| Backend API | `backend/app/api/routes.py` → `POST /api/presentations/generate` | ✅ Готово |
| Сервис презентаций | `backend/app/services/presentation.py` | ✅ Готово |
| Frontend страница | `frontend/src/pages/PresentationPage.jsx` | ✅ Готово |

---

## 🗂 Архитектура проекта

```
DocAI/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes.py              # Основные endpoints (чат, загрузка, презентации)
│   │   │   └── comparison_routes.py   # Endpoints сравнения документов
│   │   ├── services/
│   │   │   ├── document.py            # Парсинг документов (Docling)
│   │   │   ├── llm.py                 # Взаимодействие с Ollama LLM
│   │   │   ├── comparison.py          # Смысловое и техническое сравнение
│   │   │   ├── presentation.py        # Генерация PPTX
│   │   │   ├── translation.py         # ✅ Перевод (KZ/RU/EN)
│   │   │   └── converter.py           # ✅ Конвертация форматов (TXT/MD/DOCX)
│   │   ├── core/
│   │   │   ├── config.py              # Настройки приложения
│   │   │   └── session.py             # Менеджер сессий
│   │   └── main.py                    # Точка входа FastAPI
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── UploadPage.jsx         # Загрузка документов
│       │   ├── ChatPage.jsx           # Чат с документом + перевод KZ/RU/EN
│       │   ├── PresentationPage.jsx   # Генерация презентаций
│       │   ├── ComparisonPage.jsx     # Сравнение документов
│       │   └── ConvertPage.jsx        # ✅ Конвертация формата
│       └── App.jsx                    # Роутинг и навигация
├── docker-compose.yml
└── claude.md                          # Этот файл
```

---

## 📊 Сводка по статусу

| # | Функция | Статус |
|---|---------|--------|
| 1 | Точный ответ по документу (RAG) | ✅ Готово |
| 2 | Перевод (KZ / RU / EN) | ✅ Готово |
| 3 | Сравнение документов | ✅ Готово |
| 4 | Конвертация формата (TXT / MD / DOCX) | ✅ Готово |
| 5 | Генерация презентации | ✅ Готово |

---

## 🧪 Тестирование

### Backend (pytest)

Файлы тестов: `backend/tests/`

| Тест | Файл | Что проверяет | Статус |
|------|------|---------------|--------|
| Загрузка документа | `test_upload.py` | Загрузка разных форматов, валидация расширений, ошибки | ❌ Не реализовано |
| RAG-чат | `test_chat.py` | Ответ по документу, работа без документа, точность ответов | ❌ Не реализовано |
| Перевод | `test_translation.py` | Перевод на KZ/RU/EN, корректность языка вывода | ❌ Не реализовано |
| Сравнение | `test_comparison.py` | Смысловое и техническое сравнение, загрузка двух файлов | ❌ Не реализовано |
| Конвертация | `test_converter.py` | Конвертация между форматами, скачивание результата | ❌ Не реализовано |
| Презентация | `test_presentation.py` | Генерация PPTX, структура слайдов, скачивание файла | ❌ Не реализовано |
| Сессии | `test_sessions.py` | Создание, удаление, таймаут сессий | ❌ Не реализовано |

**Запуск тестов:**
```bash
# Внутри Docker контейнера
docker exec -it docai-backend pytest tests/ -v

# Локально (при установленных зависимостях)
cd backend && pytest tests/ -v --cov=app
```

---

### Frontend (Vitest + React Testing Library)

Файлы тестов: `frontend/src/__tests__/`

| Тест | Файл | Что проверяет | Статус |
|------|------|---------------|--------|
| Загрузка | `UploadPage.test.jsx` | Drag & drop, выбор файлов, отображение прогресса | ❌ Не реализовано |
| Чат | `ChatPage.test.jsx` | Отправка вопроса, отображение ответа, состояния загрузки | ❌ Не реализовано |
| Сравнение | `ComparisonPage.test.jsx` | Загрузка двух файлов, переключение режимов, отображение результатов | ❌ Не реализовано |
| Презентация | `PresentationPage.test.jsx` | Генерация, предпросмотр структуры, скачивание | ❌ Не реализовано |
| Навигация | `App.test.jsx` | Роутинг, переключение вкладок, отображение статуса сессии | ❌ Не реализовано |

**Запуск тестов:**
```bash
cd frontend && npx vitest run
```

---

### E2E тесты (Playwright)

Файлы тестов: `e2e/`

| Сценарий | Файл | Что проверяет | Статус |
|----------|------|---------------|--------|
| Полный цикл чата | `chat-flow.spec.ts` | Загрузка → вопрос → ответ | ❌ Не реализовано |
| Сравнение документов | `comparison-flow.spec.ts` | Загрузка двух файлов → сравнение | ❌ Не реализовано |
| Генерация презентации | `presentation-flow.spec.ts` | Загрузка → генерация → скачивание | ❌ Не реализовано |

**Запуск:**
```bash
npx playwright test
```

---

## 🚀 Запуск

```bash
# Убедитесь, что Docker Desktop запущен
docker-compose up --build
```

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:8000
- **Swagger docs:** http://localhost:8000/docs

# KENCE.ai — Рабочий план и статус

> Обновлено: 2026-05-11

---

## Статус среды (локальный запуск)

| Компонент | Адрес | Статус |
|-----------|-------|--------|
| Frontend (Vite) | http://127.0.0.1:5173 | ✅ Работает |
| Backend (FastAPI) | http://127.0.0.1:8000 | ✅ Работает |
| Ollama | http://localhost:11434 | ✅ Работает |
| Модель LLM | qwen2.5:7b | ✅ Загружена |
| Эмбеддинги | nomic-embed-text | ✅ Загружена |
| ChromaDB | ./chroma_db/ | ❌ Пакет не установлен |
| Docling | — | ❌ Пакет не установлен |

**Python backend:** `C:\Program Files (x86)\Microsoft Visual Studio\Shared\Python39_64\python.exe` (Python 3.9)

---

## 🔴 Текущие блокеры

### 1. Документы не парсятся
**Причина:** В VS Python 3.9, которым запускается backend, не установлены:
- `docling` — парсинг PDF/DOCX/PPTX и др.
- `chromadb` — векторная БД
- `langchain-community` — обёртка Chroma для LangChain
- `langchain-ollama` — OllamaEmbeddings
- `langchain-text-splitters` — разбивка текста на чанки

**Решение — установить в VS Python 3.9:**
```powershell
$env:TMPDIR = "D:\tmp"
$py = "C:\Program Files (x86)\Microsoft Visual Studio\Shared\Python39_64\Scripts\pip.exe"
& $py install --only-binary :all: chromadb langchain-community langchain-ollama langchain-text-splitters
& $py install docling
```

> ⚠️ C: диск почти полный (0 GB). Перед установкой задать `$env:TMPDIR = "D:\tmp"` и `$env:PIP_CACHE_DIR = "D:\tmp\pip_cache"`.

---

## ✅ Завершено

### Phase 1 — JWT Аутентификация
- `backend/app/core/security.py` — хэширование паролей (bcrypt 4.x), JWT (python-jose)
- `backend/app/services/user_service.py` — JSON-хранилище пользователей (`./data/users.json`)
- `backend/app/api/auth_routes.py` — `/api/auth/login`, `/register`, `/me`, `/users`
- Все endpoints защищены `Depends(get_current_user)`
- `frontend/src/lib/api.js` — клиент с Bearer токеном, auto-redirect на 401
- `frontend/src/pages/LoginPage.jsx` — страница входа (тёмная тема KENCE.ai)
- `frontend/src/App.jsx` — auth state, redirect guard, user badge + logout

**Дефолтные учётные данные:** `admin` / `kence2026!`

### Frontend — миграция с axios на api.js
Все страницы переведены с прямых axios-вызовов (без токена) на `lib/api.js`:
- `UploadPage.jsx` ✅
- `ChatPage.jsx` ✅
- `ComparisonPage.jsx` ✅
- `ConvertPage.jsx` ✅
- `PresentationPage.jsx` ✅

### Конфигурация портов
- Vite перенесён с 3000 → **5173** (порт 3000 занят Docker Desktop backend)
- `vite.config.js` — `host: '127.0.0.1'`, `proxy: /api → 127.0.0.1:8000`
- CORS backend расширен: добавлены `127.0.0.1:5173` и `127.0.0.1:3000`
- `api.js` BASE URL: `http://127.0.0.1:8000` (не localhost — IPv6 конфликты на Windows)

---

## 📋 Следующие фазы

### Phase 2 — История сессий по пользователю
- Привязка `session_id` к `user_id` при создании сессии
- Хранение истории документов в `./data/sessions.json`
- Возможность просмотреть свои предыдущие документы

### Phase 3 — Аудит-лог
- Логировать: кто, что, когда (загрузка, чат, перевод, экспорт)
- Хранить в `./data/audit.json`
- Endpoint `GET /api/admin/audit` (только для admin)

### Phase 4 — Дашборд менеджера
- Статистика: количество документов, активные сессии, топ пользователей
- Страница `/admin` в frontend (видна только role=admin и role=manager)

### Phase 5 — Docker Production Build
- После успешного локального тестирования всех функций
- Собрать образы, проверить docker-compose
- Деплой через флешку (без интернета на сервере): `docker save/load`

---

## 🚀 Деплой на изолированный сервер (без интернета)

### Вариант A — Перенос архива проекта + Docker build на сервере
```bash
# На рабочем компьютере
tar --exclude=node_modules --exclude=__pycache__ --exclude=.next \
    -czf kence-ai.tar.gz DocAI/
# Копировать kence-ai.tar.gz на флешку

# На сервере
sudo mount /dev/sdb1 /mnt/usb
cp /mnt/usb/kence-ai.tar.gz ~/
tar -xzf kence-ai.tar.gz
cd DocAI
docker compose up -d --build
```

### Вариант B — Перенос готовых Docker-образов (быстрее, без интернета)
```bash
# На рабочем компьютере — собрать и сохранить образы
docker compose build
docker save -o backend.tar kence-ai-backend
docker save -o frontend.tar kence-ai-frontend
# Скопировать .tar файлы на флешку

# На сервере — загрузить образы
docker load -i backend.tar
docker load -i frontend.tar
docker compose up -d
```
> Вариант B в 5-10 раз быстрее — не нужен интернет для `pip install` и `npm install` на сервере.

---

## 🔧 Полезные команды (локальный запуск)

```powershell
# Запустить backend (из D:\DocAI\backend\)
$env:PYTHONIOENCODING="utf-8"
$env:TMPDIR="D:\tmp"
uvicorn app.main:app --reload --port 8000

# Запустить frontend (из D:\DocAI\frontend\)
npm run dev

# Проверить backend
Invoke-RestMethod http://127.0.0.1:8000/

# Тест логина
$body = "username=admin&password=kence2026!"
Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/auth/login" -Method POST -Body $body -ContentType "application/x-www-form-urlencoded"
```

---

## Структура проекта (актуальная)

```
DocAI/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth_routes.py      # JWT auth endpoints
│   │   │   ├── routes.py           # Основные endpoints (все защищены JWT)
│   │   │   └── comparison_routes.py
│   │   ├── core/
│   │   │   ├── config.py           # Settings (читает .env)
│   │   │   ├── security.py         # JWT + bcrypt
│   │   │   └── session.py
│   │   ├── services/
│   │   │   ├── document.py         # Docling + ChromaDB ← ТРЕБУЕТ УСТАНОВКИ
│   │   │   ├── llm.py
│   │   │   ├── user_service.py     # JSON user storage
│   │   │   ├── translation.py
│   │   │   ├── converter.py
│   │   │   ├── comparison.py
│   │   │   └── presentation.py
│   │   └── main.py
│   ├── data/
│   │   └── users.json              # admin / kence2026!
│   └── .env                        # LLM_MODEL=qwen2.5:7b
├── frontend/
│   └── src/
│       ├── lib/
│       │   └── api.js              # Auth-aware API client
│       └── pages/
│           ├── LoginPage.jsx
│           ├── UploadPage.jsx
│           ├── ChatPage.jsx
│           ├── PresentationPage.jsx
│           ├── ComparisonPage.jsx
│           └── ConvertPage.jsx
└── PLAN.md                         # Этот файл
```

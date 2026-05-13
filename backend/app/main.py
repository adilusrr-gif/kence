from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio

from app.api.routes import router as main_router
from app.api.comparison_routes import router as comparison_router
from app.api.auth_routes import router as auth_router
from app.api.ai_settings_routes import router as ai_settings_router
from app.core.session import session_manager
from app.core.config import get_settings
from app.services.user_service import create_user, get_user

settings = get_settings()

def _ensure_default_admin():
    if not get_user("admin"):
        create_user("admin", "kence2026!", role="admin")
        print("[OK] Default admin created: admin / kence2026!")

@asynccontextmanager
async def lifespan(app: FastAPI):
    _ensure_default_admin()
    print(f"[START] {settings.APP_NAME} started")
    print(f"[LLM] {settings.LLM_MODEL} @ {settings.OLLAMA_BASE_URL}")
    print(f"[AUTH] JWT / {settings.JWT_ALGORITHM} / {settings.ACCESS_TOKEN_EXPIRE_MINUTES}min")

    async def cleanup_task():
        while True:
            await asyncio.sleep(300)
            session_manager.cleanup_expired(settings.SESSION_TIMEOUT)

    task = asyncio.create_task(cleanup_task())
    yield
    task.cancel()
    print("[STOP] Shutting down...")

app = FastAPI(
    title="KENCE.ai",
    description="AI-ассистент для работы с документами — чат, перевод, сравнение, конвертация, презентации",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5173", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(main_router, prefix="/api")
app.include_router(comparison_router, prefix="/api")
app.include_router(ai_settings_router, prefix="/api")

@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": "2.0.0",
        "features": ["chat", "presentations", "semantic_comparison", "technical_comparison"],
        "endpoints": {
            "single_doc": {
                "upload": "/api/documents/upload",
                "chat": "/api/chat",
                "presentation": "/api/presentations/generate"
            },
            "comparison": {
                "upload": "/api/compare/upload",
                "semantic": "/api/compare/semantic",
                "technical": "/api/compare/technical"
            }
        }
    }

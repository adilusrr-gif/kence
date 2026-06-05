from fastapi import FastAPI, Request
from fastapi import HTTPException as FastAPIHTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from contextlib import asynccontextmanager
import asyncio
import json
import logging
import secrets
import string
from pathlib import Path

logger = logging.getLogger(__name__)

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

from app.api.routes import router as main_router
from app.api.comparison_routes import router as comparison_router
from app.api.auth_routes import router as auth_router
from app.api.ai_settings_routes import router as ai_settings_router
from app.api.presentation_routes import router as presentation_router
from app.api.analytics_routes import router as analytics_router
from app.api.org_routes import router as org_router
from app.api.library_routes import router as library_router
from app.api.share_routes import router as share_router
from app.api.branding_routes import router as branding_router
from app.api.executive_routes import router as executive_router
from app.api.graph_routes import router as graph_router
from app.api.agent_routes import router as agent_router
from app.core.session import session_manager
from app.core.config import get_settings
from app.services.user_service import create_user, get_user

settings = get_settings()

limiter = Limiter(key_func=get_remote_address)


def _init_db():
    try:
        from app.core.database import create_tables
        create_tables()
        print("[DB] Tables ready")
        _migrate_users_from_json()
        _ensure_default_org()
    except Exception as e:
        print(f"[DB] Warning: {e} — running without persistent DB")


def _ensure_default_org():
    try:
        from app.services.org_service import ensure_default_org
        org = ensure_default_org()
        print(f"[ORG] Default org ready: {org['slug']} (id={org['id']})")
    except Exception as e:
        print(f"[ORG] Warning: could not ensure default org: {e}")


def _migrate_users_from_json():
    users_file = Path(settings.USERS_FILE)
    if not users_file.exists():
        return
    try:
        with open(users_file, encoding="utf-8") as f:
            users = json.load(f)
        from app.core.database import SessionLocal
        from app.models.models import User
        with SessionLocal() as db:
            for username, data in users.items():
                if not db.get(User, username):
                    db.add(User(
                        username=username,
                        hashed_password=data["hashed_password"],
                        role=data.get("role", "user"),
                        is_active=data.get("is_active", True),
                    ))
            db.commit()
        print(f"[DB] Migrated {len(users)} users from {users_file}")
    except Exception as e:
        print(f"[DB] Migration skipped: {e}")


def _ensure_default_admin():
    if get_user("admin"):
        return
    password = settings.ADMIN_INITIAL_PASSWORD
    if not password:
        alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
        password = "".join(secrets.choice(alphabet) for _ in range(20))
        print("=" * 60)
        print("[SECURITY] Default admin created with generated password:")
        print(f"           username: admin")
        print(f"           password: {password}")
        print("  >>> Save this password now — it will NOT be shown again <<<")
        print("  Set ADMIN_INITIAL_PASSWORD in .env to control this value.")
        print("=" * 60)
    else:
        print("[OK] Default admin created from ADMIN_INITIAL_PASSWORD")
    create_user("admin", password, role="admin")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _init_db()
    _ensure_default_admin()
    print(f"[START] {settings.APP_NAME} started")
    print(f"[LLM] {settings.LLM_MODEL} @ {settings.OLLAMA_BASE_URL}")
    print(f"[AUTH] JWT / {settings.JWT_ALGORITHM} / {settings.ACCESS_TOKEN_EXPIRE_MINUTES}min")
    print(f"[DB] {settings.DATABASE_URL.split('@')[-1]}")
    if "change-in-production" in settings.JWT_SECRET_KEY or "dev-only" in settings.JWT_SECRET_KEY:
        print("[SECURITY WARNING] JWT_SECRET_KEY is the default dev value — set a strong secret in .env!")
    if not settings.NEO4J_PASSWORD:
        print("[SECURITY WARNING] NEO4J_PASSWORD is empty — set it in .env for production")

    # Initialize Neo4j constraints (best-effort — app starts even if Neo4j is down)
    try:
        from app.services.graph_service import ensure_constraints
        await ensure_constraints()
        print("[NEO4J] Constraints ready")
    except Exception as e:
        print(f"[NEO4J] Skipped constraints: {e}")

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

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", "http://127.0.0.1:3000",
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
        "http://localhost:5175", "http://127.0.0.1:5175",
        "http://localhost:5176", "http://127.0.0.1:5176",
        "http://localhost:5177", "http://127.0.0.1:5177",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key"],
)

app.include_router(auth_router,         prefix="/api")
app.include_router(main_router,         prefix="/api")
app.include_router(comparison_router,   prefix="/api")
app.include_router(ai_settings_router,  prefix="/api")
app.include_router(presentation_router, prefix="/api/presentations", tags=["presentations"])
app.include_router(analytics_router,    prefix="/api")
# Enterprise routers
app.include_router(org_router,          prefix="/api")
app.include_router(library_router,      prefix="/api")
app.include_router(share_router,        prefix="/api")
app.include_router(branding_router,     prefix="/api")
app.include_router(executive_router,    prefix="/api")
app.include_router(graph_router,        prefix="/api")
app.include_router(agent_router,        prefix="/api")

@app.exception_handler(FastAPIHTTPException)
async def http_exception_handler(request: Request, exc: FastAPIHTTPException):
    """Strip internal details from 5xx responses; pass 4xx through as-is."""
    if exc.status_code >= 500:
        logger.error(
            "HTTP %d for %s %s: %s",
            exc.status_code, request.method, request.url.path, exc.detail,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": "Internal server error"},
        )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=getattr(exc, "headers", None) or {},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error(
        "Unhandled exception for %s %s",
        request.method, request.url.path, exc_info=exc,
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


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

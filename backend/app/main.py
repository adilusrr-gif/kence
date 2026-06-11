from fastapi import FastAPI, Request
from fastapi import HTTPException as FastAPIHTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.limiter import limiter
from app.core.logging_config import setup_logging
from contextlib import asynccontextmanager
import asyncio
import hmac
import json
import logging
import secrets
import string
from pathlib import Path

# Configure structured logging before any logger is used
setup_logging()
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
from app.api.config_routes import router as config_router
from app.api.insights_routes import router as insights_router
from app.api.image_routes import router as image_router
from app.core.session import session_manager
from app.core.config import get_settings
from app.services.user_service import create_user, get_user

settings = get_settings()


def _init_db():
    try:
        from app.core.database import create_tables
        create_tables()
        logger.info("DB tables ready")
        _migrate_users_from_json()
        _ensure_default_org()
    except Exception as e:
        logger.warning("DB init failed — running without persistent DB: %s", e)


def _ensure_default_org():
    try:
        from app.services.org_service import ensure_default_org
        org = ensure_default_org()
        logger.info("Default org ready: %s (id=%s)", org['slug'], org['id'])
    except Exception as e:
        logger.warning("Could not ensure default org: %s", e)


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
        logger.info("Migrated %d users from %s", len(users), users_file)
    except Exception as e:
        logger.debug("User migration skipped: %s", e)


def _ensure_default_admin():
    if get_user("admin"):
        return
    password = settings.ADMIN_INITIAL_PASSWORD
    if not password:
        alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
        password = "".join(secrets.choice(alphabet) for _ in range(20))
        # Write to a file readable only by this process — never log credentials
        try:
            cred_file = Path(settings.UPLOAD_DIR) / ".admin_initial_password"
            cred_file.parent.mkdir(parents=True, exist_ok=True)
            cred_file.write_text(f"username=admin\npassword={password}\n")
            cred_file.chmod(0o600)
            logger.warning(
                "SECURITY: Default admin created with auto-generated password. "
                "Retrieve it from: %s — delete this file after first login. "
                "Set ADMIN_INITIAL_PASSWORD in .env to control the value.",
                cred_file.resolve(),
            )
        except Exception as e:
            logger.critical(
                "SECURITY: Default admin created but credentials file could not be written (%s). "
                "Set ADMIN_INITIAL_PASSWORD in .env before restarting.",
                e,
            )
    else:
        logger.info("Default admin created from ADMIN_INITIAL_PASSWORD")
    create_user("admin", password, role="admin")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _init_db()
    _ensure_default_admin()
    logger.info(
        "%s started",
        settings.APP_NAME,
        extra={
            "llm_model": settings.LLM_MODEL,
            "ollama_url": settings.OLLAMA_BASE_URL,
            "jwt_algorithm": settings.JWT_ALGORITHM,
            "token_expire_min": settings.ACCESS_TOKEN_EXPIRE_MINUTES,
            "db": settings.DATABASE_URL.split("@")[-1],
        },
    )
    _weak_jwt_patterns = ("change-in-production", "dev-only", "CHANGE_ME", "insecure")
    if not settings.JWT_SECRET_KEY or len(settings.JWT_SECRET_KEY) < 32 or any(p in settings.JWT_SECRET_KEY for p in _weak_jwt_patterns):
        logger.critical(
            "SECURITY: JWT_SECRET_KEY is missing, too short (< 32 chars), or a known-weak placeholder. "
            "Generate a secret with:  openssl rand -hex 32  then set JWT_SECRET_KEY in .env. "
            "Server startup aborted."
        )
        raise SystemExit(1)
    if not settings.METRICS_TOKEN:
        logger.warning("SECURITY: METRICS_TOKEN not set — /metrics restricted to loopback only")
    if not settings.API_KEY_HMAC_SECRET:
        logger.warning("SECURITY: API_KEY_HMAC_SECRET not set — API keys use plain SHA-256; set this and regenerate keys")
    if not settings.NEO4J_PASSWORD:
        logger.warning("SECURITY: NEO4J_PASSWORD is empty — set it in .env for production")

    # ── Ollama health check at startup (warning only — never blocks start) ──────
    try:
        from app.services.llm import llm_service
        ollama_status = await llm_service.health_check()
        if ollama_status.get("status") == "ok":
            logger.info("Ollama ready: %s", settings.LLM_MODEL)
        else:
            logger.warning(
                "Ollama not reachable (%s) — responses will fail until it recovers",
                ollama_status.get("error", "?"),
            )
    except Exception as e:
        logger.warning("Ollama health check failed: %s", e)

    # ── Neo4j constraints (best-effort) ──────────────────────────────────────
    try:
        from app.services.graph_service import ensure_constraints
        await ensure_constraints()
        logger.info("Neo4j constraints ready")
    except Exception as e:
        logger.warning("Neo4j constraints skipped: %s", e)

    # ── Background tasks ──────────────────────────────────────────────────────
    async def cleanup_task():
        """Periodically expire old sessions. Runs every 5 minutes."""
        while True:
            await asyncio.sleep(300)
            try:
                session_manager.cleanup_expired(settings.SESSION_TIMEOUT)
            except Exception as e:
                logger.warning("[cleanup_task] error: %s", e)

    task = asyncio.create_task(cleanup_task())
    yield

    # ── Graceful shutdown ─────────────────────────────────────────────────────
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

    # Close Neo4j driver
    try:
        from app.services.graph_service import get_driver
        drv = get_driver()
        if drv:
            drv.close()
            logger.info("Neo4j driver closed")
    except Exception:
        pass

    logger.info("Shutdown complete")

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
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)

from app.core.middleware import RequestTracingMiddleware  # noqa: E402
app.add_middleware(RequestTracingMiddleware)  # pure ASGI — safe with CORSMiddleware

# Prometheus metrics — /metrics endpoint (Prometheus scrape target)
try:
    from prometheus_fastapi_instrumentator import Instrumentator
    Instrumentator(
        should_group_status_codes=True,
        excluded_handlers=["/metrics", "/docs", "/openapi.json", "/redoc"],
    ).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
    logger.info("Prometheus metrics enabled at /metrics")
except ImportError:
    logger.warning("prometheus-fastapi-instrumentator not installed — /metrics disabled")


@app.middleware("http")
async def _guard_metrics_endpoint(request: Request, call_next):
    """Protect /metrics from unauthenticated scraping."""
    if request.url.path != "/metrics":
        return await call_next(request)

    metrics_token = settings.METRICS_TOKEN
    if metrics_token:
        auth = request.headers.get("Authorization", "")
        expected = f"Bearer {metrics_token}"
        # constant-time comparison prevents timing oracle on the token
        if not (auth and hmac.compare_digest(auth.encode(), expected.encode())):
            return Response(status_code=403, content="Forbidden")
    else:
        # No token configured — loopback only
        client_host = getattr(request.client, "host", "") if request.client else ""
        if client_host not in ("127.0.0.1", "::1"):
            return Response(status_code=403, content="Forbidden")

    return await call_next(request)

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
app.include_router(config_router,       prefix="/api")
app.include_router(insights_router,     prefix="/api")
app.include_router(image_router,        prefix="/api")

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

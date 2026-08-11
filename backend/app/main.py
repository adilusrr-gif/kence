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
from app.api.system_routes import router as system_router
from app.api.translation_routes import router as translation_router
from app.core.session import session_manager
from app.core.config import get_settings
from app.services.user_service import create_user, get_user

settings = get_settings()


def _init_db():
    try:
        from app.core.database import engine
        if engine.url.get_backend_name() == "sqlite":
            # Test suite only — SQLite has no ADD COLUMN IF NOT EXISTS and no
            # partial-unique-index syntax; create_all() is the only thing
            # that has ever built its schema, and that stays true here.
            from app.core.database import create_tables
            create_tables()
        else:
            _verify_schema_at_expected_revision()
        logger.info("DB tables ready")
        _migrate_users_from_json()
        _ensure_default_org()
    except Exception as e:
        logger.warning("DB init failed — running without persistent DB: %s", e)


def _verify_schema_at_expected_revision():
    """PostgreSQL only. Alembic is the sole schema authority — this function
    executes zero DDL. It reads the build-pinned manifest (baked into the
    image at build time, see ops/schema_audit/generate_manifest.py and
    backend/Dockerfile), re-hashes the migration files actually present in
    this container, and confirms the database's `alembic_version` matches
    the manifest's expected head. Any mismatch — including zero or more
    than one version row — raises, and the caller (`_init_db`) logs it as a
    startup failure. This is what closes test case F ("clean application
    startup performs no implicit production schema creation, and refuses to
    start against an unexpected schema").
    """
    import hashlib
    from sqlalchemy import text
    from app.core.database import engine

    manifest_path = Path(__file__).resolve().parent / "_schema_manifest.json"
    if not manifest_path.is_file():
        raise RuntimeError(
            f"{manifest_path} not found — this image was not built with the "
            "schema manifest step (see backend/Dockerfile); refusing to "
            "start against an unverifiable schema"
        )
    manifest = json.loads(manifest_path.read_text())

    versions_dir = Path(__file__).resolve().parent.parent / "alembic" / "versions"
    for rel_name, expected_hash in manifest["migration_file_hashes"].items():
        actual_path = versions_dir / rel_name
        if not actual_path.is_file():
            raise RuntimeError(f"manifest references missing migration file {actual_path}")
        actual_hash = hashlib.sha256(actual_path.read_bytes()).hexdigest()
        if actual_hash != expected_hash:
            raise RuntimeError(
                f"{rel_name} hash mismatch: image manifest expects "
                f"{expected_hash}, found {actual_hash} — migration file was "
                "modified after the image was built; refusing to start"
            )

    with engine.connect() as conn:
        rows = conn.execute(text("SELECT version_num FROM alembic_version")).fetchall()
    expected_head = manifest["alembic_head"]
    if rows != [(expected_head,)]:
        raise RuntimeError(
            f"database alembic_version is {rows}, image expects exactly "
            f"[('{expected_head}',)] — run the migrate job before starting "
            "this build (see docs/ALEMBIC_SCHEMA_RECONCILIATION_STAGE_E2_REV3_"
            "2026-08-05.md)"
        )


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


def _cleanup_stale_generation_state():
    """Task 4: on startup, find AgentTask/GraphExtractionJob rows left in a
    non-terminal status by a previous process (killed/restarted mid-run) and
    mark them failed. In-memory state (generation_registry, _llm_semaphore,
    circuit breaker, queue guard) is module-level and recreated fresh on every
    process start — nothing to reconcile there."""
    from datetime import datetime, timezone
    try:
        from app.core.database import SessionLocal
        from app.models.models import AgentTask, GraphExtractionJob
        with SessionLocal() as db:
            n1 = db.query(AgentTask).filter(AgentTask.status.in_(["queued", "running"])).update(
                {
                    "status": "failed",
                    "error": "Прервано перезапуском сервера",
                    "finished_at": datetime.now(timezone.utc),
                },
                synchronize_session=False,
            )
            n2 = db.query(GraphExtractionJob).filter(GraphExtractionJob.status.in_(["pending", "running"])).update(
                {
                    "status": "failed",
                    "error": "Прервано перезапуском сервера",
                    "finished_at": datetime.now(timezone.utc),
                },
                synchronize_session=False,
            )
            if n1 or n2:
                db.commit()
                logger.warning(
                    "[startup] reconciled stale state: %d agent_tasks + %d graph_jobs marked failed",
                    n1, n2,
                )
    except Exception as e:
        logger.warning("[startup] cleanup_stale_generation_state failed: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _init_db()
    _ensure_default_admin()

    from app.services.llm import llm_service
    llm_service.bind_loop(asyncio.get_running_loop())

    _cleanup_stale_generation_state()

    # Re-dispatch agent tasks orphaned by a previous restart (resume instead of
    # leaving them stuck 'running' until the watchdog ages them out).
    try:
        from app.api.agent_routes import requeue_interrupted_agent_tasks
        requeue_interrupted_agent_tasks()
    except Exception as e:
        logger.warning("[startup] agent task requeue failed: %s", e)

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

    # ── Warm the embedding model (bge-m3) into VRAM at startup ───────────────────
    # The ollama container preloads the chat model itself, but embedding models
    # can't be loaded via `ollama run` — they need an /api/embeddings call, which
    # that image can't make (no curl/python3). Do it here, in the background, so
    # the first document ingest/search isn't paying a cold-load penalty.
    async def warm_embeddings():
        try:
            from app.services.embeddings_service import embeddings_service
            await embeddings_service.embeddings.aembed_query("warmup")
            logger.info("Embedding model warmed: %s", settings.EMBEDDING_MODEL)
        except Exception as e:
            logger.warning("Embedding model warmup failed: %s", e)

    asyncio.create_task(warm_embeddings())

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

    async def llm_watchdog_task():
        """Task 2 safety net: periodically clears generation_registry entries
        stuck "running" longer than LLM_WATCHDOG_MAX_RUNNING_SEC (task done()
        but finish() never called), and marks AgentTask/GraphExtractionJob rows
        that have been queued/running longer than LLM_WATCHDOG_MAX_TASK_AGE_SEC
        as failed (owning process died without updating status)."""
        from app.core import generation_registry
        from datetime import datetime, timedelta, timezone

        while True:
            await asyncio.sleep(settings.LLM_WATCHDOG_INTERVAL_SEC)
            try:
                stale = generation_registry.sweep_stale(settings.LLM_WATCHDOG_MAX_RUNNING_SEC)
                for sid in stale:
                    logger.warning("[watchdog] force-cleared stale generation: %s", sid)

                cutoff = datetime.now(timezone.utc) - timedelta(seconds=settings.LLM_WATCHDOG_MAX_TASK_AGE_SEC)
                from app.core.database import SessionLocal
                from app.models.models import AgentTask, GraphExtractionJob
                with SessionLocal() as db:
                    n1 = db.query(AgentTask).filter(
                        AgentTask.status.in_(["queued", "running"]),
                        AgentTask.created_at < cutoff,
                    ).update(
                        {
                            "status": "failed",
                            "error": "Прервано: превышен лимит времени (watchdog)",
                            "finished_at": datetime.now(timezone.utc),
                        },
                        synchronize_session=False,
                    )
                    n2 = db.query(GraphExtractionJob).filter(
                        GraphExtractionJob.status.in_(["pending", "running"]),
                        GraphExtractionJob.created_at < cutoff,
                    ).update(
                        {
                            "status": "failed",
                            "error": "Прервано: превышен лимит времени (watchdog)",
                            "finished_at": datetime.now(timezone.utc),
                        },
                        synchronize_session=False,
                    )
                    if n1 or n2:
                        db.commit()
                        logger.warning(
                            "[watchdog] marked %d agent_tasks + %d graph_jobs failed (stale)",
                            n1, n2,
                        )
            except Exception as e:
                logger.warning("[watchdog] error: %s", e)

    # ── Background translation worker ─────────────────────────────────────────
    # Resume any job interrupted by a previous process (survives restart), then
    # start the polling worker that processes queued jobs off the main thread.
    translation_stop = asyncio.Event()
    translation_worker_task = None
    if settings.TRANSLATION_WORKER_ENABLED:
        try:
            from app.services import translation_worker
            translation_worker.requeue_interrupted_jobs()
            translation_worker_task = asyncio.create_task(
                translation_worker.worker_loop(translation_stop)
            )
        except Exception as e:
            logger.warning("[startup] translation worker not started: %s", e)
    else:
        logger.info("[startup] translation worker disabled (TRANSLATION_WORKER_ENABLED=false)")

    task = asyncio.create_task(cleanup_task())
    watchdog = asyncio.create_task(llm_watchdog_task())
    yield

    # ── Graceful shutdown ─────────────────────────────────────────────────────
    translation_stop.set()
    shutdown_tasks = [task, watchdog]
    if translation_worker_task is not None:
        shutdown_tasks.append(translation_worker_task)
    for t in shutdown_tasks:
        t.cancel()
        try:
            await t
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
# Gated by ENABLE_METRICS (default on) so it can be disabled when the installed
# prometheus-fastapi-instrumentator is incompatible with the FastAPI/Starlette
# version (e.g. native dev installs that pull bleeding-edge FastAPI).
import os as _os
if _os.getenv("ENABLE_METRICS", "true").lower() in ("1", "true", "yes"):
    try:
        from prometheus_fastapi_instrumentator import Instrumentator
        Instrumentator(
            should_group_status_codes=True,
            excluded_handlers=["/metrics", "/docs", "/openapi.json", "/redoc"],
        ).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
        logger.info("Prometheus metrics enabled at /metrics")
    except ImportError:
        logger.warning("prometheus-fastapi-instrumentator not installed — /metrics disabled")
else:
    logger.info("ENABLE_METRICS disabled — /metrics not mounted")


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
app.include_router(system_router,       prefix="/api")
app.include_router(translation_router,   prefix="/api")

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

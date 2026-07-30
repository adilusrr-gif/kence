from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional

class Settings(BaseSettings):
    APP_NAME: str = "KENCE.ai"
    UPLOAD_DIR: str = "./uploads"
    CHROMA_DIR: str = "./chroma_db"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    LLM_MODEL: str = "qwen2.5:7b"
    EMBEDDING_MODEL: str = "bge-m3"
    CHUNK_SIZE: int = 2000
    CHUNK_OVERLAP: int = 400

    # ── Exact Answer mode (section-aware retrieval) ─────────────────────────────
    # In "exact" mode the system expands each matched fragment to its COMPLETE
    # enclosing section (heading → next heading) so legal articles, numbered
    # lists, definitions, glossary/NPA sections are never truncated.
    # More candidates are fetched so multiple sections can be covered.
    EXACT_RETRIEVAL_K: int = 10
    # Max complete sections assembled into the context.
    EXACT_MAX_SECTIONS: int = 6
    # Total context budget (chars) for assembled sections — each section is always
    # whole; this only caps how many whole sections are included.
    EXACT_MAX_CONTEXT_CHARS: int = 48_000
    # Ollama context window / output token budget for exact answers. num_predict
    # = -1 means "until the model stops" so a long section is never cut off by a
    # token cap. num_ctx is enlarged so the full section context + output fits.
    EXACT_NUM_CTX: int = 16_384
    EXACT_NUM_PREDICT: int = -1

    # Background translation worker. Set False on web-only nodes (so only a
    # dedicated worker node processes the queue) or in tests for determinism.
    TRANSLATION_WORKER_ENABLED: bool = True
    SESSION_TIMEOUT: int = 28800  # 8 hours for government work sessions
    MAX_FILE_SIZE: int = 100 * 1024 * 1024
    ALLOWED_UPLOAD_FORMATS: frozenset = frozenset({
        ".pdf", ".docx", ".pptx", ".xlsx",
        ".html", ".htm",
        ".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp", ".heic",
        ".txt", ".md", ".csv", ".tex",
    })

    # Vision (multimodal) model — set to "" to disable and fall back to OCR
    VISION_MODEL: str = "llava:7b"

    # Max concurrent LLM calls to Ollama (prevents overload under parallel requests)
    LLM_MAX_CONCURRENT: int = 2
    # Max requests waiting in queue before returning 503 (100-user load protection)
    LLM_QUEUE_MAXSIZE: int = 50
    # LLM call timeout in seconds (reduced from 300 for faster failure detection)
    LLM_TIMEOUT_SEC: int = 60
    # Max concurrent generations a single user may have in flight at once.
    # A second request while one is active is rejected with a clear message
    # (use "Остановить генерацию" / cancel endpoint to free the slot).
    LLM_MAX_CONCURRENT_PER_USER: int = 1
    # Max Ollama slots background agents (orchestrator tasks) may occupy at once.
    # Must be <= LLM_MAX_CONCURRENT so interactive chat always keeps the remaining
    # slots reserved and is never starved by agent chunk-extraction fan-out.
    # 2 lets the 4 analysis agents' map fan-out run in parallel (≈×2 on the
    # Insights page) while still reserving a slot for chat (LLM_MAX_CONCURRENT=3).
    LLM_AGENT_MAX_CONCURRENT: int = 2

    # Map-reduce chunking for analysis agents (summary/risk/timeline/extractor).
    # Larger chunks → fewer LLM round-trips (the dominant cost). The server's
    # default context (OLLAMA_CONTEXT_LENGTH=65536) comfortably holds a 12k-char
    # chunk plus its output, so this cuts the map-call count ~3× vs the old
    # 4000/5000 sizes with no quality loss.
    AGENT_MAP_CHUNK_SIZE: int = 12_000
    AGENT_MAP_CHUNK_OVERLAP: int = 400
    # Output cap for the SUMMARY chunk-map step only (1–2 sentence summaries) to
    # stop the model from rambling. NOT applied to extraction/timeline/risk maps,
    # whose per-chunk JSON can legitimately be long and must not be truncated.
    AGENT_SUMMARY_MAP_NUM_PREDICT: int = 512

    # On startup, re-dispatch agent tasks left 'running'/'queued' by a previous
    # process (interrupted by a restart). Agent tasks run as in-process asyncio
    # tasks with no external worker, so without this they hang until the watchdog
    # ages them out. AGENT_REQUEUE_MAX caps how many are actually re-run (newest
    # first) to avoid an LLM storm; the overflow is marked failed instead.
    AGENT_REQUEUE_ON_STARTUP: bool = True
    AGENT_REQUEUE_MAX: int = 20

    # Automatic НПА compliance check: every uploaded document is queued for a
    # background "compliance" agent run against the org's НПА library. Runs on
    # the agent lane (LLM_AGENT_MAX_CONCURRENT), so it never starves chat, and
    # is skipped entirely when the org has no doc_kind='npa' entries.
    AUTO_COMPLIANCE_CHECK: bool = True
    # Below this many chars the document is treated as a scrap/note and not
    # worth an LLM compliance run.
    AUTO_COMPLIANCE_MIN_CHARS: int = 1_000
    # Reference acts per run and how much of each is fed to the model. Each НПА
    # costs one LLM round-trip, so this is the main cost/coverage dial.
    COMPLIANCE_MAX_NPA: int = 3
    COMPLIANCE_NPA_CHARS: int = 7_000
    COMPLIANCE_TARGET_CHARS: int = 9_000

    # Document ingest (Docling convert + embed) runs on a dedicated bounded thread
    # pool so a large upload can never block the event loop / starve the default
    # asyncio thread pool used by lightweight LLM/analytics calls. Sized small —
    # ingest is heavy on CPU, RAM and Ollama embedding slots.
    DOC_PROCESS_POOL_SIZE: int = 4

    # Per-session BM25 index cache (app/services/bm25_cache.py). Avoids rebuilding
    # the keyword index from all chunks on every retrieval. Capped by entries and TTL;
    # invalidated explicitly when a session's document is (re)uploaded or cleaned up.
    BM25_CACHE_MAXSIZE: int = 256
    BM25_CACHE_TTL_SEC: int = 1800

    # Max length (chars) of extracted document text the system will load into memory
    # and process. A document whose extracted text exceeds this is rejected at upload
    # (413) BEFORE its full text is stored in the session/DB or embedded — protects RAM
    # and keeps the heaviest operation (translation) within the nginx 1800s request
    # timeout. ~50 pages; raise via env once translation runs as a background job.
    MAX_DOCUMENT_CHARS: int = 150_000

    # Per-chunk timeout while streaming from Ollama (chat_astream). Large
    # enough to survive cold-start of qwen3.5:35b (model load into VRAM after
    # an Ollama restart) before the first token arrives.
    LLM_STREAM_CHUNK_TIMEOUT_SEC: int = 90
    # Timeout for non-streaming calls (agenerate/agenerate_raw/simple_chat_guarded).
    LLM_CALL_TIMEOUT_SEC: int = 120
    # Timeout for translating a single chunk (~18000 chars) — larger because
    # the chunk itself is larger.
    LLM_TRANSLATION_TIMEOUT_SEC: int = 240
    # How often chat_stream polls request.is_disconnected() while streaming.
    LLM_DISCONNECT_POLL_SEC: int = 5
    # Watchdog: how often to scan for stuck generations/tasks.
    LLM_WATCHDOG_INTERVAL_SEC: int = 60
    # generation_registry: a "running" entry older than this without
    # task.done() is considered stuck and force-cleared. Intentionally MUCH
    # larger than LLM_STREAM_CHUNK_TIMEOUT_SEC (90s) — this is a safety net
    # for orphaned REGISTRY ENTRIES (task.done() but finish() never called),
    # not for long-but-alive responses: a legitimate long answer can stream
    # for many minutes while remaining "running" (each chunk under 90s). 900s
    # is well beyond any reasonable single-response duration.
    LLM_WATCHDOG_MAX_RUNNING_SEC: int = 900
    # AgentTask/GraphExtractionJob in queued/running/pending older than this
    # (created_at) are considered orphaned (owning process restarted) and
    # marked failed.
    LLM_WATCHDOG_MAX_TASK_AGE_SEC: int = 1800

    # ── Rate limits (slowapi format: "N/minute") — override via env for prod ──
    RATE_LIMIT_CHAT: str = "20/minute"       # /chat, /chat/stream
    RATE_LIMIT_UPLOAD: str = "10/minute"     # POST /documents/upload
    RATE_LIMIT_TRANSLATE: str = "10/minute"  # POST /translate (sync)
    RATE_LIMIT_EXPORT: str = "5/minute"      # POST /translate/export
    RATE_LIMIT_CONVERT: str = "10/minute"    # /documents/convert, /documents/export-markdown
    RATE_LIMIT_AGENTS: str = "20/minute"     # POST /agents/tasks

    # JWT Auth — REQUIRED. Generate with: openssl rand -hex 32
    # Server refuses to start if this is missing or weak.
    JWT_SECRET_KEY: str = ""
    # During rotation: set new key as JWT_SECRET_KEY, move old key here.
    # Old tokens remain valid until they expire; then clear this field.
    JWT_SECRET_KEY_PREVIOUS: str = ""
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # Prometheus /metrics auth — set to a long random token (openssl rand -hex 32).
    # If empty, /metrics is restricted to loopback (127.0.0.1) only.
    METRICS_TOKEN: str = ""

    # HMAC secret for API key hashing — set in .env to enable HMAC-SHA256.
    # If empty, falls back to plain SHA-256 (keys generated before this was set
    # remain valid; regenerate them after setting this value).
    API_KEY_HMAC_SECRET: str = ""

    USERS_FILE: str = "./data/users.json"

    # Initial admin password — if empty, a random one is generated on first startup.
    # Set ADMIN_INITIAL_PASSWORD in .env to control the value.
    ADMIN_INITIAL_PASSWORD: Optional[str] = None

    # Database — override via DATABASE_URL in .env (no credentials in source defaults)
    DATABASE_URL: str = "sqlite:///./kence_dev.db"

    # Neo4j — override NEO4J_PASSWORD in .env
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = ""

    # Enterprise defaults
    DEFAULT_ORG_SLUG: str = "default"
    API_KEY_PREFIX: str = "kce_"

    # Observability
    LOG_LEVEL: str = "INFO"          # DEBUG | INFO | WARNING | ERROR
    LOG_FORMAT: str = "json"         # json | text

    # CORS — comma-separated allowed origins.
    # Dev default allows localhost ports. Override in production.
    CORS_ORIGINS: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:5174,http://127.0.0.1:5174"
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"

@lru_cache()
def get_settings():
    return Settings()

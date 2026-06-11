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

    # AI Image Generation (ComfyUI + FLUX.1 Dev)
    IMAGE_GEN_SERVICE_URL: str = "http://localhost:8188"
    IMAGE_GEN_TIMEOUT_SEC: int = 300
    IMAGE_GEN_POLL_INTERVAL_SEC: float = 2.0
    IMAGE_GEN_MAX_CONCURRENT: int = 1
    IMAGE_GEN_WORKFLOW_TEMPLATE: str = "flux_dev_t2i.json"
    IMAGE_GEN_MODEL_NAME: str = "flux1-dev.safetensors"
    IMAGE_GEN_MODEL_VERSION: str = "FLUX.1-dev"
    IMAGE_GEN_STEPS: int = 25
    IMAGE_GEN_GUIDANCE: float = 3.5
    IMAGE_GEN_DEFAULT_WIDTH: int = 1024
    IMAGE_GEN_DEFAULT_HEIGHT: int = 1024

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

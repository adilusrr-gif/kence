from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional

class Settings(BaseSettings):
    APP_NAME: str = "KENCE.ai"
    UPLOAD_DIR: str = "./uploads"
    CHROMA_DIR: str = "./chroma_db"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    LLM_MODEL: str = "qwen2.5:7b"
    EMBEDDING_MODEL: str = "nomic-embed-text"
    CHUNK_SIZE: int = 2000
    CHUNK_OVERLAP: int = 400
    SESSION_TIMEOUT: int = 3600
    MAX_FILE_SIZE: int = 100 * 1024 * 1024
    ALLOWED_UPLOAD_FORMATS: frozenset = frozenset({
        ".pdf", ".docx", ".pptx", ".xlsx",
        ".html", ".htm",
        ".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp", ".heic",
        ".txt", ".md", ".csv", ".tex",
    })

    # Vision (multimodal) model — set to "" to disable and fall back to OCR
    VISION_MODEL: str = "llava:7b"

    # JWT Auth — MUST be overridden via JWT_SECRET_KEY in .env for production
    JWT_SECRET_KEY: str = "dev-only-insecure-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

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

    class Config:
        env_file = ".env"

@lru_cache()
def get_settings():
    return Settings()

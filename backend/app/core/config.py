from pydantic_settings import BaseSettings
from functools import lru_cache
import secrets

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

    # JWT Auth — override via JWT_SECRET_KEY env var or .env file in production
    JWT_SECRET_KEY: str = "dev-only-insecure-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    USERS_FILE: str = "./data/users.json"

    # PostgreSQL
    DATABASE_URL: str = "postgresql://kence:kence2026@127.0.0.1:5432/kenceai"

    class Config:
        env_file = ".env"

@lru_cache()
def get_settings():
    return Settings()

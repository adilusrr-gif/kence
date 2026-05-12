from pydantic_settings import BaseSettings
from functools import lru_cache
import secrets

class Settings(BaseSettings):
    APP_NAME: str = "KENCE.ai"
    UPLOAD_DIR: str = "./uploads"
    CHROMA_DIR: str = "./chroma_db"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    LLM_MODEL: str = "llama3"
    EMBEDDING_MODEL: str = "nomic-embed-text"
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 200
    SESSION_TIMEOUT: int = 3600
    MAX_FILE_SIZE: int = 50 * 1024 * 1024

    # JWT Auth
    JWT_SECRET_KEY: str = "kence-ai-super-secret-key-change-in-production-2026"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours (work day)
    USERS_FILE: str = "./data/users.json"

    class Config:
        env_file = ".env"

@lru_cache()
def get_settings():
    return Settings()

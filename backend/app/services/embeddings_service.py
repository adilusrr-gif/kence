from langchain_ollama import OllamaEmbeddings
from app.core.config import get_settings

settings = get_settings()


class EmbeddingsService:
    def __init__(self):
        self.embeddings = OllamaEmbeddings(
            model=settings.EMBEDDING_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
        )


embeddings_service = EmbeddingsService()

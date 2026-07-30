import threading

from langchain_ollama import OllamaEmbeddings
from app.core.config import get_settings

settings = get_settings()

# Embedding calls go to the same Ollama server as chat but bypass the app-level
# _llm_semaphore (they run inside worker threads during ingest/retrieval). Cap
# them here so a burst of document uploads can never occupy every
# OLLAMA_NUM_PARALLEL slot and starve interactive chat. Async variants are left
# untouched — the only async caller is the single startup warmup.
_EMBED_MAX_CONCURRENT = 2
_embed_semaphore = threading.Semaphore(_EMBED_MAX_CONCURRENT)


class _ThrottledOllamaEmbeddings(OllamaEmbeddings):
    def embed_documents(self, texts):
        with _embed_semaphore:
            return super().embed_documents(texts)

    def embed_query(self, text):
        with _embed_semaphore:
            return super().embed_query(text)


class EmbeddingsService:
    def __init__(self):
        self.embeddings = _ThrottledOllamaEmbeddings(
            model=settings.EMBEDDING_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
        )


embeddings_service = EmbeddingsService()

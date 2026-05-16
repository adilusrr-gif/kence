from langchain_ollama import OllamaLLM
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_community.vectorstores import Chroma
from app.core.config import get_settings
from app.services.embeddings_service import embeddings_service

settings = get_settings()

LANGUAGE_NAMES = {
    "kz": "Kazakh (Қазақша)",
    "ru": "Russian (Русский)",
    "en": "English",
}

# Instructions in English work better for multilingual LLMs
TRANSLATE_PROMPT = """You are a professional translator.
Translate the following text into {language}.

Rules:
- Output ONLY the translated text, nothing else
- Do NOT add explanations, notes, or commentary
- Translate completely and accurately
- Preserve the original structure: headings, lists, paragraphs, line breaks

Text to translate:
{text}

Translation into {language}:"""


class TranslationService:
    def __init__(self):
        self.llm = OllamaLLM(
            model=settings.LLM_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
            temperature=0.1,
        )
        self.embeddings = embeddings_service.embeddings

    def _get_full_text(self, session_id: str) -> str:
        """Возвращает ВЕСЬ текст документа из ChromaDB (все чанки, не similarity search)."""
        vector_store = Chroma(
            persist_directory=f"{settings.CHROMA_DIR}/{session_id}",
            embedding_function=self.embeddings,
        )
        result = vector_store._collection.get()
        texts = result.get("documents", [])
        if not texts:
            raise ValueError("Document is empty or not found")
        return "\n\n".join(texts)

    def translate_document(self, session_id: str, target_language: str) -> str:
        """Переводит весь документ на указанный язык."""
        if target_language not in LANGUAGE_NAMES:
            raise ValueError(f"Unsupported language: {target_language}. Use: kz, ru, en")

        full_text = self._get_full_text(session_id)

        # Обрезаем если текст слишком большой для контекстного окна модели (~24k символов безопасно)
        if len(full_text) > 24000:
            full_text = full_text[:24000]

        language_name = LANGUAGE_NAMES[target_language]
        prompt = PromptTemplate(template=TRANSLATE_PROMPT, input_variables=["language", "text"])
        chain = prompt | self.llm | StrOutputParser()

        return chain.invoke({"language": language_name, "text": full_text}).strip()

    def translate_text(self, text: str, target_language: str) -> str:
        """Переводит произвольный текст на указанный язык."""
        if target_language not in LANGUAGE_NAMES:
            raise ValueError(f"Unsupported language: {target_language}. Use: kz, ru, en")

        language_name = LANGUAGE_NAMES[target_language]
        prompt = PromptTemplate(template=TRANSLATE_PROMPT, input_variables=["language", "text"])
        chain = prompt | self.llm | StrOutputParser()

        return chain.invoke({"language": language_name, "text": text}).strip()


translation_service = TranslationService()

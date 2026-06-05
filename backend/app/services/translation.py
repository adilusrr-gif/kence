"""Translation service — chunk-based for unlimited document size.

Pipeline: Document → Chunks (≤20 000 chars) → Parallel Translation → Reassemble
Supports documents of any size without information loss.
"""
import asyncio
import logging
from langchain_ollama import OllamaLLM
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from app.core.config import get_settings
from app.services.pipeline import split_text, process_chunks_parallel

settings = get_settings()
logger = logging.getLogger(__name__)

LANGUAGE_NAMES = {
    "kz": "Kazakh (Қазақша)",
    "ru": "Russian (Русский)",
    "en": "English",
}

TRANSLATE_PROMPT = """You are a professional translator.
Translate the following text into {language}.

Rules:
- Output ONLY the translated text, nothing else
- Do NOT add explanations, notes, or commentary
- Translate completely and accurately
- Preserve the original structure: headings, lists, paragraphs, line breaks
- If the text appears to be a continuation of a larger document, translate it naturally

Text to translate:
{text}

Translation into {language}:"""

# Safe chunk size: leaves room for system prompt and output in 32k context window
_TRANSLATION_CHUNK_SIZE = 18_000
_TRANSLATION_OVERLAP = 200


class TranslationService:
    def __init__(self):
        self.llm = OllamaLLM(
            model=settings.LLM_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
            temperature=0.1,
            timeout=300,
        )

    def _translate_chunk_sync(self, text: str, language_name: str) -> str:
        prompt = PromptTemplate(template=TRANSLATE_PROMPT, input_variables=["language", "text"])
        chain = prompt | self.llm | StrOutputParser()
        return chain.invoke({"language": language_name, "text": text}).strip()

    async def _translate_chunk_async(self, text: str, language_name: str) -> str:
        return await asyncio.to_thread(self._translate_chunk_sync, text, language_name)

    def translate_document(self, text: str, target_language: str) -> str:
        """Translate entire document — no character limit.

        Uses chunk-translate-reassemble pipeline for large documents.
        Each chunk is translated independently to fit within LLM context window.
        """
        if target_language not in LANGUAGE_NAMES:
            raise ValueError(f"Unsupported language: {target_language}. Use: kz, ru, en")

        full_text = text.strip()
        if not full_text:
            raise ValueError("Document text is empty")

        language_name = LANGUAGE_NAMES[target_language]

        # Small document: translate in one shot
        if len(full_text) <= _TRANSLATION_CHUNK_SIZE:
            return self._translate_chunk_sync(full_text, language_name)

        # Large document: chunk → translate each → join
        chunks = split_text(full_text, _TRANSLATION_CHUNK_SIZE, _TRANSLATION_OVERLAP)
        logger.info("[translation] document %d chars → %d chunks", len(full_text), len(chunks))

        translations = []
        for i, chunk in enumerate(chunks):
            logger.debug("[translation] translating chunk %d/%d", i + 1, len(chunks))
            translated = self._translate_chunk_sync(chunk, language_name)
            translations.append(translated)

        return "\n\n".join(translations)

    async def translate_document_async(self, text: str, target_language: str) -> str:
        """Async version with parallel chunk translation (max 2 concurrent)."""
        if target_language not in LANGUAGE_NAMES:
            raise ValueError(f"Unsupported language: {target_language}. Use: kz, ru, en")

        full_text = text.strip()
        if not full_text:
            raise ValueError("Document text is empty")

        language_name = LANGUAGE_NAMES[target_language]

        if len(full_text) <= _TRANSLATION_CHUNK_SIZE:
            return await self._translate_chunk_async(full_text, language_name)

        chunks = split_text(full_text, _TRANSLATION_CHUNK_SIZE, _TRANSLATION_OVERLAP)
        logger.info("[translation] async: %d chars → %d chunks", len(full_text), len(chunks))

        async def translate_one(chunk, idx, total):
            logger.debug("[translation] chunk %d/%d", idx + 1, total)
            return await self._translate_chunk_async(chunk, language_name)

        results = await process_chunks_parallel(chunks, translate_one, max_concurrent=2)
        translations = [r for r in results if r]
        return "\n\n".join(translations)

    def translate_text(self, text: str, target_language: str) -> str:
        """Translate arbitrary text (short snippets, no chunking needed)."""
        if target_language not in LANGUAGE_NAMES:
            raise ValueError(f"Unsupported language: {target_language}. Use: kz, ru, en")

        language_name = LANGUAGE_NAMES[target_language]
        prompt = PromptTemplate(template=TRANSLATE_PROMPT, input_variables=["language", "text"])
        chain = prompt | self.llm | StrOutputParser()
        return chain.invoke({"language": language_name, "text": text}).strip()


translation_service = TranslationService()

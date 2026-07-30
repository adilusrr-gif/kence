"""Translation service — chunk-based for unlimited document size.

Pipeline: Document → Chunks (≤20 000 chars) → Parallel Translation → Reassemble
Supports documents of any size without information loss.
"""
import asyncio
import logging
import re
from langchain_ollama import OllamaLLM
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from app.core.config import get_settings
from app.services.pipeline import split_text, process_chunks_parallel

settings = get_settings()
logger = logging.getLogger(__name__)


def _strip_thinking(text: str) -> str:
    """Remove <think>…</think> reasoning traces that thinking models (qwen3.5) emit.
    Left in place they corrupt the translation with the model's internal reasoning."""
    if not text:
        return text
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


def _split_on_boundaries(text: str, max_size: int) -> list[str]:
    """Split text into chunks that never cut a paragraph in half and never overlap.

    Packs whole paragraphs (split on blank lines) up to max_size so the translated
    pieces re-join cleanly into the original document structure. A single paragraph
    larger than max_size is hard-split as a last resort.
    """
    paragraphs = re.split(r"\n\s*\n", text)
    chunks: list[str] = []
    buf = ""
    for para in paragraphs:
        if not para.strip():
            continue
        if len(para) > max_size:
            if buf:
                chunks.append(buf)
                buf = ""
            # Oversized single paragraph — hard-split without overlap.
            for i in range(0, len(para), max_size):
                chunks.append(para[i:i + max_size])
            continue
        candidate = f"{buf}\n\n{para}" if buf else para
        if len(candidate) > max_size:
            chunks.append(buf)
            buf = para
        else:
            buf = candidate
    if buf:
        chunks.append(buf)
    return chunks

LANGUAGE_NAMES = {
    "kz": "Kazakh (Қазақша)",
    "ru": "Russian (Русский)",
    "en": "English",
}

TRANSLATE_PROMPT = """You are a professional translator.
Translate the following text into {language}.

Rules:
- Output ONLY the translated text, nothing else
- Do NOT add explanations, notes, commentary, or <think> reasoning
- Translate completely and accurately — do not omit or summarize any part
- Preserve the Markdown formatting EXACTLY: keep heading markers (#, ##), list
  markers (-, *, 1.), tables (| … |), bold/italic (**, _), blockquotes (>),
  code blocks and inline code, and all line breaks and blank lines as in the source
- Do NOT wrap the whole output in a code fence
- Keep numbers, dates, URLs, code, and proper nouns/identifiers unchanged
- If the text is a continuation of a larger document, translate it naturally

Text to translate:
{text}

Translation into {language}:"""

# Safe chunk size: an 18k chunk made qwen3.5:35b emit ~7-9k tokens, which exceeds the
# per-chunk timeout (LLM_TRANSLATION_TIMEOUT_SEC=240s) on this hardware → chunks timed out
# and translation appeared to freeze. 8k emits ~3-4k tokens, finishing well within timeout.
_TRANSLATION_CHUNK_SIZE = 8_000
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
        raw = chain.invoke({"language": language_name, "text": text})
        return _strip_thinking(raw)

    async def _translate_chunk_async(self, text: str, language_name: str) -> str:
        """Guarded chunk translation — goes through the shared
        _llm_semaphore/_circuit_breaker/_queue_guard + an explicit timeout
        (replaces the dedicated client's no-op timeout=300)."""
        from app.services.llm import _guarded_invoke_standalone

        async def _call():
            return await asyncio.to_thread(self._translate_chunk_sync, text, language_name)

        return await _guarded_invoke_standalone(_call, timeout=settings.LLM_TRANSLATION_TIMEOUT_SEC)

    def _translate_chunk_sync_guarded(self, text: str, language_name: str) -> str:
        """Sync variant of _translate_chunk_async for callers already
        running inside asyncio.to_thread (translate_document)."""
        from app.services.llm import run_guarded_sync

        async def _call():
            return await asyncio.to_thread(self._translate_chunk_sync, text, language_name)

        return run_guarded_sync(_call, timeout=settings.LLM_TRANSLATION_TIMEOUT_SEC)

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
            return self._translate_chunk_sync_guarded(full_text, language_name)

        # Large document: chunk on paragraph boundaries (no overlap) → translate → join
        chunks = _split_on_boundaries(full_text, _TRANSLATION_CHUNK_SIZE)
        logger.info("[translation] document %d chars → %d chunks", len(full_text), len(chunks))

        translations = []
        for i, chunk in enumerate(chunks):
            logger.debug("[translation] translating chunk %d/%d", i + 1, len(chunks))
            translated = (self._translate_chunk_sync_guarded(chunk, language_name) or "").strip()
            translations.append(translated or chunk)  # keep source if a chunk fails — never drop content

        return "\n\n".join(translations)

    async def translate_document_async(self, text: str, target_language: str) -> str:
        """Async version with parallel chunk translation (max 2 concurrent).

        Guarantees the WHOLE document is translated: chunks are split on paragraph
        boundaries (no overlap, no mid-sentence cuts), and any chunk that fails or
        times out is retried once, then — if it still fails — kept as the original
        text rather than silently dropped, so no section ever goes missing.
        """
        if target_language not in LANGUAGE_NAMES:
            raise ValueError(f"Unsupported language: {target_language}. Use: kz, ru, en")

        full_text = text.strip()
        if not full_text:
            raise ValueError("Document text is empty")

        language_name = LANGUAGE_NAMES[target_language]

        if len(full_text) <= _TRANSLATION_CHUNK_SIZE:
            return await self._translate_chunk_async(full_text, language_name)

        chunks = _split_on_boundaries(full_text, _TRANSLATION_CHUNK_SIZE)
        logger.info("[translation] async: %d chars → %d chunks", len(full_text), len(chunks))

        async def translate_one(chunk, idx, total):
            logger.debug("[translation] chunk %d/%d", idx + 1, total)
            return await self._translate_chunk_async(chunk, language_name)

        results = await process_chunks_parallel(chunks, translate_one, max_concurrent=2)

        # Recover any failed/empty chunk so the output is never partial.
        translations: list[str] = []
        missing = 0
        for idx, (chunk, res) in enumerate(zip(chunks, results)):
            text_out = (res or "").strip()
            if not text_out:
                try:
                    text_out = (await self._translate_chunk_async(chunk, language_name) or "").strip()
                except Exception as e:
                    logger.warning("[translation] chunk %d retry failed: %s", idx + 1, e)
                    text_out = ""
            if not text_out:
                # Last resort: keep the source text so the section isn't lost.
                missing += 1
                text_out = chunk
            translations.append(text_out)

        if missing:
            logger.warning("[translation] %d/%d chunks could not be translated — kept original text", missing, len(chunks))
        return "\n\n".join(translations)

    async def translate_document_tracked(
        self,
        text: str,
        target_language: str,
        progress_cb=None,
    ) -> str:
        """Translate a whole document, reporting progress per chunk.

        ``progress_cb(done_chunks, total_chunks)`` is awaited after each chunk
        (if provided), letting the background worker persist progress so the UI
        can show a live percentage and so the job survives refresh/restart.

        Chunks are translated sequentially (background lane) to avoid starving
        interactive chat, with a per-chunk retry; a chunk that still fails keeps
        its original text so no section is ever dropped.
        """
        if target_language not in LANGUAGE_NAMES:
            raise ValueError(f"Unsupported language: {target_language}. Use: kz, ru, en")

        full_text = text.strip()
        if not full_text:
            raise ValueError("Document text is empty")

        language_name = LANGUAGE_NAMES[target_language]
        chunks = (
            [full_text]
            if len(full_text) <= _TRANSLATION_CHUNK_SIZE
            else _split_on_boundaries(full_text, _TRANSLATION_CHUNK_SIZE)
        )
        total = len(chunks)
        logger.info("[translation] tracked: %d chars → %d chunks", len(full_text), total)

        async def _maybe_report(done: int):
            if progress_cb is None:
                return
            res = progress_cb(done, total)
            if asyncio.iscoroutine(res):
                await res

        await _maybe_report(0)
        translations: list[str] = []
        for idx, chunk in enumerate(chunks):
            text_out = ""
            try:
                text_out = (await self._translate_chunk_async(chunk, language_name) or "").strip()
            except Exception as e:
                logger.warning("[translation] tracked chunk %d/%d failed: %s", idx + 1, total, e)
            if not text_out:
                try:
                    text_out = (await self._translate_chunk_async(chunk, language_name) or "").strip()
                except Exception as e:
                    logger.warning("[translation] tracked chunk %d retry failed: %s", idx + 1, e)
            translations.append(text_out or chunk)  # never drop a section
            await _maybe_report(idx + 1)

        return "\n\n".join(translations)

    @staticmethod
    def count_chunks(text: str) -> int:
        full_text = (text or "").strip()
        if not full_text:
            return 0
        if len(full_text) <= _TRANSLATION_CHUNK_SIZE:
            return 1
        return len(_split_on_boundaries(full_text, _TRANSLATION_CHUNK_SIZE))

    def translate_text(self, text: str, target_language: str) -> str:
        """Translate arbitrary text (short snippets, no chunking needed)."""
        if target_language not in LANGUAGE_NAMES:
            raise ValueError(f"Unsupported language: {target_language}. Use: kz, ru, en")

        language_name = LANGUAGE_NAMES[target_language]
        return self._translate_chunk_sync_guarded(text, language_name)


translation_service = TranslationService()

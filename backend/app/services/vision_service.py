import base64
import asyncio
from typing import AsyncGenerator, Optional
from pathlib import Path

from app.core.config import get_settings

settings = get_settings()

_DESCRIBE_PROMPT = (
    "Подробно опиши содержимое этого изображения на русском языке. "
    "Если это документ — извлеки весь текст, заголовки и структуру. "
    "Если это график или диаграмма — опиши данные и выводы. "
    "Если это фотография — опиши объекты, людей и контекст."
)


class VisionService:
    def __init__(self):
        self._model = settings.VISION_MODEL
        self._available: Optional[bool] = None

    def _encode(self, path: str) -> str:
        with open(path, "rb") as f:
            return base64.b64encode(f.read()).decode()

    def is_available(self) -> bool:
        if not self._model:
            return False
        if self._available is not None:
            return self._available
        try:
            import ollama
            tags = ollama.list()
            names = [m.model for m in tags.models]
            self._available = any(self._model.split(":")[0] in n for n in names)
        except Exception:
            self._available = False
        return self._available

    def describe(self, image_path: str) -> str:
        import ollama
        encoded = self._encode(image_path)
        response = ollama.chat(
            model=self._model,
            messages=[{"role": "user", "content": _DESCRIBE_PROMPT, "images": [encoded]}],
        )
        return response["message"]["content"]

    def answer(self, image_path: str, question: str) -> str:
        import ollama
        encoded = self._encode(image_path)
        response = ollama.chat(
            model=self._model,
            messages=[{"role": "user", "content": question, "images": [encoded]}],
        )
        return response["message"]["content"]

    async def answer_stream(self, image_path: str, question: str) -> AsyncGenerator[str, None]:
        import ollama
        encoded = self._encode(image_path)

        def _sync_stream():
            return ollama.chat(
                model=self._model,
                messages=[{"role": "user", "content": question, "images": [encoded]}],
                stream=True,
            )

        stream = await asyncio.to_thread(_sync_stream)
        for chunk in stream:
            content = chunk["message"]["content"]
            if content:
                yield content

    def describe_with_ocr_fallback(self, image_path: str) -> str:
        if self.is_available():
            try:
                return self.describe(image_path)
            except Exception:
                pass
        from app.services.ocr_service import ocr_service
        return ocr_service.extract_text(image_path)


vision_service = VisionService()

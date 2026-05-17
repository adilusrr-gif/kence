from langchain_ollama import OllamaLLM
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from app.core.config import get_settings

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
            timeout=300,
        )

    def translate_document(self, text: str, target_language: str) -> str:
        """Переводит текст документа на указанный язык."""
        if target_language not in LANGUAGE_NAMES:
            raise ValueError(f"Unsupported language: {target_language}. Use: kz, ru, en")

        full_text = text.strip()
        if not full_text:
            raise ValueError("Document text is empty")

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

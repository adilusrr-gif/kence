from langchain_ollama import OllamaLLM
from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
from app.core.config import get_settings
from app.services.document import doc_processor
import asyncio
from typing import AsyncGenerator

settings = get_settings()

QA_PROMPT = """Ты — полезный ассистент для работы с документами. 
Отвечай ТОЛЬКО на основе предоставленного контекста.
Если ответа нет в контексте, скажи об этом честно.

Контекст:
{context}

Вопрос: {question}

Ответ (на русском языке):"""

PRESENTATION_PROMPT = """На основе следующего документа создай структуру презентации.

Документ:
{context}

Создай JSON-структуру презентации:
- 5-8 слайдов
- Каждый слайд: заголовок + 3-5 ключевых пунктов
- Первый слайд — титульный
- Последний — выводы

Ответ строго в формате JSON:
{{
  "title": "Название презентации",
  "slides": [
    {{
      "title": "Заголовок слайда",
      "points": ["Пункт 1", "Пункт 2", "Пункт 3"]
    }}
  ]
}}"""

class LLMService:
    def __init__(self):
        self.llm = OllamaLLM(
            model=settings.LLM_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
            temperature=0.3,
            timeout=300,
        )

    def chat(self, question: str, session_id: str) -> str:
        retriever = doc_processor.get_retriever(session_id)
        
        prompt = PromptTemplate(
            template=QA_PROMPT,
            input_variables=["context", "question"]
        )
        
        # Modern LCEL Chain
        chain = (
            {"context": retriever, "question": RunnablePassthrough()}
            | prompt
            | self.llm
            | StrOutputParser()
        )
        
        return chain.invoke(question)

    async def chat_astream(self, question: str, session_id: str) -> AsyncGenerator[str, None]:
        """Стриминг: сначала retrieval (sync в thread), потом stream LLM"""
        retriever = doc_processor.get_retriever(session_id)
        docs = await asyncio.to_thread(retriever.invoke, question)
        context = "\n\n".join([d.page_content for d in docs])

        prompt = PromptTemplate(template=QA_PROMPT, input_variables=["context", "question"])
        chain = prompt | self.llm | StrOutputParser()

        async for chunk in chain.astream({"context": context, "question": question}):
            yield chunk

    def generate_presentation_structure(self, session_id: str) -> dict:
        retriever = doc_processor.get_retriever(session_id)
        docs = retriever.invoke("основное содержание документа")
        context = "\n\n".join([d.page_content for d in docs[:10]])

        prompt = PRESENTATION_PROMPT.format(context=context)
        response = self.llm.invoke(prompt)

        # Парсим JSON из ответа
        import json
        import re

        # Ищем JSON в ответе
        json_match = re.search(r'\{.*\}', response, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())

        # Fallback
        return {
            "title": "Презентация",
            "slides": [{"title": "Слайд 1", "points": ["Пункт 1"]}]
        }

llm_service = LLMService()

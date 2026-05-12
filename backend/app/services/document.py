from docling.document_converter import DocumentConverter
from docling.datamodel.base_models import InputFormat
from pathlib import Path
from typing import List
from langchain_core.documents import Document as LCDocument
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_ollama import OllamaEmbeddings
from app.core.config import get_settings

settings = get_settings()

class DocumentProcessor:
    def __init__(self):
        self.converter = DocumentConverter()
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP,
            separators=["\n\n", "\n", ". ", " ", ""]
        )
        self.embeddings = OllamaEmbeddings(
            model=settings.EMBEDDING_MODEL,
            base_url=settings.OLLAMA_BASE_URL
        )

    def process_file(self, file_path: str, session_id: str) -> Chroma:
        path = Path(file_path)

        # Docling конвертирует любой формат с сохранением структуры
        result = self.converter.convert(str(path))

        # Экспорт в Markdown (сохраняет таблицы, заголовки, списки)
        markdown_text = result.document.export_to_markdown()

        # Метаданные документа
        doc_title = result.document.name or path.stem

        documents = [LCDocument(
            page_content=markdown_text,
            metadata={
                "source": path.name,
                "format": path.suffix.lower(),
                "title": doc_title,
                "pages": len(result.document.pages) if hasattr(result.document, 'pages') else 0
            }
        )]

        chunks = self.text_splitter.split_documents(documents)

        vector_store = Chroma.from_documents(
            documents=chunks,
            embedding=self.embeddings,
            persist_directory=f"{settings.CHROMA_DIR}/{session_id}"
        )

        return vector_store, markdown_text

    def get_retriever(self, session_id: str):
        vector_store = Chroma(
            persist_directory=f"{settings.CHROMA_DIR}/{session_id}",
            embedding_function=self.embeddings
        )
        return vector_store.as_retriever(search_kwargs={"k": 5})

doc_processor = DocumentProcessor()

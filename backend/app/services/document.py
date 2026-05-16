from docling.document_converter import DocumentConverter
from docling.datamodel.base_models import InputFormat
try:
    from docling_core.types.doc import ImageRefMode
except ImportError:
    ImageRefMode = None
from pathlib import Path
from typing import List
from langchain_core.documents import Document as LCDocument
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from app.core.config import get_settings
from app.services.embeddings_service import embeddings_service

settings = get_settings()

class DocumentProcessor:
    def __init__(self):
        self.converter = DocumentConverter()
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP,
            # "\n" убран: без него строки таблиц остаются в одном чанке
            separators=["\n\n", ". ", "! ", "? ", " ", ""]
        )
        self.embeddings = embeddings_service.embeddings

    # Форматы, читаемые напрямую без Docling
    _PLAIN_EXTS = {".txt", ".md", ".csv", ".tex"}
    _IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".tiff", ".bmp"}

    def process_file(self, file_path: str, session_id: str) -> Chroma:
        path = Path(file_path)
        ext = path.suffix.lower()

        html_text = ""

        if ext in self._PLAIN_EXTS:
            markdown_text = path.read_text(encoding="utf-8", errors="replace")
            doc_title = path.stem
            pages = 0
        else:
            try:
                result = self.converter.convert(str(path))
                markdown_text = result.document.export_to_markdown()
                doc_title = result.document.name or path.stem
                pages = len(result.document.pages) if hasattr(result.document, 'pages') else 0
                # Экспортируем HTML с картинками (base64 embedded)
                try:
                    if ImageRefMode is not None:
                        html_text = result.document.export_to_html(image_mode=ImageRefMode.EMBEDDED)
                    else:
                        html_text = result.document.export_to_html()
                except Exception:
                    html_text = ""
            except Exception:
                if ext in self._IMAGE_EXTS:
                    from app.services.ocr_service import ocr_service
                    markdown_text = ocr_service.extract_text(str(path))
                    doc_title = path.stem
                    pages = 1
                else:
                    raise

        documents = [LCDocument(
            page_content=markdown_text,
            metadata={
                "source": path.name,
                "format": ext,
                "title": doc_title,
                "pages": pages
            }
        )]

        chunks = self.text_splitter.split_documents(documents)

        vector_store = Chroma.from_documents(
            documents=chunks,
            embedding=self.embeddings,
            persist_directory=f"{settings.CHROMA_DIR}/{session_id}"
        )

        return vector_store, markdown_text, html_text

    def get_retriever(self, session_id: str):
        vector_store = Chroma(
            persist_directory=f"{settings.CHROMA_DIR}/{session_id}",
            embedding_function=self.embeddings
        )
        return vector_store.as_retriever(search_kwargs={"k": 5})

doc_processor = DocumentProcessor()

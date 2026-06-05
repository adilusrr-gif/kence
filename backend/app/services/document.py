from docling.document_converter import DocumentConverter
from docling.datamodel.base_models import InputFormat
try:
    from docling.datamodel.pipeline_options import PipelineOptions, PdfPipelineOptions
    _HAS_PIPELINE_OPTIONS = True
except ImportError:
    _HAS_PIPELINE_OPTIONS = False
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

_SEPARATORS = ["\n\n", ". ", "! ", "? ", " ", ""]

# Chunk sizes tuned per document type.
# Spreadsheets/tables → small (row-level granularity).
# Presentations → medium (one topic per slide).
# Plain text → moderate.
# PDF/DOCX → use settings defaults (large for dense prose).
_CHUNK_PROFILES = {
    "table":        dict(chunk_size=400,                   chunk_overlap=50),
    "presentation": dict(chunk_size=700,                   chunk_overlap=100),
    "plain":        dict(chunk_size=1000,                  chunk_overlap=150),
    "default":      dict(chunk_size=settings.CHUNK_SIZE,   chunk_overlap=settings.CHUNK_OVERLAP),
}

_EXT_PROFILE = {
    ".xlsx": "table", ".xls": "table", ".csv": "table",
    ".pptx": "presentation", ".ppt": "presentation",
    ".txt":  "plain", ".md": "plain", ".tex": "plain",
}


def _make_converter(do_ocr: bool = True) -> DocumentConverter:
    """Create Docling converter, optionally with OCR disabled for environments
    where OCR model downloads are blocked."""
    if not do_ocr and _HAS_PIPELINE_OPTIONS:
        try:
            pipeline_options = PdfPipelineOptions(do_ocr=False, do_table_structure=True)
            from docling.document_converter import PdfFormatOption
            return DocumentConverter(
                format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)}
            )
        except Exception:
            pass
    return DocumentConverter()


def _pdf_text_fallback(file_path: str) -> str:
    """Extract text from PDF using pure-Python fallback (no OCR needed)."""
    try:
        import pdfminer.high_level as pdfminer
        return pdfminer.extract_text(file_path) or ""
    except Exception:
        pass
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(file_path)
        return "\n".join(page.get_text() for page in doc)
    except Exception:
        pass
    return ""


class DocumentProcessor:
    def __init__(self):
        self.converter = _make_converter(do_ocr=False)
        self.embeddings = embeddings_service.embeddings

    _PLAIN_EXTS = {".txt", ".md", ".csv", ".tex"}
    _IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp", ".heic"}

    def _splitter(self, ext: str) -> RecursiveCharacterTextSplitter:
        profile = _CHUNK_PROFILES[_EXT_PROFILE.get(ext, "default")]
        return RecursiveCharacterTextSplitter(
            separators=_SEPARATORS,
            **profile,
        )

    def process_file(self, file_path: str, session_id: str) -> Chroma:
        path = Path(file_path)
        ext = path.suffix.lower()
        html_text = ""

        if ext in self._PLAIN_EXTS:
            markdown_text = path.read_text(encoding="utf-8", errors="replace")
            doc_title = path.stem
            pages = 0
        elif ext in self._IMAGE_EXTS:
            from app.services.vision_service import vision_service
            markdown_text = vision_service.describe_with_ocr_fallback(str(path))
            doc_title = path.stem
            pages = 1
        else:
            try:
                result = self.converter.convert(str(path))
                markdown_text = result.document.export_to_markdown()
                doc_title = result.document.name or path.stem
                pages = len(result.document.pages) if hasattr(result.document, "pages") else 0
                try:
                    if ImageRefMode is not None:
                        html_text = result.document.export_to_html(image_mode=ImageRefMode.EMBEDDED)
                    else:
                        html_text = result.document.export_to_html()
                except Exception:
                    html_text = ""
            except Exception as docling_err:
                if ext in self._IMAGE_EXTS:
                    from app.services.vision_service import vision_service
                    markdown_text = vision_service.describe_with_ocr_fallback(str(path))
                    doc_title = path.stem
                    pages = 1
                elif ext == ".pdf":
                    # Fallback: plain text extraction without OCR
                    import logging
                    logging.getLogger(__name__).warning(
                        "Docling failed for %s (%s), using text-only fallback", path.name, docling_err
                    )
                    markdown_text = _pdf_text_fallback(str(path))
                    if not markdown_text.strip():
                        markdown_text = f"[Документ: {path.stem}]\n\nТекст не удалось извлечь автоматически."
                    doc_title = path.stem
                    pages = 0
                    html_text = ""
                else:
                    raise

        documents = [LCDocument(
            page_content=markdown_text,
            metadata={
                "source": path.name,
                "format": ext,
                "title": doc_title,
                "pages": pages,
            },
        )]

        chunks = self._splitter(ext).split_documents(documents)

        vector_store = Chroma.from_documents(
            documents=chunks,
            embedding=self.embeddings,
            persist_directory=f"{settings.CHROMA_DIR}/{session_id}",
        )

        return vector_store, markdown_text, html_text

    def get_retriever(self, session_id: str, mode: str = "precise"):
        """Returns a HybridRetriever. Falls back to pure Chroma on import error."""
        try:
            from app.services.retriever import HybridRetriever
            return HybridRetriever(session_id).as_langchain_retriever(k=8, mode=mode)
        except Exception:
            vector_store = Chroma(
                persist_directory=f"{settings.CHROMA_DIR}/{session_id}",
                embedding_function=self.embeddings,
            )
            if mode == "consultation":
                return vector_store.as_retriever(
                    search_type="mmr",
                    search_kwargs={"k": 12, "fetch_k": 30, "lambda_mult": 0.6},
                )
            return vector_store.as_retriever(search_kwargs={"k": 8})


doc_processor = DocumentProcessor()

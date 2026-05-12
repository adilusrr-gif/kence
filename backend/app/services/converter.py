from docling.document_converter import DocumentConverter
from pathlib import Path
from typing import Literal
from app.core.config import get_settings
import re

settings = get_settings()

SupportedFormat = Literal["txt", "md", "docx", "pdf"]

FORMAT_EXTENSIONS = {
    "txt":  ".txt",
    "md":   ".md",
    "docx": ".docx",
    "pdf":  ".pdf",
}

MEDIA_TYPES = {
    "txt":  "text/plain",
    "md":   "text/markdown",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf":  "application/pdf",
}


def _strip_markdown(text: str) -> str:
    """Убирает markdown-разметку, оставляет чистый текст."""
    text = re.sub(r'#{1,6}\s', '', text)
    text = re.sub(r'\*{1,2}([^*]+)\*{1,2}', r'\1', text)
    text = re.sub(r'`([^`]+)`', r'\1', text)
    return text


def _markdown_to_docx(markdown_text: str, output_path: Path):
    """Конвертирует Markdown в DOCX через python-docx."""
    from docx import Document as DocxDocument

    doc = DocxDocument()

    for line in markdown_text.split("\n"):
        line = line.rstrip()
        if line.startswith("### "):
            doc.add_heading(line[4:], level=3)
        elif line.startswith("## "):
            doc.add_heading(line[3:], level=2)
        elif line.startswith("# "):
            doc.add_heading(line[2:], level=1)
        elif line.startswith(("- ", "* ")):
            doc.add_paragraph(line[2:], style="List Bullet")
        elif re.match(r'^\d+\. ', line):
            doc.add_paragraph(re.sub(r'^\d+\. ', '', line), style="List Number")
        elif line in ("", "---"):
            doc.add_paragraph("")
        else:
            clean = re.sub(r'\*{1,2}([^*]+)\*{1,2}', r'\1', line)
            clean = re.sub(r'`([^`]+)`', r'\1', clean)
            if clean.strip():
                doc.add_paragraph(clean)

    doc.save(str(output_path))


def _text_to_pdf(text: str, output_path: Path, title: str = "Document"):
    """Создаёт PDF из текста через fpdf2 с поддержкой Unicode."""
    from fpdf import FPDF

    class PDF(FPDF):
        def header(self):
            pass
        def footer(self):
            self.set_y(-15)
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(150)
            self.cell(0, 10, f"Page {self.page_no()}", align="C")

    pdf = PDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # Встроенный шрифт Helvetica поддерживает только Latin-1.
    # Для кириллицы используем встроенный DejaVu (включён в fpdf2).
    pdf.add_font("DejaVu", "", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    pdf.add_font("DejaVu", "B", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")

    def safe_font(bold=False):
        try:
            pdf.set_font("DejaVu", "B" if bold else "", 12 if not bold else 14)
        except Exception:
            pdf.set_font("Helvetica", "B" if bold else "", 12 if not bold else 14)

    lines = text.split("\n")
    for line in lines:
        line = line.rstrip()

        if line.startswith("### "):
            safe_font(bold=True)
            pdf.set_font_size(13)
            pdf.multi_cell(0, 8, line[4:])
            pdf.ln(2)
        elif line.startswith("## "):
            safe_font(bold=True)
            pdf.set_font_size(15)
            pdf.multi_cell(0, 9, line[3:])
            pdf.ln(3)
        elif line.startswith("# "):
            safe_font(bold=True)
            pdf.set_font_size(18)
            pdf.multi_cell(0, 10, line[2:])
            pdf.ln(4)
        elif line.startswith(("- ", "* ")):
            safe_font()
            pdf.multi_cell(0, 7, f"  • {line[2:]}")
        elif line in ("", "---"):
            pdf.ln(4)
        else:
            clean = _strip_markdown(line)
            if clean.strip():
                safe_font()
                pdf.multi_cell(0, 7, clean)

    pdf.output(str(output_path))


class ConverterService:
    def __init__(self):
        self.converter = DocumentConverter()

    def _get_source_path(self, session_id: str) -> Path:
        """Находит исходный файл в папке сессии."""
        session_dir = Path(settings.UPLOAD_DIR) / session_id
        if not session_dir.exists():
            raise FileNotFoundError(f"Session directory not found: {session_id}")

        candidates = [
            f for f in session_dir.iterdir()
            if f.is_file()
            and f.name != "presentation.pptx"
            and not f.name.startswith("converted_")
            and not f.name.startswith("translated_")
        ]
        if not candidates:
            raise FileNotFoundError("No source document found in session")

        return candidates[0]

    def convert(self, session_id: str, target_format: SupportedFormat) -> Path:
        """Конвертирует документ сессии в указанный формат."""
        if target_format not in FORMAT_EXTENSIONS:
            raise ValueError(f"Unsupported format: {target_format}. Use: txt, md, docx, pdf")

        source_path = self._get_source_path(session_id)
        output_path = source_path.parent / f"converted_{source_path.stem}{FORMAT_EXTENSIONS[target_format]}"

        result = self.converter.convert(str(source_path))
        doc = result.document
        markdown = doc.export_to_markdown()

        if target_format == "txt":
            output_path.write_text(_strip_markdown(markdown), encoding="utf-8")
        elif target_format == "md":
            output_path.write_text(markdown, encoding="utf-8")
        elif target_format == "docx":
            _markdown_to_docx(markdown, output_path)
        elif target_format == "pdf":
            _text_to_pdf(markdown, output_path, title=source_path.stem)

        return output_path

    def text_to_format(self, text: str, output_path: Path, target_format: SupportedFormat, title: str = "Translated"):
        """Сохраняет произвольный текст в указанном формате (для перевода)."""
        if target_format == "txt":
            output_path.write_text(text, encoding="utf-8")
        elif target_format == "md":
            output_path.write_text(text, encoding="utf-8")
        elif target_format == "docx":
            _markdown_to_docx(text, output_path)
        elif target_format == "pdf":
            _text_to_pdf(text, output_path, title=title)
        return output_path


converter_service = ConverterService()

from docling.document_converter import DocumentConverter
from pathlib import Path
from typing import Literal, Optional
from app.core.config import get_settings
import io
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

_CHART_RE = re.compile(
    r"""\[CHART\s+type=["']?(\w+)["']?\s+title=["']([^"']+)["'](?:\s+data='([^']*)')?(?:\s+data_hint=["']([^"']+)["'])?\]""",
    re.IGNORECASE,
)


def _strip_markdown(text: str) -> str:
    text = re.sub(r'#{1,6}\s', '', text)
    text = re.sub(r'\*{1,2}([^*]+)\*{1,2}', r'\1', text)
    text = re.sub(r'`([^`]+)`', r'\1', text)
    return text


def _render_docx_table(doc, table_lines):
    """Convert buffered | markdown table lines into a python-docx Table."""
    data_rows = [l for l in table_lines if not re.match(r'^\|[\s\-:|]+\|$', l)]
    rows = [[c.strip() for c in l.strip('|').split('|')] for l in data_rows]
    if not rows:
        return
    n_cols = max(len(r) for r in rows)
    table = doc.add_table(rows=len(rows), cols=n_cols)
    try:
        table.style = 'Table Grid'
    except Exception:
        pass
    for r_idx, row in enumerate(rows):
        for c_idx, cell_text in enumerate(row):
            if c_idx < n_cols:
                cell = table.cell(r_idx, c_idx)
                cell.text = cell_text
                if r_idx == 0:
                    for para in cell.paragraphs:
                        for run in para.runs:
                            run.bold = True
    doc.add_paragraph("")


def _render_chart_in_docx(doc, m, llm_service=None):
    """Render a [CHART ...] directive as a PNG image embedded in the docx.

    Group layout: (1) type, (2) title, (3) data JSON (optional), (4) data_hint (optional).
    If group 3 is present, parse data directly without calling LLM.
    """
    import json as _json
    from app.services.chart_service import generate_chart_bytes
    from docx.shared import Inches
    theme = {"bg": "#FFFFFF", "accent": "#2563EB", "text": "#1E293B"}
    chart_type = m.group(1)
    title      = m.group(2)
    data_json  = m.group(3)  # new JSON field  e.g. '[{"label":"A","value":10}]'
    data_hint  = m.group(4)  # legacy hint text
    try:
        if data_json:
            items = _json.loads(data_json)
            labels = [str(item.get("label", "")) for item in items]
            values = [float(item.get("value", 0)) for item in items]
            # Build a simple data_hint string so generate_chart_bytes can use it
            # OR call a direct variant if chart_service supports it
            data_hint_fallback = ", ".join(f"{l}: {v}" for l, v in zip(labels, values))
            chart_bytes = generate_chart_bytes(
                chart_type, title, data_hint_fallback, theme, llm_service,
                direct_labels=labels, direct_values=values,
            )
        else:
            chart_bytes = generate_chart_bytes(
                chart_type, title, data_hint or title, theme, llm_service,
            )
        doc.add_picture(io.BytesIO(chart_bytes), width=Inches(5.5))
        doc.add_paragraph("")
    except Exception:
        doc.add_paragraph(f"[График: {title}]")


def _markdown_to_docx(markdown_text: str, output_path: Path, llm_service=None):
    """Convert Markdown (with tables and [CHART] directives) to DOCX."""
    from docx import Document as DocxDocument

    doc = DocxDocument()
    lines = markdown_text.split("\n")
    table_buffer = []
    i = 0

    while i < len(lines):
        line = lines[i].rstrip()

        # Flush table buffer when non-table line encountered
        if table_buffer and not line.startswith("|"):
            _render_docx_table(doc, table_buffer)
            table_buffer = []

        # Table row
        if line.startswith("|"):
            table_buffer.append(line)
            i += 1
            continue

        # Chart directive
        chart_match = _CHART_RE.match(line)
        if chart_match:
            _render_chart_in_docx(doc, chart_match, llm_service)
            i += 1
            continue

        # Standard markdown elements
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

        i += 1

    # Flush any remaining table
    if table_buffer:
        _render_docx_table(doc, table_buffer)

    doc.save(str(output_path))


def _text_to_pdf(text: str, output_path: Path, title: str = "Document"):
    """Create PDF from text via fpdf2 with Unicode support."""
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
        session_dir = Path(settings.UPLOAD_DIR) / session_id
        if not session_dir.exists():
            raise FileNotFoundError(f"Session directory not found: {session_id}")

        candidates = [
            f for f in session_dir.iterdir()
            if f.is_file()
            and f.name != "presentation.pptx"
            and not f.name.startswith("converted_")
            and not f.name.startswith("translated_")
            and not f.name.startswith("edited_")
        ]
        if not candidates:
            raise FileNotFoundError("No source document found in session")

        return candidates[0]

    def convert(self, session_id: str, target_format: SupportedFormat) -> Path:
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

    def text_to_format(
        self,
        text: str,
        output_path: Path,
        target_format: SupportedFormat,
        title: str = "Translated",
        llm_service=None,
    ):
        """Save arbitrary text in the given format (translation or edited export)."""
        if target_format == "txt":
            output_path.write_text(text, encoding="utf-8")
        elif target_format == "md":
            output_path.write_text(text, encoding="utf-8")
        elif target_format == "docx":
            _markdown_to_docx(text, output_path, llm_service=llm_service)
        elif target_format == "pdf":
            _text_to_pdf(text, output_path, title=title)
        return output_path


converter_service = ConverterService()

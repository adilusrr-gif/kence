"""Tests for multi-format export with structure preservation (PART 3)."""
import tempfile
from pathlib import Path

import pytest

from app.services.converter import converter_service

MD = """# Договор

## Статья 1. Определения

1. Сторона — участник договора.
2. Предмет — объект соглашения.
3. Срок — период действия.

## Таблица

| Параметр | Значение |
| --- | --- |
| Вес | 10 кг |
| Длина | 2 м |

- пункт один
- пункт два
"""


@pytest.fixture
def tmp():
    return Path(tempfile.mkdtemp())


def test_format_attrs_exposed():
    assert converter_service.FORMAT_EXTENSIONS["html"] == ".html"
    assert "text/html" in converter_service.MEDIA_TYPES["html"]
    # Pre-existing formats still present.
    for fmt in ("txt", "md", "docx", "pdf"):
        assert fmt in converter_service.FORMAT_EXTENSIONS


def test_html_preserves_structure(tmp):
    out = tmp / "o.html"
    converter_service.text_to_format(MD, out, "html", title="T")
    html = out.read_text(encoding="utf-8")
    assert "<h1>Договор</h1>" in html
    assert "<ol>" in html and "<li>Сторона — участник договора.</li>" in html
    assert "<table" in html and "<th>Параметр</th>" in html
    assert "<td>10 кг</td>" in html
    assert "<ul>" in html and "<li>пункт один</li>" in html


def test_txt_strips_markdown(tmp):
    out = tmp / "o.txt"
    converter_service.text_to_format(MD, out, "txt", title="T")
    txt = out.read_text(encoding="utf-8")
    assert "Договор" in txt
    assert "#" not in txt


def test_md_roundtrip(tmp):
    out = tmp / "o.md"
    converter_service.text_to_format(MD, out, "md", title="T")
    assert "# Договор" in out.read_text(encoding="utf-8")


def test_docx_created(tmp):
    out = tmp / "o.docx"
    converter_service.text_to_format(MD, out, "docx", title="T")
    assert out.exists() and out.stat().st_size > 0


def test_pdf_created(tmp):
    out = tmp / "o.pdf"
    converter_service.text_to_format(MD, out, "pdf", title="T")
    assert out.exists() and out.stat().st_size > 0

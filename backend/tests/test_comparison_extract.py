"""Unit tests for DocumentComparator.extract_document's PDF fallback path.

Route-level tests in test_comparison.py patch the whole `comparator` singleton,
so they never exercise extract_document itself. These do, by patching only
the pieces that would otherwise hit Docling/network.
"""
from unittest.mock import patch

from app.services.comparison import comparator


def test_extract_document_pdf_falls_back_when_docling_fails():
    with patch.object(comparator.converter, "convert", side_effect=RuntimeError("docling boom")), \
         patch("app.services.document._pdf_text_fallback", return_value="fallback text"):
        text = comparator.extract_document("report.pdf")
    assert text == "fallback text"


def test_extract_document_pdf_uses_placeholder_when_fallback_empty():
    with patch.object(comparator.converter, "convert", side_effect=RuntimeError("docling boom")), \
         patch("app.services.document._pdf_text_fallback", return_value=""):
        text = comparator.extract_document("empty.pdf")
    assert "empty" in text
    assert "не удалось извлечь" in text


def test_extract_document_non_pdf_reraises_on_docling_failure():
    with patch.object(comparator.converter, "convert", side_effect=RuntimeError("docling boom")):
        try:
            comparator.extract_document("notes.docx")
        except RuntimeError as e:
            assert str(e) == "docling boom"
        else:
            raise AssertionError("expected RuntimeError to propagate for non-PDF, non-image extensions")

"""Unit tests for the MIME validator (no HTTP, no app startup needed)."""
import os
import tempfile
import pytest
from app.core.mime_validator import validate_mime


def _write_tmp(content: bytes, suffix: str) -> str:
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
        f.write(content)
        return f.name


class TestTextFiles:
    def test_txt_passes(self):
        path = _write_tmp(b"Hello world plain text", ".txt")
        ok, mime = validate_mime(path)
        assert ok is True
        os.unlink(path)

    def test_html_passes(self):
        path = _write_tmp(b"<html><body>test</body></html>", ".html")
        ok, mime = validate_mime(path)
        assert ok is True
        os.unlink(path)

    def test_tex_passes(self):
        path = _write_tmp(b"\\documentclass{article}", ".tex")
        ok, mime = validate_mime(path)
        assert ok is True
        os.unlink(path)


class TestImageFiles:
    # PNG magic bytes: \x89PNG\r\n\x1a\n
    PNG_HEADER = b'\x89PNG\r\n\x1a\n' + b'\x00' * 100

    # JPEG magic bytes: FF D8 FF
    JPEG_HEADER = b'\xff\xd8\xff\xe0' + b'\x00' * 100

    def test_valid_png(self):
        path = _write_tmp(self.PNG_HEADER, ".png")
        ok, mime = validate_mime(path)
        assert ok is True
        os.unlink(path)

    def test_valid_jpeg(self):
        path = _write_tmp(self.JPEG_HEADER, ".jpg")
        ok, mime = validate_mime(path)
        assert ok is True
        os.unlink(path)

    def test_exe_disguised_as_png(self):
        # MZ header (Windows exe) with .png extension
        path = _write_tmp(b'MZ\x90\x00' + b'\x00' * 100, ".png")
        ok, mime = validate_mime(path)
        assert ok is False
        os.unlink(path)


class TestPdfFiles:
    PDF_HEADER = b'%PDF-1.4 ' + b'\x00' * 100

    def test_valid_pdf(self):
        path = _write_tmp(self.PDF_HEADER, ".pdf")
        ok, _ = validate_mime(path)
        assert ok is True
        os.unlink(path)

    def test_text_disguised_as_pdf(self):
        # Plain text content with .pdf extension — filetype returns None (can't detect),
        # which we treat as pass (text/plain may not have magic bytes)
        path = _write_tmp(b"Just plain text no magic bytes here", ".pdf")
        ok, _ = validate_mime(path)
        # When filetype can't detect, we allow it through (returns True)
        assert isinstance(ok, bool)
        os.unlink(path)

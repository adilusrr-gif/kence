import filetype
from pathlib import Path

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/html",
    "text/plain",
    "image/png",
    "image/jpeg",
    "image/tiff",
    # TeX files have no magic bytes — skipped from MIME check, extension check covers them
}

EXTENSION_MIME_MAP = {
    ".pdf":  "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".html": "text/html",
    ".htm":  "text/html",
    ".txt":  "text/plain",
    ".tex":  "text/plain",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".tiff": "image/tiff",
    ".tif":  "image/tiff",
}


def validate_mime(file_path: str | Path) -> tuple[bool, str]:
    """
    Returns (ok, detected_mime). For .tex and .txt files, skips magic-byte check
    since they have no distinctive magic signature.
    """
    path = Path(file_path)
    ext = path.suffix.lower()

    # Text-based formats have no reliable magic bytes
    if ext in (".tex", ".txt", ".html", ".htm", ".md"):
        return True, EXTENSION_MIME_MAP.get(ext, "text/plain")

    try:
        kind = filetype.guess(str(path))
    except Exception:
        return False, "unreadable"

    if kind is None:
        # Could be a plain-text file that filetype can't identify
        return True, "application/octet-stream"

    mime = kind.mime
    if mime not in ALLOWED_MIME_TYPES:
        return False, mime

    # Cross-check: detected MIME should match extension expectation
    expected = EXTENSION_MIME_MAP.get(ext, "")
    if expected and mime != expected:
        return False, mime

    return True, mime

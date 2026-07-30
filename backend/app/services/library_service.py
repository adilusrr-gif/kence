import os
import logging
import shutil
from typing import Optional
from datetime import datetime, timezone
from app.core.database import SessionLocal
from app.models.models import DocumentLibrary, LibraryDocumentContent, LibraryTaxonomy
from fastapi import HTTPException

logger = logging.getLogger(__name__)

_PREVIEW_CHARS = 800


def _library_root(org_id: int) -> str:
    base = os.getenv("UPLOAD_DIR", "./uploads")
    path = os.path.join(base, "org_library", str(org_id))
    os.makedirs(path, exist_ok=True)
    return path


# ── Durable content + vector store, decoupled from sessions ────────────────────

def library_collection_id(doc_id: int) -> str:
    """Chroma namespace of a library document: chroma_db/library/{id}.

    Deliberately not a session UUID — cleanup_session only rmtree's
    chroma_dir/{session_id}, so a library index under library/ is never
    collected along with an expiring session.
    """
    return f"library/{doc_id}"


def _library_chroma_dir(doc_id: int) -> str:
    from app.core.config import get_settings
    return os.path.join(get_settings().CHROMA_DIR, "library", str(doc_id))


def save_library_content(
    doc_id: int,
    markdown_text: Optional[str],
    has_vector_store: bool = False,
) -> None:
    """Upsert the extracted text of a library document."""
    text = markdown_text or ""
    with SessionLocal() as db:
        row = db.query(LibraryDocumentContent).filter_by(library_doc_id=doc_id).first()
        if row is None:
            row = LibraryDocumentContent(library_doc_id=doc_id)
            db.add(row)
        row.markdown_text = text
        row.preview = text[:_PREVIEW_CHARS]
        row.char_count = len(text)
        row.has_vector_store = has_vector_store
        if has_vector_store:
            row.indexed_at = datetime.now(timezone.utc)
        db.commit()


def get_library_content(doc_id: int, org_id: int) -> Optional[dict]:
    """Extracted text of a library document, scoped to its organisation.

    Joined to document_library and filtered by org_id so a doc_id from another
    organisation never yields content (defence-in-depth for the agent path).
    """
    with SessionLocal() as db:
        row = (
            db.query(LibraryDocumentContent)
            .join(DocumentLibrary, DocumentLibrary.id == LibraryDocumentContent.library_doc_id)
            .filter(
                LibraryDocumentContent.library_doc_id == doc_id,
                DocumentLibrary.org_id == org_id,
            )
            .first()
        )
        if not row:
            return None
        return {
            "library_doc_id": row.library_doc_id,
            "markdown_text": row.markdown_text or "",
            "preview": row.preview or "",
            "char_count": row.char_count or 0,
            "has_vector_store": bool(row.has_vector_store),
            "indexed_at": row.indexed_at.isoformat() if row.indexed_at else None,
        }


def adopt_session_vector_store(doc_id: int, session_id: str) -> bool:
    """Copy an already-built session Chroma index into the library namespace.

    Used when a document is added to the library from a workspace session: the
    embeddings already exist, so copying the directory avoids re-embedding the
    whole document just to get a session-independent copy.
    """
    from app.core.config import get_settings

    src = os.path.join(get_settings().CHROMA_DIR, session_id)
    if not os.path.isdir(src):
        return False
    dst = _library_chroma_dir(doc_id)
    try:
        if os.path.isdir(dst):
            shutil.rmtree(dst)
        shutil.copytree(src, dst)
        return True
    except OSError as e:
        logger.warning("[library] vector store adopt failed for doc %s: %s", doc_id, e)
        return False


def reindex_library_doc(doc_id: int) -> bool:
    """Re-extract and re-index a library document from its stored original file.

    Repairs rows whose content predates library_document_content (backfilled
    without a vector store) or whose index was lost.
    """
    with SessionLocal() as db:
        doc = db.query(DocumentLibrary).filter_by(id=doc_id).first()
        file_path = doc.file_path if doc else None
    if not file_path or not os.path.exists(file_path):
        logger.warning("[library] reindex skipped for doc %s: file missing", doc_id)
        return False

    from app.services.document import doc_processor

    try:
        _vs, markdown_text, _html = doc_processor.process_file(
            file_path, library_collection_id(doc_id)
        )
    except Exception as e:
        logger.error("[library] reindex failed for doc %s: %s", doc_id, e)
        return False

    save_library_content(doc_id, markdown_text, has_vector_store=True)
    return True


def add_to_library(
    org_id: int,
    username: str,
    source_path: str,
    name: str,
    description: Optional[str] = None,
    tags: Optional[list] = None,
    mime_type: Optional[str] = None,
    doc_kind: str = "document",
    direction: Optional[str] = None,
    issuer: Optional[str] = None,
    doc_number: Optional[str] = None,
    doc_date: Optional[str] = None,
    session_id: Optional[str] = None,
) -> dict:
    if not os.path.exists(source_path):
        raise HTTPException(status_code=404, detail="Исходный файл не найден")

    dest_dir = _library_root(org_id)
    filename = os.path.basename(source_path)
    dest_path = os.path.join(dest_dir, filename)

    # Avoid name collision
    if os.path.exists(dest_path):
        base, ext = os.path.splitext(filename)
        dest_path = os.path.join(dest_dir, f"{base}_{int(datetime.now().timestamp())}{ext}")

    shutil.copy2(source_path, dest_path)
    file_size = os.path.getsize(dest_path)

    with SessionLocal() as db:
        doc = DocumentLibrary(
            org_id=org_id,
            owner_username=username,
            name=name,
            description=description,
            file_path=dest_path,
            file_size_bytes=file_size,
            mime_type=mime_type,
            tags=tags or [],
            doc_kind=doc_kind if doc_kind in ("document", "npa") else "document",
            direction=direction,
            issuer=issuer,
            doc_number=doc_number,
            doc_date=doc_date,
            session_id=session_id,
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        return _doc_to_dict(doc)


def list_library(org_id: int, username: str, include_shared: bool = True) -> list[dict]:
    with SessionLocal() as db:
        q = db.query(DocumentLibrary).filter(DocumentLibrary.org_id == org_id)
        if not include_shared:
            q = q.filter(DocumentLibrary.owner_username == username)
        return [_doc_to_dict(d) for d in q.order_by(DocumentLibrary.created_at.desc()).all()]


def get_library_doc(doc_id: int, org_id: int) -> Optional[dict]:
    """Fetch a library document scoped to its organisation.

    org_id is mandatory and part of the WHERE clause: a doc_id that belongs to
    another organisation returns None (→ 404 at the route), so cross-org reads
    are impossible even if the caller is a member of the org named in the URL.
    """
    with SessionLocal() as db:
        doc = db.query(DocumentLibrary).filter_by(id=doc_id, org_id=org_id).first()
        if not doc:
            return None
        doc.last_accessed = datetime.now(timezone.utc)
        db.commit()
        return _doc_to_dict(doc)


def update_library_doc(doc_id: int, org_id: int, fields: dict) -> Optional[dict]:
    """Admin metadata edit — name, description, tags, doc_kind, direction, issuer, doc_number, doc_date."""
    editable = {"name", "description", "tags", "doc_kind", "direction", "issuer", "doc_number", "doc_date"}
    with SessionLocal() as db:
        doc = db.query(DocumentLibrary).filter_by(id=doc_id, org_id=org_id).first()
        if not doc:
            return None
        for k, v in fields.items():
            if k not in editable:
                continue
            if k == "doc_kind" and v not in ("document", "npa"):
                continue
            setattr(doc, k, v)
        db.commit()
        db.refresh(doc)
        return _doc_to_dict(doc)


def delete_library_doc(doc_id: int, requester_username: str, requester_org_id: int, is_admin: bool = False) -> bool:
    with SessionLocal() as db:
        doc = db.query(DocumentLibrary).filter_by(id=doc_id, org_id=requester_org_id).first()
        if not doc:
            return False
        # Owner or org admin/owner can delete
        if doc.owner_username != requester_username and not is_admin:
            raise HTTPException(status_code=403, detail="Недостаточно прав для удаления")
        try:
            if os.path.exists(doc.file_path):
                os.remove(doc.file_path)
        except OSError:
            pass
        # ondelete=CASCADE covers Postgres, but the SQLite dev engine never sets
        # PRAGMA foreign_keys=ON, so delete the content row explicitly to avoid
        # orphans there. The vector store is on disk and always needs doing.
        db.query(LibraryDocumentContent).filter_by(library_doc_id=doc_id).delete()
        try:
            chroma_dir = _library_chroma_dir(doc_id)
            if os.path.isdir(chroma_dir):
                shutil.rmtree(chroma_dir)
        except OSError as e:
            logger.warning("[library] vector store cleanup failed for doc %s: %s", doc_id, e)
        db.delete(doc)
        db.commit()
        return True


def search_library(
    org_id: int,
    query: str,
    tags: Optional[list] = None,
    doc_kind: Optional[str] = None,
    direction: Optional[str] = None,
    issuer: Optional[str] = None,
) -> list[dict]:
    with SessionLocal() as db:
        q = db.query(DocumentLibrary).filter(DocumentLibrary.org_id == org_id)
        if doc_kind in ("document", "npa"):
            q = q.filter(DocumentLibrary.doc_kind == doc_kind)
        if direction:
            q = q.filter(DocumentLibrary.direction == direction)
        if issuer:
            q = q.filter(DocumentLibrary.issuer == issuer)
        if query:
            pattern = f"%{query}%"
            from sqlalchemy import or_
            # Body search rides on an outer join so documents without an
            # extracted-content row still match on their metadata.
            q = q.outerjoin(
                LibraryDocumentContent,
                LibraryDocumentContent.library_doc_id == DocumentLibrary.id,
            ).filter(or_(
                DocumentLibrary.name.ilike(pattern),
                DocumentLibrary.description.ilike(pattern),
                DocumentLibrary.doc_number.ilike(pattern),
                LibraryDocumentContent.markdown_text.ilike(pattern),
            ))
        docs = q.order_by(DocumentLibrary.created_at.desc()).all()
        if tags:
            docs = [d for d in docs if d.tags and any(t in d.tags for t in tags)]
        return [_doc_to_dict(d) for d in docs]


# ── Taxonomy (admin-managed dictionaries: directions, issuers) ──────────────────

_TAXONOMY_KINDS = ("direction", "issuer")


def list_taxonomy(org_id: int, kind: Optional[str] = None) -> dict:
    """Returns {'direction': [...], 'issuer': [...]} or one list if kind given."""
    with SessionLocal() as db:
        q = db.query(LibraryTaxonomy).filter(LibraryTaxonomy.org_id == org_id)
        if kind in _TAXONOMY_KINDS:
            q = q.filter(LibraryTaxonomy.kind == kind)
        rows = q.order_by(LibraryTaxonomy.value.asc()).all()
    out = {"direction": [], "issuer": []}
    for r in rows:
        out.setdefault(r.kind, []).append({"id": r.id, "value": r.value})
    return out[kind] if kind in _TAXONOMY_KINDS else out


def add_taxonomy(org_id: int, kind: str, value: str) -> dict:
    if kind not in _TAXONOMY_KINDS:
        raise HTTPException(status_code=400, detail="Недопустимый тип справочника")
    value = (value or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail="Пустое значение")
    with SessionLocal() as db:
        existing = db.query(LibraryTaxonomy).filter_by(org_id=org_id, kind=kind, value=value).first()
        if existing:
            return {"id": existing.id, "kind": kind, "value": value}
        row = LibraryTaxonomy(org_id=org_id, kind=kind, value=value)
        db.add(row)
        db.commit()
        db.refresh(row)
        return {"id": row.id, "kind": kind, "value": value}


def delete_taxonomy(org_id: int, taxonomy_id: int) -> bool:
    with SessionLocal() as db:
        row = db.query(LibraryTaxonomy).filter_by(id=taxonomy_id, org_id=org_id).first()
        if not row:
            return False
        db.delete(row)
        db.commit()
        return True


def _doc_to_dict(doc: DocumentLibrary) -> dict:
    return {
        "id": doc.id,
        "org_id": doc.org_id,
        "owner_username": doc.owner_username,
        "name": doc.name,
        "description": doc.description,
        "file_path": doc.file_path,
        "file_size_bytes": doc.file_size_bytes,
        "mime_type": doc.mime_type,
        "is_shared": doc.is_shared,
        "tags": doc.tags or [],
        "doc_kind": doc.doc_kind or "document",
        "direction": doc.direction,
        "issuer": doc.issuer,
        "doc_number": doc.doc_number,
        "doc_date": doc.doc_date,
        "session_id": doc.session_id,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
        "last_accessed": doc.last_accessed.isoformat() if doc.last_accessed else None,
    }

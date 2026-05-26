import os
import shutil
from typing import Optional
from datetime import datetime, timezone
from app.core.database import SessionLocal
from app.models.models import DocumentLibrary
from fastapi import HTTPException


def _library_root(org_id: int) -> str:
    base = os.getenv("UPLOAD_DIR", "./uploads")
    path = os.path.join(base, "org_library", str(org_id))
    os.makedirs(path, exist_ok=True)
    return path


def add_to_library(
    org_id: int,
    username: str,
    source_path: str,
    name: str,
    description: Optional[str] = None,
    tags: Optional[list] = None,
    mime_type: Optional[str] = None,
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


def get_library_doc(doc_id: int, requester_username: str) -> Optional[dict]:
    with SessionLocal() as db:
        doc = db.query(DocumentLibrary).filter_by(id=doc_id).first()
        if not doc:
            return None
        doc.last_accessed = datetime.now(timezone.utc)
        db.commit()
        return _doc_to_dict(doc)


def delete_library_doc(doc_id: int, requester_username: str, requester_org_id: int) -> bool:
    with SessionLocal() as db:
        doc = db.query(DocumentLibrary).filter_by(id=doc_id, org_id=requester_org_id).first()
        if not doc:
            return False
        # Only owner or admin can delete
        if doc.owner_username != requester_username:
            raise HTTPException(status_code=403, detail="Недостаточно прав для удаления")
        try:
            if os.path.exists(doc.file_path):
                os.remove(doc.file_path)
        except OSError:
            pass
        db.delete(doc)
        db.commit()
        return True


def search_library(org_id: int, query: str, tags: Optional[list] = None) -> list[dict]:
    with SessionLocal() as db:
        q = db.query(DocumentLibrary).filter(DocumentLibrary.org_id == org_id)
        if query:
            pattern = f"%{query}%"
            from sqlalchemy import or_
            q = q.filter(or_(
                DocumentLibrary.name.ilike(pattern),
                DocumentLibrary.description.ilike(pattern),
            ))
        docs = q.order_by(DocumentLibrary.created_at.desc()).all()
        if tags:
            docs = [d for d in docs if d.tags and any(t in d.tags for t in tags)]
        return [_doc_to_dict(d) for d in docs]


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
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
        "last_accessed": doc.last_accessed.isoformat() if doc.last_accessed else None,
    }

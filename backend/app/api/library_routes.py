import os
import asyncio
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional

from app.api.auth_routes import get_current_user, require_org_member, require_org_admin
from app.services.library_service import (
    add_to_library, list_library, get_library_doc, delete_library_doc, search_library,
    update_library_doc, list_taxonomy, add_taxonomy, delete_taxonomy,
    save_library_content, adopt_session_vector_store,
)
from app.core.session import session_manager
from app.core.config import get_settings

router = APIRouter(tags=["library"])
_settings = get_settings()


def _is_org_admin(org_id: int, current_user: dict) -> bool:
    try:
        require_org_admin(org_id, current_user)
        return True
    except HTTPException:
        return False


class AddToLibraryRequest(BaseModel):
    session_id: str
    name: str
    description: Optional[str] = None
    tags: Optional[list[str]] = None
    doc_kind: Optional[str] = "document"
    direction: Optional[str] = None
    issuer: Optional[str] = None
    doc_number: Optional[str] = None
    doc_date: Optional[str] = None


class UpdateLibraryRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[list[str]] = None
    doc_kind: Optional[str] = None
    direction: Optional[str] = None
    issuer: Optional[str] = None
    doc_number: Optional[str] = None
    doc_date: Optional[str] = None


class TaxonomyRequest(BaseModel):
    kind: str   # direction | issuer
    value: str


@router.get("/orgs/{org_id}/library")
async def get_library(
    org_id: int,
    search: Optional[str] = Query(None),
    tags: Optional[str] = Query(None),
    doc_kind: Optional[str] = Query(None),
    direction: Optional[str] = Query(None),
    issuer: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    require_org_member(org_id, current_user)
    tag_list = tags.split(",") if tags else None
    if search or tag_list or doc_kind or direction or issuer:
        return search_library(org_id, search or "", tag_list, doc_kind=doc_kind, direction=direction, issuer=issuer)
    return list_library(org_id, current_user["username"])


@router.post("/orgs/{org_id}/library")
async def add_doc_to_library(
    org_id: int,
    req: AddToLibraryRequest,
    current_user: dict = Depends(get_current_user),
):
    require_org_member(org_id, current_user)
    session = session_manager.get_session(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    from app.api.routes import _verify_session_access
    _verify_session_access(session, current_user)

    upload_dir = _settings.UPLOAD_DIR
    session_dir = os.path.join(upload_dir, req.session_id)
    if not os.path.isdir(session_dir):
        raise HTTPException(status_code=404, detail="Файлы сессии не найдены")

    # Find the uploaded file (skip generated/converted artifacts)
    _ARTIFACT_PREFIXES = ("converted_", "translated_", "edited_", "presentation")
    files = [
        f for f in os.listdir(session_dir)
        if not f.startswith(".") and not any(f.startswith(p) for p in _ARTIFACT_PREFIXES)
    ]
    if not files:
        raise HTTPException(status_code=404, detail="В сессии нет файлов")

    source_path = os.path.join(session_dir, files[0])
    doc = add_to_library(
        org_id=org_id,
        username=current_user["username"],
        source_path=source_path,
        name=req.name,
        description=req.description,
        tags=req.tags,
        doc_kind=req.doc_kind or "document",
        direction=req.direction,
        issuer=req.issuer,
        doc_number=req.doc_number,
        doc_date=req.doc_date,
        session_id=req.session_id,
    )

    # Take a session-independent copy of the text and the vector store: the
    # source session expires (SESSION_TIMEOUT) and takes both with it, which
    # used to leave this library row unreadable to the compliance agent.
    adopted = await asyncio.to_thread(adopt_session_vector_store, doc["id"], req.session_id)
    await asyncio.to_thread(
        save_library_content, doc["id"], session.get("markdown_text"), adopted
    )
    return doc


@router.post("/orgs/{org_id}/library/upload")
async def upload_doc_to_library(
    org_id: int,
    file: UploadFile = File(...),
    name: str = Form(...),
    description: Optional[str] = Form(None),
    doc_kind: str = Form("document"),
    direction: Optional[str] = Form(None),
    issuer: Optional[str] = Form(None),
    doc_number: Optional[str] = Form(None),
    doc_date: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """Direct upload into the library (e.g. an НПА/law) without an existing workspace session.

    The file is processed (Docling → markdown + vector store) under a fresh session so
    agents can RAG-retrieve it, then registered in the library with metadata.
    """
    require_org_admin(org_id, current_user)

    from app.core.mime_validator import validate_mime
    from app.services.document import doc_processor, doc_executor

    safe_name = Path(file.filename or "").name
    if not safe_name or len(safe_name) > 200:
        raise HTTPException(status_code=400, detail="Недопустимое имя файла")
    ext = Path(safe_name).suffix.lower()
    if ext not in _settings.ALLOWED_UPLOAD_FORMATS:
        raise HTTPException(status_code=400, detail=f"Допустимые форматы: {', '.join(sorted(_settings.ALLOWED_UPLOAD_FORMATS))}")
    if file.size and file.size > _settings.MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"Файл слишком большой. Максимум {_settings.MAX_FILE_SIZE // 1024 // 1024} МБ")

    session_id = session_manager.create_session()
    upload_root = Path(_settings.UPLOAD_DIR).resolve()
    file_path = (upload_root / session_id / safe_name).resolve()
    if not file_path.is_relative_to(upload_root):
        raise HTTPException(status_code=400, detail="Недопустимый путь файла")
    file_path.parent.mkdir(parents=True, exist_ok=True)

    import shutil

    # Blocking file write + MIME sniff off the event loop (see routes.upload_document).
    loop = asyncio.get_running_loop()

    def _save_and_validate():
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return validate_mime(file_path)

    ok, detected_mime = await loop.run_in_executor(doc_executor, _save_and_validate)
    if not ok:
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=415, detail=f"Содержимое не соответствует расширению (определено: {detected_mime})")

    # Process so the doc is indexed for RAG (used by the compliance agent).
    try:
        _vs, markdown_text, html_text = await loop.run_in_executor(
            doc_executor, doc_processor.process_file, str(file_path), session_id
        )
        session = session_manager.get_session(session_id)
        session["document"] = safe_name
        session["vector_store"] = True
        session["preview"] = (markdown_text or "")[:800]
        session["markdown_text"] = markdown_text
        # HTML preview goes to disk, not RAM/DB (see session_manager.store_html).
        await asyncio.to_thread(session_manager.store_html, session_id, html_text or "")
        session["org_id"] = org_id
        session["owner_username"] = current_user["username"]
        session_manager.save_session(session_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Не удалось обработать файл: {e}")

    resolved_kind = doc_kind if doc_kind in ("document", "npa") else "document"
    # A regular document added to the library gets the same automatic НПА check
    # as a workspace upload; an НПА must not be checked against itself.
    if resolved_kind != "npa":
        from app.services import compliance_autocheck
        if await asyncio.to_thread(compliance_autocheck.should_autocheck, session, org_id):
            compliance_autocheck.dispatch(session_id, current_user["username"], org_id)

    tag_list = [t.strip() for t in tags.split(",")] if tags else None
    doc = add_to_library(
        org_id=org_id,
        username=current_user["username"],
        source_path=str(file_path),
        name=name,
        description=description,
        tags=tag_list,
        mime_type=detected_mime,
        doc_kind=resolved_kind,
        direction=direction,
        issuer=issuer,
        doc_number=doc_number,
        doc_date=doc_date,
        session_id=session_id,
    )

    # Promote the freshly built index and text out of the session and into the
    # library namespace, so neither is lost when this session expires.
    adopted = await asyncio.to_thread(adopt_session_vector_store, doc["id"], session_id)
    await asyncio.to_thread(save_library_content, doc["id"], markdown_text, adopted)
    return doc


@router.get("/orgs/{org_id}/library/{doc_id}")
async def get_library_document(org_id: int, doc_id: int, current_user: dict = Depends(get_current_user)):
    require_org_member(org_id, current_user)
    doc = get_library_doc(doc_id, org_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Документ не найден")
    return doc


@router.put("/orgs/{org_id}/library/{doc_id}")
async def edit_library_document(
    org_id: int,
    doc_id: int,
    req: UpdateLibraryRequest,
    current_user: dict = Depends(get_current_user),
):
    require_org_admin(org_id, current_user)
    fields = {k: v for k, v in req.model_dump().items() if v is not None}
    doc = update_library_doc(doc_id, org_id, fields)
    if not doc:
        raise HTTPException(status_code=404, detail="Документ не найден")
    return doc


@router.delete("/orgs/{org_id}/library/{doc_id}")
async def delete_library_document(org_id: int, doc_id: int, current_user: dict = Depends(get_current_user)):
    require_org_member(org_id, current_user)
    ok = delete_library_doc(
        doc_id, current_user["username"], org_id, is_admin=_is_org_admin(org_id, current_user)
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Документ не найден")
    return {"message": "Документ удалён из библиотеки"}


@router.get("/orgs/{org_id}/library/{doc_id}/download")
async def download_library_document(org_id: int, doc_id: int, current_user: dict = Depends(get_current_user)):
    require_org_member(org_id, current_user)
    doc = get_library_doc(doc_id, org_id)
    if not doc or not os.path.exists(doc["file_path"]):
        raise HTTPException(status_code=404, detail="Файл не найден")
    return FileResponse(doc["file_path"], filename=doc["name"])


@router.post("/orgs/{org_id}/library/{doc_id}/open-session")
async def open_library_doc_in_session(org_id: int, doc_id: int, current_user: dict = Depends(get_current_user)):
    """Creates a new workspace session pre-loaded with a library document."""
    require_org_member(org_id, current_user)
    doc = get_library_doc(doc_id, org_id)
    if not doc or not os.path.exists(doc["file_path"]):
        raise HTTPException(status_code=404, detail="Файл не найден")

    session_id = session_manager.create_session()
    upload_dir = _settings.UPLOAD_DIR
    dest_dir = os.path.join(upload_dir, session_id)
    os.makedirs(dest_dir, exist_ok=True)

    import shutil
    dest_path = os.path.join(dest_dir, doc["name"])
    shutil.copy2(doc["file_path"], dest_path)

    session = session_manager.get_session(session_id)
    session["document"] = doc["name"]
    session["org_id"] = org_id
    session["owner_username"] = current_user["username"]
    session_manager.save_session(session_id)

    return {"session_id": session_id, "document_name": doc["name"]}


# ── Taxonomy (admin-managed dictionaries) ───────────────────────────────────────

@router.get("/orgs/{org_id}/library-taxonomy")
async def get_taxonomy(org_id: int, kind: Optional[str] = Query(None), current_user: dict = Depends(get_current_user)):
    require_org_member(org_id, current_user)
    return list_taxonomy(org_id, kind)


@router.post("/orgs/{org_id}/library-taxonomy")
async def create_taxonomy(org_id: int, req: TaxonomyRequest, current_user: dict = Depends(get_current_user)):
    require_org_admin(org_id, current_user)
    return add_taxonomy(org_id, req.kind, req.value)


@router.delete("/orgs/{org_id}/library-taxonomy/{taxonomy_id}")
async def remove_taxonomy(org_id: int, taxonomy_id: int, current_user: dict = Depends(get_current_user)):
    require_org_admin(org_id, current_user)
    ok = delete_taxonomy(org_id, taxonomy_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Запись справочника не найдена")
    return {"message": "Удалено"}

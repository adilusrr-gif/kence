import os
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional

from app.api.auth_routes import get_current_user, require_org_member, require_org_admin
from app.services.library_service import (
    add_to_library, list_library, get_library_doc, delete_library_doc, search_library
)
from app.core.session import session_manager

router = APIRouter(tags=["library"])


class AddToLibraryRequest(BaseModel):
    session_id: str
    name: str
    description: Optional[str] = None
    tags: Optional[list[str]] = None


@router.get("/orgs/{org_id}/library")
async def get_library(
    org_id: int,
    search: Optional[str] = Query(None),
    tags: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    require_org_member(org_id, current_user)
    tag_list = tags.split(",") if tags else None
    if search or tag_list:
        return search_library(org_id, search or "", tag_list)
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

    upload_dir = os.getenv("UPLOAD_DIR", "./uploads")
    session_dir = os.path.join(upload_dir, req.session_id)
    if not os.path.isdir(session_dir):
        raise HTTPException(status_code=404, detail="Файлы сессии не найдены")

    # Find the uploaded file
    files = [f for f in os.listdir(session_dir) if not f.startswith(".")]
    if not files:
        raise HTTPException(status_code=404, detail="В сессии нет файлов")

    source_path = os.path.join(session_dir, files[0])
    return add_to_library(
        org_id=org_id,
        username=current_user["username"],
        source_path=source_path,
        name=req.name,
        description=req.description,
        tags=req.tags,
    )


@router.get("/orgs/{org_id}/library/{doc_id}")
async def get_library_document(org_id: int, doc_id: int, current_user: dict = Depends(get_current_user)):
    require_org_member(org_id, current_user)
    doc = get_library_doc(doc_id, current_user["username"])
    if not doc:
        raise HTTPException(status_code=404, detail="Документ не найден")
    return doc


@router.delete("/orgs/{org_id}/library/{doc_id}")
async def delete_library_document(org_id: int, doc_id: int, current_user: dict = Depends(get_current_user)):
    require_org_member(org_id, current_user)
    ok = delete_library_doc(doc_id, current_user["username"], org_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Документ не найден")
    return {"message": "Документ удалён из библиотеки"}


@router.get("/orgs/{org_id}/library/{doc_id}/download")
async def download_library_document(org_id: int, doc_id: int, current_user: dict = Depends(get_current_user)):
    require_org_member(org_id, current_user)
    doc = get_library_doc(doc_id, current_user["username"])
    if not doc or not os.path.exists(doc["file_path"]):
        raise HTTPException(status_code=404, detail="Файл не найден")
    return FileResponse(doc["file_path"], filename=doc["name"])


@router.post("/orgs/{org_id}/library/{doc_id}/open-session")
async def open_library_doc_in_session(org_id: int, doc_id: int, current_user: dict = Depends(get_current_user)):
    """Creates a new workspace session pre-loaded with a library document."""
    require_org_member(org_id, current_user)
    doc = get_library_doc(doc_id, current_user["username"])
    if not doc or not os.path.exists(doc["file_path"]):
        raise HTTPException(status_code=404, detail="Файл не найден")

    session_id = session_manager.create_session()
    upload_dir = os.getenv("UPLOAD_DIR", "./uploads")
    dest_dir = os.path.join(upload_dir, session_id)
    os.makedirs(dest_dir, exist_ok=True)

    import shutil
    dest_path = os.path.join(dest_dir, doc["name"])
    shutil.copy2(doc["file_path"], dest_path)

    session = session_manager.get_session(session_id)
    session["document_name"] = doc["name"]
    session["org_id"] = org_id
    session["owner_username"] = current_user["username"]
    session_manager.save_session(session_id)

    return {"session_id": session_id, "document_name": doc["name"]}

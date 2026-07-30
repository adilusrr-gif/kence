import asyncio
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from app.api.auth_routes import get_current_user, require_org_member, require_org_admin
from app.core.database import SessionLocal
from app.models.models import GraphExtractionJob, KnowledgeGraphNode
from app.services import graph_service
from app.services.llm import llm_service

router = APIRouter(tags=["knowledge-graph"])

# Keeps strong references to running extraction asyncio.Tasks so CPython GC cannot
# collect them before they finish. Cleaned up via add_done_callback.
_extraction_task_registry: dict[int, asyncio.Task] = {}


class ExtractRequest(BaseModel):
    session_id: str
    language: str = "ru"


class GraphQueryRequest(BaseModel):
    query: str


@router.post("/orgs/{org_id}/graph/extract")
async def trigger_extraction(
    org_id: int,
    req: ExtractRequest,
    current_user: dict = Depends(get_current_user),
):
    require_org_member(org_id, current_user)

    from app.core.session import session_manager
    session = session_manager.get_session(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    from app.api.routes import _verify_session_access
    _verify_session_access(req.session_id, session, current_user)

    markdown_text = session.get("markdown_text", "")
    if not markdown_text:
        raise HTTPException(status_code=400, detail="Документ ещё не обработан")

    with SessionLocal() as db:
        job = GraphExtractionJob(
            org_id=org_id,
            session_id=req.session_id,
            status="pending",
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        job_id = job.id

    from app.services.entity_extractor import run_extraction_job
    t = asyncio.create_task(run_extraction_job(job_id, req.session_id, org_id, markdown_text, llm_service, req.language))
    _extraction_task_registry[job_id] = t
    t.add_done_callback(lambda _: _extraction_task_registry.pop(job_id, None))

    return {"job_id": job_id, "status": "pending"}


@router.get("/orgs/{org_id}/graph/jobs/{job_id}")
async def get_extraction_job(org_id: int, job_id: int, current_user: dict = Depends(get_current_user)):
    require_org_member(org_id, current_user)
    with SessionLocal() as db:
        job = db.query(GraphExtractionJob).filter_by(id=job_id, org_id=org_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Задание не найдено")
        return {
            "id": job.id,
            "status": job.status,
            "entity_count": job.entity_count,
            "rel_count": job.rel_count,
            "error": job.error,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        }


@router.get("/orgs/{org_id}/graph/nodes")
async def list_graph_nodes(
    org_id: int,
    entity_type: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
):
    require_org_member(org_id, current_user)
    with SessionLocal() as db:
        q = db.query(KnowledgeGraphNode).filter_by(org_id=org_id)
        if entity_type:
            q = q.filter_by(entity_type=entity_type)
        total = q.count()
        nodes = q.offset((page - 1) * page_size).limit(page_size).all()
        return {
            "total": total,
            "page": page,
            "data": [
                {"id": n.id, "neo4j_id": n.neo4j_id, "label": n.label, "entity_type": n.entity_type, "session_id": n.session_id}
                for n in nodes
            ],
        }


@router.get("/orgs/{org_id}/graph/nodes/{label}/neighbors")
async def node_neighbors(
    org_id: int,
    label: str,
    depth: int = Query(2, ge=1, le=4),
    current_user: dict = Depends(get_current_user),
):
    require_org_member(org_id, current_user)
    neighbors = await graph_service.query_neighbors(org_id, label, depth)
    return {"label": label, "neighbors": neighbors}


@router.get("/orgs/{org_id}/graph/export")
async def export_graph(
    org_id: int,
    session_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    require_org_member(org_id, current_user)
    return await graph_service.export_graph_for_d3(org_id, doc_id=session_id)


@router.get("/orgs/{org_id}/graph/documents")
async def list_graph_documents(org_id: int, current_user: dict = Depends(get_current_user)):
    """Documents (sessions) that have entities in the graph — for the doc selector."""
    require_org_member(org_id, current_user)
    from app.models.models import DocSession
    from sqlalchemy import func as sqlfunc
    with SessionLocal() as db:
        rows = (
            db.query(
                KnowledgeGraphNode.session_id,
                sqlfunc.count(KnowledgeGraphNode.id).label("node_count"),
            )
            .filter(KnowledgeGraphNode.org_id == org_id, KnowledgeGraphNode.session_id.isnot(None))
            .group_by(KnowledgeGraphNode.session_id)
            .all()
        )
        result = []
        for session_id, node_count in rows:
            doc = db.query(DocSession).filter_by(session_id=session_id).first()
            result.append({
                "session_id": session_id,
                "document_name": doc.document_name if doc else None,
                "node_count": node_count,
            })
    return {"documents": result}


@router.post("/orgs/{org_id}/graph/query")
async def query_graph(
    org_id: int,
    req: GraphQueryRequest,
    current_user: dict = Depends(get_current_user),
):
    require_org_member(org_id, current_user)
    result = await graph_service.natural_language_query(req.query, llm_service, org_id=org_id)
    return {"query": req.query, "result": result}


@router.delete("/orgs/{org_id}/graph")
async def delete_graph(org_id: int, current_user: dict = Depends(get_current_user)):
    require_org_admin(org_id, current_user)
    deleted = await graph_service.delete_org_graph(org_id)
    with SessionLocal() as db:
        db.query(KnowledgeGraphNode).filter_by(org_id=org_id).delete()
        db.commit()
    return {"deleted_nodes": deleted}

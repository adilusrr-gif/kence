"""Operational diagnostics for the LLM pipeline (Task 7).

Admin-only — exposes internals (semaphore/queue/circuit-breaker state,
generation registry) used to verify there is no "stuck typing..." / blocked
queue scenario after an Ollama outage.
"""
from fastapi import APIRouter, Depends
from app.api.auth_routes import require_admin
from app.core import generation_registry
from app.services.llm import llm_service, get_llm_metrics

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/llm-status")
async def llm_status(current_user: dict = Depends(require_admin)):
    metrics = get_llm_metrics()
    registry = generation_registry.get_registry_summary()
    health = await llm_service.health_check()
    return {
        "active_generations": registry["active_generations"],
        "queued_generations": registry["queued_generations"],
        "generation_registry_size": registry["registry_size"],
        "semaphore_usage": f"{metrics['active_count']}/{metrics['max_concurrent']}",
        "queue_depth": metrics["queue_depth"],
        "queue_maxsize": metrics["queue_maxsize"],
        "ollama_available": health.get("status") == "ok",
        "ollama_status": health.get("status"),
        "circuit_breaker_state": metrics["circuit_state"],
        "circuit_breaker_failures": metrics["circuit_failures"],
    }

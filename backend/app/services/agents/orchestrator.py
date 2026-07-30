"""Agent task orchestrator — dispatches tasks to the correct agent."""
import logging
from app.services.agents.base_agent import AgentState, update_task_status
from app.services.llm import _current_language, _call_lane

logger = logging.getLogger(__name__)

_REGISTRY = {
    "document_analyst":   "app.services.agents.document_analyst",
    "data_extractor":     "app.services.agents.data_extractor",
    "timeline":           "app.services.agents.timeline_agent",
    "risk_engine":        "app.services.agents.risk_engine",
    "summary":            "app.services.agents.summary_agent",
    "comparison":         "app.services.agents.comparison_agent",
    "report_generator":   "app.services.agents.report_generator",
    "research":           "app.services.agents.research_agent",
    "document_editor":    "app.services.agents.document_editor",
    "government_briefing": "app.services.agents.briefing_orchestrator",
    "compliance":         "app.services.agents.compliance_agent",
}


def get_agent_class(task_type: str):
    module_path = _REGISTRY.get(task_type)
    if not module_path:
        raise ValueError(f"Unknown agent type: {task_type}")
    import importlib
    return importlib.import_module(module_path)


async def run_agent_task(task_id: int, task_type: str, input_data: dict, org_id: int, username: str) -> None:
    update_task_status(task_id, "running")
    lang = input_data.get("language", "ru")
    lang_token = _current_language.set(lang)
    # Mark every LLM call spawned by this agent (incl. parallel chunk extraction)
    # as "background" so it is throttled through _agent_lane and cannot starve chat.
    lane_token = _call_lane.set("background")
    try:
        agent_module = get_agent_class(task_type)
        from app.services.llm import llm_service as llm

        state: AgentState = {
            "session_id": input_data.get("session_id"),
            # Authoritative org_id is the membership-verified argument (create_task
            # / requeue pass the DB column, which is NOT NULL). Never fall back to
            # input_data.org_id — that path allowed a nested value to override the
            # authorised organisation (BL-03).
            "org_id": org_id,
            "username": username,
            "task_id": task_id,
            "question": input_data.get("question"),
            "instructions": input_data.get("instructions"),
            "language": lang,
            "context": None,
            "graph_context": None,
            "history": [],
            "steps": [],
            "result": None,
            "error": None,
            "library_doc_ids": input_data.get("library_doc_ids"),
            "direction": input_data.get("direction"),
        }

        final_state = await agent_module.run(state, llm)

        if final_state.get("error"):
            update_task_status(task_id, "failed", error=final_state["error"])
        else:
            update_task_status(task_id, "done", output_data=final_state.get("result"))

    except Exception as e:
        logger.error("Agent task %d failed: %s", task_id, e)
        update_task_status(task_id, "failed", error=str(e))
    finally:
        _current_language.reset(lang_token)
        _call_lane.reset(lane_token)

"""Agent task orchestrator — dispatches tasks to the correct agent."""
import logging
from app.services.agents.base_agent import AgentState, update_task_status

logger = logging.getLogger(__name__)

_REGISTRY = {
    "document_analyst": "app.services.agents.document_analyst",
    "summary": "app.services.agents.summary_agent",
    "comparison": "app.services.agents.comparison_agent",
    "report_generator": "app.services.agents.report_generator",
    "research": "app.services.agents.research_agent",
    "document_editor": "app.services.agents.document_editor",
}


def get_agent_class(task_type: str):
    module_path = _REGISTRY.get(task_type)
    if not module_path:
        raise ValueError(f"Unknown agent type: {task_type}")
    import importlib
    return importlib.import_module(module_path)


async def run_agent_task(task_id: int, task_type: str, input_data: dict, org_id: int, username: str) -> None:
    update_task_status(task_id, "running")
    try:
        agent_module = get_agent_class(task_type)
        from app.services.llm import LLMService
        llm = LLMService()

        state: AgentState = {
            "session_id": input_data.get("session_id"),
            "org_id": org_id or input_data.get("org_id"),
            "username": username,
            "task_id": task_id,
            "question": input_data.get("question"),
            "instructions": input_data.get("instructions"),
            "context": None,
            "graph_context": None,
            "history": [],
            "steps": [],
            "result": None,
            "error": None,
        }

        final_state = await agent_module.run(state, llm)

        if final_state.get("error"):
            update_task_status(task_id, "failed", error=final_state["error"])
        else:
            update_task_status(task_id, "done", output_data=final_state.get("result"))

    except Exception as e:
        logger.error("Agent task %d failed: %s", task_id, e)
        update_task_status(task_id, "failed", error=str(e))

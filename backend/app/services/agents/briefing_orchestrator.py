"""Government Briefing Orchestrator — runs 4 agents in sequence and merges
outputs into a single GovernmentBrief suitable for senior government leadership.

Pipeline:
  summary_agent → data_extractor → risk_engine → timeline_agent
  → required_decisions (LLM pass)
  → merge → GovernmentBrief
"""
import json
import logging
import re
from datetime import datetime, timezone

from app.services.agents.base_agent import AgentState, emit_step

logger = logging.getLogger(__name__)

_DECISIONS_PROMPT = """Based on the document summary below, identify any decisions that must be made.
Return ONLY JSON (no other text):

{{
  "decisions": [
    {{
      "decision": "what needs to be decided",
      "responsible": "role or person responsible (or null)",
      "deadline": "deadline date (or null)",
      "consequence": "what happens if this decision is not made"
    }}
  ]
}}

If no decisions are required, return {{"decisions": []}}

Document summary:
{summary}"""

_ACTIONS_PROMPT = """Based on the document summary and risks below, produce the top 3–5 prioritized action items.
Return ONLY JSON (no other text):

{{
  "actions": [
    {{
      "priority": "CRITICAL|HIGH|MEDIUM",
      "action": "specific actionable verb phrase",
      "reason": "why this matters, referencing document evidence",
      "deadline": "deadline or timeframe (or null)",
      "owner": "responsible role or person (or null)"
    }}
  ]
}}

Rank by urgency and impact. Be specific — not generic.

Summary:
{summary}

Top risks:
{risks}"""

_CONFIDENCE_MAP = {
    "high":   "ВЫСОКИЙ",
    "medium": "СРЕДНИЙ",
    "low":    "НИЗКИЙ",
}


def _compute_confidence(markdown_text: str, chunks_processed: int) -> str:
    chars = len(markdown_text or "")
    if chars >= 5_000 and chunks_processed >= 10:
        return "high"
    if chars >= 1_000 and chunks_processed >= 3:
        return "medium"
    return "low"


def _extract_json(raw: str) -> dict:
    try:
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        if m:
            return json.loads(m.group())
    except Exception:
        pass
    return {}


async def run(state: AgentState, llm_service) -> AgentState:
    import importlib
    from app.core.session import session_manager

    task_id    = state["task_id"]
    session_id = state.get("session_id")
    language   = state.get("language", "ru")

    emit_step(task_id, "briefing_start", "running",
              "Запуск системы формирования оперативной сводки...")

    session = session_manager.get_session(session_id)
    markdown_text = (session or {}).get("markdown_text", "")
    doc_name = (session or {}).get("document", "Документ")

    if not markdown_text:
        state["error"] = "Документ не найден или не обработан"
        emit_step(task_id, "briefing_start", "error", state["error"])
        return state

    # ── Phase 1: Summary ──────────────────────────────────────────────────────
    emit_step(task_id, "phase_summary", "running", "Анализ содержания...")
    sub_state = {**state, "result": None, "error": None}
    summary_module = importlib.import_module("app.services.agents.summary_agent")
    sub_state = await summary_module.run(sub_state, llm_service)
    summary_result = sub_state.get("result") or {}
    if sub_state.get("error"):
        logger.warning("[briefing] summary phase failed: %s", sub_state["error"])
        summary_result = {}
    emit_step(task_id, "phase_summary", "done", "Содержание проанализировано")

    # ── Phase 2: Data extraction ──────────────────────────────────────────────
    emit_step(task_id, "phase_extraction", "running", "Извлечение ключевых данных...")
    sub_state = {**state, "result": None, "error": None}
    extractor_module = importlib.import_module("app.services.agents.data_extractor")
    sub_state = await extractor_module.run(sub_state, llm_service)
    extracted_result = sub_state.get("result") or {}
    if sub_state.get("error"):
        logger.warning("[briefing] extraction phase failed: %s", sub_state["error"])
        extracted_result = {}
    emit_step(task_id, "phase_extraction", "done", "Данные извлечены")

    # ── Phase 3: Risk assessment ──────────────────────────────────────────────
    emit_step(task_id, "phase_risks", "running", "Оценка рисков...")
    sub_state = {**state, "result": None, "error": None}
    risk_module = importlib.import_module("app.services.agents.risk_engine")
    sub_state = await risk_module.run(sub_state, llm_service)
    risk_result = sub_state.get("result") or {}
    if sub_state.get("error"):
        logger.warning("[briefing] risk phase failed: %s", sub_state["error"])
        risk_result = {}
    emit_step(task_id, "phase_risks", "done", "Риски оценены")

    # ── Phase 4: Timeline ─────────────────────────────────────────────────────
    emit_step(task_id, "phase_timeline", "running", "Составление хронологии...")
    sub_state = {**state, "result": None, "error": None}
    timeline_module = importlib.import_module("app.services.agents.timeline_agent")
    sub_state = await timeline_module.run(sub_state, llm_service)
    timeline_result = sub_state.get("result") or {}
    if sub_state.get("error"):
        logger.warning("[briefing] timeline phase failed: %s", sub_state["error"])
        timeline_result = {}
    emit_step(task_id, "phase_timeline", "done", "Хронология составлена")

    # ── Phase 5: Required decisions ───────────────────────────────────────────
    emit_step(task_id, "phase_decisions", "running", "Определение требуемых решений...")
    required_decisions = []
    exec_summary = summary_result.get("executive_summary", "") or ""
    try:
        raw = await llm_service.agenerate(
            _DECISIONS_PROMPT.format(summary=exec_summary[:3000])
        )
        data = _extract_json(raw)
        required_decisions = data.get("decisions", [])
    except Exception as e:
        logger.warning("[briefing] decisions phase failed: %s", e)
    emit_step(task_id, "phase_decisions", "done",
              f"{len(required_decisions)} решений определено")

    # ── Phase 6: Prioritized actions ─────────────────────────────────────────
    emit_step(task_id, "phase_actions", "running", "Формирование рекомендаций...")
    recommended_actions = []
    top_risk_descriptions = [
        r.get("description", "") for r in (risk_result.get("top_risks") or [])[:5]
    ]
    risks_text = "\n".join(f"- {r}" for r in top_risk_descriptions) or "Нет данных"
    try:
        raw = await llm_service.agenerate(
            _ACTIONS_PROMPT.format(
                summary=exec_summary[:2000],
                risks=risks_text,
            )
        )
        data = _extract_json(raw)
        recommended_actions = data.get("actions", [])
    except Exception as e:
        logger.warning("[briefing] actions phase failed: %s", e)
        # Fallback: convert summary recommendations to basic action list
        for rec in (summary_result.get("recommendations") or [])[:5]:
            recommended_actions.append({
                "priority": "MEDIUM",
                "action": rec,
                "reason": None,
                "deadline": None,
                "owner": None,
            })
    emit_step(task_id, "phase_actions", "done",
              f"{len(recommended_actions)} рекомендаций сформировано")

    # ── Merge into GovernmentBrief ────────────────────────────────────────────
    emit_step(task_id, "briefing_merge", "running", "Сборка оперативной сводки...")

    extracted = extracted_result.get("extracted", {})
    entities  = extracted.get("key_entities", {})

    all_timeline = timeline_result.get("timeline") or []
    deadlines = [e for e in all_timeline if e.get("type") == "deadline"]

    confidence_key = _compute_confidence(markdown_text, extracted_result.get("chunks_processed", 0))

    brief: dict = {
        "type":             "government_briefing",
        "document_name":    doc_name,
        "language":         language,
        "prepared_at":      datetime.now(timezone.utc).isoformat(),
        "confidence_level": _CONFIDENCE_MAP[confidence_key],
        "confidence_key":   confidence_key,

        # Section 1 — Executive summary
        "executive_summary": exec_summary,
        "short_summary":     summary_result.get("short_summary", ""),

        # Section 2 — Key facts
        "key_facts": extracted.get("key_facts", []),

        # Section 3 — People
        "people": entities.get("persons", []),

        # Section 4 — Organizations
        "organizations": entities.get("organizations", []),

        # Section 5 — Timeline (full)
        "timeline": all_timeline,

        # Section 6 — Risks
        "risks": {
            "overall_score": risk_result.get("overall_risk_score", 0),
            "level":         risk_result.get("risk_level", ""),
            "category_scores": risk_result.get("category_scores", {}),
            "top_risks":     (risk_result.get("top_risks") or [])[:10],
        },

        # Section 7 — Recommended actions
        "recommended_actions": recommended_actions,

        # Section 8 — Deadlines (filtered from timeline)
        "deadlines": deadlines,

        # Section 9 — Required decisions
        "required_decisions": required_decisions,

        # Section 10 — Supporting entities
        "locations":       entities.get("locations", []),
        "numerical_data":  extracted.get("numerical_data", []),
        "key_findings":    summary_result.get("key_findings", []),

        # Raw agent outputs preserved for detailed views
        "raw": {
            "summary":   summary_result,
            "extracted": extracted_result,
            "risk":      risk_result,
            "timeline":  timeline_result,
        },
    }

    emit_step(task_id, "briefing_merge", "done",
              f"Сводка готова — {doc_name}")

    state["result"] = brief
    return state

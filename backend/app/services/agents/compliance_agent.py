"""Compliance Agent — checks the working document against regulatory acts (НПА) from the library.

Inputs (AgentState):
- session_id:        the document being checked (current workspace session)
- library_doc_ids:   explicit list of library doc ids to check against (manual mode)
- direction:         when no ids given, auto-pick НПА from the library by this direction
- instructions:      optional extra focus for the check

Output: structured compliance report — per-requirement findings, status, evidence,
recommendations, and an overall compliance score.
"""
import json
import logging
from typing import Optional
from app.services.agents.base_agent import AgentState, emit_step

logger = logging.getLogger(__name__)

def _caps() -> tuple[int, int, int]:
    """(max reference acts, chars of НПА text, chars of checked doc) per run.

    Read from settings at call time rather than import time so COMPLIANCE_*
    env overrides apply without a rebuild.
    """
    from app.core.config import get_settings
    s = get_settings()
    return s.COMPLIANCE_MAX_NPA, s.COMPLIANCE_NPA_CHARS, s.COMPLIANCE_TARGET_CHARS

_STATUS_VALUES = ("соответствует", "не соответствует", "частично", "не применимо")

# Formats whose bytes are readable as text without a converter (see _load_doc_text).
_TEXT_EXTS = {".txt", ".md", ".markdown", ".csv", ".json", ".xml", ".html", ".htm"}


def _rag(collection_id: str, query: str) -> str:
    try:
        from app.services.retriever import HybridRetriever
        chunks = HybridRetriever(collection_id).retrieve(query, k=8)
        if chunks:
            return "\n\n".join(c.page_content for c in chunks)
    except Exception:
        pass
    return ""


def _load_doc_text(doc: dict, query: str, npa_chars: int, org_id: Optional[int]) -> str:
    """Best-effort text for a library doc, most durable source first.

    The library's own index and content row survive session expiry; the
    session_id path is a fallback for rows added before that split and is the
    one that used to go silently empty once cleanup_expired ran.
    """
    from app.services.pipeline import stratified_sample
    from app.services.library_service import get_library_content, library_collection_id

    doc_id = doc.get("id")
    if doc_id:
        text = _rag(library_collection_id(int(doc_id)), query)
        if text:
            return text
        content = get_library_content(int(doc_id), org_id)
        if content and content.get("markdown_text"):
            return stratified_sample(content["markdown_text"], target_chars=npa_chars, n_parts=5)

    session_id = doc.get("session_id")
    if session_id:
        text = _rag(session_id, query)
        if text:
            return text

    file_path = doc.get("file_path", "")
    if file_path:
        import os
        # Only plain-text formats survive a raw read — decoding a PDF/DOCX with
        # errors="ignore" yields binary noise that poisons the prompt, so those
        # are skipped instead (they need a session/vector store to be usable).
        if os.path.splitext(file_path)[1].lower() in _TEXT_EXTS and os.path.exists(file_path):
            try:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    full = f.read()
                if full:
                    return stratified_sample(full, target_chars=npa_chars, n_parts=5)
            except Exception:
                pass
    return ""


async def run(state: AgentState, llm_service) -> AgentState:
    task_id    = state["task_id"]
    org_id     = state.get("org_id")
    session_id = state.get("session_id")
    username   = state.get("username")
    language   = state.get("language", "ru")
    instructions = state.get("instructions") or ""
    max_npa, npa_chars, target_chars = _caps()

    # ── Step 1: load the document being checked ──────────────────────────────
    emit_step(task_id, "load_target", "running", "Загрузка проверяемого документа...")
    from app.core.session import session_manager
    session = session_manager.get_session(session_id) if session_id else None
    if not session:
        state["error"] = "Сессия не найдена. Откройте проверяемый документ в рабочем пространстве."
        emit_step(task_id, "load_target", "error", state["error"])
        return state
    target_text = session.get("markdown_text", "")
    if not target_text:
        state["error"] = "Документ ещё не обработан."
        emit_step(task_id, "load_target", "error", state["error"])
        return state
    target_name = session.get("document", "Проверяемый документ")
    emit_step(task_id, "load_target", "done", f"{target_name} ({len(target_text):,} симв.)")

    # ── Step 2: resolve reference НПА from the library ───────────────────────
    emit_step(task_id, "resolve_npa", "running", "Подбор НПА из библиотеки...")
    from app.services.library_service import get_library_doc, search_library

    npa_docs: list[dict] = []
    doc_ids = state.get("library_doc_ids")
    direction = state.get("direction")

    if doc_ids:
        for did in doc_ids[:max_npa]:
            # get_library_doc is org-scoped: a doc id from another organisation
            # returns None and never leaks into the prompt. org_id here is the
            # membership-verified value resolved in create_task (see BL-03).
            d = get_library_doc(int(did), org_id)
            if d:
                npa_docs.append(d)
    else:
        # Auto-pick: НПА filtered by direction (or all НПА if no direction)
        found = search_library(org_id, "", doc_kind="npa", direction=direction)
        npa_docs = found[:max_npa]

    if not npa_docs:
        state["error"] = (
            "Не найдено НПА в библиотеке для проверки. "
            "Добавьте закон/НПА в библиотеку (тип «НПА») или выберите его вручную."
        )
        emit_step(task_id, "resolve_npa", "error", state["error"])
        return state
    emit_step(task_id, "resolve_npa", "done",
              "НПА: " + ", ".join(d.get("name", "?") for d in npa_docs))

    # ── Step 3: per-НПА compliance analysis ──────────────────────────────────
    from app.services.pipeline import stratified_sample
    target_sample = stratified_sample(target_text, target_chars=target_chars, n_parts=5)

    all_findings: list[dict] = []
    npa_used: list[str] = []

    for npa in npa_docs:
        npa_name = npa.get("name", "НПА")
        emit_step(task_id, "check_npa", "running", f"Проверка по: {npa_name}")
        npa_text = _load_doc_text(npa, instructions or target_name, npa_chars, org_id)
        if not npa_text:
            emit_step(task_id, "check_npa", "running", f"⚠ Не удалось прочитать {npa_name}")
            continue

        prompt = _build_prompt(language, target_name, target_sample, npa_name, npa_text, instructions)
        try:
            raw = await llm_service.agenerate(prompt)
            parsed = _parse_findings(raw)
            for f in parsed:
                f["npa"] = npa_name
                all_findings.append(f)
            npa_used.append(npa_name)
            emit_step(task_id, "check_npa", "done", f"✓ {npa_name}: {len(parsed)} пунктов")
        except Exception as e:
            logger.error("[compliance] check failed for %s: %s", npa_name, e)
            emit_step(task_id, "check_npa", "error", f"{npa_name}: {e}")

    if not all_findings:
        state["error"] = "Не удалось получить результаты проверки."
        emit_step(task_id, "synthesize", "error", state["error"])
        return state

    # ── Step 4: score + summary ──────────────────────────────────────────────
    emit_step(task_id, "synthesize", "running", "Подсчёт итогов...")
    score = _compliance_score(all_findings)
    non_compliant = [f for f in all_findings if f.get("status") == "не соответствует"]
    partial = [f for f in all_findings if f.get("status") == "частично"]

    try:
        summary = await llm_service.agenerate(
            f"Кратко (4-6 предложений) подведи итог проверки документа «{target_name}» "
            f"на соответствие НПА ({', '.join(npa_used)}). "
            f"Всего пунктов: {len(all_findings)}, не соответствует: {len(non_compliant)}, "
            f"частично: {len(partial)}. Сделай вывод о готовности документа и ключевых рисках.\n\n"
            f"Несоответствия:\n" +
            "\n".join(f"- {f.get('requirement','')}: {f.get('recommendation','')}" for f in (non_compliant + partial)[:15])
        )
    except Exception:
        summary = f"Проверено {len(all_findings)} требований. Не соответствует: {len(non_compliant)}, частично: {len(partial)}."

    state["result"] = {
        "target_document": target_name,
        "npa_used": npa_used,
        "npa_ids": [d.get("id") for d in npa_docs if d.get("name") in npa_used],
        "compliance_score": score,
        "total_requirements": len(all_findings),
        "non_compliant_count": len(non_compliant),
        "partial_count": len(partial),
        "summary": summary.strip(),
        "findings": all_findings,
    }
    emit_step(task_id, "synthesize", "done", f"Соответствие: {score}%", summary[:300])
    return state


def _build_prompt(language: str, target_name: str, target_text: str,
                  npa_name: str, npa_text: str, instructions: str) -> str:
    focus = f"\nОсобое внимание: {instructions}\n" if instructions else ""
    return f"""Ты — эксперт по нормативно-правовому соответствию.
Проверь документ на соответствие требованиям нормативно-правового акта (НПА).

Для каждого значимого требования НПА определи:
- requirement: краткая формулировка требования НПА (со ссылкой на пункт/статью, если есть)
- status: одно из "соответствует", "не соответствует", "частично", "не применимо"
- evidence: что в проверяемом документе подтверждает оценку (цитата/факт)
- recommendation: что исправить (пусто если соответствует)
{focus}
Верни ТОЛЬКО JSON без markdown:
{{
  "findings": [
    {{"requirement": "...", "status": "соответствует", "evidence": "...", "recommendation": ""}}
  ]
}}

=== НПА: {npa_name} ===
{npa_text}

=== Проверяемый документ: {target_name} ===
{target_text}
"""


def _parse_findings(raw: str) -> list[dict]:
    clean = (raw or "").strip()
    if clean.startswith("```"):
        lines = clean.split("\n")
        clean = "\n".join(lines[1:] if lines[0].startswith("```") else lines)
    if clean.endswith("```"):
        clean = "\n".join(clean.split("\n")[:-1])
    try:
        data = json.loads(clean)
    except json.JSONDecodeError:
        # Try to locate the JSON object
        start, end = clean.find("{"), clean.rfind("}")
        if start >= 0 and end > start:
            try:
                data = json.loads(clean[start:end + 1])
            except json.JSONDecodeError:
                return []
        else:
            return []
    findings = data.get("findings", []) if isinstance(data, dict) else []
    out = []
    for f in findings:
        if not isinstance(f, dict) or not f.get("requirement"):
            continue
        status = str(f.get("status", "")).strip().lower()
        if status not in _STATUS_VALUES:
            status = "частично"
        out.append({
            "requirement": str(f.get("requirement", "")).strip(),
            "status": status,
            "evidence": str(f.get("evidence", "")).strip(),
            "recommendation": str(f.get("recommendation", "")).strip(),
        })
    return out


def _compliance_score(findings: list[dict]) -> int:
    """Weighted score: соответствует=1, частично=0.5, не соответствует=0; не применимо excluded."""
    weights = {"соответствует": 1.0, "частично": 0.5, "не соответствует": 0.0}
    scored = [weights[f["status"]] for f in findings if f.get("status") in weights]
    if not scored:
        return 0
    return round(100 * sum(scored) / len(scored))

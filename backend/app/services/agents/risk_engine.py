"""Risk Engine Agent — AI-powered risk assessment over ENTIRE document.

Pipeline: ALL Chunks → Extract risks per chunk → Merge by category → Score → Report

Risk Score: 0 (no risk) → 100 (critical risk)
"""
import logging
import json
import re
from app.services.agents.base_agent import AgentState, emit_step
from app.services.pipeline import split_text, process_chunks_parallel

logger = logging.getLogger(__name__)

_CATEGORIES = ["financial", "legal", "compliance", "operational", "reputational"]

_RISK_PROMPT = """Analyze this document fragment for risks. Return ONLY JSON (no other text):

{{
  "risks": [
    {{
      "category": "financial|legal|compliance|operational|reputational",
      "description": "clear risk description",
      "severity": "critical|high|medium|low",
      "probability": "high|medium|low",
      "evidence": "short quote from text confirming this risk (max 100 chars)",
      "recommendation": "specific action to mitigate this risk"
    }}
  ]
}}

Category definitions:
- financial: monetary losses, budget overruns, penalties, cash flow issues
- legal: contract breaches, litigation, liability, IP issues
- compliance: regulatory violations, licensing, standards non-compliance
- operational: process failures, dependencies, resource issues, timeline risks
- reputational: brand damage, stakeholder trust, public perception

If no risks found, return: {{"risks": []}}

Text:
{text}"""

_SEVERITY_SCORE = {"critical": 90, "high": 70, "medium": 45, "low": 20}
_PROBABILITY_MULT = {"high": 1.0, "medium": 0.7, "low": 0.4}


async def _extract_risks_chunk(chunk: str, llm_service) -> list:
    try:
        raw = await llm_service.agenerate(_RISK_PROMPT.format(text=chunk))
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        if m:
            data = json.loads(m.group())
            return data.get("risks", [])
        return []
    except Exception as e:
        logger.warning("[risk_engine] chunk extraction failed: %s", e)
        return []


def _merge_risks(all_risks_by_chunk: list[list]) -> dict:
    """Merge and deduplicate risks by category. Score each category and overall."""
    by_category: dict[str, list] = {cat: [] for cat in _CATEGORIES}
    seen = set()

    for chunk_risks in all_risks_by_chunk:
        if not chunk_risks:
            continue
        for r in chunk_risks:
            cat = r.get("category", "operational")
            if cat not in _CATEGORIES:
                cat = "operational"
            # Dedup by description similarity (first 60 chars)
            key = (cat, r.get("description", "")[:60].lower())
            if key not in seen:
                seen.add(key)
                by_category[cat].append(r)

    # Score each category (0-100)
    def score_category(risks: list) -> int:
        if not risks:
            return 0
        scores = []
        for r in risks:
            sev = _SEVERITY_SCORE.get(r.get("severity", "low"), 20)
            prob = _PROBABILITY_MULT.get(r.get("probability", "low"), 0.4)
            scores.append(sev * prob)
        # Category score: max score + bonus for multiple risks
        max_score = max(scores)
        bonus = min(10, len(risks) * 2)
        return min(100, int(max_score + bonus))

    category_scores = {cat: score_category(by_category[cat]) for cat in _CATEGORIES}

    # Overall score: weighted average (legal and financial weight more)
    weights = {"financial": 1.3, "legal": 1.3, "compliance": 1.1, "operational": 1.0, "reputational": 0.9}
    total_w = sum(weights.values())
    overall = int(sum(category_scores[c] * weights[c] for c in _CATEGORIES) / total_w)

    # Top risks across all categories (by severity → probability)
    sev_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    all_risks_flat = [r for risks in by_category.values() for r in risks]
    all_risks_flat.sort(key=lambda r: (
        sev_order.get(r.get("severity", "low"), 3),
        -_PROBABILITY_MULT.get(r.get("probability", "low"), 0.4),
    ))

    return {
        "overall_risk_score": overall,
        "category_scores": category_scores,
        "categories": by_category,
        "top_risks": all_risks_flat[:10],
        "total_risks": len(all_risks_flat),
    }


def _build_risk_report(doc_name: str, merged: dict, chunks_processed: int, char_count: int) -> str:
    score = merged["overall_risk_score"]
    score_label = "КРИТИЧЕСКИЙ" if score >= 80 else "ВЫСОКИЙ" if score >= 60 else "СРЕДНИЙ" if score >= 35 else "НИЗКИЙ"
    score_emoji = "🔴" if score >= 80 else "🟠" if score >= 60 else "🟡" if score >= 35 else "🟢"

    md = [f"# Оценка рисков: {doc_name}\n"]
    md.append(f"*{chunks_processed} чанков · {char_count:,} символов · {merged['total_risks']} рисков*\n")
    md.append(f"\n## {score_emoji} Общий балл риска: **{score}/100** — {score_label}\n")

    # Category scores table
    md.append("\n## Риски по категориям\n\n| Категория | Балл | Рисков |\n|---|---|---|\n")
    cat_labels = {"financial": "💰 Финансовые", "legal": "⚖️ Юридические",
                  "compliance": "📋 Соответствие", "operational": "⚙️ Операционные",
                  "reputational": "👁️ Репутационные"}
    for cat in _CATEGORIES:
        s = merged["category_scores"][cat]
        n = len(merged["categories"][cat])
        bar = "🔴" if s >= 80 else "🟠" if s >= 60 else "🟡" if s >= 35 else "🟢"
        md.append(f"| {cat_labels.get(cat, cat)} | {bar} {s}/100 | {n} |\n")

    # Top risks
    if merged["top_risks"]:
        md.append("\n## Топ-10 рисков\n")
        sev_labels = {"critical": "🔴 КРИТИЧЕСКИЙ", "high": "🟠 ВЫСОКИЙ",
                      "medium": "🟡 СРЕДНИЙ", "low": "🟢 НИЗКИЙ"}
        for i, r in enumerate(merged["top_risks"], 1):
            sev = sev_labels.get(r.get("severity", "low"), r.get("severity", ""))
            cat = cat_labels.get(r.get("category", "operational"), r.get("category", ""))
            md.append(f"\n### {i}. {sev} | {cat}\n")
            md.append(f"**Описание:** {r.get('description', '')}\n\n")
            md.append(f"**Вероятность:** {r.get('probability', '—')} | ")
            md.append(f"**Вид:** {r.get('category', '—')}\n\n")
            if r.get("evidence"):
                md.append(f"**Подтверждение:** *«{r['evidence']}»*\n\n")
            if r.get("recommendation"):
                md.append(f"**Рекомендация:** {r['recommendation']}\n")

    return "".join(md)


async def run(state: AgentState, llm_service) -> AgentState:
    task_id    = state["task_id"]
    session_id = state.get("session_id")

    # Load document
    emit_step(task_id, "load_document", "running", "Загрузка документа...")
    from app.core.session import session_manager
    session = session_manager.get_session(session_id)
    markdown_text = (session or {}).get("markdown_text", "")
    doc_name = (session or {}).get("document", "Документ")

    if not markdown_text:
        state["error"] = "Документ не найден"
        emit_step(task_id, "load_document", "error", state["error"])
        return state

    char_count = len(markdown_text)
    emit_step(task_id, "load_document", "done", f"{doc_name} — {char_count:,} символов")

    # Extract risks from ALL chunks
    from app.core.config import get_settings
    _s = get_settings()
    chunks = split_text(markdown_text, chunk_size=_s.AGENT_MAP_CHUNK_SIZE, overlap=_s.AGENT_MAP_CHUNK_OVERLAP)
    total_chunks = len(chunks)
    emit_step(task_id, "extract_risks", "running",
              f"Анализ рисков в {total_chunks} чанках...")

    async def extract_one(chunk, idx, total):
        if idx % 5 == 0 or idx == total - 1:
            emit_step(task_id, "extract_risks", "running", f"Чанк {idx+1}/{total}")
        return await _extract_risks_chunk(chunk, llm_service)

    raw_results = await process_chunks_parallel(chunks, extract_one, max_concurrent=3)
    raw_results = [r for r in raw_results if r is not None]

    emit_step(task_id, "score_risks", "running", "Оценка и категоризация рисков...")
    merged = _merge_risks(raw_results)

    score = merged["overall_risk_score"]
    score_label = "КРИТИЧЕСКИЙ" if score >= 80 else "ВЫСОКИЙ" if score >= 60 else "СРЕДНИЙ" if score >= 35 else "НИЗКИЙ"
    emit_step(task_id, "score_risks", "done",
              f"Балл: {score}/100 ({score_label}) | {merged['total_risks']} рисков")

    # Build report
    report_md = _build_risk_report(doc_name, merged, total_chunks, char_count)

    state["result"] = {
        "report_markdown": report_md,
        "overall_risk_score": score,
        "risk_level": score_label.lower(),
        "category_scores": merged["category_scores"],
        "categories": {
            cat: risks for cat, risks in merged["categories"].items()
        },
        "top_risks": merged["top_risks"],
        "total_risks": merged["total_risks"],
        "document_name": doc_name,
        "chunks_processed": total_chunks,
        "char_count": char_count,
    }
    emit_step(task_id, "done", "done",
              f"Балл: {score}/100 · {merged['total_risks']} рисков · {total_chunks} чанков",
              report_md[:400])
    return state

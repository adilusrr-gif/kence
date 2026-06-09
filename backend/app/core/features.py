from __future__ import annotations


def get_edition_flags(plan: str | None) -> dict:
    """Return feature flag dict for a given org plan string."""
    p = (plan or "free").lower()
    return {
        # UX mode
        "gov_ux":              p == "gov",
        # Intelligence features
        "knowledge_graph":     p in ("enterprise", "gov"),
        "full_agents":         p in ("enterprise", "gov"),
        "document_library":    p in ("enterprise", "gov"),
        "executive_dashboard": p in ("enterprise", "gov"),
        "ai_settings":         p in ("enterprise", "gov"),
        # Enterprise-only
        "custom_prompts":      p == "enterprise",
        "batch_agents":        p == "enterprise",
        "bi_export":           p == "enterprise",
        # Government-only
        "classified_mode":     p == "gov",
        "audit_trail":         p in ("enterprise", "gov"),
        "compliance_export":   p == "gov",
        "watermark_downloads": p == "gov",
        # Pro+
        "analytics":           p in ("pro", "enterprise", "gov"),
    }


FLAGS_FREE = get_edition_flags("free")

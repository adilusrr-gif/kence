from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.api.auth_routes import get_current_user, require_admin
from app.services import ai_settings_service

router = APIRouter(prefix="/ai-settings", tags=["ai-settings"])

PROMPT_META = {
    "chat_prompt": {
        "label": "Точный ответ (RAG)",
        "variables": ["{context}", "{question}"],
        "description": "Строгий режим — ответ только по контексту документа. Используйте {context} и {question}.",
    },
    "exact_prompt": {
        "label": "Дословный ответ (по разделам)",
        "variables": ["{context}", "{question}"],
        "description": "Режим 'exact' — воспроизводит целиком найденный раздел документа без сокращений. Используйте {context} и {question}.",
    },
    "consultation_prompt": {
        "label": "Консультация по документу",
        "variables": ["{context}", "{question}"],
        "description": "Режим консультации — развёрнутые ответы с интерпретацией. Используйте {context} и {question}.",
    },
    "presentation_prompt": {
        "label": "Промпт презентации",
        "variables": ["{context}"],
        "description": "Ответ должен быть JSON с полями 'title' и 'slides'. Используйте {{ }} для экранирования фигурных скобок в JSON.",
    },
    "comparison_technical_prompt": {
        "label": "Тех. сравнение",
        "variables": ["{text}"],
        "description": "Промпт для извлечения технических спецификаций. Ответ JSON: 'product_name', 'specifications', 'key_features'. Используйте {{ }} для JSON-скобок.",
    },
    "comparison_semantic_prompt": {
        "label": "Сем. анализ",
        "variables": ["{text}"],
        "description": "Промпт для описания ключевых тем и содержания документа.",
    },
}


class UpdatePromptRequest(BaseModel):
    content: str


class DocumentContextRequest(BaseModel):
    document_name: str
    context: str


# ── Prompts ──────────────────────────────────────────────────────────────
#
# Every user has their own prompts (personal override → global admin default →
# hardcoded default). scope="user" (default) reads/writes the caller's personal
# copy; scope="global" reads/writes the shared admin default and is admin-only.

@router.get("/prompts")
async def get_prompts(scope: str = "user", user: dict = Depends(get_current_user)):
    if scope == "global":
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Только администратор может просматривать глобальные промпты")
        return {
            "prompts": {pt: {"content": c, "is_personal": False} for pt, c in ai_settings_service.get_prompts().items()},
            "meta": PROMPT_META,
            "scope": "global",
        }
    return {
        "prompts": ai_settings_service.get_user_prompts(user["username"]),
        "meta": PROMPT_META,
        "scope": "user",
    }


@router.put("/prompts/{prompt_type}")
async def update_prompt(
    prompt_type: str,
    request: UpdatePromptRequest,
    scope: str = "user",
    user: dict = Depends(get_current_user),
):
    if prompt_type not in PROMPT_META:
        raise HTTPException(status_code=404, detail="Тип промпта не найден")
    if scope == "global":
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Только администратор может изменять глобальные промпты")
        if not ai_settings_service.update_prompt(prompt_type, request.content):
            raise HTTPException(status_code=400, detail="Не удалось обновить промпт")
        return {"status": "updated", "prompt_type": prompt_type, "scope": "global"}
    if not ai_settings_service.update_user_prompt(user["username"], prompt_type, request.content):
        raise HTTPException(status_code=400, detail="Не удалось обновить промпт")
    return {"status": "updated", "prompt_type": prompt_type, "scope": "user"}


@router.post("/prompts/reset-all")
async def reset_all_prompts(admin: dict = Depends(require_admin)):
    """Admin-only: resets the GLOBAL defaults. Does not touch personal overrides."""
    ai_settings_service.reset_all_prompts()
    return {"status": "all_reset"}


@router.post("/prompts/{prompt_type}/reset")
async def reset_prompt(
    prompt_type: str,
    scope: str = "user",
    user: dict = Depends(get_current_user),
):
    if prompt_type not in PROMPT_META:
        raise HTTPException(status_code=404, detail="Тип промпта не найден")
    if scope == "global":
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Только администратор может сбрасывать глобальные промпты")
        content = ai_settings_service.reset_prompt(prompt_type)
        return {"status": "reset", "prompt_type": prompt_type, "content": content, "scope": "global"}
    # Personal reset = drop the override, revert to the (possibly admin-edited) global default.
    ai_settings_service.delete_user_prompt(user["username"], prompt_type)
    content = ai_settings_service.get_prompt(prompt_type)
    return {"status": "reset", "prompt_type": prompt_type, "content": content, "scope": "user"}


# ── Users: Document Contexts ───────────────────────────────────────────────

@router.get("/document-contexts")
async def list_document_contexts(user: dict = Depends(get_current_user)):
    return {"contexts": ai_settings_service.get_user_document_contexts(user["username"])}


@router.get("/document-context")
async def get_document_context(
    document_name: str,
    user: dict = Depends(get_current_user),
):
    context = ai_settings_service.get_document_context(user["username"], document_name)
    return {"document_name": document_name, "context": context or ""}


@router.post("/document-context")
async def save_document_context(
    request: DocumentContextRequest,
    user: dict = Depends(get_current_user),
):
    ai_settings_service.save_document_context(
        user["username"], request.document_name, request.context
    )
    return {"status": "saved", "document_name": request.document_name}


@router.delete("/document-context")
async def delete_document_context(
    document_name: str,
    user: dict = Depends(get_current_user),
):
    deleted = ai_settings_service.delete_document_context(user["username"], document_name)
    if not deleted:
        raise HTTPException(status_code=404, detail="Контекст не найден")
    return {"status": "deleted", "document_name": document_name}

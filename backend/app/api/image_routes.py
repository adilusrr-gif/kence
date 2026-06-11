import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.api.auth_routes import get_current_user
from app.core.limiter import limiter
from app.services import analytics_service
from app.services import image_gallery_service
from app.services.image_generation_service import ASPECT_RATIOS, image_generation_service
from app.core.config import get_settings

router = APIRouter(tags=["images"])
settings = get_settings()
logger = logging.getLogger(__name__)


class ImageGenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    negative_prompt: str = ""
    aspect_ratio: str = "square"
    seed: Optional[int] = None
    session_id: Optional[str] = None


@router.get("/images/status")
async def image_gen_status():
    available = await image_generation_service.health_check()
    return {"available": available}


@router.get("/images/options")
async def image_gen_options():
    return {
        "aspect_ratios": [
            {"key": key, "width": w, "height": h}
            for key, (w, h) in ASPECT_RATIOS.items()
        ],
        "model_name": settings.IMAGE_GEN_MODEL_NAME,
        "model_version": settings.IMAGE_GEN_MODEL_VERSION,
    }


@router.post("/images/generate")
@limiter.limit("5/minute")
async def generate_image(
    request: Request,
    body: ImageGenerateRequest,
    user: dict = Depends(get_current_user),
):
    try:
        image_bytes, metadata = await image_generation_service.generate_text_to_image(
            prompt=body.prompt,
            negative_prompt=body.negative_prompt,
            aspect_ratio=body.aspect_ratio,
            seed=body.seed,
        )
    except TimeoutError as e:
        raise HTTPException(status_code=504, detail=str(e))
    except Exception as e:
        logger.error("[images] generation failed: %s", e)
        raise HTTPException(status_code=503, detail="Сервис генерации изображений недоступен")

    image = image_gallery_service.save_image(
        owner_username=user["username"],
        org_id=analytics_service.resolve_org_id(user["username"]),
        session_id=body.session_id,
        prompt=body.prompt,
        negative_prompt=body.negative_prompt,
        image_bytes=image_bytes,
        metadata=metadata,
    )

    analytics_service.log_event(
        "ai_image_generated",
        username=user["username"],
        session_id=body.session_id,
        org_id=analytics_service.resolve_org_id(user["username"]),
    )

    return image


@router.get("/images")
async def list_images(user: dict = Depends(get_current_user)):
    return image_gallery_service.list_images(user["username"])


@router.get("/images/{image_id}/file")
async def get_image_file(image_id: int, user: dict = Depends(get_current_user)):
    image = image_gallery_service.get_image(image_id, user["username"])
    if not image:
        raise HTTPException(status_code=404, detail="Изображение не найдено")
    path = image_gallery_service.get_image_path(image)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Файл изображения не найден")
    return FileResponse(path, media_type="image/png")


@router.delete("/images/{image_id}")
async def delete_image(image_id: int, user: dict = Depends(get_current_user)):
    ok = image_gallery_service.delete_image(image_id, user["username"])
    if not ok:
        raise HTTPException(status_code=404, detail="Изображение не найдено")
    return {"message": "Изображение удалено"}

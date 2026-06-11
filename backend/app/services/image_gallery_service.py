import uuid
from pathlib import Path
from typing import Optional

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.models.models import GeneratedImage

settings = get_settings()


def _images_root(username: str) -> Path:
    path = Path(settings.UPLOAD_DIR) / "ai_images" / username
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_image(
    owner_username: str,
    org_id: Optional[int],
    session_id: Optional[str],
    prompt: str,
    negative_prompt: str,
    image_bytes: bytes,
    metadata: dict,
) -> dict:
    dest_path = _images_root(owner_username) / f"{uuid.uuid4()}.png"
    dest_path.write_bytes(image_bytes)

    with SessionLocal() as db:
        image = GeneratedImage(
            org_id=org_id,
            owner_username=owner_username,
            session_id=session_id,
            prompt=prompt,
            negative_prompt=negative_prompt or None,
            width=metadata["width"],
            height=metadata["height"],
            seed=metadata.get("seed"),
            model_name=metadata["model_name"],
            model_version=metadata["model_version"],
            file_path=str(dest_path),
        )
        db.add(image)
        db.commit()
        db.refresh(image)
        return _to_dict(image)


def list_images(owner_username: str) -> list[dict]:
    with SessionLocal() as db:
        q = db.query(GeneratedImage).filter(GeneratedImage.owner_username == owner_username)
        return [_to_dict(i) for i in q.order_by(GeneratedImage.created_at.desc()).all()]


def get_image(image_id: int, owner_username: str) -> Optional[GeneratedImage]:
    with SessionLocal() as db:
        image = db.query(GeneratedImage).filter_by(id=image_id, owner_username=owner_username).first()
        if image:
            db.expunge(image)
        return image


def get_image_path(image: GeneratedImage) -> Path:
    return Path(image.file_path)


def delete_image(image_id: int, owner_username: str) -> bool:
    with SessionLocal() as db:
        image = db.query(GeneratedImage).filter_by(id=image_id, owner_username=owner_username).first()
        if not image:
            return False
        try:
            path = Path(image.file_path)
            if path.exists():
                path.unlink()
        except OSError:
            pass
        db.delete(image)
        db.commit()
        return True


def _to_dict(image: GeneratedImage) -> dict:
    return {
        "id": image.id,
        "session_id": image.session_id,
        "prompt": image.prompt,
        "negative_prompt": image.negative_prompt,
        "width": image.width,
        "height": image.height,
        "seed": image.seed,
        "model_name": image.model_name,
        "model_version": image.model_version,
        "created_at": image.created_at.isoformat() if image.created_at else None,
    }

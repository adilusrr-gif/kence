"""AI image generation via ComfyUI (FLUX.1 Dev).

Single entry point for the rest of the app: generate_text_to_image() / health_check().
The underlying model can be swapped (e.g. to FLUX.1 Kontext) by replacing the
workflow JSON template referenced by IMAGE_GEN_WORKFLOW_TEMPLATE and updating
IMAGE_GEN_MODEL_NAME / IMAGE_GEN_MODEL_VERSION — this public interface stays the same.
"""
import asyncio
import copy
import json
import logging
import random
import time
import uuid
from pathlib import Path

import httpx

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

# Aspect ratio presets — multiples of 64, ~1MP, recommended for FLUX.1 Dev
ASPECT_RATIOS: dict[str, tuple[int, int]] = {
    "square": (1024, 1024),
    "portrait": (832, 1216),
    "landscape": (1216, 832),
    "widescreen": (1344, 768),  # 16:9 — well suited for presentation slides
}

_WORKFLOWS_DIR = Path(__file__).parent / "comfyui_workflows"


class ImageGenerationService:
    def __init__(self):
        self._client = httpx.AsyncClient(
            base_url=settings.IMAGE_GEN_SERVICE_URL,
            timeout=settings.IMAGE_GEN_TIMEOUT_SEC,
        )
        self._semaphore = asyncio.Semaphore(max(1, settings.IMAGE_GEN_MAX_CONCURRENT))
        self._template = self._load_template()

    def _load_template(self) -> dict | None:
        path = _WORKFLOWS_DIR / settings.IMAGE_GEN_WORKFLOW_TEMPLATE
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.error("[image_gen] failed to load workflow template %s: %s", path, e)
            return None

    async def health_check(self) -> bool:
        if self._template is None:
            return False
        try:
            resp = await self._client.get("/system_stats", timeout=5.0)
            return resp.status_code == 200
        except Exception:
            return False

    def _patch_workflow(self, prompt: str, width: int, height: int, seed: int | None) -> tuple[dict, int]:
        graph = copy.deepcopy(self._template)
        resolved_seed = seed if seed is not None else random.randint(0, 2**32 - 1)
        for node in graph.values():
            class_type = node.get("class_type")
            title = node.get("_meta", {}).get("title", "")
            inputs = node.get("inputs", {})
            if class_type == "CLIPTextEncode" and title == "Positive Prompt":
                inputs["text"] = prompt
            elif class_type in ("EmptySD3LatentImage", "EmptyLatentImage"):
                inputs["width"] = width
                inputs["height"] = height
            elif class_type == "KSampler":
                inputs["seed"] = resolved_seed
                inputs["steps"] = settings.IMAGE_GEN_STEPS
                inputs["cfg"] = 1.0
            elif class_type == "FluxGuidance":
                inputs["guidance"] = settings.IMAGE_GEN_GUIDANCE
        return graph, resolved_seed

    async def generate_text_to_image(
        self,
        prompt: str,
        negative_prompt: str = "",
        aspect_ratio: str = "square",
        seed: int | None = None,
    ) -> tuple[bytes, dict]:
        if self._template is None:
            raise RuntimeError("ComfyUI workflow template not loaded")

        width, height = ASPECT_RATIOS.get(aspect_ratio, ASPECT_RATIOS["square"])

        async with self._semaphore:
            graph, resolved_seed = self._patch_workflow(prompt, width, height, seed)
            client_id = str(uuid.uuid4())
            resp = await self._client.post("/prompt", json={"prompt": graph, "client_id": client_id})
            resp.raise_for_status()
            prompt_id = resp.json()["prompt_id"]
            image_bytes = await self._poll_result(prompt_id)

        return image_bytes, {
            "seed": resolved_seed,
            "width": width,
            "height": height,
            "model_name": settings.IMAGE_GEN_MODEL_NAME,
            "model_version": settings.IMAGE_GEN_MODEL_VERSION,
        }

    async def _poll_result(self, prompt_id: str) -> bytes:
        deadline = time.monotonic() + settings.IMAGE_GEN_TIMEOUT_SEC
        while time.monotonic() < deadline:
            resp = await self._client.get(f"/history/{prompt_id}")
            resp.raise_for_status()
            history = resp.json().get(prompt_id)
            if history:
                for node_output in history.get("outputs", {}).values():
                    images = node_output.get("images")
                    if images:
                        img_resp = await self._client.get("/view", params=images[0])
                        img_resp.raise_for_status()
                        return img_resp.content
            await asyncio.sleep(settings.IMAGE_GEN_POLL_INTERVAL_SEC)
        raise TimeoutError("ComfyUI: image generation timed out")


image_generation_service = ImageGenerationService()

from typing import Optional


class OCRService:
    def __init__(self):
        self._ocr = None

    def _get_ocr(self):
        if self._ocr is None:
            from paddleocr import PaddleOCR
            self._ocr = PaddleOCR(use_angle_cls=True, lang='ru', use_gpu=False, show_log=False)
        return self._ocr

    def extract_text(self, image_path: str) -> str:
        try:
            result = self._get_ocr().ocr(image_path, cls=True)
            lines = []
            for page in (result or []):
                for line in (page or []):
                    if line and len(line) >= 2 and line[1]:
                        lines.append(line[1][0])
            return "\n".join(lines)
        except Exception as e:
            raise RuntimeError(f"OCR failed: {e}")


ocr_service = OCRService()

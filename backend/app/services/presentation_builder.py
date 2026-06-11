import io
from pathlib import Path
from typing import Optional
from pptx import Presentation as PPTXPresentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_CONNECTOR_TYPE
from app.core.config import get_settings
from app.services.presentation_plan import THEMES

settings = get_settings()


def _hex(color: str) -> RGBColor:
    h = color.lstrip('#')
    return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def _add_text_box(slide, text: str, left, top, width, height,
                  font_size=18, bold=False, color="#FFFFFF", align=PP_ALIGN.LEFT):
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.size = Pt(font_size)
    run.font.bold = bold
    run.font.color.rgb = _hex(color)
    return txBox


def _add_speaker_notes(slide, points: list, title_text: str):
    notes_slide = slide.notes_slide
    tf = notes_slide.notes_text_frame
    tf.text = "\n".join(points) if points else title_text


def build_presentation(plan: dict, theme_name: str, selected_ids: list, session_id: str,
                        llm_service=None, progress_cb=None) -> str:
    from app.services.chart_service import generate_chart_bytes, generate_infographic_bytes

    theme = THEMES.get(theme_name, THEMES["corporate"])
    bg_color = theme["bg"]
    accent_color = theme["accent"]
    text_color = theme["text"]

    prs = PPTXPresentation()
    prs.slide_width  = Inches(13.33)
    prs.slide_height = Inches(7.5)

    blank_layout = prs.slide_layouts[6]

    slides_to_build = [s for s in plan.get("slides", []) if s.get("id") in selected_ids]
    total = len(slides_to_build)
    doc_title = plan.get("title", "")[:50]

    for idx, slide_data in enumerate(slides_to_build, 1):
        if progress_cb:
            progress_cb({"status": f"Слайд {idx}/{total}: {slide_data.get('title', '')[:40]}", "slide": idx, "total": total})
        slide = prs.slides.add_slide(blank_layout)
        bg = slide.background
        fill = bg.fill
        fill.solid()
        fill.fore_color.rgb = _hex(bg_color)

        stype = slide_data.get("type", "content")
        title_text = slide_data.get("title", "")
        points = slide_data.get("points", [])

        if stype == "title":
            _add_text_box(slide, title_text,
                          Inches(1.5), Inches(2.5), Inches(10), Inches(1.5),
                          font_size=40, bold=True, color=text_color, align=PP_ALIGN.CENTER)
            subtitle = points[0] if points else ""
            if subtitle:
                _add_text_box(slide, subtitle,
                              Inches(2), Inches(4.3), Inches(9), Inches(0.8),
                              font_size=18, color=accent_color, align=PP_ALIGN.CENTER)

        elif stype == "chart":
            _add_text_box(slide, title_text,
                          Inches(0.5), Inches(0.3), Inches(12), Inches(0.8),
                          font_size=24, bold=True, color=text_color)
            try:
                chart_bytes = generate_chart_bytes(
                    chart_type=slide_data.get("chart_type", "bar"),
                    title=title_text,
                    data_hint=slide_data.get("data_hint", ""),
                    theme=theme,
                    llm_service=llm_service,
                )
                img_stream = io.BytesIO(chart_bytes)
                slide.shapes.add_picture(img_stream, Inches(1.5), Inches(1.4), Inches(10), Inches(5.6))
            except Exception:
                _add_text_box(slide, "[График недоступен]",
                              Inches(1.5), Inches(3), Inches(10), Inches(1),
                              font_size=16, color=accent_color, align=PP_ALIGN.CENTER)

        elif stype == "image":
            _add_text_box(slide, title_text,
                          Inches(0.5), Inches(0.2), Inches(12), Inches(0.8),
                          font_size=24, bold=True, color=text_color)
            try:
                img_bytes = generate_infographic_bytes(title_text, points, theme)
                slide.shapes.add_picture(io.BytesIO(img_bytes),
                                         Inches(0.4), Inches(1.2), Inches(12.5), Inches(5.8))
            except Exception:
                y = Inches(1.6)
                for pt in points[:8]:
                    _add_text_box(slide, f"• {pt}",
                                  Inches(0.8), y, Inches(11.5), Inches(0.6),
                                  font_size=16, color=text_color)
                    y += Inches(0.65)

        elif stype == "ai_image":
            _add_text_box(slide, title_text,
                          Inches(0.5), Inches(0.2), Inches(12), Inches(0.8),
                          font_size=24, bold=True, color=text_color)
            img_path = slide_data.get("_ai_image_path")
            if img_path and Path(img_path).exists():
                slide.shapes.add_picture(img_path, Inches(1.5), Inches(1.3), width=Inches(10.3))
            else:
                _add_text_box(slide, "[AI-изображение недоступно]",
                              Inches(1.5), Inches(3.5), Inches(10), Inches(1),
                              font_size=16, color=accent_color, align=PP_ALIGN.CENTER)

        elif stype == "quote":
            _add_text_box(slide, "❝",
                          Inches(1), Inches(1.2), Inches(1), Inches(1),
                          font_size=60, color=accent_color)
            quote_text = points[0] if points else title_text
            _add_text_box(slide, quote_text,
                          Inches(1.5), Inches(2.0), Inches(10), Inches(3),
                          font_size=22, bold=False, color=text_color, align=PP_ALIGN.CENTER)

        else:
            _add_text_box(slide, title_text,
                          Inches(0.5), Inches(0.3), Inches(12), Inches(0.9),
                          font_size=28, bold=True, color=text_color)

            line = slide.shapes.add_connector(
                MSO_CONNECTOR_TYPE.STRAIGHT,
                Inches(0.5), Inches(1.35),
                Inches(12.8), Inches(1.35),
            )
            line.line.color.rgb = _hex(accent_color)
            line.line.width = Pt(2)

            y = Inches(1.6)
            step = Inches(0.65)
            for pt in points[:8]:
                _add_text_box(slide, f"• {pt}",
                              Inches(0.8), y, Inches(11.5), Inches(0.6),
                              font_size=16, color=text_color)
                y += step

        # Speaker notes for every slide
        _add_speaker_notes(slide, points, title_text)

        # Footer: slide number (bottom-right) + doc title (bottom-left), skip on title slide
        if stype != "title":
            _add_text_box(slide, f"{idx}/{total}",
                          Inches(12.0), Inches(7.1), Inches(1.2), Inches(0.35),
                          font_size=11, color=accent_color, align=PP_ALIGN.RIGHT)
            if doc_title:
                _add_text_box(slide, doc_title,
                              Inches(0.4), Inches(7.1), Inches(8), Inches(0.35),
                              font_size=10, color=text_color)

    if progress_cb:
        progress_cb({"status": "Сохраняю файл…"})
    out_path = Path(settings.UPLOAD_DIR) / session_id / "presentation_v2.pptx"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    prs.save(str(out_path))
    return str(out_path)

import io
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from typing import Optional

_CHART_PROMPT = """Создай данные для графика типа "{chart_type}" с заголовком "{title}".
Подсказка по данным: {data_hint}

Верни ТОЛЬКО валидный JSON без markdown-блоков:
{{"labels": ["A", "B", "C"], "values": [10, 20, 30], "xlabel": "Ось X", "ylabel": "Ось Y"}}"""


def generate_chart_bytes(
    chart_type: str,
    title: str,
    data_hint: str,
    theme: dict,
    llm_service=None,
) -> bytes:
    labels, values, xlabel, ylabel = _get_data(chart_type, title, data_hint, llm_service)
    return _render(chart_type, title, labels, values, xlabel, ylabel, theme)


def _get_data(chart_type, title, data_hint, llm_service):
    if llm_service:
        try:
            prompt = _CHART_PROMPT.format(chart_type=chart_type, title=title, data_hint=data_hint or title)
            raw = llm_service.simple_chat(prompt).strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            d = json.loads(raw)
            return (
                d.get("labels", ["A", "B", "C"]),
                d.get("values", [1, 2, 3]),
                d.get("xlabel", ""),
                d.get("ylabel", ""),
            )
        except Exception:
            pass
    return ["A", "B", "C", "D"], [25, 40, 30, 45], "", ""


def _render(chart_type, title, labels, values, xlabel, ylabel, theme) -> bytes:
    bg = theme.get("bg", "#1A2744")
    accent = theme.get("accent", "#3B82F6")
    text_color = theme.get("text", "#FFFFFF")

    fig, ax = plt.subplots(figsize=(8, 4.5))
    fig.patch.set_facecolor(bg)
    ax.set_facecolor(bg)

    for spine in ax.spines.values():
        spine.set_edgecolor(text_color)
        spine.set_alpha(0.3)

    ax.tick_params(colors=text_color, labelsize=9)
    ax.xaxis.label.set_color(text_color)
    ax.yaxis.label.set_color(text_color)

    if chart_type == "pie":
        colors = [accent] + [_vary_color(accent, i) for i in range(1, len(labels))]
        wedges, texts, autotexts = ax.pie(
            values, labels=labels, autopct='%1.0f%%',
            colors=colors[:len(labels)], startangle=140,
            textprops={'color': text_color, 'fontsize': 9}
        )
        for at in autotexts:
            at.set_color(text_color)
    elif chart_type == "line":
        ax.plot(labels, values, color=accent, linewidth=2.5, marker='o', markersize=6)
        ax.fill_between(range(len(labels)), values, alpha=0.15, color=accent)
        ax.set_xticks(range(len(labels)))
        ax.set_xticklabels(labels, rotation=20, ha='right')
        if xlabel: ax.set_xlabel(xlabel, color=text_color, fontsize=9)
        if ylabel: ax.set_ylabel(ylabel, color=text_color, fontsize=9)
    else:
        bars = ax.bar(labels, values, color=accent, alpha=0.85, width=0.6)
        for bar, val in zip(bars, values):
            ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + max(values) * 0.01,
                    str(val), ha='center', va='bottom', color=text_color, fontsize=8)
        ax.set_xticks(range(len(labels)))
        ax.set_xticklabels(labels, rotation=20, ha='right')
        if xlabel: ax.set_xlabel(xlabel, color=text_color, fontsize=9)
        if ylabel: ax.set_ylabel(ylabel, color=text_color, fontsize=9)

    ax.set_title(title, color=text_color, fontsize=12, fontweight='bold', pad=10)
    ax.grid(axis='y', alpha=0.15, color=text_color, linestyle='--')
    plt.tight_layout(pad=0.5)

    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=150, bbox_inches='tight', facecolor=bg)
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def _vary_color(hex_color: str, offset: int) -> str:
    try:
        h = hex_color.lstrip('#')
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        step = offset * 30
        r = min(255, r + step % 80)
        g = min(255, g + (step * 2) % 80)
        b = min(255, b + (step * 3) % 80)
        return f'#{r:02x}{g:02x}{b:02x}'
    except Exception:
        return hex_color

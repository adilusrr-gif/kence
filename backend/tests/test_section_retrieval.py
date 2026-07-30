"""Tests for section-aware Exact Answer retrieval (PART 1).

These verify the core promise: a fragment is expanded to its COMPLETE
enclosing section and never truncated — for legal articles, numbered lists,
definitions, glossaries, military regulations and NPA sections.
"""
from langchain_core.documents import Document as LCDocument

from app.services import section_retriever as sr


# ── Heading detection ─────────────────────────────────────────────────────────

def test_detects_markdown_headings():
    assert sr.is_heading_line("# Title")
    assert sr.is_heading_line("### Sub")
    assert not sr.is_heading_line("not a heading")
    assert not sr.is_heading_line("")


def test_detects_legal_article_headings():
    assert sr.is_heading_line("Статья 5. Права сторон")
    assert sr.is_heading_line("Article 12. Termination")
    assert sr.is_heading_line("§ 3 Geltungsbereich")
    assert sr.is_heading_line("Глава 2. Общие положения")
    assert sr.is_heading_line("Бап 7. Жалпы ережелер")


def test_detects_caps_and_definition_titles():
    assert sr.is_heading_line("ОБЩИЕ ПОЛОЖЕНИЯ")
    assert sr.is_heading_line("TERMS AND DEFINITIONS")
    assert sr.is_heading_line("Термины и определения")


def test_list_item_not_heading_inside_list():
    # A numbered item inside a list must NOT be treated as a section boundary.
    assert not sr.is_heading_line("2. второй пункт списка", prev_is_list=True)
    assert not sr.is_heading_line("- bullet item")


# ── Legal article: never truncate ─────────────────────────────────────────────

LEGAL_DOC = """# Закон о государственной службе

Статья 1. Общие положения

Настоящий закон регулирует отношения.

Статья 2. Определения

В настоящем законе используются следующие понятия:
1. Государственный служащий — лицо, занимающее должность.
2. Должность — структурная единица.
3. Орган — государственное учреждение.

Статья 3. Заключительные положения

Закон вступает в силу со дня опубликования.
"""


def test_legal_article_expanded_completely():
    # A fragment from the MIDDLE of Article 2 must return the WHOLE article,
    # including every numbered definition.
    frag = "1. Государственный служащий — лицо, занимающее должность."
    sec = sr.expand_to_section(LEGAL_DOC, frag)
    assert sec is not None
    assert sec.heading.startswith("Статья 2")
    # All three numbered definitions present — list not truncated.
    assert "1. Государственный служащий" in sec.text
    assert "2. Должность" in sec.text
    assert "3. Орган" in sec.text
    # Did NOT bleed into the next article.
    assert "Статья 3" not in sec.text


def test_numbered_list_never_truncated():
    frag = "2. Должность — структурная единица."
    sec = sr.expand_to_section(LEGAL_DOC, frag)
    assert sec is not None
    assert "1. Государственный служащий" in sec.text
    assert "3. Орган" in sec.text


# ── Glossary / definitions ────────────────────────────────────────────────────

GLOSSARY = """ГЛОССАРИЙ

Авторизация — процесс предоставления прав доступа.

Аутентификация — процесс проверки подлинности пользователя путём
сопоставления предъявленных учётных данных с эталонными.

# Следующий раздел

Прочий текст.
"""


def test_glossary_definition_full():
    frag = "процесс проверки подлинности пользователя"
    sec = sr.expand_to_section(GLOSSARY, frag)
    assert sec is not None
    assert "Аутентификация" in sec.text
    assert "сопоставления предъявленных учётных данных" in sec.text
    assert "Следующий раздел" not in sec.text


# ── Military regulation / NPA style ──────────────────────────────────────────

NPA = """РАЗДЕЛ III. ПОРЯДОК НЕСЕНИЯ СЛУЖБЫ

15. Военнослужащий обязан:
а) соблюдать устав;
б) выполнять приказы командира;
в) беречь военное имущество;
г) хранить государственную тайну.

РАЗДЕЛ IV. ОТВЕТСТВЕННОСТЬ

16. За нарушение устава наступает ответственность.
"""


def test_npa_subitems_not_truncated():
    frag = "б) выполнять приказы командира;"
    sec = sr.expand_to_section(NPA, frag)
    assert sec is not None
    for sub in ("а) соблюдать устав", "б) выполнять приказы", "в) беречь", "г) хранить"):
        assert sub in sec.text
    assert "РАЗДЕЛ IV" not in sec.text


# ── Tables preserved ──────────────────────────────────────────────────────────

TABLE_DOC = """## Характеристики

| Параметр | Значение |
| --- | --- |
| Вес | 10 кг |
| Длина | 2 м |
| Высота | 1 м |

## Другое
"""


def test_table_kept_whole():
    frag = "| Длина | 2 м |"
    sec = sr.expand_to_section(TABLE_DOC, frag)
    assert sec is not None
    assert "| Вес | 10 кг |" in sec.text
    assert "| Высота | 1 м |" in sec.text
    assert "Другое" not in sec.text


# ── Fragment location resilience ──────────────────────────────────────────────

def test_find_fragment_whitespace_normalized():
    doc = "Статья 1.\n\nТекст   с   разными    пробелами."
    loc = sr.find_fragment_offset(doc, "Текст с разными пробелами.")
    assert loc is not None


def test_no_headings_returns_whole_doc():
    doc = "just some plain text without any headings at all here."
    sec = sr.expand_to_section(doc, "plain text")
    assert sec is not None
    assert sec.text == doc.strip("\n")


# ── build_exact_context across multiple fragments ─────────────────────────────

def test_build_exact_context_multiple_sections():
    docs = [
        LCDocument(page_content="1. Государственный служащий — лицо, занимающее должность."),
        LCDocument(page_content="Закон вступает в силу со дня опубликования."),
    ]
    ctx = sr.build_exact_context(LEGAL_DOC, docs)
    assert "Статья 2" in ctx
    assert "3. Орган" in ctx          # full list from section 2
    assert "Статья 3" in ctx          # second section
    assert ctx.count("[Раздел") >= 2


def test_build_exact_context_dedup_overlapping():
    # Two fragments from the SAME article should yield ONE section, not two.
    docs = [
        LCDocument(page_content="1. Государственный служащий — лицо, занимающее должность."),
        LCDocument(page_content="3. Орган — государственное учреждение."),
    ]
    ctx = sr.build_exact_context(LEGAL_DOC, docs)
    assert ctx.count("[Раздел") == 1

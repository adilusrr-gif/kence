"""Section-aware retrieval for Exact Answer mode.

Problem this solves
--------------------
Plain RAG returns isolated ~2000-char chunks. When a user asks for a *complete*
section — a legal article, a glossary entry, a numbered list, a definitions
block, an NPA clause — the matching chunk is only a slice of it, so the answer
is truncated.

Strategy
--------
The full extracted document text is already persisted on the session
(``DocSession.markdown_text``). So instead of stitching overlapping chunks back
together (lossy, order-dependent), we:

1. Retrieve the best-matching fragment(s) via the normal hybrid retriever.
2. Locate each fragment inside the full document text.
3. Expand UP to the enclosing section heading.
4. Expand DOWN to just before the next heading of the same-or-higher level.
5. Return the COMPLETE section(s), de-duplicated and in document order.

Heading detection is format-agnostic and covers Markdown, plain text, legal
documents, military regulations (НПА), standards, contracts, glossaries and
technical docs. A section boundary is *only* ever a heading — never a blank
line, list item or table row — which is what guarantees numbered lists,
definitions, tables and articles are never cut in half.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import List, Optional, Tuple

from langchain_core.documents import Document as LCDocument

logger = logging.getLogger(__name__)


# ── Heading detection ────────────────────────────────────────────────────────
#
# Each pattern matches a WHOLE line (already stripped of trailing whitespace).
# The order does not matter — a line is a heading if ANY pattern matches.

# Markdown ATX heading: "#", "##", … "######"
_RE_MD_ATX = re.compile(r"^\s{0,3}#{1,6}\s+\S")

# Numbered structural headings that are clearly titles, not list items:
#   "1. ОБЩИЕ ПОЛОЖЕНИЯ"      "1.2 Scope"      "3.4.5. Requirements"
# Heuristic: a dotted/number prefix followed by text. We deliberately accept
# "1. Title" too, but the list-vs-heading ambiguity is resolved by the caller —
# expansion never *stops* inside a run of consecutive numbered lines (that is a
# list), only at a heading that introduces a new block. See _is_list_context.
_RE_NUM_HEADING = re.compile(
    r"^\s{0,3}\d{1,3}(?:\.\d{1,3}){0,4}\.?\s+\S"
)

# Legal / regulatory / NPA structural markers in RU/KZ/EN. These are the
# strongest section boundaries in legal & military-regulation documents.
_RE_LEGAL = re.compile(
    r"^\s{0,3}(?:"
    r"глава|раздел|статья|стать[яи]|пункт|подпункт|параграф|часть|приложение|"      # RU
    r"тарау|бап|бөлім|тармақ|қосымша|"                                              # KZ
    r"chapter|section|article|clause|part|appendix|annex|schedule|paragraph|"       # EN
    r"§"                                                                            # symbol
    r")\s*"
    r"(?:№\s*)?\d+[A-Za-zА-Яа-я]?(?:[.\-)]\d+)*\.?\b",
    re.IGNORECASE,
)

# ALL-CAPS / Title heading lines (common in plain-text standards & regulations):
#   "ОБЩИЕ ПОЛОЖЕНИЯ"   "TERMS AND DEFINITIONS"   "ГЛОССАРИЙ"
_RE_CAPS_HEADING = re.compile(r"^\s{0,3}[A-ZА-ЯЁ0-9][A-ZА-ЯЁ0-9 .,()№\-/]{3,80}$")

# Glossary / definition section titles, even when not capitalised.
_RE_DEFINITION_TITLE = re.compile(
    r"^\s{0,3}(?:термины и определения|определения|глоссарий|словарь терминов|"
    r"терминдер мен анықтамалар|глоссарий|"
    r"terms and definitions|definitions|glossary|terminology)\b",
    re.IGNORECASE,
)

# Lines that look like list items — used to AVOID treating list bullets as
# headings and to detect "we are inside a list" context.
_RE_LIST_ITEM = re.compile(r"^\s{0,3}(?:[-*+•]\s+|\d{1,3}[.)]\s+|[a-zа-яё][.)]\s+)\S")

# Markdown table row.
_RE_TABLE_ROW = re.compile(r"^\s{0,3}\|.*\|\s*$")


def _is_caps_line(line: str) -> bool:
    """True for an upper-case heading line that contains at least one letter."""
    stripped = line.strip()
    if not (4 <= len(stripped) <= 80):
        return False
    letters = [c for c in stripped if c.isalpha()]
    if len(letters) < 3:
        return False
    # Mostly upper-case and no sentence-ending punctuation mid-line.
    if any(c.islower() for c in letters):
        return False
    return bool(_RE_CAPS_HEADING.match(stripped))


def is_heading_line(line: str, *, prev_is_list: bool = False) -> bool:
    """Return True if ``line`` starts a new section.

    ``prev_is_list`` lets the caller suppress the numbered-heading rule while we
    are inside a numbered list, so list items like "1. foo / 2. bar / 3. baz"
    are kept together instead of each starting a "section".
    """
    s = line.rstrip()
    if not s.strip():
        return False

    if _RE_TABLE_ROW.match(s):
        return False
    if _RE_LIST_ITEM.match(s) and prev_is_list:
        # In the middle of a list — never a boundary.
        return False

    if _RE_MD_ATX.match(s):
        return True
    if _RE_LEGAL.match(s):
        return True
    if _RE_DEFINITION_TITLE.match(s):
        return True
    if _is_caps_line(s):
        return True

    # Numbered headings: accept only when NOT a continuation of a list and the
    # line is reasonably short (titles are short; list items / sentences run on).
    if _RE_NUM_HEADING.match(s) and not prev_is_list:
        # A genuine heading is short and has no terminal sentence punctuation
        # beyond an optional trailing period.
        body = _RE_NUM_HEADING.sub("", s).strip()
        if len(s) <= 90 and not body.endswith((".", ";", ",")):
            return True
    return False


@dataclass
class _Heading:
    line_idx: int
    char_offset: int


# ── Public types ─────────────────────────────────────────────────────────────

@dataclass
class Section:
    """A complete document section."""
    text: str
    start: int          # char offset in source
    end: int            # char offset in source (exclusive)
    heading: str        # the heading line (or "" if none)


# ── Core algorithm ───────────────────────────────────────────────────────────

def _line_offsets(text: str) -> List[int]:
    """Char offset of the start of each line."""
    offsets = [0]
    for m in re.finditer(r"\n", text):
        offsets.append(m.end())
    return offsets


def _heading_indices(lines: List[str]) -> List[int]:
    """Indices of lines that are headings, list-aware."""
    headings: List[int] = []
    prev_is_list = False
    for i, line in enumerate(lines):
        is_list = bool(_RE_LIST_ITEM.match(line.rstrip()))
        if is_heading_line(line, prev_is_list=prev_is_list):
            headings.append(i)
        # A blank line ends a list run; a list item continues it.
        if is_list:
            prev_is_list = True
        elif not line.strip():
            prev_is_list = False
        elif _RE_TABLE_ROW.match(line.rstrip()):
            pass  # tables don't change list context
        else:
            prev_is_list = False
    return headings


def find_fragment_offset(full_text: str, fragment: str) -> Optional[Tuple[int, int]]:
    """Locate ``fragment`` inside ``full_text``.

    Tries exact match, then whitespace-normalised match, then an anchor on the
    first non-trivial run of the fragment. Returns (start, end) char offsets or
    None.
    """
    if not full_text or not fragment:
        return None

    frag = fragment.strip()
    if not frag:
        return None

    idx = full_text.find(frag)
    if idx != -1:
        return idx, idx + len(frag)

    # Whitespace-normalised search: collapse runs of whitespace in both sides
    # and map back to original offsets.
    norm_full, mapping = _normalize_with_map(full_text)
    norm_frag = re.sub(r"\s+", " ", frag).strip()
    pos = norm_full.find(norm_frag)
    if pos != -1:
        start = mapping[pos]
        end_idx = min(pos + len(norm_frag), len(mapping) - 1)
        return start, mapping[end_idx]

    # Anchor on the first ~80 chars of the fragment.
    anchor = norm_frag[:80]
    if len(anchor) >= 20:
        pos = norm_full.find(anchor)
        if pos != -1:
            start = mapping[pos]
            return start, min(start + len(frag), len(full_text))

    return None


def _normalize_with_map(text: str) -> Tuple[str, List[int]]:
    """Collapse whitespace; return (normalized, map[norm_idx] -> orig_idx)."""
    out_chars: List[str] = []
    mapping: List[int] = []
    prev_space = False
    for i, ch in enumerate(text):
        if ch.isspace():
            if prev_space:
                continue
            out_chars.append(" ")
            mapping.append(i)
            prev_space = True
        else:
            out_chars.append(ch)
            mapping.append(i)
            prev_space = False
    mapping.append(len(text))
    return "".join(out_chars), mapping


def expand_to_section(full_text: str, fragment: str) -> Optional[Section]:
    """Expand a matched fragment to its complete enclosing section."""
    loc = find_fragment_offset(full_text, fragment)
    if loc is None:
        return None
    frag_start, frag_end = loc

    lines = full_text.split("\n")
    line_offsets = _line_offsets(full_text)
    heading_idx = _heading_indices(lines)

    if not heading_idx:
        # No headings at all — return the whole document (it IS one section).
        return Section(text=full_text.strip("\n"), start=0, end=len(full_text), heading="")

    # Map char offsets to line indices.
    def line_of(offset: int) -> int:
        lo, hi = 0, len(line_offsets) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if line_offsets[mid] <= offset:
                lo = mid
            else:
                hi = mid - 1
        return lo

    start_line = line_of(frag_start)
    end_line = line_of(max(frag_start, frag_end - 1))

    # Section start = nearest heading at or before the fragment start.
    section_start_line = 0
    heading_text = ""
    for h in heading_idx:
        if h <= start_line:
            section_start_line = h
            heading_text = lines[h].strip()
        else:
            break

    # Section end = first heading strictly after the fragment end. This keeps
    # the whole block (lists/tables/definitions) intact even if the matched
    # chunk straddled a sub-heading.
    section_end_line = len(lines)
    for h in heading_idx:
        if h > end_line and h > section_start_line:
            section_end_line = h
            break

    start_off = line_offsets[section_start_line]
    end_off = (
        line_offsets[section_end_line]
        if section_end_line < len(line_offsets)
        else len(full_text)
    )
    text = full_text[start_off:end_off].strip("\n")
    return Section(text=text, start=start_off, end=end_off, heading=heading_text)


def _merge_sections(sections: List[Section], full_text: str) -> List[Section]:
    """De-duplicate and merge overlapping sections, keeping document order.

    Merge only on genuine overlap (one span starts before the other ends).
    Adjacent-but-distinct sections (sec.start == last.end) are kept separate so
    two different articles/clauses aren't fused. Merged spans are re-sliced from
    ``full_text`` so the union text is always complete.
    """
    if not sections:
        return []
    ordered = sorted(sections, key=lambda s: s.start)
    merged: List[Section] = [ordered[0]]
    for sec in ordered[1:]:
        last = merged[-1]
        if sec.start < last.end:  # genuine overlap
            if sec.end > last.end:
                new_start, new_end = last.start, sec.end
                merged[-1] = Section(
                    text=full_text[new_start:new_end].strip("\n"),
                    start=new_start,
                    end=new_end,
                    heading=last.heading,
                )
        else:
            merged.append(sec)
    return merged


def build_exact_sections(
    full_text: str,
    fragments: List[str],
    *,
    max_sections: int = 6,
    max_chars: int = 48_000,
) -> List[Section]:
    """Expand each fragment to its full section, ranked by fragment order.

    Sections are merged (overlaps removed) and capped by ``max_sections`` and a
    total ``max_chars`` budget so the assembled context still fits the model's
    window — but each individual section is always returned COMPLETE (never
    sliced mid-section).
    """
    if not full_text:
        return []

    raw: List[Section] = []
    seen_spans: List[Tuple[int, int]] = []
    for frag in fragments:
        sec = expand_to_section(full_text, frag)
        if sec is None:
            continue
        # Skip if this span is already represented.
        if any(sec.start >= s and sec.end <= e for s, e in seen_spans):
            continue
        raw.append(sec)
        seen_spans.append((sec.start, sec.end))

    merged = _merge_sections(raw, full_text)

    # Re-rank merged sections by the best (earliest) fragment that produced them,
    # but cap by count and total chars. Keep document order for readability.
    selected: List[Section] = []
    total = 0
    for sec in merged:
        if len(selected) >= max_sections:
            break
        if total + len(sec.text) > max_chars and selected:
            break
        selected.append(sec)
        total += len(sec.text)
    return selected


def build_exact_context(full_text: str, docs: List[LCDocument], **kwargs) -> str:
    """Assemble a complete-section context string from retrieved documents."""
    fragments = [d.page_content for d in docs if getattr(d, "page_content", "")]
    sections = build_exact_sections(full_text, fragments, **kwargs)
    if not sections:
        # Fall back to the raw fragments so the caller still gets *something*.
        return "\n\n".join(fragments)
    parts = []
    for i, sec in enumerate(sections, 1):
        parts.append(f"[Раздел {i}]\n{sec.text}")
    return "\n\n".join(parts)

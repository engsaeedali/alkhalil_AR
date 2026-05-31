# -*- coding: utf-8 -*-
"""
تنظيف نص PDF العربي (خصوصاً Adobe InDesign):
ترتيب القراءة، دمج الأسطر، إزالة أرقام الصفحات والفهرس المقطّع، تقليل التشكيل المزدوج.
"""

from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher
from typing import Iterable, List, Optional

ARABIC_RE = re.compile(r"[\u0600-\u06FF]")
ARABIC_BASE_RE = re.compile(
    r"[\u0621-\u064A\u0671\u0677-\u069F\u06A0-\u06A9\u06AA-\u06BF"
    r"\u06C0-\u06CE\u06D0-\u06D3\u06D5\u06FA-\u06FF]"
)
SENTENCE_END_RE = re.compile(r"[.!?؟؛:…]\s*$")
HEADING_START_RE = re.compile(
    r"^(?:الفصل|الركن|الباب|مقدمة|الفهرس|الإهداء|الخاتمة|الملحق|"
    r"الفصل\s+ال|الركن\s+ال|الباب\s+ال)",
    re.UNICODE,
)
PAGE_NUMBER_RE = re.compile(r"^\d{1,4}$")
LEADING_PAGE_RE = re.compile(r"^\d{1,3}\s+")
TRAILING_PAGE_RE = re.compile(r"\s+\d{1,3}\s*$")
DUPLICATE_MARK_RE = re.compile(r"([\u064B-\u065F\u0670])\1+")
KASHIDA = "\u0640"
MARKS_SET = set(chr(c) for c in range(0x064B, 0x0660)) | {"\u0670"}
CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
BROKEN_LATIN_RE = re.compile(r"^[A-Za-z][A-Za-z\s]{0,40}\(?$")
ORPHAN_QUOTE_RE = re.compile(r"^[«»\"']\s*$")
DEDICATION_LINE_RE = re.compile(r"^[\(]?إلى\b")
TOC_TITLE_RE = re.compile(r"(?:الباب|الركن|الفصل|الإهداء|الفهرس|مقدمة)", re.UNICODE)


def strip_diacritics(text: str) -> str:
    return DUPLICATE_MARK_RE.sub(r"\1", re.sub(r"[\u064B-\u065F\u0670]", "", text or ""))


def collapse_arabic_marks(text: str) -> str:
    """حرف عربي واحد + حركة واحدة كحد أقصى (إصلاح مخرجات InDesign)."""
    if not text:
        return ""
    out: List[str] = []
    i = 0
    n = len(text)
    while i < n:
        c = text[i]
        out.append(c)
        i += 1
        if ARABIC_BASE_RE.match(c) or c in ("ى", "ة"):
            marks: List[str] = []
            while i < n and text[i] in MARKS_SET:
                marks.append(text[i])
                i += 1
            if marks:
                out.append(marks[-1])
    return "".join(out)


def normalize_for_compare(text: str) -> str:
    t = strip_diacritics(text)
    t = t.replace(KASHIDA, "")
    t = re.sub(r"\s+", " ", t).strip()
    return t.casefold()


def _similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a[:400], b[:400]).ratio()


def arabic_char_count(text: str) -> int:
    return len(ARABIC_RE.findall(text or ""))


def score_extracted_arabic(text: str) -> float:
    if not text or not text.strip():
        return 0.0
    body = text.replace("\n", "")
    ar_count = len(ARABIC_RE.findall(body))
    total = max(len(body), 1)
    ar_ratio = ar_count / total
    dup_marks = len(DUPLICATE_MARK_RE.findall(text))
    page_hits = len(PAGE_NUMBER_RE.findall(text))
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    short_lines = sum(1 for ln in lines if len(ln) < 15 and ARABIC_RE.search(ln))
    short_ratio = short_lines / max(len(lines), 1)
    orphan_quotes = sum(1 for ln in lines if ORPHAN_QUOTE_RE.match(ln))
    return (
        ar_ratio * 100.0
        - dup_marks * 4.0
        - page_hits * 5.0
        - short_ratio * 30.0
        - orphan_quotes * 8.0
    )


def _strip_line_noise(line: str) -> str:
    s = line.strip()
    if not s:
        return ""
    s = LEADING_PAGE_RE.sub("", s)
    if TOC_TITLE_RE.search(s) and len(s) < 160:
        s = TRAILING_PAGE_RE.sub("", s).strip()
    return s.strip()


def _should_merge_lines(prev: str, curr: str) -> bool:
    prev_s = prev.strip()
    curr_s = curr.strip()
    if not prev_s or not curr_s:
        return False
    if ORPHAN_QUOTE_RE.match(prev_s) or prev_s in ("«", "»"):
        return True
    if curr_s in ("«", "»") and len(prev_s) < 80:
        return True
    if DEDICATION_LINE_RE.match(curr_s) and not SENTENCE_END_RE.search(prev_s):
        return True
    if HEADING_START_RE.match(curr_s) and len(curr_s) > 25:
        return False
    if HEADING_START_RE.match(curr_s) and len(prev_s) > 40:
        return False
    if SENTENCE_END_RE.search(prev_s):
        return False
    if prev_s[-1] in "([«\"‘":
        return True
    if curr_s[0] in "،)]»\"’":
        return True
    if curr_s.startswith("بل ") or curr_s.startswith("بلُ"):
        return True
    last_word = prev_s.split()[-1] if prev_s.split() else ""
    if last_word and len(last_word) <= 6 and ARABIC_RE.search(last_word):
        return True
    if ARABIC_RE.search(prev_s) and not SENTENCE_END_RE.search(prev_s):
        if len(curr_s) < 55 and not (HEADING_START_RE.match(curr_s) and len(curr_s) > 20):
            return True
    return False


def merge_broken_lines(lines: Iterable[str]) -> List[str]:
    merged: List[str] = []
    buffer = ""

    for raw in lines:
        line = _strip_line_noise(raw)
        if not line:
            if buffer:
                merged.append(buffer.strip())
                buffer = ""
            merged.append("")
            continue

        if not buffer:
            buffer = line
            continue

        if _should_merge_lines(buffer, line):
            if buffer.endswith(("-", "ـ")):
                buffer = buffer[:-1]
            if ORPHAN_QUOTE_RE.match(buffer):
                buffer = line if buffer in ("«", "»") else f"{buffer}{line}"
            else:
                buffer = f"{buffer} {line}".strip()
        else:
            merged.append(buffer.strip())
            buffer = line

    if buffer:
        merged.append(buffer.strip())
    return merged


def dedupe_similar_lines(lines: Iterable[str], threshold: float = 0.88) -> List[str]:
    """طبقات InDesign المزدوجة — أسطر متتالية متطابقة تقريباً."""
    kept: List[str] = []
    prev_norm: Optional[str] = None
    for line in lines:
        s = line.strip()
        if not s:
            kept.append(line)
            prev_norm = None
            continue
        norm = normalize_for_compare(s)
        if prev_norm and len(norm) > 25 and _similarity(norm, prev_norm) >= threshold:
            if score_extracted_arabic(s) > score_extracted_arabic(kept[-1]):
                kept[-1] = s
                prev_norm = norm
            continue
        kept.append(s)
        prev_norm = norm
    return kept


def _filter_raw_lines(lines: Iterable[str]) -> List[str]:
    filtered: List[str] = []
    for raw in lines:
        s = raw.strip()
        if not s:
            filtered.append("")
            continue
        if PAGE_NUMBER_RE.fullmatch(s):
            continue
        if re.fullmatch(r"[\d\s]+", s):
            continue
        if BROKEN_LATIN_RE.fullmatch(s):
            continue
        if len(s) <= 2 and not re.search(r"[\w\u0600-\u06FF]", s, re.UNICODE):
            continue
        filtered.append(s)
    return filtered


def dedupe_paragraphs(paragraphs: Iterable[str], threshold: float = 0.78) -> List[str]:
    kept: List[str] = []
    norms: List[str] = []

    for para in paragraphs:
        p = para.strip()
        if not p:
            kept.append("")
            continue
        norm = normalize_for_compare(p)
        if len(norm) < 50:
            kept.append(p)
            continue
        replaced = False
        for i, prev_norm in enumerate(norms):
            if _similarity(norm, prev_norm) >= threshold:
                if score_extracted_arabic(p) > score_extracted_arabic(kept[i]):
                    kept[i] = p
                    norms[i] = norm
                replaced = True
                break
        if not replaced:
            kept.append(p)
            norms.append(norm)
    return kept


def compress_index_block(paragraphs: List[str]) -> List[str]:
    """
    تقليل فوضى الفهرس: دمج عناوين الفهرس المتتالية في فقرة واحدة
    عندما تكون معظم الأسطر قصيرة + أرقام صفحات.
    """
    out: List[str] = []
    i = 0
    while i < len(paragraphs):
        p = paragraphs[i].strip()
        if not p:
            out.append("")
            i += 1
            continue
        if "الفهرس" in p or (i > 0 and "الفهرس" in (paragraphs[i - 1] or "")):
            chunk = [p]
            j = i + 1
            while j < len(paragraphs):
                nxt = (paragraphs[j] or "").strip()
                if not nxt:
                    break
                if len(nxt) > 200 and not TOC_TITLE_RE.search(nxt[:40]):
                    break
                if HEADING_START_RE.match(nxt) and len(nxt) > 80:
                    break
                chunk.append(nxt)
                j += 1
            if len(chunk) >= 3:
                merged = " | ".join(c for c in chunk if c)
                out.append(merged)
                i = j
                continue
        out.append(p)
        i += 1
    return out


def clean_pdf_arabic_text(text: str, *, strip_index: bool = False) -> str:
    if not text:
        return ""

    text = CONTROL_CHARS_RE.sub("", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\t", " ")
    try:
        text = unicodedata.normalize("NFC", text)
    except Exception:
        pass
    text = collapse_arabic_marks(text)
    text = DUPLICATE_MARK_RE.sub(r"\1", text)
    text = text.replace(KASHIDA, "")
    text = re.sub(r"[ \u00a0]+", " ", text)

    filtered = _filter_raw_lines(text.split("\n"))
    filtered = dedupe_similar_lines(filtered)
    merged_lines = merge_broken_lines(filtered)

    paragraphs: List[str] = []
    buf: List[str] = []
    for line in merged_lines:
        if not line:
            if buf:
                paragraphs.append(" ".join(buf))
                buf = []
            paragraphs.append("")
        else:
            buf.append(line)
    if buf:
        paragraphs.append(" ".join(buf))

    # على المستندات الضخمة نتخطى dedupe الفقرات O(n²)
    if len([p for p in paragraphs if p.strip()]) <= 120:
        paragraphs = dedupe_paragraphs(paragraphs)
        paragraphs = compress_index_block(paragraphs)

    if strip_index:
        paragraphs = [p for p in paragraphs if p and "الفهرس" not in p[:30]]

    out_parts: List[str] = []
    for p in paragraphs:
        if not p:
            if out_parts and out_parts[-1] != "":
                out_parts.append("")
            continue
        out_parts.append(p)

    result = "\n\n".join(out_parts)
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result.strip()


def minimal_normalize_pdf_text(text: str) -> str:
    """تنظيف خفيف عند فشل التنظيف الكامل — لا يُفرّغ المستند."""
    if not text:
        return ""
    text = CONTROL_CHARS_RE.sub("", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\t", " ")
    text = collapse_arabic_marks(text)
    text = DUPLICATE_MARK_RE.sub(r"\1", text)
    text = text.replace(KASHIDA, "")
    text = re.sub(r"[ \u00a0]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def clean_pdf_arabic_text_with_fallback(raw: str) -> str:
    """تنظيف كامل ثم خفيف إن أفرغ التنظيف الكامل النص (شائع في InDesign)."""
    if not raw or not raw.strip():
        return ""
    cleaned = clean_pdf_arabic_text(raw)
    if arabic_char_count(cleaned) >= 30 or len(cleaned.strip()) >= 200:
        return cleaned
    minimal = minimal_normalize_pdf_text(raw)
    if arabic_char_count(minimal) >= 20 or len(minimal.strip()) >= 100:
        return minimal
    return cleaned if cleaned.strip() else minimal


def pick_best_raw_pdf_text(candidates: List[str]) -> str:
    """أفضل نص خام قبل التنظيف — يُفضَّل وجود حروف عربية."""
    valid = [c for c in candidates if c and c.strip()]
    if not valid:
        return ""
    with_arabic = [c for c in valid if arabic_char_count(c) > 0]
    pool = with_arabic if with_arabic else valid
    return max(pool, key=lambda t: (arabic_char_count(t), len(t)))


def pick_best_candidate(candidates: List[str]) -> str:
    """اختيار أفضل نص خام ثم تنظيفه مرة واحدة فقط (تسريع كبير للملفات الكبيرة)."""
    if not candidates:
        return ""
    raw_scored = [
        (score_extracted_arabic(c), c)
        for c in candidates
        if c and c.strip()
    ]
    if not raw_scored:
        return ""
    raw_scored.sort(key=lambda x: x[0], reverse=True)
    return clean_pdf_arabic_text_with_fallback(raw_scored[0][1])

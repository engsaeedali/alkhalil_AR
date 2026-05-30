# -*- coding: utf-8 -*-

import re
from typing import Optional

# علامات نهاية الجمل/الاقتباس المقبولة
_SENTENCE_END = re.compile(r'[.!?؟…"\»\)]\s*$')
_OPEN_QUOTE = re.compile(r'[«"\u201c\u201d]')


def is_likely_truncated(text: str) -> bool:
    """يكشف النص المبتور (كلمة ناقصة، آية مقطوعة، اقتباس غير مغلق)."""
    if not text or not str(text).strip():
        return False
    t = str(text).strip()
    if len(t) < 25:
        return False

    if _SENTENCE_END.search(t):
        # اقتباس مفتوح دون إغلاق
        opens = len(_OPEN_QUOTE.findall(t))
        closes = t.count('"') + t.count('\u201d') + t.count('»')
        if opens > 0 and closes < opens:
            return True
        return False

    # ينتهي بفاصلة أو حرف عاري — غالباً بتر
    if t[-1] in "،,;:":
        return True

    words = t.split()
    if not words:
        return True
    last = re.sub(r'[،,:;\)"\»]+$', '', words[-1])
    if len(last) <= 3 and len(t) > 60:
        return True

    # آية قرآنية/اقتباس بدون إغلاق
    if "قوله تعالى" in t or "قال تعالى" in t:
        if t.count('"') % 2 == 1 or (t.count('«') > t.count('»')):
            return True

    return True


def clip_at_boundary(text: str, max_len: int = 320) -> str:
    """قصّ ذكي عند حدود الجمل أو الكلمات — لا قطع mid-word."""
    text = re.sub(r'\s+', ' ', text.strip())
    if len(text) <= max_len:
        return text

    clip = text[:max_len]
    for sep in ('.', '؟', '!', '…', '،'):
        idx = clip.rfind(sep)
        if idx >= int(max_len * 0.45):
            return clip[: idx + 1].strip()

    last_space = clip.rfind(' ')
    if last_space >= int(max_len * 0.55):
        return clip[:last_space].strip() + "…"
    return clip.strip() + "…"


def join_texts_full(parts: list) -> str:
    """دمج نصوص دون حد أقصى يقطع المعنى."""
    return " ".join(p.strip() for p in parts if p and str(p).strip())

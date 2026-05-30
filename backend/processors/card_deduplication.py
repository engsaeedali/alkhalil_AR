# -*- coding: utf-8 -*-
"""
v4.2 — فلترة محلية محدودة: استبعاد العناوين المتطابقة حرفياً 100% فقط.
يُحظر قص الفقرات أو الفرز بالتشابه الدلالي على متن البطاقات — ذلك للموديل والتدقيق.
"""

import re
from typing import Any, Dict, List

from processors.consolidation_audit import calculate_cosine_similarity

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?؟…])\s+")


def _normalize_title(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def drop_literal_duplicate_titles(ideas: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """إزالة البطاقات ذات section_title المتطابق حرفياً (100%) — دون المساس بالمتن."""
    if len(ideas) <= 1:
        return ideas

    seen: set[str] = set()
    kept: List[Dict[str, Any]] = []
    for idea in ideas:
        title = _normalize_title(idea.get("section_title") or "")
        if title:
            key = title.casefold()
            if key in seen:
                continue
            seen.add(key)
        kept.append(dict(idea))

    for idx, idea in enumerate(kept, start=1):
        idea["id"] = idx
    return kept


def sanitize_consolidation_card(card: Dict[str, Any]) -> Dict[str, Any]:
    """تمرير مخرجات الموديل دون تعديل ميكانيكي على الطبقات."""
    return dict(card)


def intra_card_redundancy_issues(card: Dict[str, Any]) -> List[str]:
    """تنبيهات حية للواجهة — لا تُستخدم لقص أو دمج المحتوى."""
    issues: List[str] = []
    sovereign = (card.get("sovereign_idea") or "").strip()
    layers = card.get("layers") or {}
    cf = (layers.get("conceptual_framework") or "").strip()
    pa = (layers.get("practical_applications") or "").strip()
    idx = card.get("id", "?")

    if sovereign and cf and calculate_cosine_similarity(sovereign, cf) > 0.58:
        issues.append(f"البطاقة {idx}: الإطار المفاهيمي يكرر الصياغة السيادية.")
    if cf and pa and calculate_cosine_similarity(cf, pa) > 0.75:
        issues.append(f"البطاقة {idx}: التطبيقات العملية تكرر الإطار المفاهيمي.")
    if pa:
        mid = len(pa) // 2
        if mid > 120 and calculate_cosine_similarity(pa[:mid], pa[mid:]) > 0.78:
            issues.append(f"البطاقة {idx}: التطبيقات العملية قد تحتوي تكراراً داخلياً — راجع يدوياً.")
    return issues

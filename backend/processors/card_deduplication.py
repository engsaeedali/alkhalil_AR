# -*- coding: utf-8 -*-
"""v4.5 — فلترة محلية: تطابق حرفي 100% للعناوين فقط. باقي التنقية للموديل."""

import re
from typing import Any, Dict, List


def _normalize_literal(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def drop_literal_duplicate_titles(ideas: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """إزالة البطاقات ذات section_title المتطابق حرفياً (100%)."""
    if len(ideas) <= 1:
        return ideas

    seen: set[str] = set()
    kept: List[Dict[str, Any]] = []
    for idea in ideas:
        title = _normalize_literal(idea.get("section_title") or "")
        if title:
            key = title.casefold()
            if key in seen:
                continue
            seen.add(key)
        kept.append(dict(idea))

    for idx, idea in enumerate(kept, start=1):
        idea["id"] = idx
    return kept


def drop_literal_duplicate_lines(text: str) -> str:
    """استبعاد السطور المتطابقة حرفياً 100% — دون المساس بباقي المتن."""
    if not text or not str(text).strip():
        return text or ""
    seen: set[str] = set()
    kept: List[str] = []
    for line in str(text).splitlines():
        key = line.strip()
        if not key:
            kept.append(line)
            continue
        fold = key.casefold()
        if fold in seen:
            continue
        seen.add(fold)
        kept.append(line)
    return "\n".join(kept).strip()


def sanitize_consolidation_card(card: Dict[str, Any]) -> Dict[str, Any]:
    """تمرير مخرجات الموديل — الفلترة المحلية للعناوين/السطور المكررة حرفياً فقط."""
    out = dict(card)
    title = _normalize_literal(out.get("section_title") or "")
    if title:
        out["section_title"] = title
    layers = dict(out.get("layers") or {})
    if layers.get("practical_applications"):
        layers["practical_applications"] = drop_literal_duplicate_lines(
            str(layers["practical_applications"])
        )
    out["layers"] = layers
    return out


def intra_card_redundancy_issues(card: Dict[str, Any]) -> List[str]:
    """إرشادات تحريرية — تطابق حرفي فقط، بلا معادلات تشابه."""
    issues: List[str] = []
    sovereign = _normalize_literal(card.get("sovereign_idea") or "")
    layers = card.get("layers") or {}
    cf = _normalize_literal(layers.get("conceptual_framework") or "")
    pa = _normalize_literal(layers.get("practical_applications") or "")
    idx = card.get("id", "?")

    if sovereign and cf and sovereign == cf:
        issues.append(f"البطاقة {idx}: الإطار المفاهيمي يطابق الصياغة السيادية حرفياً.")
    elif sovereign and cf and sovereign in cf:
        issues.append(f"البطاقة {idx}: الإطار المفاهيمي يتضمن نص الصياغة السيادية حرفياً.")
    if cf and pa and cf == pa:
        issues.append(f"البطاقة {idx}: التطبيقات العملية تطابق الإطار المفاهيمي حرفياً.")
    elif cf and pa and cf in pa:
        issues.append(f"البطاقة {idx}: التطبيقات العملية تتضمن الإطار المفاهيمي حرفياً.")
    return issues

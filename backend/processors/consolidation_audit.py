# -*- coding: utf-8 -*-
"""v4.5 — تدقيق تحريري: إرشادات حية للواجهة بلا جيب تمام ولا دمج ميكانيكي."""

import re
from typing import Any, Dict, List, Tuple

from processors.text_integrity import is_likely_truncated
from processors.sovereign_keywords import is_prohibited_keyword
from utils.logger_config import setup_logger

logger = setup_logger("consolidation_audit")


def _normalize_literal(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def _is_critical_issue(issue: str) -> bool:
    critical_markers = (
        "لا توجد بطاقات",
        "قصيرة أو فارغة",
        "مبتور",
        "غير مقبولة",
        "سجل رقمي ناقص",
        "فارغة.",
    )
    return any(marker in issue for marker in critical_markers)


def audit_consolidated_output(
    output_json: dict,
) -> Tuple[bool, List[str], List[str]]:
    """
    v4.5: (passed, critical_issues, editorial_suggestions)
    التداخلات الدلالية → إرشادات تحريرية للشاشة الوسطى — لا دمج ولا قص.
    """
    critical: List[str] = []
    editorial: List[str] = []
    structure = output_json.get("discovered_structure") or output_json
    ideas = structure.get("core_ideas") or []

    if not ideas:
        critical.append("لا توجد بطاقات معرفية في المخرج.")
        return False, critical, editorial

    for i, idea_a in enumerate(ideas):
        text_a = (idea_a.get("sovereign_idea") or idea_a.get("idea") or "").strip()
        if len(text_a) < 25:
            critical.append(f"البطاقة {i + 1}: الصياغة السيادية قصيرة أو فارغة.")
        if is_likely_truncated(text_a):
            critical.append(f"البطاقة {i + 1}: الصياغة السيادية تبدو مبتورة.")
        layers = idea_a.get("layers") or {}
        for layer_name, layer_text in layers.items():
            if layer_text and is_likely_truncated(str(layer_text)):
                critical.append(f"البطاقة {i + 1}: حقل {layer_name} مبتور.")
        from processors.card_deduplication import intra_card_redundancy_issues

        editorial.extend(intra_card_redundancy_issues({**idea_a, "id": i + 1}))

        norm_a = _normalize_literal(text_a)
        for j, idea_b in enumerate(ideas):
            if i >= j:
                continue
            text_b = (idea_b.get("sovereign_idea") or idea_b.get("idea") or "").strip()
            norm_b = _normalize_literal(text_b)
            if not norm_a or not norm_b:
                continue
            if norm_a == norm_b:
                msg = f"تكرار حرفي كامل بين البطاقة {i + 1} والبطاقة {j + 1} — دمج يدوي موصى به."
                editorial.append(msg)
                logger.warning(f"إرشاد تحريري: {msg}")
            elif len(norm_a) > 35 and (norm_a in norm_b or norm_b in norm_a):
                msg = (
                    f"تداخل نصي بين البطاقة {i + 1} والبطاقة {j + 1} "
                    f"— راجع الصياغة وصحّح التكرار يدوياً."
                )
                editorial.append(msg)
                logger.warning(f"إرشاد تحريري: {msg}")

    keywords = structure.get("sovereign_keywords") or []
    if not keywords:
        editorial.append("قائمة الكلمات المفتاحية فارغة — أضف مصطلحات موضوعية من الموديل.")
    for word in keywords:
        w = str(word).strip()
        if is_prohibited_keyword(w) or len(w) <= 2:
            critical.append(f"كلمة مفتاحية غير مقبولة: «{w}»")
            logger.error(f"فشل اختبار الكلمات: {w}")

    ledger = structure.get("numerical_ledger") or []
    for entry in ledger:
        if not entry.get("value") or not entry.get("context"):
            critical.append("سجل رقمي ناقص: value أو context فارغ.")

    passed = len(critical) == 0
    return passed, critical, editorial


def merge_overlapping_ideas(ideas: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """v4.5: لا دمج — عناوين متطابقة حرفياً فقط."""
    from processors.card_deduplication import drop_literal_duplicate_titles

    return drop_literal_duplicate_titles(ideas)

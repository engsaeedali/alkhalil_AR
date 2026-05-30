# -*- coding: utf-8 -*-
"""v4.2 — تدقيق حوكمة: تنبيهات حية للواجهة دون دمج أو قص ميكانيكي."""

import math
import re
from collections import Counter
from typing import Any, Dict, List, Tuple

from processors.summarizer import ArabicExtractiveSummarizer
from processors.text_integrity import is_likely_truncated
from processors.sovereign_keywords import is_prohibited_keyword, SOVEREIGN_STOP_WORDS
from utils.logger_config import setup_logger

logger = setup_logger("consolidation_audit")

PROHIBITED_KEYWORDS = SOVEREIGN_STOP_WORDS
SIMILARITY_THRESHOLD = 0.70


def _idea_to_vector(text: str) -> Dict[str, float]:
    tokens = ArabicExtractiveSummarizer._clean_and_tokenize(text)
    counts = Counter(tokens)
    total = sum(counts.values()) or 1
    return {w: c / total for w, c in counts.items()}


def calculate_cosine_similarity(text_a: str, text_b: str) -> float:
    """حساب التشابه — للتنبيهات فقط، لا للدمج أو القص."""
    vec_a = _idea_to_vector(text_a)
    vec_b = _idea_to_vector(text_b)
    common = set(vec_a.keys()) & set(vec_b.keys())
    if not common:
        return 0.0
    dot = sum(vec_a[w] * vec_b[w] for w in common)
    norm_a = math.sqrt(sum(v ** 2 for v in vec_a.values()))
    norm_b = math.sqrt(sum(v ** 2 for v in vec_b.values()))
    if norm_a * norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


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


def audit_consolidated_output(output_json: dict) -> Tuple[bool, List[str]]:
    """
    طبقة التدقيق v4.2: ترفع التنبيهات للواجهة.
    passed = لا أخطاء حرجة؛ التداخل الدلالي تنبيه فقط.
    """
    issues: List[str] = []
    structure = output_json.get("discovered_structure") or output_json
    ideas = structure.get("core_ideas") or []

    if not ideas:
        issues.append("لا توجد بطاقات معرفية في المخرج.")
        return False, issues

    for i, idea_a in enumerate(ideas):
        text_a = (idea_a.get("sovereign_idea") or idea_a.get("idea") or "").strip()
        if len(text_a) < 25:
            issues.append(f"البطاقة {i + 1}: الصياغة السيادية قصيرة أو فارغة.")
        if is_likely_truncated(text_a):
            issues.append(f"البطاقة {i + 1}: الصياغة السيادية تبدو مبتورة.")
        layers = idea_a.get("layers") or {}
        for layer_name, layer_text in layers.items():
            if layer_text and is_likely_truncated(str(layer_text)):
                issues.append(f"البطاقة {i + 1}: حقل {layer_name} مبتور.")
        from processors.card_deduplication import intra_card_redundancy_issues

        issues.extend(intra_card_redundancy_issues({**idea_a, "id": i + 1}))
        for j, idea_b in enumerate(ideas):
            if i >= j:
                continue
            text_b = (idea_b.get("sovereign_idea") or idea_b.get("idea") or "").strip()
            similarity = calculate_cosine_similarity(text_a, text_b)
            if similarity > SIMILARITY_THRESHOLD:
                msg = (
                    f"تداخل دلالي بين البطاقة {i + 1} والبطاقة {j + 1} "
                    f"(نسبة {similarity:.0%}) — مراجعة يدوية موصى بها."
                )
                issues.append(msg)
                logger.warning(f"تنبيه حوكمة: {msg}")

    keywords = structure.get("sovereign_keywords") or []
    if not keywords:
        issues.append("قائمة الكلمات السيادية فارغة.")
    for word in keywords:
        w = str(word).strip()
        if is_prohibited_keyword(w) or len(w) <= 2:
            issues.append(f"كلمة سيادية غير مقبولة: «{w}»")
            logger.error(f"فشل اختبار الكلمات السيادية: {w}")

    ledger = structure.get("numerical_ledger") or []
    for entry in ledger:
        if not entry.get("value") or not entry.get("context"):
            issues.append("سجل رقمي ناقص: value أو context فارغ.")

    critical = [i for i in issues if _is_critical_issue(i)]
    passed = len(critical) == 0
    return passed, issues


def merge_overlapping_ideas(ideas: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """v4.2: لا دمج ميكانيكي — استبعاد العناوين المتطابقة حرفياً فقط."""
    from processors.card_deduplication import drop_literal_duplicate_titles

    return drop_literal_duplicate_titles(ideas)

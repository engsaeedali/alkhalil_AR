# -*- coding: utf-8 -*-
"""v4.2 — بطاقات المحاور: صهر v4 كامل عبر LLM؛ احتياط خام بدون اقتطاع ميكانيكي."""

import json
import os
import re
from typing import Any, Callable, Dict, List, Optional

from processors.card_deduplication import intra_card_redundancy_issues, sanitize_consolidation_card
from processors.json_document_parser import SemanticCluster

_V4_PROMPT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "agent", "prompts", "consolidation_v4.txt",
)

_META_BOILERPLATE_RE = re.compile(
    r"(?:القيمة المضافة والتميز|الخلاصة النهائية|النتيجة المرجوة|"
    r"تهدف هذه المنهجية|الوثيقة في شكلها الحالي|يمكن القول إن المنهجية الآن).*$",
    re.DOTALL | re.IGNORECASE,
)

_ENGLISH_PAREN_RE = re.compile(r"\s*\([^)]*[A-Za-z][^)]*\)")


def clean_axis_title(title: str) -> str:
    t = _ENGLISH_PAREN_RE.sub("", title or "").strip()
    t = re.sub(r"\s+", " ", t)
    return t


def _load_v4_prompt() -> str:
    with open(_V4_PROMPT_PATH, encoding="utf-8") as f:
        return f.read()


def _parse_json(content: str) -> Dict[str, Any]:
    clean = content.strip()
    clean = re.sub(r"^```(?:json)?\s*", "", clean)
    clean = re.sub(r"\s*```$", "", clean)
    return json.loads(clean)


def _build_v4_prompt(
    cluster: SemanticCluster,
    custom_intent: Optional[str] = None,
) -> str:
    template = _load_v4_prompt()
    reference_block = ""
    if cluster.canonical:
        reference_block = (
            "مرجع الأصل المعتمد (Grounding Concept — لا تخترع خارج هذا الإطار):\n"
            + cluster.canonical.to_prompt_block()
        )
    custom_block = ""
    if custom_intent and custom_intent.strip():
        custom_block = (
            "توجيه المستخدم (يُطبَّق على الأسلوب فقط — لا يبرر نسخ نفس النص في أكثر من حقل):\n"
            f"{custom_intent.strip()}"
        )
    cluster_text = cluster.combined_text or (cluster.canonical.concept if cluster.canonical else "")
    return template.format(
        reference_block=reference_block or "لا يوجد ملف أصل مرفق — استنتج الهيكل من النص ذاتياً.",
        custom_intent_block=custom_block,
        cluster_id=cluster.id,
        section_title=cluster.title,
        cluster_text=cluster_text or "",
    )


def build_canonical_card(
    cluster: SemanticCluster,
    llm_invoke: Optional[Callable] = None,
    custom_intent: Optional[str] = None,
    style_sample: str = "",
) -> Dict[str, Any]:
    """
    بطاقة محور v4.2:
    - مع LLM: صهر v4 كامل (الطبقات الثلاث توليدياً)
    - بدون LLM: نص المرجع خاماً — دون فرز جمل أو قص
    """
    canonical = cluster.canonical
    if not canonical:
        raise ValueError("cluster بدون مرجع canonical")

    title = clean_axis_title(cluster.title or canonical.title)
    concept = (canonical.concept or "").strip()
    applications = (canonical.applications or "").strip()
    applications = _META_BOILERPLATE_RE.sub("", applications).strip()

    if llm_invoke:
        try:
            prompt = _build_v4_prompt(cluster, custom_intent)
            response = llm_invoke(prompt)
            from utils.token_meter import message_content_to_str

            content = message_content_to_str(getattr(response, "content", response))
            parsed = _parse_json(content)
            card = {
                "section_title": clean_axis_title(parsed.get("section_title") or title),
                "sovereign_idea": (parsed.get("sovereign_idea") or "").strip(),
                "layers": parsed.get("layers") or {},
                "discovered_styles": parsed.get("discovered_styles") or [],
                "id": cluster.id,
                "cluster_source": "canonical_reference",
            }
            return sanitize_consolidation_card(card)
        except Exception:
            pass

    styles = (
        ["قصصية", "توثيقية"]
        if "قصص" in (custom_intent or "") or style_sample
        else ["توثيقية", "توجيهية"]
    )
    card = {
        "section_title": title,
        "sovereign_idea": concept[:500] if concept else title,
        "layers": {
            "conceptual_framework": concept,
            "practical_applications": applications,
        },
        "discovered_styles": styles[:3],
        "id": cluster.id,
        "cluster_source": "canonical_reference",
    }
    return sanitize_consolidation_card(card)


def needs_sovereign_retry(card: Dict[str, Any]) -> bool:
    return bool(intra_card_redundancy_issues(card))

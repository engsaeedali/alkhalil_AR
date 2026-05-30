# -*- coding: utf-8 -*-

import json
import os
import re
from typing import Any, Callable, Dict, List, Optional, Tuple

from processors.json_document_parser import (
    build_semantic_clusters,
    blocks_to_text,
    parse_doc_json_payload,
    SemanticCluster,
)
from processors.consolidation_audit import audit_consolidated_output
from processors.card_deduplication import drop_literal_duplicate_titles, sanitize_consolidation_card
from processors.canonical_card_builder import (
    build_canonical_card,
    clean_axis_title,
)
from processors.sovereign_keywords import build_sovereign_keywords, sanitize_sovereign_keywords
from processors.summarizer import ArabicExtractiveSummarizer
from processors.text_integrity import is_likely_truncated
from utils.logger_config import setup_logger
from utils.token_meter import extract_token_usage, merge_usage_accumulator, message_content_to_str

logger = setup_logger("consolidation_engine")

PROMPT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "agent", "prompts", "consolidation_v4.txt",
)

MAX_LLM_CLUSTERS = 8
MAX_LLM_CALLS_PER_RUN = 10


def _load_prompt_template() -> str:
    with open(PROMPT_PATH, encoding="utf-8") as f:
        return f.read()


def _parse_llm_json(content: str) -> Dict[str, Any]:
    clean = content.strip()
    clean = re.sub(r"^```(?:json)?\s*", "", clean)
    clean = re.sub(r"\s*```$", "", clean)
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        # محاولة إصلاح JSON المبتور (استجابة LLM قطعت عند حد التوكنات)
        repaired = clean
        if repaired.count('"') % 2 == 1:
            repaired += '"'
        open_braces = repaired.count("{") - repaired.count("}")
        open_brackets = repaired.count("[") - repaired.count("]")
        repaired += "]" * max(0, open_brackets) + "}" * max(0, open_braces)
        return json.loads(repaired)


def _card_fields_truncated(card: Dict[str, Any]) -> bool:
    layers = card.get("layers") or {}
    for field in (
        card.get("sovereign_idea"),
        layers.get("conceptual_framework"),
        layers.get("practical_applications"),
    ):
        if field and is_likely_truncated(str(field)):
            return True
    return False


def build_cluster_prompt(
    cluster: SemanticCluster,
    custom_intent: Optional[str] = None,
) -> str:
    template = _load_prompt_template()
    reference_block = ""
    if cluster.canonical:
        reference_block = (
            "مرجع الأصل المعتمد (لا تخترع خارج هذا الإطار):\n"
            + cluster.canonical.to_prompt_block()
        )
    custom_block = ""
    if custom_intent and custom_intent.strip():
        custom_block = (
            f"توجيه المستخدم (يُطبَّق على الأسلوب فقط — لا يبرر نسخ نفس النص في أكثر من حقل):\n"
            f"{custom_intent.strip()}"
        )

    return template.format(
        reference_block=reference_block or "لا يوجد ملف أصل مرفق — استنتج الهيكل من النص ذاتياً.",
        custom_intent_block=custom_block,
        cluster_id=cluster.id,
        section_title=cluster.title,
        cluster_text=cluster.combined_text or "",
    )


def _limit_clusters(clusters: List[SemanticCluster], limit: int = MAX_LLM_CLUSTERS) -> List[SemanticCluster]:
    """حد أقصى للعناقيد — الأطول أولاً مع الإبقاء على التمهيد إن وُجد."""
    if len(clusters) <= limit:
        return clusters
    preamble = [c for c in clusters if c.id == 0 or c.source == "preamble"]
    rest = sorted(
        [c for c in clusters if c not in preamble],
        key=lambda c: c.word_count,
        reverse=True,
    )
    keep = preamble[:1] + rest[: max(1, limit - len(preamble[:1]))]
    keep.sort(key=lambda c: c.id)
    return keep


def _emergency_cards_from_reference(
    reference_json: Any,
    custom_intent: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """بطاقات من الأصل دون LLM — احتياط عند فشل الصهر."""
    from processors.json_document_parser import (
        build_semantic_clusters,
        extract_canonical_axes_from_reference,
        parse_doc_json_payload,
    )

    ref_blocks = parse_doc_json_payload(reference_json)
    axes = extract_canonical_axes_from_reference(ref_blocks)
    if not axes:
        return []
    cards: List[Dict[str, Any]] = []
    for axis in axes:
        cluster = SemanticCluster(
            id=axis.id,
            title=axis.title,
            paragraphs=[],
            canonical=axis,
            source="canonical",
        )
        card = build_canonical_card(cluster, llm_invoke=None, custom_intent=custom_intent)
        cards.append({
            "id": len(cards) + 1,
            "section_title": clean_axis_title(card.get("section_title", axis.title)),
            "sovereign_idea": card.get("sovereign_idea", ""),
            "layers": card.get("layers") or {},
            "discovered_styles": card.get("discovered_styles") or ["توثيقية"],
            "cluster_source": "emergency_canonical",
        })
    return cards


class ConsolidationEngine:
    """محرك الصهر الديناميكي — Map-Reduce عنقودي."""

    def __init__(self, llm_invoke: Callable, usage_accumulator: Optional[Dict[str, Any]] = None):
        self._usage_accumulator = usage_accumulator
        self._raw_llm_invoke = llm_invoke

    def llm_invoke(self, prompt: str):
        if self._usage_accumulator is not None:
            if self._usage_accumulator.get("llm_calls", 0) >= MAX_LLM_CALLS_PER_RUN:
                raise RuntimeError(
                    f"تجاوز حد استدعاءات LLM ({MAX_LLM_CALLS_PER_RUN}). "
                    "ارفع ملف الأصل JSON لمسار المحاور السبعة."
                )
        response = self._raw_llm_invoke(prompt)
        if self._usage_accumulator is not None:
            usage = extract_token_usage(
                response,
                prompt_text=prompt[:12000],
                completion_text=message_content_to_str(getattr(response, "content", "")),
            )
            merge_usage_accumulator(self._usage_accumulator, usage)
        return response

    def prepare_clusters(
        self,
        text: str,
        reference_json: Optional[Any] = None,
    ) -> Tuple[List[SemanticCluster], str, Optional[int]]:
        clusters, canonical, mode = build_semantic_clusters(text, reference_json)
        return clusters, mode, len(canonical) if canonical else None

    def consolidate_cluster(
        self,
        cluster: SemanticCluster,
        custom_intent: Optional[str] = None,
        retry_on_truncation: bool = True,
    ) -> Dict[str, Any]:
        prompt = build_cluster_prompt(cluster, custom_intent)
        response = self.llm_invoke(prompt)
        content = message_content_to_str(
            response.content if hasattr(response, "content") else response
        )
        parsed = _parse_llm_json(content)
        parsed.setdefault("section_title", cluster.title)
        parsed["id"] = cluster.id
        parsed = sanitize_consolidation_card(parsed)

        if retry_on_truncation and _card_fields_truncated(parsed):
            logger.warning(f"بتر مكتشف في العنقود {cluster.id} — إعادة صهر")
            repair_prompt = (
                prompt
                + "\n\nتنبيه حاكم: المخرج السابق بُتر. أعد JSON كاملاً فقط. "
                "كل حقل ينتهي بجملة تامة (. أو ؟). "
                "يُمنع قطع الكلمات أو الآيات أو الاقتباسات. "
                "يُمنع تكرار sovereign_idea في conceptual_framework أو practical_applications. "
                "اختصر إن لزم لكن لا تبتر."
            )
            response = self.llm_invoke(repair_prompt)
            content = message_content_to_str(
                response.content if hasattr(response, "content") else response
            )
            parsed = _parse_llm_json(content)
            parsed.setdefault("section_title", cluster.title)
            parsed["id"] = cluster.id
            parsed = sanitize_consolidation_card(parsed)
        return parsed

    def consolidate_cluster_canonical(
        self,
        cluster: SemanticCluster,
        custom_intent: Optional[str] = None,
    ) -> Dict[str, Any]:
        """وضع مرجعي: صهر كامل عبر v4 — الطبقات الثلاث عبر LLM لا اقتطاع محلي."""
        return self.consolidate_cluster(cluster, custom_intent)

    @staticmethod
    def _preamble_card_local(cluster: SemanticCluster) -> Dict[str, Any]:
        text = cluster.combined_text
        sovereign = (text[:500].strip() if text else cluster.title) or cluster.title
        return sanitize_consolidation_card({
            "section_title": clean_axis_title(cluster.title),
            "sovereign_idea": sovereign,
            "layers": {"conceptual_framework": "", "practical_applications": ""},
            "discovered_styles": ["توثيقية"],
            "id": cluster.id,
        })

    def run(
        self,
        text: str,
        reference_json: Optional[Any] = None,
        custom_intent: Optional[str] = None,
        engine_name: str = "deepseek_v3",
        max_retries: int = 1,
    ) -> Dict[str, Any]:
        clusters, mode, canonical_count = self.prepare_clusters(text, reference_json)

        if not clusters:
            raise ValueError("تعذر بناء عنقود دلالي من النص المدخل.")

        if mode == "dynamic_virtual_schema" and len(clusters) > MAX_LLM_CLUSTERS:
            logger.warning(
                f"تقليص العناقيد من {len(clusters)} إلى {MAX_LLM_CLUSTERS} "
                "(وضع ديناميكي — يُفضّل رفع ملف الأصل)"
            )
            clusters = _limit_clusters(clusters, MAX_LLM_CLUSTERS)

        logger.info(f"🔥 بدء الصهر الديناميكي: {len(clusters)} عنقود | الوضع: {mode}")

        core_ideas: List[Dict[str, Any]] = []
        style_union: List[str] = []
        keyword_pool: List[str] = []

        for cluster in clusters:
            if cluster.word_count < 15 and cluster.canonical is None:
                continue
            try:
                if cluster.canonical is not None and mode == "canonical_guided":
                    card = self.consolidate_cluster_canonical(cluster, custom_intent)
                elif cluster.id == 0 or cluster.source == "preamble":
                    card = self._preamble_card_local(cluster)
                else:
                    card = self.consolidate_cluster(cluster, custom_intent)
                core_ideas.append({
                    "id": len(core_ideas) + 1,
                    "section_title": clean_axis_title(
                        card.get("section_title", cluster.title)
                    ),
                    "sovereign_idea": card.get("sovereign_idea", ""),
                    "layers": card.get("layers") or {
                        "conceptual_framework": "",
                        "practical_applications": "",
                    },
                    "discovered_styles": card.get("discovered_styles") or [],
                    "cluster_source": cluster.source,
                })
                for s in card.get("discovered_styles") or []:
                    if s and s not in style_union:
                        style_union.append(s)
                for kw in card.get("sovereign_keywords") or []:
                    if kw and kw not in keyword_pool:
                        keyword_pool.append(kw)
            except Exception as exc:
                logger.error(f"فشل صهر العنقود {cluster.id}: {exc}")
                if cluster.canonical:
                    core_ideas.append({
                        "id": len(core_ideas) + 1,
                        "section_title": cluster.canonical.title,
                        "sovereign_idea": cluster.canonical.concept or cluster.title,
                        "layers": {
                            "conceptual_framework": cluster.canonical.concept,
                            "practical_applications": cluster.canonical.applications,
                        },
                        "discovered_styles": ["توثيقية"],
                        "cluster_source": "fallback_canonical",
                    })

        if not core_ideas and reference_json is not None:
            logger.warning("فشل الصهر — بناء بطاقات احتياطية من ملف الأصل")
            core_ideas = _emergency_cards_from_reference(reference_json, custom_intent)

        core_ideas = drop_literal_duplicate_titles(core_ideas)

        plain_text = text
        if text.strip().startswith("{"):
            try:
                plain_text = blocks_to_text(parse_doc_json_payload(text))
            except Exception:
                plain_text = text

        numerical_ledger = ArabicExtractiveSummarizer.extract_numbers(plain_text)

        sovereign_keywords = build_sovereign_keywords(
            core_ideas=core_ideas,
            source_text=plain_text,
            llm_candidates=sanitize_sovereign_keywords(keyword_pool),
            top_k=7,
        )
        if len(sovereign_keywords) < 3:
            sovereign_keywords = build_sovereign_keywords(
                core_ideas=core_ideas,
                source_text=plain_text,
                llm_candidates=None,
                top_k=7,
            )

        discovered_structure = {
            "core_ideas": core_ideas,
            "numerical_ledger": numerical_ledger[:15],
            "sovereign_keywords": sovereign_keywords,
            "discovered_styles": style_union,
            "_metadata": {
                "mode": "autonomous_reverse_consolidation",
                "clustering_mode": mode,
                "clusters_processed": len(clusters),
                "canonical_axes_reference": canonical_count,
                "engine_utilized": engine_name,
                "tokens_consumed": 0,
            },
        }

        output = {"discovered_structure": discovered_structure}
        passed, issues = audit_consolidated_output(output)

        discovered_structure["_metadata"]["audit_passed"] = passed
        if issues:
            discovered_structure["_metadata"]["audit_issues"] = issues
            discovered_structure["_metadata"]["audit_warnings"] = issues

        return output


def build_consolidation_export(discovered_structure: Dict[str, Any]) -> str:
    ideas = discovered_structure.get("core_ideas") or []
    lines = []
    for idea in ideas:
        title = idea.get("section_title", "")
        sovereign = idea.get("sovereign_idea", "")
        layers = idea.get("layers") or {}
        styles = ", ".join(idea.get("discovered_styles") or [])
        lines.append(f"### {idea.get('id', '')}. {title}")
        lines.append(f"**الصياغة السيادية:** {sovereign}")
        if layers.get("conceptual_framework"):
            lines.append(f"- **الإطار المفاهيمي:** {layers['conceptual_framework']}")
        if layers.get("practical_applications"):
            lines.append(f"- **التطبيقات العملية:** {layers['practical_applications']}")
        if styles:
            lines.append(f"- **الأنماط المكتشفة:** {styles}")
        lines.append("")

    numbers = discovered_structure.get("numerical_ledger") or []
    num_lines = [f"- **{n['value']}**: {n['context']}" for n in numbers[:15]]
    keywords = discovered_structure.get("sovereign_keywords") or []
    meta = discovered_structure.get("_metadata") or {}
    token_usage = meta.get("token_usage") or {}
    total_tkn = token_usage.get("total_tokens") or meta.get("tokens_consumed", 0)
    in_tkn = token_usage.get("input_tokens", "—")
    out_tkn = token_usage.get("output_tokens", "—")
    calls = token_usage.get("llm_calls", "—")
    est_note = " (تقدير)" if token_usage.get("estimated") else ""

    return f"""# جوهر المخطوطة — الصهر الديناميكي v4.0 | مدونة الخليل

## البطاقات المعرفية السيادية
{chr(10).join(lines) if lines else '- لم يُستخلص بعد.'}

## الكشاف الرقمي
{chr(10).join(num_lines) if num_lines else '- لا توجد أرقام بارزة.'}

## الكلمات السيادية
{', '.join(keywords) if keywords else '-'}

---
*الوضع:* {meta.get('clustering_mode', 'unknown')} | *المحرك:* {meta.get('engine_utilized', 'unknown')}
*التوكنات:* {total_tkn}{est_note} (مدخل: {in_tkn} | مخرج: {out_tkn} | استدعاءات: {calls})
*التدقيق:* {'ناجح' if meta.get('audit_passed') else 'تحذيرات'}
"""

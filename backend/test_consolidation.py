# -*- coding: utf-8 -*-
"""اختبارات محلية لطبقة الفرز والتدقيق — بدون LLM."""

import json
import os
import sys

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from processors.json_document_parser import (
    build_semantic_clusters,
    extract_canonical_axes_from_reference,
    parse_doc_json_payload,
)
from processors.consolidation_audit import audit_consolidated_output, calculate_cosine_similarity


def test_canonical_clustering():
    docs_dir = os.path.join(os.path.dirname(current_dir), "documents")
    orig_path = os.path.join(docs_dir, "أصل منهجية المحاور السبعة للبناء.json")
    story_path = os.path.join(docs_dir, "قصة محاور البناء السبعة.json")

    with open(orig_path, encoding="utf-8") as f:
        orig = json.load(f)
    with open(story_path, encoding="utf-8") as f:
        story = json.load(f)

    ref_blocks = parse_doc_json_payload(orig)
    axes = extract_canonical_axes_from_reference(ref_blocks)
    assert len(axes) == 7, f"Expected 7 axes, got {len(axes)}"

    clusters, canonical, mode = build_semantic_clusters(story, orig)
    assert mode == "canonical_guided"
    assert len(clusters) >= 7, f"Expected >=7 clusters, got {len(clusters)}"
    print(f"OK Canonical clustering: {len(clusters)} clusters, {len(axes)} axes")


def test_dynamic_clustering():
    text = "مقدمة عامة\n\n" + "\n\n".join(
        f"القسم {i}: فكرة رئيسية {i}\n" + f"تفاصيل الفقرة {i} " * 20
        for i in range(1, 6)
    )
    clusters, _, mode = build_semantic_clusters(text, None)
    assert len(clusters) >= 3
    assert len(clusters) <= 12
    print(f"OK Dynamic clustering: {len(clusters)} clusters ({mode})")


def test_story_without_ref_not_88_clusters():
    import json
    import os
    docs = os.path.join(os.path.dirname(os.path.dirname(__file__)), "documents")
    story_path = os.path.join(docs, "قصة محاور البناء السبعة.json")
    if not os.path.isfile(story_path):
        return
    with open(story_path, encoding="utf-8") as f:
        story = json.load(f)
    from processors.json_document_parser import blocks_to_text, parse_doc_json_payload

    text = blocks_to_text(parse_doc_json_payload(story))
    clusters, _, mode = build_semantic_clusters(text, None)
    assert len(clusters) <= 12, f"expected <=12 clusters, got {len(clusters)}"
    print(f"OK Story dynamic cap: {len(clusters)} clusters ({mode})")


def test_audit_pass_and_fail():
    good = {
        "discovered_structure": {
            "core_ideas": [
                {"id": 1, "sovereign_idea": "إن التخطيط الاستراتيجي الصارم يحمي المشاريع من الانهيار المفاجئ تحت المتغيرات."},
                {"id": 2, "sovereign_idea": "تأسيس الثقة الاجتماعية قبل الإطلاق شرط حاكم لنجاح أي تحول مؤسسي."},
            ],
            "sovereign_keywords": ["التخطيط", "الثقة", "التحول", "المؤسسات", "الاستراتيجية"],
            "numerical_ledger": [{"value": "7", "context": "عدد المحاور"}],
        }
    }
    passed, issues = audit_consolidated_output(good)
    assert passed, issues

    bad = good.copy()
    bad["discovered_structure"] = dict(good["discovered_structure"])
    bad["discovered_structure"]["sovereign_keywords"] = ["لا", "بل", "منهجية"]
    passed2, _ = audit_consolidated_output(bad)
    assert not passed2

    sim = calculate_cosine_similarity(
        "إن التخطيط الاستراتيجي يحمي المشاريع",
        "إن التخطيط الاستراتيجي يحمي المشاريع الكبرى",
    )
    assert sim > 0.5
    print("OK Audit layer")


def test_sovereign_keywords_quality():
    from processors.sovereign_keywords import build_sovereign_keywords, is_prohibited_keyword, _strip_al

    ideas = [
        {
            "id": 1,
            "section_title": "المحور الأول: تمهيد الطريق",
            "sovereign_idea": "أن التخطيط الاستراتيجي الصارم وتهيئة الجاهزية الاجتماعية شرط حاكم.",
            "layers": {
                "conceptual_framework": "بناء الثقة ورأس المال الاجتماعي",
                "practical_applications": "نموذج الجاهزية الاستراتيجية",
            },
        },
    ]
    noisy_source = (
        "الذي يعني ضرورة لضمان تكييف تحديد التي في البناء "
        "منهجية الحوكمة والشرعية والتمكين والثقة الاستراتيجية "
        * 40
    )
    kw = build_sovereign_keywords(ideas, source_text=noisy_source)
    assert len(kw) >= 3
    banned = {
        "لم", "ولا", "هل", "قبل", "الذي", "التي", "يعني", "لضمان",
        "ضرورة", "ضمان", "تحديد", "تكييف",
    }
    for w in kw:
        assert not is_prohibited_keyword(w), w
        assert w not in banned, f"weak keyword leaked: {w}"
        assert _strip_al(w) not in banned, f"weak keyword leaked: {w}"
    joined = " ".join(kw)
    assert any(
        term in joined
        for term in ("التخطيط", "تخطيط", "الثقة", "ثقة", "الجاهزية", "جاهزية", "الحوكمة", "حوكمة")
    ), f"expected domain terms, got {kw}"
    print("OK Sovereign keywords quality")


def test_token_meter_openai_format():
    from utils.token_meter import extract_token_usage

    class FakeResponse:
        content = "test output"
        usage_metadata = {}
        response_metadata = {
            "token_usage": {
                "prompt_tokens": 1200,
                "completion_tokens": 350,
                "total_tokens": 1550,
            }
        }

    usage = extract_token_usage(FakeResponse(), prompt_text="x" * 100)
    assert usage["total_tokens"] == 1550
    assert usage["input_tokens"] == 1200
    assert usage["output_tokens"] == 350
    assert usage["estimated"] is False
    print("OK Token meter OpenAI format")


def test_token_meter_zero_provider_usage_fallback():
    from utils.token_meter import extract_token_usage

    class R:
        content = "output text here"
        usage_metadata = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
        response_metadata = {}

    usage = extract_token_usage(R(), prompt_text="input " * 80, completion_text="output " * 40)
    assert usage["total_tokens"] > 0
    assert usage.get("estimated") is True


def test_token_meter_estimation_fallback():
    from utils.token_meter import extract_token_usage

    class EmptyMeta:
        content = "output text here"
        usage_metadata = None
        response_metadata = {}

    usage = extract_token_usage(EmptyMeta(), prompt_text="prompt text here")
    assert usage["total_tokens"] > 0
    assert usage["estimated"] is True
    print("OK Token meter estimation")


if __name__ == "__main__":
    test_canonical_clustering()
    test_dynamic_clustering()
    test_story_without_ref_not_88_clusters()
    test_audit_pass_and_fail()
    test_sovereign_keywords_quality()
    test_token_meter_openai_format()
    test_token_meter_zero_provider_usage_fallback()
    test_token_meter_estimation_fallback()
    print("All consolidation unit tests passed.")

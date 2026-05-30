# -*- coding: utf-8 -*-
import json
import os
import sys

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from processors.canonical_card_builder import (
    build_canonical_card,
    clean_axis_title,
)
from processors.card_deduplication import drop_literal_duplicate_titles, intra_card_redundancy_issues
from processors.json_document_parser import (
    CanonicalAxis,
    SemanticCluster,
    build_semantic_clusters,
)
from processors.sovereign_keywords import build_sovereign_keywords, is_prohibited_keyword


def test_clean_title():
    t = clean_axis_title("المحور الأول: بناء (Paving the Way)")
    assert "Paving" not in t


def test_practical_literal_title_dedupe():
    ideas = [
        {"id": 1, "section_title": "المحور الأول", "sovereign_idea": "أ"},
        {"id": 2, "section_title": "المحور الأول", "sovereign_idea": "ب"},
    ]
    out = drop_literal_duplicate_titles(ideas)
    assert len(out) == 1


def test_canonical_card_no_layer_dup():
    axis = CanonicalAxis(
        id=1,
        title="المحور الأول: تمهيد الطريق",
        concept="المفهوم: البناء يبدأ بالثقة. الفلسفة العميقة هي تهيئة البيئة.",
        applications=(
            "في البناء المادي: تمهيد الطريق. "
            "في البناء البشري: بناء الثقة. "
            "في البناء الاجتماعي: قنوات التواصل."
        ),
    )
    cluster = SemanticCluster(
        id=1,
        title=axis.title,
        paragraphs=["فقرة فوضوية من القصة"],
        canonical=axis,
        source="canonical",
    )
    card = build_canonical_card(cluster, llm_invoke=None)
    assert card["sovereign_idea"]
    assert card["layers"]["conceptual_framework"]
    assert card["layers"]["practical_applications"]
    assert "في البناء المادي" in card["layers"]["practical_applications"]


def test_keywords_no_english():
    ideas = [
        {
            "section_title": "المحور الأول: بناء الطريق (Paving)",
            "sovereign_idea": "أن الثقة والجاهزية الاستراتيجية شرطان لنجاح التخطيط العمراني.",
            "layers": {
                "conceptual_framework": "رأس المال الاجتماعي يمهد للبناء.",
                "practical_applications": "في البناء المادي: بنى تحتية.",
            },
        }
    ]
    kw = build_sovereign_keywords(ideas, source_text="Building Construction Available " * 20)
    for w in kw:
        assert not is_prohibited_keyword(w)
        assert "Building" not in w and "Available" not in w


if __name__ == "__main__":
    docs = os.path.join(os.path.dirname(current_dir), "documents")
    orig = os.path.join(docs, "أصل منهجية المحاور السبعة للبناء.json")
    story = os.path.join(docs, "قصة محاور البناء السبعة.json")
    if os.path.isfile(orig) and os.path.isfile(story):
        with open(orig, encoding="utf-8") as f:
            ref = json.load(f)
        with open(story, encoding="utf-8") as f:
            story_doc = json.load(f)
        from processors.json_document_parser import blocks_to_text, parse_doc_json_payload

        story_text = blocks_to_text(parse_doc_json_payload(story_doc))
        clusters, _, mode = build_semantic_clusters(story_text, ref)
        assert mode == "canonical_guided"
        c0 = next(c for c in clusters if c.canonical is not None)
        card = build_canonical_card(c0, llm_invoke=None)
        assert card["layers"]["practical_applications"]
        print("OK integration with reference JSON")

    test_clean_title()
    test_practical_literal_title_dedupe()
    test_canonical_card_no_layer_dup()
    test_keywords_no_english()
    print("OK canonical card tests")

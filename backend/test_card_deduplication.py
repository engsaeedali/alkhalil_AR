# -*- coding: utf-8 -*-

import os
import sys

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from processors.card_deduplication import (
    drop_literal_duplicate_titles,
    intra_card_redundancy_issues,
    sanitize_consolidation_card,
)


def test_drop_literal_duplicate_titles():
    ideas = [
        {"id": 1, "section_title": "المحور الأول: تمهيد الطريق", "sovereign_idea": "أ"},
        {"id": 2, "section_title": "المحور الأول: تمهيد الطريق", "sovereign_idea": "ب"},
        {"id": 3, "section_title": "المحور الثاني: بناء", "sovereign_idea": "ج"},
    ]
    out = drop_literal_duplicate_titles(ideas)
    assert len(out) == 2
    assert out[0]["id"] == 1
    assert out[1]["id"] == 2


def test_sanitize_card_pass_through():
    card = {
        "sovereign_idea": "مبدأ التخطيط يحمي المشاريع من الانهيار.",
        "layers": {
            "conceptual_framework": "مبدأ التخطيط يحمي المشاريع من الانهيار.",
            "practical_applications": "في البناء المادي: أ. في البناء البشري: ب.",
        },
    }
    clean = sanitize_consolidation_card(card)
    assert clean["layers"]["conceptual_framework"] == card["layers"]["conceptual_framework"]
    assert clean["layers"]["practical_applications"] == card["layers"]["practical_applications"]


def test_intra_card_warnings_only():
    card = {
        "id": 1,
        "sovereign_idea": "نص سيادي طويل بما يكفي للاختبار الدلالي هنا.",
        "layers": {
            "conceptual_framework": "نص سيادي طويل بما يكفي للاختبار الدلالي هنا.",
            "practical_applications": "تطبيقات عملية وافية.",
        },
    }
    issues = intra_card_redundancy_issues(card)
    assert any("الإطار المفاهيمي" in i for i in issues)


if __name__ == "__main__":
    test_drop_literal_duplicate_titles()
    test_sanitize_card_pass_through()
    test_intra_card_warnings_only()
    print("OK card deduplication v4.2")

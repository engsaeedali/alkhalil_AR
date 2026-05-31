# -*- coding: utf-8 -*-
"""اختبارات تنظيف نص PDF العربي / InDesign."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from processors.pdf_arabic_cleanup import (
    clean_pdf_arabic_text,
    collapse_arabic_marks,
    merge_broken_lines,
)


INDESIGN_SAMPLE = """2 
الأرض الصلبة
(إلى الجذورِِ التي تحملُُ الغابةََ ولا يراها أحد 
إلى الذين أدرِكوا أنََّ الحياةَ ليست نزهةًَ عابرة، بلُ هي 
« 
إلى كلِِّ يدٍ بََنَت صرحاً في صمتٍ، بينما العالمُُ يضجُُّ بالهدم 
3 
الفهرس
الإهداء
5
الباًب الأول: الأساًس الفكري لماًذا تبني أرضاًً صلبة؟ 
9
16
الباًب الثاًني: أركان الأرض الصلبة بناًء رأس الماًل المتكامل
 الركن الأول: رأس الماًل البشري الاستثماًر في جوهرك 26"""


def test_collapse_indesign_marks():
    assert collapse_arabic_marks("بََنَت") == "بَنَت"
    assert "ِِ" not in collapse_arabic_marks("الجذورِِ")


def test_clean_indesign_sample():
    out = clean_pdf_arabic_text(INDESIGN_SAMPLE)
    assert "2\n" not in out or "2 " not in out.split("\n")[0]
    assert "ُُ" not in out
    assert "بََنَت" not in out
    assert "إلى الجذور" in out
    assert "الفهرس" in out


def test_merge_dedication_lines():
    lines = [
        "(إلى الجذور التي تحمل الغابة ولا يراها أحد",
        "إلى الذين أدركوا أن الحياة ليست نزهة عابرة، بل هي",
        "«",
        "إلى كل يد بنت صرحاً في صمت",
    ]
    merged = merge_broken_lines(lines)
    body = " ".join(ln for ln in merged if ln)
    assert "«" in body
    assert body.count("إلى") >= 2


if __name__ == "__main__":
    test_collapse_indesign_marks()
    test_clean_indesign_sample()
    test_merge_dedication_lines()
    print("ok")

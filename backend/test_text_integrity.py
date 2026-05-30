# -*- coding: utf-8 -*-

from processors.text_integrity import is_likely_truncated, clip_at_boundary


def test_truncation_detection():
    assert is_likely_truncated("الاجتماعي اللازم لتطبيق الح") is True
    assert is_likely_truncated("كالثقة المفرطة أو التفكير الجماعي، مم") is True
    assert is_likely_truncated('كما في قوله تعالى: " أَفَمَنْ أَسَّسَ') is True
    assert is_likely_truncated("إن التخطيط الاستراتيجي الصارم يحمي المشاريع من الانهيار.") is False
    print("OK truncation detection")


def test_clip_boundary():
    long_ctx = "الاجتماعي " + "كلمة " * 80 + "نهاية."
    clipped = clip_at_boundary(long_ctx, 120)
    assert not clipped.endswith("الح")
    assert len(clipped) <= 125
    print("OK clip boundary")


if __name__ == "__main__":
    test_truncation_detection()
    test_clip_boundary()

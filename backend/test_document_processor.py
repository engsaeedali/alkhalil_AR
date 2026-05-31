# -*- coding: utf-8 -*-
"""اختبارات استخراج النص الصافي v4.7."""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from processors.document_processor import DocumentProcessor, _json_sections_to_text


DOC_JSON = {
    "metadata": {"source": "Docx_to_JSON_Engine"},
    "content": {
        "sections": [
            {"type": "paragraph", "text": "فقرة أولى"},
            {"type": "paragraph", "text": "فقرة ثانية", "items": ["بند واحد"]},
        ]
    },
}


def test_json_sections_to_text():
    text = _json_sections_to_text(DOC_JSON)
    assert "فقرة أولى" in text
    assert "فقرة ثانية" in text
    assert "بند واحد" in text


def test_extract_json_docx_format():
    raw = json.dumps(DOC_JSON, ensure_ascii=False).encode("utf-8")
    text, fmt = DocumentProcessor.extract_text(raw, "sample.json")
    assert fmt == "JSON"
    assert "فقرة أولى" in text
    assert "بند واحد" in text


def test_extract_plain_utf8():
    raw = "نص عربي صافٍ".encode("utf-8")
    text, fmt = DocumentProcessor.extract_text(raw, "note.txt")
    assert text == "نص عربي صافٍ"
    assert fmt == "نص"


def test_extract_json_text_field():
    raw = json.dumps({"text": "محتوى مباشر"}, ensure_ascii=False).encode("utf-8")
    text, _ = DocumentProcessor.extract_text(raw, "direct.json")
    assert text == "محتوى مباشر"


def test_extract_pdf_text_layer():
    try:
        import fitz
    except ImportError:
        pytest.skip("pymupdf not installed")

    doc = fitz.open()
    p = doc.new_page()
    p.insert_text((72, 72), "نص عربي تجريبي من PDF", fontsize=14)
    raw = doc.tobytes()
    doc.close()

    text, fmt = DocumentProcessor.extract_text(raw, "sample.pdf")
    assert fmt == "PDF"
    assert "نص عربي" in text


def test_sample_story_json_if_present():
    path = ROOT.parent / "documents" / "قصة محاور البناء السبعة.json"
    if not path.is_file():
        pytest.skip("sample document not available")
    raw = path.read_bytes()
    text, fmt = DocumentProcessor.extract_text(raw, path.name)
    assert fmt == "JSON"
    assert len(text) > 10_000
    assert "منهجية المحاور السبعة" in text

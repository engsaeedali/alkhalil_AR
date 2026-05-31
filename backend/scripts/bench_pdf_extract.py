# -*- coding: utf-8 -*-
"""قياس زمن استخراج PDF — python scripts/bench_pdf_extract.py [path.pdf]"""
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from processors.document_processor import DocumentProcessor


def make_heavy_pdf(pages: int = 80) -> bytes:
    import fitz

    doc = fitz.open()
    for i in range(pages):
        p = doc.new_page()
        p.insert_text(
            (72, 72),
            f"صفحة {i + 1}: في عالم الاقتصاد تُقاس ثروات الأمم بما تملكه من موارد. " * 8,
            fontsize=11,
        )
    raw = doc.tobytes()
    doc.close()
    return raw


def main() -> None:
    if len(sys.argv) > 1:
        path = Path(sys.argv[1])
        raw = path.read_bytes()
        label = path.name
    else:
        raw = make_heavy_pdf(80)
        label = f"synthetic-{len(raw) // 1024}KB"

    t0 = time.perf_counter()
    text, fmt = DocumentProcessor.extract_text(raw, "bench.pdf")
    ms = (time.perf_counter() - t0) * 1000
    print(f"{label}: {fmt}, {len(text)} chars, {ms:.0f} ms ({ms/1000:.1f}s)")


if __name__ == "__main__":
    main()

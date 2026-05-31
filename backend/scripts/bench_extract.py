# -*- coding: utf-8 -*-
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

t0 = time.perf_counter()
from processors.document_processor import DocumentProcessor  # noqa: E402

t1 = time.perf_counter()

docs = Path(__file__).resolve().parents[2] / "documents"
for path in sorted(docs.glob("*.json")):
    raw = path.read_bytes()
    t2 = time.perf_counter()
    text, _ = DocumentProcessor.extract_text(raw, path.name)
    t3 = time.perf_counter()
    print(
        f"{path.name}: {len(raw)} B -> {len(text)} chars | "
        f"extract={(t3 - t2) * 1000:.1f}ms"
    )

print(f"module_import={(t1 - t0) * 1000:.0f}ms")

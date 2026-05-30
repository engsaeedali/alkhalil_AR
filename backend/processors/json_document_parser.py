# -*- coding: utf-8 -*-

import json
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from processors.summarizer import ArabicExtractiveSummarizer


AXIS_ORDINALS = {
    "أول": 1, "الأول": 1,
    "ثاني": 2, "الثاني": 2,
    "ثالث": 3, "الثالث": 3,
    "رابع": 4, "الرابع": 4,
    "خامس": 5, "الخامس": 5,
    "سادس": 6, "السادس": 6,
    "سابع": 7, "السابع": 7,
}

AXIS_HEADER_RE = re.compile(
    r"(?:^\d+\.\s*)?المحور\s+(?:ال)?(أول|ثاني|ثالث|رابع|خامس|سادس|سابع|الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع)\s*[:\-—]",
    re.MULTILINE,
)

HEADING_CANDIDATE_RE = re.compile(
    r"^(?:القسم|الفصل|المحور|\d+\.|【).{3,120}$"
)


@dataclass
class DocumentBlock:
    index: int
    text: str
    block_type: str = "paragraph"


@dataclass
class CanonicalAxis:
    id: int
    title: str
    concept: str = ""
    applications: str = ""

    def to_prompt_block(self) -> str:
        parts = [f"المحور {self.id}: {self.title}"]
        if self.concept:
            parts.append(f"المفهوم المرجعي: {self.concept[:1200]}")
        if self.applications:
            parts.append(f"التطبيقات المرجعية: {self.applications[:1500]}")
        return "\n".join(parts)


@dataclass
class SemanticCluster:
    id: int
    title: str
    paragraphs: List[str] = field(default_factory=list)
    canonical: Optional[CanonicalAxis] = None
    source: str = "dynamic"

    @property
    def combined_text(self) -> str:
        return "\n\n".join(self.paragraphs)

    @property
    def word_count(self) -> int:
        return len(self.combined_text.split())


def parse_doc_json_payload(payload: Any) -> List[DocumentBlock]:
    """استخراج كتل النص من JSON المُنتَج من Docx_to_JSON_Engine أو نص خام."""
    if isinstance(payload, str):
        payload = payload.strip()
        if payload.startswith("{"):
            payload = json.loads(payload)
        else:
            paragraphs = [p.strip() for p in payload.split("\n") if p.strip()]
            return [DocumentBlock(i, t) for i, t in enumerate(paragraphs)]

    if isinstance(payload, dict):
        sections = payload.get("content", {}).get("sections", [])
        blocks: List[DocumentBlock] = []
        idx = 0
        for section in sections:
            if section.get("text"):
                blocks.append(DocumentBlock(idx, section["text"].strip(), section.get("type", "paragraph")))
                idx += 1
            for item in section.get("items") or []:
                if item and str(item).strip():
                    blocks.append(DocumentBlock(idx, str(item).strip(), "list_item"))
                    idx += 1
        if blocks:
            return blocks
        raw = payload.get("text") or payload.get("content")
        if isinstance(raw, str):
            return parse_doc_json_payload(raw)

    raise ValueError("تعذر استخراج فقرات من بنية JSON المرفقة.")


def blocks_to_text(blocks: List[DocumentBlock]) -> str:
    return "\n\n".join(b.text for b in blocks)


def _normalize_axis_ordinal(token: str) -> Optional[int]:
    token = token.strip()
    return AXIS_ORDINALS.get(token) or AXIS_ORDINALS.get(f"ال{token}")


def _detect_axis_id(text: str) -> Optional[int]:
    match = AXIS_HEADER_RE.search(text)
    if match:
        return _normalize_axis_ordinal(match.group(1))
    return None


def _is_heading_candidate(text: str) -> bool:
    t = text.strip()
    if len(t) < 8 or len(t) > 180:
        return False
    if t.endswith(":") or t.endswith("："):
        return True
    if HEADING_CANDIDATE_RE.match(t):
        return True
    if "المحور" in t and len(t.split()) <= 18:
        return True
    return False


def extract_canonical_axes_from_reference(blocks: List[DocumentBlock]) -> List[CanonicalAxis]:
    """بناء الهيكل المرجعي من وثيقة الأصل (منهجية المحاور السبعة)."""
    axes: Dict[int, CanonicalAxis] = {}
    current_id: Optional[int] = None
    concept_buf: List[str] = []
    app_buf: List[str] = []
    mode: Optional[str] = None

    def flush_buffers():
        nonlocal current_id, concept_buf, app_buf, mode
        if current_id and current_id in axes:
            if concept_buf:
                axes[current_id].concept = " ".join(concept_buf)[:2500]
            if app_buf:
                axes[current_id].applications = " ".join(app_buf)[:3500]
        concept_buf, app_buf = [], []
        mode = None

    for block in blocks:
        text = block.text.strip()
        axis_id = _detect_axis_id(text)
        numbered = re.match(r"^\d+\.\s*المحور", text)

        if axis_id and (numbered or "المحور" in text[:40]):
            flush_buffers()
            title = re.sub(r"^\d+\.\s*", "", text).strip()
            current_id = axis_id
            axes[current_id] = CanonicalAxis(id=current_id, title=title)
            continue

        if current_id is None:
            continue

        if text.startswith("المفهوم:") or text.startswith("المفهوم："):
            mode = "concept"
            tail = text.split(":", 1)[-1].strip()
            if tail:
                concept_buf.append(tail)
            continue

        if "تطبيقاته العملية" in text or text.startswith("تطبيقات"):
            mode = "applications"
            tail = re.split(r"[:：]", text, maxsplit=1)
            if len(tail) > 1 and tail[1].strip():
                app_buf.append(tail[1].strip())
            continue

        if block.block_type == "list_item":
            if "المفهوم" in text[:20]:
                mode = "concept"
                concept_buf.append(re.split(r"[:：]", text, maxsplit=1)[-1].strip())
            elif "تطبيق" in text[:30]:
                mode = "applications"
                app_buf.append(re.split(r"[:：]", text, maxsplit=1)[-1].strip())
            elif mode == "concept":
                concept_buf.append(text)
            elif mode == "applications":
                app_buf.append(text)
            else:
                concept_buf.append(text)
        elif mode == "concept":
            concept_buf.append(text)
        elif mode == "applications":
            app_buf.append(text)

    flush_buffers()
    return [axes[i] for i in sorted(axes.keys())]


def cluster_by_canonical_axes(
    blocks: List[DocumentBlock],
    canonical_axes: List[CanonicalAxis],
) -> List[SemanticCluster]:
    """ربط فقرات المخطوطة الفوضوية بالمحاور المرجعية عند توفر الأصل."""
    axis_ids = {a.id for a in canonical_axes}
    canonical_map = {a.id: a for a in canonical_axes}
    buckets: Dict[int, List[str]] = {i: [] for i in axis_ids}
    preamble: List[str] = []
    current_axis: Optional[int] = None

    for block in blocks:
        text = block.text.strip()
        if not text:
            continue
        detected = _detect_axis_id(text)
        if detected in axis_ids:
            current_axis = detected
            buckets[current_axis].append(text)
            continue
        if current_axis is not None:
            buckets[current_axis].append(text)
        else:
            preamble.append(text)

    if preamble:
        buckets.setdefault(0, [])
        buckets[0] = preamble + buckets.get(0, [])

    clusters: List[SemanticCluster] = []
    for axis in canonical_axes:
        paras = buckets.get(axis.id, [])
        if not paras:
            continue
        clusters.append(
            SemanticCluster(
                id=axis.id,
                title=axis.title,
                paragraphs=paras,
                canonical=axis,
                source="canonical",
            )
        )

    if buckets.get(0):
        clusters.insert(
            0,
            SemanticCluster(
                id=0,
                title="التأسيس والرؤية الشمولية",
                paragraphs=buckets[0],
                source="preamble",
            ),
        )
    return clusters


def _token_set(text: str) -> set:
    return set(ArabicExtractiveSummarizer._clean_and_tokenize(text))


def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def cluster_by_dynamic_salience(blocks: List[DocumentBlock], target_clusters: int = 7) -> List[SemanticCluster]:
    """بناء هيكل افتراضي ديناميكي عند غياب ملف الأصل."""
    headings: List[Tuple[int, str]] = []
    for block in blocks:
        if _is_heading_candidate(block.text):
            headings.append((block.index, block.text.strip()))

    # كثرة العناوين الزائفة (مثل قصة المحاور المكررة) → لا نُنشئ عنقوداً لكل سطر
    if 3 <= len(headings) <= 12:
        clusters: List[SemanticCluster] = []
        for i, (start_idx, title) in enumerate(headings):
            end_idx = headings[i + 1][0] if i + 1 < len(headings) else len(blocks)
            paras = [b.text for b in blocks if start_idx <= b.index < end_idx and b.text.strip()]
            if paras:
                clusters.append(
                    SemanticCluster(id=i + 1, title=title[:160], paragraphs=paras, source="heading")
                )
        if clusters:
            return clusters

    paragraphs = [b.text for b in blocks if len(b.text.strip()) > 40]
    if not paragraphs:
        paragraphs = [b.text for b in blocks]

    n = len(paragraphs)
    if n <= target_clusters:
        return [
            SemanticCluster(id=i + 1, title=f"محور {i + 1}", paragraphs=[p], source="fallback")
            for i, p in enumerate(paragraphs)
        ]

    chunk_size = max(1, n // target_clusters)
    clusters = []
    for i in range(target_clusters):
        start = i * chunk_size
        end = n if i == target_clusters - 1 else (i + 1) * chunk_size
        chunk = paragraphs[start:end]
        if not chunk:
            continue
        title = chunk[0][:100] + ("…" if len(chunk[0]) > 100 else "")
        clusters.append(SemanticCluster(id=i + 1, title=title, paragraphs=chunk, source="salience"))
    return clusters


def assign_orphan_paragraphs(
    blocks: List[DocumentBlock],
    clusters: List[SemanticCluster],
) -> List[SemanticCluster]:
    """إعادة توزيع الفقرات غير المربوطة وفق التشابه المعجمي."""
    assigned_indices = set()
    for cluster in clusters:
        for block in blocks:
            if block.text in cluster.paragraphs:
                assigned_indices.add(block.index)

    orphans = [b for b in blocks if b.index not in assigned_indices and len(b.text.strip()) > 30]
    if not orphans or not clusters:
        return clusters

    for orphan in orphans:
        o_tokens = _token_set(orphan.text)
        best_idx = 0
        best_score = -1.0
        for idx, cluster in enumerate(clusters):
            score = _jaccard(o_tokens, _token_set(cluster.combined_text[:2000]))
            if score > best_score:
                best_score = score
                best_idx = idx
        clusters[best_idx].paragraphs.append(orphan.text)
    return clusters


def build_semantic_clusters(
    text: str,
    reference_json: Optional[Any] = None,
) -> Tuple[List[SemanticCluster], Optional[List[CanonicalAxis]], str]:
    """
    طبقة الفرز والتجميع العنقودي.
    يُرجع: (clusters, canonical_axes, mode)
    """
    blocks = parse_doc_json_payload(text if not isinstance(text, dict) else text)
    canonical_axes: Optional[List[CanonicalAxis]] = None

    if reference_json is not None:
        ref_blocks = parse_doc_json_payload(reference_json)
        canonical_axes = extract_canonical_axes_from_reference(ref_blocks)
        if canonical_axes:
            clusters = cluster_by_canonical_axes(blocks, canonical_axes)
            clusters = assign_orphan_paragraphs(blocks, clusters)
            return clusters, canonical_axes, "canonical_guided"

    clusters = cluster_by_dynamic_salience(blocks)
    clusters = assign_orphan_paragraphs(blocks, clusters)
    return clusters, None, "dynamic_virtual_schema"

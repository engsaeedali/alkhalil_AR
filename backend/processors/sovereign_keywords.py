# -*- coding: utf-8 -*-

import re
import math
from collections import Counter
from typing import Dict, Iterable, List, Optional, Set, Tuple

# أدوات ربط ونفي وضمائر وأسماء إشارة — ممنوعة
SOVEREIGN_STOP_WORDS = {
    "من", "إلى", "الى", "في", "على", "عن", "مع", "بين", "حتى", "منذ", "خلال",
    "أن", "ان", "إن", "إذ", "إذا", "لأن", "كي", "لكي", "حيث", "ما", "لا",
    "لم", "لن", "لما", "بل", "غير", "سوى", "هل", "أ", "أم", "أو", "او", "ثم",
    "قد", "كان", "كانت", "يكون", "تكون", "هو", "هي", "هم", "هن", "هذا", "هذه",
    "ذلك", "تلك", "هناك", "هنا", "كل", "بعض", "ذات", "نفس",
    "قبل", "بعد", "عند", "عندما", "ولا", "ولكن", "لكن", "فإن", "فإذا", "إلا",
    "ألا", "أما", "إما", "أيضا", "أيضاً", "فقط", "جدا", "جداً", "أكثر", "أقل",
    "ب", "ف", "و", "ك", "ل", "س",
    # ضمائر وموصولات
    "الذي", "التي", "الذين", "اللذان", "اللتان", "اللواتي", "هؤلاء", "أولئك",
    "ذلك", "هكذا", "كذلك", "ثم", "لذلك", "إذن", "أي", "كما", "مثل", "حيث",
    # أفعال/عبارات شائعة بلا قيمة موضوعية
    "يعني", "تعني", "أي", "يجب", "ينبغي", "يمكن", "تستطيع", "قادر", "لضمان",
    "ليكون", "لتكون", "لتحقيق", "منأجل", "بسبب", "خلال", "دون", "حول", "ضمن",
    "وفق", "بحسب", "بناء", "اعتماد", "انطلاق", "انطلاقا", "انطلاقاً",
}

# أسماء مجردة عامة — تُستبعد إلا إن ظهرت بثقل في البطاقات
WEAK_GENERIC_NOUNS = {
    "ضرورة", "الضرورة", "أهمية", "الأهمية", "إمكانية", "الإمكانية",
    "ضمان", "الضمان", "تحديد", "التحديد", "تكييف", "التكييف",
    "معنى", "المعنى", "مفهوم", "المفهوم", "جانب", "الجانب", "ناحية", "الناحية",
    "عملية", "العملية", "مرحلة", "المرحلة", "خطوة", "الخطوة", "مستوى", "المستوى",
    "شكل", "الشكل", "نوع", "النوع", "طريقة", "الطريقة", "أسلوب", "الأسلوب",
    "نتيجة", "النتيجة", "قيمة", "القيمة", "دور", "الدور", "جزء", "الجزء",
}

GENERIC_LOW_VALUE = {
    "بناء", "البناء", "محور", "المحور", "محاور", "المحاور", "أرض", "الأرض",
    "نص", "النص", "فكرة", "الفكرة", "أفكار", "الأفكار", "عمل", "العمل",
    "مشروع", "المشروع", "شخص", "الشخص", "مجتمع", "المجتمع", "إنسان", "الإنسان",
    "طريق", "الطريق", "هدف", "الهدف", "وقت", "الوقت", "حياة", "الحياة",
    "قصة", "القصة", "فصل", "الفصل", "قسم", "القسم", "مرة", "مرات",
    "شيء", "أشياء", "أمر", "الأمر", "أمور", "أجزاء",
    "world", "text", "axis", "build", "paving", "choosing", "obtaining",
    "building", "accordance", "qualified", "according", "construction", "goal",
}

DOMAIN_BOOST_TERMS = {
    "منهجية", "المنهجية", "استراتيجي", "الاستراتيجي", "استراتيجية", "الاستراتيجية",
    "تخطيط", "التخطيط", "جاهزية", "الجاهزية", "شرعية", "الشرعية", "حوكمة", "الحوكمة",
    "إصلاح", "الإصلاح", "تمكين", "التمكين", "كفاءات", "الكفاءات", "موارد", "الموارد",
    "قيود", "القيود", "حدود", "الحدود", "ترتيب", "الترتيب", "تدرج", "التدرج",
    "ثقة", "الثقة", "عمران", "العمران", "إتقان", "الإتقان", "فطرة", "الفطرة",
    "ابتكار", "الابتكار", "استدامة", "الاستدامة", "تحول", "التحول", "تأسيس", "التأسيس",
    "عوائق", "العوائق", "تراخيص", "التراخيص", "تصاريح", "التصاريح", "مخططات", "المخططات",
    "بنى", "البنى", "تحتية", "التحتية", "بنية", "البنية", "أساسات", "الأساسات",
    "تشطيبات", "التشطيبات", "مقاولين", "المقاولين", "مهندسين", "المهندسين",
    "مؤسسات", "المؤسسات", "مؤسسي", "المؤسسي", "مجتمعي", "المجتمعي", "اجتماعي", "الاجتماعي",
    "فردي", "الفردي", "بشري", "البشري", "مادي", "المادي", "إنشائي", "الإنشائي",
    "عمارة", "العمارة", "معماري", "المعماري", "تقوى", "التقوى", "رضوان", "الرضوان",
    "SACM", "إيرباص", "airbus",
}

TITLE_PHRASE_PATTERNS = re.compile(
    r"(?:بناء|تهيئة|اختيار|الحصول|الترتيب|الموارد|الخبراء|الخبرة|"
    r"الثقة|العوائق|التراخيص|المساحة|العمارة|التخطيط|الحوكمة|الشرعية|"
    r"الجاهزية|الاستدامة|الابتكار|التمكين|الكفاءات)",
    re.IGNORECASE,
)

ARABIC_PREFIXES = ("و", "ف", "ب", "ك", "ل", "س", "لل")

MIN_KEYWORD_LEN = 4
TARGET_COUNT = 7
MIN_CARD_HITS_FOR_IDF_ONLY = 2


def _normalize_token(word: str) -> str:
    w = re.sub(r"[\u064B-\u065F\u0670]", "", word.strip())
    w = re.sub(r"[^\u0600-\u06FFa-zA-Z]", "", w)
    return w


def _strip_al(word: str) -> str:
    if word.startswith("ال") and len(word) > 4:
        return word[2:]
    return word


def _strip_prefixes(word: str) -> str:
    w = word
    changed = True
    while changed and len(w) > 3:
        changed = False
        if w.startswith("ال") and len(w) > 5:
            w = w[2:]
            changed = True
            continue
        for p in ARABIC_PREFIXES:
            if w.startswith(p) and len(w) > len(p) + 3:
                w = w[len(p):]
                changed = True
                break
    return w


def _is_english_only(word: str) -> bool:
    w = (word or "").strip()
    if not w:
        return False
    letters = re.sub(r"[^A-Za-z]", "", w)
    arabic = re.sub(r"[^\u0600-\u06FF]", "", w)
    return len(letters) >= 3 and len(arabic) == 0


def is_prohibited_keyword(word: str) -> bool:
    w = _normalize_token(word)
    if not w or len(w) < 2:
        return True
    if _is_english_only(w) and w.lower() not in {x.lower() for x in DOMAIN_BOOST_TERMS}:
        return True
    if w in SOVEREIGN_STOP_WORDS:
        return True
    bare = _strip_al(w)
    if bare in SOVEREIGN_STOP_WORDS:
        return True
    stripped = _strip_prefixes(w)
    if stripped != w:
        if stripped in SOVEREIGN_STOP_WORDS or _strip_al(stripped) in SOVEREIGN_STOP_WORDS:
            return True
        if stripped in WEAK_GENERIC_NOUNS or _strip_al(stripped) in WEAK_GENERIC_NOUNS:
            return True
    if w in WEAK_GENERIC_NOUNS or bare in WEAK_GENERIC_NOUNS:
        return True
    if len(w) <= 3 and w not in DOMAIN_BOOST_TERMS:
        return True
    # موصولات ملتصقة: لضمان، بالتحديد
    if len(w) > 4 and w[0] in "لبفكو" and _strip_prefixes(w) in WEAK_GENERIC_NOUNS | GENERIC_LOW_VALUE:
        return True
    return False


def _tokenize_rich(text: str) -> List[str]:
    text = re.sub(r"[\u064B-\u065F\u0670]", "", text)
    raw = re.findall(r"[\u0600-\u06FF]{3,}|[A-Za-z]{4,}", text)
    return [_normalize_token(w) for w in raw if _normalize_token(w)]


def _extract_title_phrases(section_title: str) -> List[str]:
    """استخراج عبارات من عنوان المحور (بعد النقطتين أو الأقواس)."""
    phrases: List[str] = []
    title = (section_title or "").strip()
    if not title:
        return phrases

    for sep in (":", "：", "—", "-", "("):
        if sep in title:
            tail = title.split(sep, 1)[-1].strip().rstrip(")")
            if len(tail) > 8:
                phrases.append(tail)
                for m in TITLE_PHRASE_PATTERNS.finditer(tail):
                    phrases.append(m.group(0))

    tokens = [t for t in _tokenize_rich(title) if not is_prohibited_keyword(t)]
    for i in range(len(tokens) - 1):
        a, b = tokens[i], tokens[i + 1]
        if len(a) >= 4 and len(b) >= 4:
            phrases.append(f"{a} {b}")

    return phrases


def _extract_bigrams(text: str) -> List[str]:
    tokens = [t for t in _tokenize_rich(text) if not is_prohibited_keyword(t)]
    bigrams = []
    for i in range(len(tokens) - 1):
        a, b = tokens[i], tokens[i + 1]
        if len(a) >= 4 and len(b) >= 4:
            if a in WEAK_GENERIC_NOUNS or b in WEAK_GENERIC_NOUNS:
                continue
            phrase = f"{a} {b}"
            bigrams.append(phrase)
    return bigrams


def _compute_idf_scores(text: str) -> Dict[str, float]:
    sentences = re.split(r"(?<=[.!?؟])\s*|[\n]+", text)
    sentences = [s for s in sentences if len(s.strip()) > 20]
    if not sentences:
        sentences = [text]

    doc_freq: Counter = Counter()
    for sent in sentences:
        terms = set(_tokenize_rich(sent))
        terms = {t for t in terms if not is_prohibited_keyword(t)}
        for t in terms:
            doc_freq[t] += 1

    n = len(sentences)
    idf = {}
    for term, df in doc_freq.items():
        idf[term] = math.log((n + 1) / (df + 1)) + 1.0
    return idf


def _score_term(
    term: str,
    idf: Dict[str, float],
    sovereign_hits: Counter,
    *,
    allow_weak: bool = False,
) -> float:
    if is_prohibited_keyword(term):
        return -999.0

    root = _strip_al(term)
    hits = sovereign_hits.get(term, 0) + sovereign_hits.get(root, 0)
    if hits == 0 and term not in DOMAIN_BOOST_TERMS and root not in DOMAIN_BOOST_TERMS:
        if not allow_weak:
            return -999.0

    base = idf.get(term, idf.get(root, 0.5))
    base += hits * 5.0

    if term in DOMAIN_BOOST_TERMS or root in DOMAIN_BOOST_TERMS:
        base += 6.0

    if term in WEAK_GENERIC_NOUNS or root in WEAK_GENERIC_NOUNS:
        base *= 0.08 if not allow_weak else 0.2

    if term in GENERIC_LOW_VALUE or root in GENERIC_LOW_VALUE:
        base *= 0.15 if not allow_weak else 0.35

    if " " in term:
        base += 4.0
    if len(root) >= 6:
        base += 2.0
    if len(root) >= 8:
        base += 1.5

    return base


def _collect_sovereign_corpus(core_ideas: List[dict]) -> Tuple[str, Counter]:
    parts: List[str] = []
    hits: Counter = Counter()

    for idea in core_ideas:
        title = str(idea.get("section_title") or "")
        parts.append(title)
        for phrase in _extract_title_phrases(title):
            parts.append(phrase)
            for t in _tokenize_rich(phrase):
                if not is_prohibited_keyword(t):
                    hits[t] += 8
                    hits[_strip_al(t)] += 6
            if len(phrase) >= 6:
                hits[phrase] += 10

        for field in ("sovereign_idea", "idea"):
            val = str(idea.get(field) or "")
            if not val:
                continue
            parts.append(val)
            for t in _tokenize_rich(val):
                if not is_prohibited_keyword(t):
                    hits[t] += 5
                    hits[_strip_al(t)] += 4

        layers = idea.get("layers") or {}
        for layer_text in (layers.get("conceptual_framework"), layers.get("practical_applications")):
            if not layer_text:
                continue
            parts.append(str(layer_text))
            for t in _tokenize_rich(str(layer_text)):
                if not is_prohibited_keyword(t):
                    hits[t] += 3
                    hits[_strip_al(t)] += 2

    return "\n".join(parts), hits


def _pick_display_form(term: str, corpus: str) -> str:
    if not term:
        return term
    if " " in term:
        return term
    al_form = f"ال{term}" if not term.startswith("ال") else term
    bare = _strip_al(term)
    counts = Counter()
    for form in {term, al_form, bare, f"ال{bare}"}:
        if form and form in corpus:
            counts[form] = corpus.count(form)
    if counts:
        return counts.most_common(1)[0][0]
    return al_form if len(al_form) >= len(term) else term


def build_sovereign_keywords(
    core_ideas: List[dict],
    source_text: str = "",
    llm_candidates: Optional[Iterable[str]] = None,
    top_k: int = TARGET_COUNT,
) -> List[str]:
    """
    كلمات سيادية من البطاقات المعرفية المصهورة — لا من تكرار النص الخام الفوضوي.
    """
    sovereign_corpus, sovereign_hits = _collect_sovereign_corpus(core_ideas)

    if sovereign_corpus.strip():
        idf = _compute_idf_scores(sovereign_corpus)
    else:
        sample = (source_text or "")[:12000]
        idf = _compute_idf_scores(sample)
        for t in _tokenize_rich(sample):
            if not is_prohibited_keyword(t):
                sovereign_hits[t] += 1

    candidates: Counter = Counter()

    for term, weight in sovereign_hits.items():
        if not is_prohibited_keyword(term):
            candidates[term] += weight

    for phrase in _extract_bigrams(sovereign_corpus):
        candidates[phrase] += 12.0

    for phrase in _extract_title_phrases(" ".join(
        str(i.get("section_title") or "") for i in core_ideas
    )):
        if len(phrase) >= 8 and not is_prohibited_keyword(phrase.split()[0] if phrase else ""):
            candidates[phrase] += 14.0

    if llm_candidates:
        for raw in llm_candidates:
            w = _normalize_token(str(raw))
            if w and not is_prohibited_keyword(w):
                if sovereign_hits.get(w, 0) >= 1 or w in DOMAIN_BOOST_TERMS:
                    candidates[w] += 2.0

    for term in idf:
        if is_prohibited_keyword(term):
            continue
        hits = sovereign_hits.get(term, 0) + sovereign_hits.get(_strip_al(term), 0)
        if hits >= MIN_CARD_HITS_FOR_IDF_ONLY or term in DOMAIN_BOOST_TERMS:
            candidates[term] += _score_term(term, idf, sovereign_hits) * 0.5

    scored: List[tuple] = []
    seen_roots: Set[str] = set()

    for term, _ in candidates.most_common(120):
        if _is_english_only(term):
            continue
        root = _strip_al(term.split()[0] if " " in term else term)
        if root in seen_roots or len(root) < MIN_KEYWORD_LEN:
            continue
        if is_prohibited_keyword(term):
            continue
        score = _score_term(term, idf, sovereign_hits)
        if score <= 0:
            continue
        scored.append((score, term, root))
        seen_roots.add(root)

    scored.sort(key=lambda x: x[0], reverse=True)

    results: List[str] = []
    used_roots: Set[str] = set()

    for score, term, root in scored:
        if root in used_roots:
            continue
        display = _pick_display_form(term, sovereign_corpus or source_text)
        if is_prohibited_keyword(display):
            continue
        if _strip_al(display) in used_roots:
            continue
        results.append(display)
        used_roots.add(root)
        used_roots.add(_strip_al(display))
        if len(results) >= top_k:
            break

    if len(results) < top_k:
        for term in DOMAIN_BOOST_TERMS:
            if len(results) >= top_k:
                break
            root = _strip_al(term)
            if root in used_roots:
                continue
            if term in sovereign_corpus or root in sovereign_corpus:
                results.append(_pick_display_form(term, sovereign_corpus))
                used_roots.add(root)

    return results[:top_k]


def sanitize_sovereign_keywords(keywords: List[str]) -> List[str]:
    clean = []
    seen = set()
    for raw in keywords:
        w = _normalize_token(str(raw))
        if is_prohibited_keyword(w):
            continue
        root = _strip_al(w)
        if root in seen:
            continue
        seen.add(root)
        clean.append(w)
    return clean

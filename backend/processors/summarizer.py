# -*- coding: utf-8 -*-

import re
import math
from typing import List, Dict, Optional, Tuple
from collections import Counter, defaultdict

from processors.text_integrity import clip_at_boundary as _clip_context

class ArabicExtractiveSummarizer:
    """
    محرك التلخيص الاستخلاصي الهجين المطور - نسخة الإنتاج v2.5 (محلي 100%)
    يدعم: التقطيع المقاوم للمسافات، تطهير التشكيل، أوزان TextRank، واستخراج الكشاف الرقمي.
    """
    
    STOP_WORDS = {
        "من", "إلى", "الى", "عن", "على", "علي", "في", "فيما", "إذ", "إذا", "أن", "أنها", "أنهم",
        "أو", "ثم", "التي", "الذي", "الذين", "هذا", "هذه", "هناك", "تلك", "ذلك", "ما", "لا", "يا",
        "كان", "كانت", "يكون", "حيث", "كل", "مع", "هو", "هي", "لقد", "تم", "بناء", "أم", "بل",
        "بشكل", "بين", "قد", "وقد", "تمت", "بناء_على", "إن", "لكن", "فإن", "ولكن", "عبر", "خلال",
        "حتى", "غير", "دون", "بلا", "فقط", "عند", "عندما", "منذ", "تحت", "فوق", "بسبب", "وهذا", "وهذه"
    }

    @classmethod
    def _split_sentences(cls, text: str) -> List[str]:
        """تقسيم النص إلى جمل - معالجة ثغرة غياب المسافات بعد الترقيم"""
        text = re.sub(r'\s+', ' ', text).strip()
        sentences = re.split(r'(?<=[.!?؟])\s*', text)
        return [s.strip() for s in sentences if len(s.strip()) > 15]

    @classmethod
    def _clean_and_tokenize(cls, sentence: str) -> List[str]:
        """تنظيف الكلمات وتقطيعها - سحق التشكيل العربي بالكامل عبر اليونيكود"""
        # حذف التشكيل العربي (الحركات، التنوين، الشدة)
        text = re.sub(r'[\u064B-\u065F\u0670]', '', sentence)
        # حذف علامات الترقيم والأرقام والإبقاء على الحروف العربية فقط
        text = re.sub(r'[^\u0600-\u06FF\s]', '', text)
        words = text.split()
        return [w for w in words if w not in cls.STOP_WORDS and len(w) > 1]

    @classmethod
    def _compute_cosine_similarity(cls, vec1: Dict[str, float], vec2: Dict[str, float]) -> float:
        """حساب جيب التمام للتشابه بين مصفوفتين"""
        common_words = set(vec1.keys()) & set(vec2.keys())
        if not common_words:
            return 0.0
        dot_product = sum(vec1[w] * vec2[w] for w in common_words)
        norm1 = math.sqrt(sum(v ** 2 for v in vec1.values()))
        norm2 = math.sqrt(sum(v ** 2 for v in vec2.values()))
        return dot_product / (norm1 * norm2) if (norm1 * norm2) else 0.0

    @classmethod
    def summarize(cls, text: str, compression_ratio: float = 0.3, max_ideas: Optional[int] = None) -> Dict:
        """التلخيص الهجين المطور (TF-IDF + TextRank) - استهلاك صفر توكن"""
        if not text or len(text.strip()) < 50:
            return {"summary": text, "summary_sentences": [], "_metadata": {"original_sentences": 0, "summary_sentences": 0, "tokens_consumed": 0}}

        # 1. تقسيم النص إلى فقرات أولية بناءً على السطور الجديدة
        raw_paragraphs = [p.strip() for p in text.split('\n') if len(p.strip()) > 30]
        if not raw_paragraphs:
            raw_paragraphs = [text.strip()]

        # 2. تفكيك كل فقرة إلى جمل وحفظ العلاقة مع الفقرة الأم
        paragraph_sentences = []
        all_sentences = []
        sentence_to_paragraph = {}
        
        sent_idx = 0
        for p_idx, para in enumerate(raw_paragraphs):
            sents = cls._split_sentences(para)
            para_sents_indices = []
            for s in sents:
                all_sentences.append(s)
                sentence_to_paragraph[sent_idx] = p_idx
                para_sents_indices.append(sent_idx)
                sent_idx += 1
            paragraph_sentences.append(para_sents_indices)

        n = len(all_sentences)
        if n == 0:
            return {"summary": "", "summary_sentences": [], "_metadata": {"original_sentences": 0, "summary_sentences": 0, "tokens_consumed": 0}}
        if n <= 2:
            return {"summary": " ".join(all_sentences), "summary_sentences": all_sentences, "_metadata": {"original_sentences": n, "summary_sentences": n, "tokens_consumed": 0}}

        # 3. حساب أوزان الجمل عالمياً باستخدام خوارزمية TextRank
        word_freq = defaultdict(int)
        sentence_vectors = []
        
        for sent in all_sentences:
            tokens = cls._clean_and_tokenize(sent)
            counts = Counter(tokens)
            sentence_vectors.append(counts)
            for w in set(tokens):
                word_freq[w] += 1

        scores = [1.0 / n] * n
        
        for _ in range(10):
            new_scores = []
            for i in range(n):
                score_sum = 0
                for j in range(n):
                    if i != j:
                        sim = cls._compute_cosine_similarity(sentence_vectors[i], sentence_vectors[j])
                        score_sum += sim * scores[j]
                
                words_count = len(sentence_vectors[i])
                norm_factor = (words_count ** 0.5) if words_count else 1
                new_scores.append(0.15 + 0.85 * (score_sum / norm_factor))
            scores = new_scores

        # 4. تحديد سقف عدد الأفكار المطلوبة
        if max_ideas is not None:
            target_count = max_ideas
        else:
            target_count = max(1, int(n * compression_ratio))

        # 5. التصفية على مستوى الفقرات لضمان سحب جملة مركزية من كل محور
        paragraph_best_sentence = {}
        for p_idx, sent_indices in enumerate(paragraph_sentences):
            if sent_indices:
                best_idx = max(sent_indices, key=lambda idx: scores[idx])
                paragraph_best_sentence[p_idx] = (best_idx, scores[best_idx])

        # ترتيب الفقرات بناءً على وزن الجملة المركزية فيها تنازلياً
        sorted_paragraphs = sorted(paragraph_best_sentence.items(), key=lambda item: item[1][1], reverse=True)
        
        selected_indices = set()
        selected_texts = set()
        
        # المرحلة الأولى: سحب أفضل جملة غير مكررة من كل فقرة (بحد أقصى target_count)
        for p_idx, _ in sorted_paragraphs:
            if len(selected_indices) >= target_count:
                break
            
            # ترتيب جمل الفقرة الحالية حسب الأهمية لتحديد البديل غير المكرر
            sent_indices = paragraph_sentences[p_idx]
            sorted_sent_indices = sorted(sent_indices, key=lambda idx: scores[idx], reverse=True)
            
            for idx in sorted_sent_indices:
                sent_text = all_sentences[idx].strip()
                if sent_text not in selected_texts:
                    selected_indices.add(idx)
                    selected_texts.add(sent_text)
                    break
            
        # المرحلة الثانية: إذا لم نصل للعدد المطلوب، نسحب بقية الجمل الأعلى وزناً عالمياً وغير المكررة
        if len(selected_indices) < target_count:
            remaining_indices = sorted(
                [idx for idx in range(n) if idx not in selected_indices],
                key=lambda idx: scores[idx],
                reverse=True
            )
            for idx in remaining_indices:
                if len(selected_indices) >= target_count:
                    break
                sent_text = all_sentences[idx].strip()
                if sent_text not in selected_texts:
                    selected_indices.add(idx)
                    selected_texts.add(sent_text)

        # ترتيب المؤشرات لضمان تدفق المستخلص منطقياً حسب النص الأصلي
        final_indices = sorted(list(selected_indices))
        
        summary = " ".join([all_sentences[i] for i in final_indices])
        summary_sentences = [all_sentences[i] for i in final_indices]
        
        return {
            "summary": summary,
            "summary_sentences": summary_sentences,
            "_metadata": {
                "original_sentences": n,
                "summary_sentences": len(final_indices),
                "tokens_consumed": 0,
                "algorithm": "extractive_hybrid_paragraph_textrank_v3.0"
            }
        }

    @classmethod
    def extract_keywords(cls, text: str, top_k: int = 5) -> List[str]:
        """استخراج أهم الكلمات المفتاحية السيادية بناءً على تكرار الجمل"""
        sentences = cls._split_sentences(text)
        word_freq = {}
        for sent in sentences:
            words = cls._clean_and_tokenize(sent)
            for w in set(words):
                word_freq[w] = word_freq.get(w, 0) + 1
        sorted_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
        return [w for w, _ in sorted_words[:top_k]]

    @classmethod
    def extract_numbers(cls, text: str) -> List[Dict[str, str]]:
        """استخراج الأرقام مع الحفاظ على هوامش السياق الدلالي البسيط"""
        patterns = [
            (r'\b(?:19|20)\d{2}\b', 'سنة'),
            (r'\b\d+(?:\.\d+)?\s*[%٪]\b', 'نسبة مئوية'),
            (r'\b\d{1,3}(?:,\d{3})*\s*(?:مليون|مليار|ألف)\b', 'كمية'),
        ]
        results = []
        seen = set()
        for pattern, _ in patterns:
            for match in re.finditer(pattern, text):
                value = match.group()
                if value not in seen:
                    seen.add(value)
                    start = max(0, match.start() - 40)
                    end = min(len(text), match.end() + 40)
                    context = text[start:end].strip().replace('\n', ' ')
                    results.append({"value": value, "context": _clip_context(context, 320)})
        return results[:10]

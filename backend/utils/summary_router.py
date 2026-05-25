# -*- coding: utf-8 -*-

import os
import re
from typing import Literal, Optional

EngineType = Literal["deepseek", "gemini", "openai", "local_hybrid"]

# تفعيل متغير التحكم الصارم في حد النصوص القصيرة جداً
MIN_TEXT_FOR_LOCAL = int(os.getenv("MIN_TEXT_FOR_LOCAL", "500"))

def choose_summarizer_engine(
    user_tier: str,
    text_length: int,
    text: str,
    force_engine: Optional[str] = None
) -> EngineType:
    """محدد المحرك الذكي - يلغي المحلي تماماً للنصوص الطويلة لضمان الفصاحة المطلقة"""
    
    # فرض يدوي من المطور أو الواجهة
    if force_engine in ["deepseek", "gemini", "openai", "local_hybrid"]:
        if force_engine == "local_hybrid" and text_length >= MIN_TEXT_FOR_LOCAL:
            return "deepseek"  # ترقية قسرية حتمية لحماية الجودة البلاغية
        return force_engine
    
    # حصر المحرك المحلي فقط في النصوص القاصرة والقليلة جداً (توفيراً للوقت)
    if text_length < MIN_TEXT_FOR_LOCAL:
        return "local_hybrid"
        
    # التوجيه الافتراضي والسيادي للمخطوطات والكتب والعملاء
    return "deepseek"

def get_engine_description(engine: EngineType) -> dict:
    descriptions = {
        "deepseek": {"name": "DeepSeek-V3 Engine (التوليد اللغوي البليغ)", "tier": "premium"},
        "gemini": {"name": "Google Gemini Flash (السرعة والتحليل الموسع)", "tier": "premium"},
        "openai": {"name": "OpenAI GPT-4o (التحقق والاستخلاص الصارم)", "tier": "premium"},
        "local_hybrid": {"name": "المحرك المحلي التقليدي (مخصص للنصوص القصيرة جداً)", "tier": "free"}
    }
    return descriptions.get(engine, descriptions["local_hybrid"])

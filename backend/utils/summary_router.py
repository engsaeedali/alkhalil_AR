# -*- coding: utf-8 -*-

import os
import re
from typing import Literal, Optional

EngineType = Literal["deepseek", "gemini", "local_hybrid"]

MIN_TEXT_FOR_LOCAL = int(os.getenv("MIN_TEXT_FOR_LOCAL", "500"))

_ALLOWED_CLOUD = frozenset({"deepseek", "gemini"})


def choose_summarizer_engine(
    user_tier: str,
    text_length: int,
    text: str,
    force_engine: Optional[str] = None
) -> EngineType:
    """محدد المحرك v4.2 — DeepSeek-V3 أو Gemini Flash حصرياً."""

    if force_engine == "openai":
        force_engine = "deepseek"

    if force_engine in _ALLOWED_CLOUD:
        return force_engine  # type: ignore[return-value]

    if force_engine == "local_hybrid" and text_length >= MIN_TEXT_FOR_LOCAL:
        return "deepseek"

    if force_engine == "local_hybrid":
        return "local_hybrid"

    if text_length < MIN_TEXT_FOR_LOCAL:
        return "local_hybrid"

    return "deepseek"


def get_engine_description(engine: EngineType) -> dict:
    descriptions = {
        "deepseek": {"name": "DeepSeek-V3 Engine (التوليد اللغوي البليغ)", "tier": "premium"},
        "gemini": {"name": "Google Gemini Flash (السرعة والتحليل الموسع)", "tier": "premium"},
        "local_hybrid": {"name": "المحرك المحلي التقليدي (مخصص للنصوص القصيرة جداً)", "tier": "free"},
    }
    return descriptions.get(engine, descriptions["local_hybrid"])

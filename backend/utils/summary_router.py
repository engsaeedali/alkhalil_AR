# -*- coding: utf-8 -*-
"""v4.5 — محركان سحابيان حصرياً: DeepSeek-V3 | Gemini Flash."""

from typing import Literal, Optional

EngineType = Literal["deepseek", "gemini"]


def choose_summarizer_engine(
    user_tier: str,
    text_length: int,
    text: str,
    force_engine: Optional[str] = None,
) -> EngineType:
    """توجيه حصري للمحركات التوليدية — بلا مسار extractive محلي."""

    if force_engine in ("openai", "local_hybrid"):
        force_engine = "deepseek"

    if force_engine == "gemini":
        return "gemini"
    return "deepseek"


def get_engine_description(engine: EngineType) -> dict:
    descriptions = {
        "deepseek": {"name": "DeepSeek-V3 (سبك بلاغي معهود)", "tier": "premium"},
        "gemini": {"name": "Google Gemini Flash (تحليل سريع موسع)", "tier": "premium"},
    }
    return descriptions.get(engine, descriptions["deepseek"])

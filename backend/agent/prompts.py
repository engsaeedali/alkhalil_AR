# -*- coding: utf-8 -*-

"""
تطبيق مساعد المحرر الذكي - واجهة تحميل التوجيهات اللغوية (Prompt Loader)
بإصدار يدعم الترميز الموحد UTF-8 لتفادي مشاكل الحروف العربية في Windows.
"""

import os

def load_prompt(file_name: str) -> str:
    """
    تحميل التوجيه النصي من ملف مستقل في مجلد prompts ترميز UTF-8
    """
    base_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(base_dir, "prompts", file_name)
    with open(file_path, "r", encoding="utf-8") as f:
        return f.read()

# تحميل الدستور العام وتوجيه الفروق
SYSTEM_CONSTITUTION = load_prompt("constitution.txt")
STYLE_DETECTION_PROMPT = load_prompt("style_detection.txt")
EXTRACTION_AGENT_PROMPT = load_prompt("extraction.txt")
CONSOLIDATION_AGENT_PROMPT = load_prompt("consolidation.txt")
AUDIT_AGENT_PROMPT = load_prompt("audit.txt")

# تحميل الأساليب اللغوية بشكل منفصل لتوفير التوكنات
STYLE_INSTRUCTIONS = {
    "academic": load_prompt("style_academic.txt"),
    "legal": load_prompt("style_legal.txt"),
    "literary": load_prompt("style_literary.txt"),
    "business": load_prompt("style_business.txt")
}
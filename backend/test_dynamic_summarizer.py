# -*- coding: utf-8 -*-
import sys
import os

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from processors.summarizer import ArabicExtractiveSummarizer

# Route prints to logger and avoid leaking API keys
from utils.logger_config import setup_logger
import builtins, os
logger = setup_logger("test_dynamic_summarizer")
_original_print = builtins.print
_sensitive_vals = [os.getenv(k, "") for k in ("DEEPSEEK_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY")]

def _safe_print(*args, **kwargs):
    try:
        s = " ".join(str(a) for a in args)
        for v in _sensitive_vals:
            if v:
                s = s.replace(v, "<REDACTED_API_KEY>")
        logger.info(s)
    except Exception:
        _original_print(*args, **kwargs)

builtins.print = _safe_print

def test_short_text():
    print("--- Testing Short Text (<= 5000 words, target 5 ideas) ---")
    # A text with 10 paragraphs, each having 1 sentence.
    paragraphs = [f"هذه هي الفقرة رقم {i+1} من النص القصير ولها سياق مفيد جداً." for i in range(10)]
    text = "\n".join(paragraphs)
    
    result = ArabicExtractiveSummarizer.summarize(text, max_ideas=5)
    sentences = result["summary_sentences"]
    print(f"Original sentences: {result['_metadata']['original_sentences']}")
    print(f"Extracted ideas count: {len(sentences)}")
    print(f"Algorithm: {result['_metadata']['algorithm']}")
    for idx, sent in enumerate(sentences):
        print(f"  Idea {idx+1}: {sent}")
        
    assert len(sentences) <= 5, f"Expected <= 5 ideas, got {len(sentences)}"
    print("Short text test passed successfully!\n")

def test_long_text():
    print("--- Testing Long Text (> 5000 words, target 20 ideas) ---")
    # Generate a long text with 30 paragraphs, each with 2 sentences, to have a good pool.
    paragraphs = []
    for i in range(30):
        para = f"هذه هي الفقرة رقم {i+1} من هذا الكتاب الضخم والمخطوطة المعقدة والسيادية. إنها تحتوي على جملة ثانية لتأكيد المعنى الدلالي للمحور."
        paragraphs.append(para)
    text = "\n".join(paragraphs)
    
    # We pass max_ideas=20 as would be calculated by main.py
    result = ArabicExtractiveSummarizer.summarize(text, max_ideas=20)
    sentences = result["summary_sentences"]
    print(f"Original sentences: {result['_metadata']['original_sentences']}")
    print(f"Extracted ideas count: {len(sentences)}")
    print(f"Algorithm: {result['_metadata']['algorithm']}")
    for idx, sent in enumerate(sentences[:5]):
        print(f"  Idea {idx+1}: {sent}")
    print("  ...")
    for idx, sent in enumerate(sentences[-5:]):
        print(f"  Idea {len(sentences)-4+idx}: {sent}")
        
    assert len(sentences) == 20, f"Expected exactly 20 ideas, got {len(sentences)}"
    print("Long text test passed successfully!\n")

if __name__ == "__main__":
    test_short_text()
    test_long_text()
    print("All dynamic summarizer tests passed successfully!")

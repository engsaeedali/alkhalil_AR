# -*- coding: utf-8 -*-

from typing import Any, Dict, Optional

from utils.logger_config import setup_logger

logger = setup_logger("token_meter")

MAX_ESTIMATE_TOKENS_PER_CALL = 12000


def message_content_to_str(content: Any) -> str:
    """تحويل محتوى استجابة LangChain (نص أو قائمة أجزاء) إلى نص."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                parts.append(str(item.get("text") or item.get("content") or ""))
            else:
                parts.append(str(item))
        return "\n".join(p for p in parts if p)
    return str(content)


def estimate_tokens(text: str) -> int:
    """تقدير تقريبي للتوكنات (عربي ≈ 1.35 كلمة/توكن)."""
    if not text or not str(text).strip():
        return 0
    words = len(str(text).split())
    chars = len(str(text))
    by_words = int(words * 1.35)
    by_chars = int(chars / 3.5)
    return max(1, max(by_words, by_chars))


def _coerce_int(value: Any) -> int:
    try:
        if value is None:
            return 0
        return int(value)
    except (TypeError, ValueError):
        return 0


def _read_usage_dict(data: Any) -> Dict[str, int]:
    """قراءة حقول الاستخدام من dict أو كائن LangChain."""
    if not data:
        return {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}

    if isinstance(data, dict):
        src = data
    else:
        if hasattr(data, "model_dump"):
            try:
                dumped = data.model_dump()
                if isinstance(dumped, dict):
                    src = dumped
                else:
                    src = {}
            except Exception:
                src = {}
        else:
            src = {}
        if not src:
            for key in (
                "input_tokens", "output_tokens", "total_tokens",
                "prompt_tokens", "completion_tokens", "total_token_count",
                "prompt_token_count", "candidates_token_count",
            ):
                val = getattr(data, key, None)
                if val is not None:
                    src[key] = val

    input_t = _coerce_int(
        src.get("input_tokens")
        or src.get("prompt_tokens")
        or src.get("prompt_token_count")
    )
    output_t = _coerce_int(
        src.get("output_tokens")
        or src.get("completion_tokens")
        or src.get("candidates_token_count")
    )
    total_t = _coerce_int(
        src.get("total_tokens")
        or src.get("total_token_count")
    )
    if total_t == 0 and (input_t or output_t):
        total_t = input_t + output_t
    return {
        "input_tokens": input_t,
        "output_tokens": output_t,
        "total_tokens": total_t,
    }


def extract_token_usage(
    response: Any,
    prompt_text: str = "",
    completion_text: str = "",
) -> Dict[str, Any]:
    """
    استخراج استهلاك التوكنات من استجابة LangChain (DeepSeek / Gemini / OpenAI).
    يُرجع تقديراً عند غياب البيانات من المزود.
    """
    merged = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}

    usage_meta = getattr(response, "usage_metadata", None)
    merged_usage = _read_usage_dict(usage_meta)
    for k in merged:
        merged[k] = max(merged[k], merged_usage[k])

    response_meta = getattr(response, "response_metadata", None) or {}
    if isinstance(response_meta, dict):
        for key in ("token_usage", "usage", "usage_metadata"):
            nested = response_meta.get(key)
            if nested:
                nested_usage = _read_usage_dict(nested)
                for k in merged:
                    merged[k] = max(merged[k], nested_usage[k])

    additional = getattr(response, "additional_kwargs", None) or {}
    if isinstance(additional, dict):
        for key in ("usage_metadata", "token_usage", "usage"):
            nested = additional.get(key)
            if nested:
                nested_usage = _read_usage_dict(nested)
                for k in merged:
                    merged[k] = max(merged[k], nested_usage[k])

    if not completion_text and hasattr(response, "content"):
        completion_text = message_content_to_str(response.content)

    completion_text = message_content_to_str(completion_text)
    prompt_text = message_content_to_str(prompt_text)

    has_real_provider_usage = merged["input_tokens"] > 0 or merged["output_tokens"] > 0
    if merged["total_tokens"] == 0 or (
        not has_real_provider_usage and (prompt_text.strip() or completion_text.strip())
    ):
        est_in = min(estimate_tokens(prompt_text), MAX_ESTIMATE_TOKENS_PER_CALL)
        est_out = min(estimate_tokens(str(completion_text)), MAX_ESTIMATE_TOKENS_PER_CALL)
        merged = {
            "input_tokens": est_in,
            "output_tokens": est_out,
            "total_tokens": est_in + est_out,
        }
        logger.info(
            f"تقدير توكنات (لا metadata من المزود): in={est_in} out={est_out} total={est_in + est_out}"
        )
        return {**merged, "estimated": True}

    return {**merged, "estimated": False}


def extract_tokens_consumed(response: Any, prompt_text: str = "", completion_text: str = "") -> int:
    """توافق مع الكود القديم — يُرجع الإجمالي فقط."""
    return extract_token_usage(response, prompt_text, completion_text)["total_tokens"]


def merge_usage_accumulator(acc: Dict[str, Any], usage: Dict[str, Any], calls_delta: int = 1) -> Dict[str, Any]:
    """دمج استخدام دفعة جديدة في المجموع التراكمي."""
    acc["input_tokens"] = acc.get("input_tokens", 0) + usage.get("input_tokens", 0)
    acc["output_tokens"] = acc.get("output_tokens", 0) + usage.get("output_tokens", 0)
    acc["total_tokens"] = acc.get("total_tokens", 0) + usage.get("total_tokens", 0)
    acc["llm_calls"] = acc.get("llm_calls", 0) + calls_delta
    if usage.get("estimated"):
        acc["estimated"] = True
    return acc

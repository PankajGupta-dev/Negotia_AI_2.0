"""
LLM Client Service for Negotia AI.
Provides unified integration with Qwen (Alibaba DashScope / Model Studio)
using OpenAI-compatible API, with fallback support for Gemini and OpenAI.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from openai import OpenAI
from app.config import settings

logger = logging.getLogger(__name__)


def get_qwen_client() -> OpenAI:
    """Returns an OpenAI-compatible client configured for Qwen API."""
    base_url = (settings.QWEN_BASE_URL or "https://dashscope-intl.aliyuncs.com/compatible-mode/v1").strip()
    api_key = (settings.QWEN_API_KEY or "").strip()
    return OpenAI(api_key=api_key, base_url=base_url)


def call_qwen_chat(
    prompt: str,
    system_prompt: Optional[str] = None,
    json_mode: bool = False,
    model: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: int = 4096,
) -> str:
    """
    Execute a chat completion against Qwen's OpenAI-compatible endpoint.
    Returns the string completion text.
    """
    client = get_qwen_client()
    selected_model = model or settings.QWEN_MODEL or "qwen-plus"

    messages: List[Dict[str, str]] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    kwargs: Dict[str, Any] = {
        "model": selected_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    if json_mode:
        try:
            kwargs["response_format"] = {"type": "json_object"}
        except Exception:
            pass

    logger.info(f"[QwenLLM] Calling model '{selected_model}' via {settings.QWEN_BASE_URL}...")
    try:
        response = client.chat.completions.create(**kwargs)
        content = response.choices[0].message.content or ""
        logger.info(f"[QwenLLM] Received response from '{selected_model}' ({len(content)} chars).")
        return content
    except Exception as e:
        # If response_format error, retry without response_format
        if json_mode and "response_format" in str(e).lower():
            logger.info("[QwenLLM] Retrying without response_format...")
            kwargs.pop("response_format", None)
            response = client.chat.completions.create(**kwargs)
            return response.choices[0].message.content or ""
        raise e

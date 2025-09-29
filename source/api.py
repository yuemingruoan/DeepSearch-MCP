"""封装与 DeepSearch API 的交互。"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Dict, Optional
from urllib.parse import urlsplit, urlunsplit

import httpx
from dotenv import load_dotenv


class DeepSearchAPIError(RuntimeError):
    """表示调用 DeepSearch API 时的异常。"""


@dataclass
class DeepSearchConfig:
    """DeepSearch API 所需的配置。"""

    api_key: str
    base_url: str = "https://yunwu.ai"
    model: str = "gemini-2.5-pro"
    timeout: float = 30.0

    @classmethod
    def from_env(cls) -> "DeepSearchConfig":
        load_dotenv()

        api_key = cls._first_env(
            "DEEPSEARCH_API_KEY",
            "API_KEY",
            "DEEPSEARCH_TOKEN",
        )
        if not api_key:
            raise DeepSearchAPIError("缺少 DEEPSEARCH_API_KEY 配置")

        base_url_raw = cls._first_env("DEEPSEARCH_BASE_URL", "BASE_URL") or cls.base_url
        base_url = cls._normalize_base_url(base_url_raw)

        model = cls._first_env("DEEPSEARCH_MODEL", "MODEL_NAME", "MODEL") or cls.model

        timeout_raw = cls._first_env("DEEPSEARCH_TIMEOUT", "TIMEOUT") or str(cls.timeout)
        try:
            timeout = float(timeout_raw)
        except ValueError as exc:
            raise DeepSearchAPIError("DEEPSEARCH_TIMEOUT 必须为数字") from exc

        return cls(api_key=api_key, base_url=base_url, model=model, timeout=timeout)

    @staticmethod
    def _first_env(*names: str) -> Optional[str]:
        for name in names:
            value = os.getenv(name)
            if value:
                return value
        return None

    @staticmethod
    def _normalize_base_url(url: str) -> str:
        parts = urlsplit(url.strip())
        if not parts.scheme or not parts.netloc:
            raise DeepSearchAPIError("DEEPSEARCH_BASE_URL 配置无效")
        normalized = urlunsplit((parts.scheme, parts.netloc, "", "", ""))
        return normalized.rstrip("/")


class DeepSearchTransport:
    """提供给 MCP 客户端使用的工具调用传输层。"""

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = "https://yunwu.ai",
        model: str = "gemini-2.5-pro",
        timeout: float = 30.0,
        http_transport: Optional[httpx.BaseTransport] = None,
    ) -> None:
        self._model = model
        self._client = httpx.Client(
            base_url=base_url,
            timeout=timeout,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            transport=http_transport,
        )

    @classmethod
    def from_config(cls, config: DeepSearchConfig, **kwargs: Any) -> "DeepSearchTransport":
        merged = {
            "api_key": config.api_key,
            "base_url": config.base_url,
            "model": config.model,
            "timeout": config.timeout,
        }
        merged.update(kwargs)
        return cls(**merged)

    @classmethod
    def from_env(cls, **kwargs: Any) -> "DeepSearchTransport":
        return cls.from_config(DeepSearchConfig.from_env(), **kwargs)

    def invoke_tool(self, tool_name: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        request_body = self._build_request(tool_name, payload)
        response = self._client.post("/v1/chat/completions", json=request_body)
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:  # pragma: no cover - 防御性分支
            raise DeepSearchAPIError(
                f"DeepSearch API 返回错误状态: {exc.response.status_code}"
            ) from exc
        return self._parse_response(response.json())

    def _build_request(self, tool_name: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        system_prompt = self._system_prompt(tool_name)
        return {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            "temperature": 0.1,
            "top_p": 0.9,
            "stream": False,
            "response_format": {"type": "json_object"},
            "tools": self._tool_schema(),
            "tool_choice": {"type": "function", "function": {"name": "format_deepsearch_response"}},
        }

    def _parse_response(self, data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            choices = data["choices"]
            first_choice = choices[0]
            message = first_choice["message"]
            content = message["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise DeepSearchAPIError("DeepSearch API 响应缺少有效的消息内容") from exc

        try:
            payload = json.loads(content)
        except json.JSONDecodeError as exc:
            raise DeepSearchAPIError("DeepSearch API 响应内容不是合法的 JSON") from exc

        items = payload.get("items", []) or []
        metadata = payload.get("metadata", {}) or {}
        usage = payload.get("usage") or {}

        if not usage:
            api_usage = data.get("usage") or {}
            usage = {
                "input_tokens": int(api_usage.get("prompt_tokens", 0)),
                "output_tokens": int(api_usage.get("completion_tokens", 0)),
            }

        return {
            "items": items,
            "metadata": metadata,
            "usage": usage,
        }

    @staticmethod
    def _tool_schema() -> Any:
        return [
            {
                "type": "function",
                "function": {
                    "name": "format_deepsearch_response",
                    "description": "格式化 DeepSearch 的结构化响应",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "items": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "title": {"type": "string"},
                                        "snippet": {"type": "string"},
                                        "url": {"type": "string", "format": "uri"},
                                        "score": {"type": ["number", "null"]},
                                    },
                                    "required": ["title", "url"],
                                },
                            },
                            "metadata": {"type": "object"},
                            "usage": {"type": "object"},
                        },
                        "required": ["items"],
                    },
                },
            }
        ]

    @staticmethod
    def _system_prompt(tool_name: str) -> str:
        if tool_name == "deepsearch-web":
            return (
                "你是 DeepSearch-Website 工具，必须返回 JSON，其中 items 为命中网站结果，"
                "metadata 至少包含 source 字段；确保 filters 中 site/time_range 限制生效。"
            )
        return (
            "你是 DeepSearch 通用检索工具，必须返回 JSON，其中 items 为查询相关结果列表，"
            "metadata 包含来源与延迟信息，usage 提供 token 统计。"
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "DeepSearchTransport":  # pragma: no cover - 便利接口
        return self

    def __exit__(self, *exc_info: Any) -> None:  # pragma: no cover - 便利接口
        self.close()

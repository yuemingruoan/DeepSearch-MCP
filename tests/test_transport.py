"""覆盖 DeepSearchTransport 的行为。"""

from __future__ import annotations

import json
from typing import List

import httpx
import pytest

from source.api import DeepSearchAPIError, DeepSearchConfig, DeepSearchTransport


def _mock_response(items: List[dict]) -> dict:
    return {
        "items": items,
        "metadata": {"source": "deepsearch", "latency_ms": 42},
        "usage": {"input_tokens": 12, "output_tokens": 18},
    }


def test_transport_invokes_chat_endpoint_and_parses_json_payload():
    requested = {}

    def handler(request: httpx.Request) -> httpx.Response:
        requested["method"] = request.method
        requested["url"] = str(request.url)
        requested["headers"] = dict(request.headers)
        body = json.loads(request.content.decode())
        requested["body"] = body

        assert body["model"] == "gemini-2.5-pro"
        assert body["response_format"] == {"type": "json_object"}
        assert body["messages"][0]["role"] == "system"
        assert body["messages"][1]["role"] == "user"

        payload = json.loads(body["messages"][1]["content"])
        assert payload["query"] == "pytest 查询"

        response_payload = _mock_response([
            {
                "title": "结果标题",
                "snippet": "结果摘要",
                "url": "https://example.com/result",
                "score": 0.95,
            }
        ])

        choices = [
            {
                "index": 0,
                "message": {"role": "assistant", "content": json.dumps(response_payload, ensure_ascii=False)},
                "finish_reason": "stop",
            }
        ]
        return httpx.Response(
            status_code=200,
            json={
                "id": "chatcmpl-test",
                "object": "chat.completion",
                "created": 1234567890,
                "choices": choices,
                "usage": {"prompt_tokens": 9, "completion_tokens": 11, "total_tokens": 20},
            },
        )

    transport = DeepSearchTransport(
        api_key="test-key",
        model="gemini-2.5-pro",
        base_url="https://yunwu.ai",
        http_transport=httpx.MockTransport(handler),
    )

    result = transport.invoke_tool(
        "deepsearch",
        {
            "query": "pytest 查询",
            "top_k": 3,
            "locale": "zh-CN",
            "filters": {"time_range": "7d"},
        },
    )

    assert result["items"][0]["title"] == "结果标题"
    assert result["usage"]["input_tokens"] == 12
    assert result["metadata"]["source"] == "deepsearch"
    assert requested["method"] == "POST"
    assert requested["url"].endswith("/v1/chat/completions")
    assert requested["headers"]["authorization"] == "Bearer test-key"


def test_transport_raises_error_on_invalid_json_content():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            status_code=200,
            json={
                "id": "chatcmpl-test",
                "object": "chat.completion",
                "created": 1234567890,
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": "不是合法 JSON"},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {"prompt_tokens": 4, "completion_tokens": 6, "total_tokens": 10},
            },
        )

    transport = DeepSearchTransport(
        api_key="test-key",
        http_transport=httpx.MockTransport(handler),
    )

    with pytest.raises(DeepSearchAPIError):
        transport.invoke_tool("deepsearch", {"query": "bad json"})


def test_config_from_env_supports_legacy_variable_names(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_KEY", "env-key")
    monkeypatch.setenv("BASE_URL", "https://example.com/v1/chat/completions")
    monkeypatch.setenv("MODEL_NAME", "gemini-web")
    monkeypatch.setenv("DEEPSEARCH_TIMEOUT", "15")

    config = DeepSearchConfig.from_env()

    assert config.api_key == "env-key"
    assert config.base_url == "https://example.com"
    assert config.model == "gemini-web"
    assert config.timeout == 15.0

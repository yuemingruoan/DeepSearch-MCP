"""针对 DeepSearch MCP 客户端逻辑的首轮单元测试。"""

from unittest.mock import Mock

import pytest

from deepsearch_mcp.client import DeepSearchMCPClient, SearchResult, SearchResultItem


def test_search_invokes_transport_with_expected_payload():
    transport = Mock()
    transport.invoke_tool.return_value = {
        "items": [
            {
                "title": "示例标题",
                "snippet": "示例摘要",
                "url": "https://example.com/article",
                "score": 0.88,
            }
        ],
        "metadata": {"source": "deepsearch", "latency_ms": 120},
        "usage": {"input_tokens": 15, "output_tokens": 20},
    }

    client = DeepSearchMCPClient(transport, tool_name="deepsearch-web")
    result = client.search(
        "测试查询",
        top_k=3,
        locale="zh-CN",
        filters={"time_range": "7d", "site": "example.com"},
    )

    assert isinstance(result, SearchResult)
    assert len(result.items) == 1
    assert isinstance(result.items[0], SearchResultItem)
    assert result.items[0].title == "示例标题"
    assert result.items[0].snippet == "示例摘要"
    assert result.items[0].url == "https://example.com/article"
    assert result.metadata["source"] == "deepsearch"
    assert result.usage["output_tokens"] == 20

    called_tool, payload = transport.invoke_tool.call_args.args
    assert called_tool == "deepsearch-web"
    assert payload["query"] == "测试查询"
    assert payload["top_k"] == 3
    assert payload["locale"] == "zh-CN"
    assert payload["filters"] == {"time_range": "7d", "site": "example.com"}


def test_search_requires_positive_top_k():
    client = DeepSearchMCPClient(Mock())

    with pytest.raises(ValueError):
        client.search("无效的数量", top_k=0)

    with pytest.raises(ValueError):
        client.search("无效的数量", top_k=-5)


def test_search_normalizes_partial_items_and_defaults():
    transport = Mock()
    transport.invoke_tool.return_value = {
        "items": [
            {
                "title": "只有标题",
                "url": "https://example.com/only-title",
            }
        ],
    }

    client = DeepSearchMCPClient(transport)
    result = client.search("默认配置")

    called_tool, payload = transport.invoke_tool.call_args.args
    assert called_tool == "deepsearch"
    assert payload["top_k"] == 5
    assert payload["locale"] == "zh-CN"
    assert payload["filters"] == {}

    assert len(result.items) == 1
    item = result.items[0]
    assert item.title == "只有标题"
    assert item.snippet == ""
    assert item.url == "https://example.com/only-title"
    assert item.score is None
    assert result.metadata == {}
    assert result.usage == {"input_tokens": 0, "output_tokens": 0}

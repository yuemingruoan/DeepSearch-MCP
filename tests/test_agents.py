"""覆盖深搜代理封装层。"""

from __future__ import annotations

from unittest.mock import Mock

import pytest

from deepsearch_mcp.client import SearchResult, SearchResultItem
from mcp.deepsearch import DeepSearchAgent
from mcp.deepsearch_web import DeepSearchWebAgent


@pytest.fixture
def sample_result() -> SearchResult:
    return SearchResult(
        items=[
            SearchResultItem(
                title="示例标题",
                snippet="示例摘要",
                url="https://example.com",
                score=0.8,
            )
        ],
        metadata={"source": "deepsearch"},
        usage={"input_tokens": 10, "output_tokens": 12},
    )


def test_deepsearch_agent_delegates_to_client(sample_result: SearchResult) -> None:
    client = Mock()
    client.search.return_value = sample_result

    agent = DeepSearchAgent(client=client)
    result = agent.search("最新 AI 动态", top_k=4)

    client.search.assert_called_once_with("最新 AI 动态", top_k=4, locale="zh-CN", filters=None)
    assert result.items[0].title == "示例标题"


def test_deepsearch_agent_close_releases_transport(sample_result: SearchResult) -> None:
    transport = Mock()
    client = Mock()
    client.search.return_value = sample_result
    agent = DeepSearchAgent(client=client, transport=transport)

    agent.close()
    transport.close.assert_called_once_with()


def test_deepsearch_web_agent_requires_site_or_time_filter(sample_result: SearchResult) -> None:
    client = Mock()
    client.search.return_value = sample_result
    agent = DeepSearchWebAgent(client=client)

    with pytest.raises(ValueError):
        agent.search("定向检索", filters={})

    agent.search("定向检索", filters={"site": "example.com"})
    client.search.assert_called_with(
        "定向检索",
        top_k=5,
        locale="zh-CN",
        filters={"site": "example.com"},
    )


def test_deepsearch_web_agent_defaults_to_time_range(sample_result: SearchResult) -> None:
    client = Mock()
    client.search.return_value = sample_result
    agent = DeepSearchWebAgent(client=client)

    agent.search("定向检索", filters={"time_range": "24h"}, top_k=2)
    client.search.assert_called_with(
        "定向检索",
        top_k=2,
        locale="zh-CN",
        filters={"time_range": "24h"},
    )

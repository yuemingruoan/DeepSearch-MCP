"""针对 MCP 服务器入口的单元测试。"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import pytest

from deepsearch_mcp.client import SearchResult, SearchResultItem
from main import create_server


@dataclass
class FakeAgent:
    result: SearchResult
    calls: List[Dict[str, Any]] | None = None
    closed: bool = False

    def search(
        self,
        query: str,
        *,
        top_k: int = 5,
        locale: str = "zh-CN",
        filters: Optional[Dict[str, Any]] = None,
    ) -> SearchResult:
        if self.calls is None:
            self.calls = []
        self.calls.append(
            {
                "query": query,
                "top_k": top_k,
                "locale": locale,
                "filters": filters,
            }
        )
        return self.result

    def close(self) -> None:
        self.closed = True


@pytest.fixture
def sample_result() -> SearchResult:
    return SearchResult(
        items=[
            SearchResultItem(
                title="测试标题",
                snippet="测试摘要",
                url="https://example.com/item",
                score=0.9,
            )
        ],
        metadata={"source": "deepsearch"},
        usage={"input_tokens": 5, "output_tokens": 7},
    )


@pytest.mark.anyio("asyncio")
async def test_server_lists_registered_tools(sample_result: SearchResult) -> None:
    agent = FakeAgent(sample_result)
    server = create_server(deepsearch_agent=agent, deepsearch_web_agent=agent)

    tools = await server._list_tools_handler()  # type: ignore[attr-defined]
    tool_names = {tool.name for tool in tools}

    assert tool_names == {"deepsearch", "deepsearch-web"}
    deepsearch_tool = next(tool for tool in tools if tool.name == "deepsearch")
    assert deepsearch_tool.inputSchema["properties"]["top_k"]["maximum"] == 10


@pytest.mark.anyio("asyncio")
async def test_call_tool_returns_structured_payload(sample_result: SearchResult) -> None:
    deep_agent = FakeAgent(sample_result)
    web_agent = FakeAgent(sample_result)
    server = create_server(deepsearch_agent=deep_agent, deepsearch_web_agent=web_agent)

    content, payload = await server._call_tool_handler(
        "deepsearch",
        {"query": "pytest 查询", "top_k": 3},
    )  # type: ignore[attr-defined]

    assert json.loads(content[0].text)["items"][0]["title"] == "测试标题"
    assert payload["usage"]["output_tokens"] == 7
    assert deep_agent.calls and deep_agent.calls[0]["top_k"] == 3

    content_web, payload_web = await server._call_tool_handler(
        "deepsearch-web",
        {"query": "pytest 查询", "filters": {"site": "example.com"}},
    )  # type: ignore[attr-defined]

    assert json.loads(content_web[0].text)["metadata"]["source"] == "deepsearch"
    assert web_agent.calls and web_agent.calls[0]["filters"] == {"site": "example.com"}


@pytest.mark.anyio("asyncio")
async def test_server_closes_managed_agents(monkeypatch: pytest.MonkeyPatch, sample_result: SearchResult) -> None:
    deep_agent = FakeAgent(sample_result)
    web_agent = FakeAgent(sample_result)

    monkeypatch.setattr("main.DeepSearchAgent", lambda: deep_agent)
    monkeypatch.setattr("main.DeepSearchWebAgent", lambda: web_agent)

    server = create_server()

    assert server._managed_agents == (deep_agent, web_agent)  # type: ignore[attr-defined]

    async with server.lifespan(server):
        pass

    assert deep_agent.closed is True
    assert web_agent.closed is True

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager, suppress
from functools import partial
from typing import Any, Dict, Iterable, List, Optional

import anyio

from mcp import types
from mcp.server import Server
from mcp.server.stdio import stdio_server

from deepsearch_agents import DeepSearchAgent, DeepSearchWebAgent
from deepsearch_mcp.client import SearchResult, SearchResultItem

DEEPSEARCH_INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "query": {"type": "string", "description": "检索问题或关键词"},
        "top_k": {
            "type": "integer",
            "description": "返回结果数量",
            "default": 5,
            "minimum": 1,
            "maximum": 10,
        },
        "locale": {
            "type": "string",
            "description": "内容语言",
            "default": "zh-CN",
        },
        "filters": {
            "type": "object",
            "description": "附加筛选条件，例如时间范围、站点等",
            "default": {},
        },
    },
    "required": ["query"],
    "additionalProperties": False,
}

DEEPSEARCH_WEB_INPUT_SCHEMA: dict[str, Any] = {
    **DEEPSEARCH_INPUT_SCHEMA,
    "properties": {
        **DEEPSEARCH_INPUT_SCHEMA["properties"],
        "filters": {
            "type": "object",
            "description": "筛选条件，必须包含 site 或 time_range",
            "default": {},
        },
    },
    "allOf": [
        {
            "anyOf": [
                {"properties": {"filters": {"required": ["site"]}}},
                {"properties": {"filters": {"required": ["time_range"]}}},
            ]
        }
    ],
}

SEARCH_RESULT_SCHEMA: dict[str, Any] = {
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
                "additionalProperties": False,
            },
        },
        "metadata": {"type": "object"},
        "usage": {
            "type": "object",
            "properties": {
                "input_tokens": {"type": "integer"},
                "output_tokens": {"type": "integer"},
            },
            "required": ["input_tokens", "output_tokens"],
        },
    },
    "required": ["items", "metadata", "usage"],
    "additionalProperties": False,
}


def _result_to_payload(result: SearchResult) -> Dict[str, Any]:
    return {
        "items": [
            {
                "title": item.title,
                "snippet": item.snippet,
                "url": item.url,
                "score": item.score,
            }
            for item in result.items
        ],
        "metadata": result.metadata,
        "usage": result.usage,
    }


def _text_content(payload: Dict[str, Any]) -> List[types.TextContent]:
    return [
        types.TextContent(type="text", text=json.dumps(payload, ensure_ascii=False, indent=2)),
    ]


def create_server(
    *,
    deepsearch_agent: Optional[DeepSearchAgent] = None,
    deepsearch_web_agent: Optional[DeepSearchWebAgent] = None,
) -> Server:
    managed: List[Any] = []

    if deepsearch_agent is None:
        deepsearch_agent = DeepSearchAgent()
        managed.append(deepsearch_agent)
    if deepsearch_web_agent is None:
        deepsearch_web_agent = DeepSearchWebAgent()
        managed.append(deepsearch_web_agent)

    @asynccontextmanager
    async def lifespan(_: Server):
        try:
            yield
        finally:
            for agent in managed:
                with suppress(Exception):
                    agent.close()

    server = Server(
        "deepsearch-mcp",
        instructions="提供 deepsearch 与 deepsearch-web 工具，用于联网检索最新信息。",
        lifespan=lifespan,
    )

    tools = [
        types.Tool(
            name="deepsearch",
            description="使用 DeepSearch 模型执行广域检索，返回结构化结果。",
            inputSchema=DEEPSEARCH_INPUT_SCHEMA,
            outputSchema=SEARCH_RESULT_SCHEMA,
        ),
        types.Tool(
            name="deepsearch-web",
            description="针对指定站点或时间范围进行定向检索。",
            inputSchema=DEEPSEARCH_WEB_INPUT_SCHEMA,
            outputSchema=SEARCH_RESULT_SCHEMA,
        ),
    ]

    async def _invoke_agent(agent: Any, arguments: Dict[str, Any]) -> Dict[str, Any]:
        query = arguments["query"]
        top_k = int(arguments.get("top_k", 5))
        locale = arguments.get("locale", "zh-CN")
        filters = arguments.get("filters")
        worker = partial(
            agent.search,
            query,
            top_k=top_k,
            locale=locale,
            filters=filters,
        )
        result = await anyio.to_thread.run_sync(worker)
        return _result_to_payload(result)

    @server.list_tools()
    async def _list_tools() -> List[types.Tool]:
        return tools

    setattr(server, "_list_tools_handler", _list_tools)

    @server.call_tool()
    async def _call_tool(name: str, arguments: Dict[str, Any]):
        if name == "deepsearch":
            payload = await _invoke_agent(deepsearch_agent, arguments)
        elif name == "deepsearch-web":
            payload = await _invoke_agent(deepsearch_web_agent, arguments)
        else:  # pragma: no cover - 防御性分支
            raise ValueError(f"未知工具: {name}")

        return _text_content(payload), payload

    setattr(server, "_call_tool_handler", _call_tool)
    setattr(
        server,
        "_agent_registry",
        {
            "deepsearch": deepsearch_agent,
            "deepsearch-web": deepsearch_web_agent,
        },
    )
    setattr(server, "_managed_agents", tuple(managed))

    return server


async def _amain() -> None:
    server = create_server()
    init_options = server.create_initialization_options()

    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, init_options)


def main() -> None:
    asyncio.run(_amain())


if __name__ == "__main__":
    main()

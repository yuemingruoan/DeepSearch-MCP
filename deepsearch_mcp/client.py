"""DeepSearch MCP 客户端实现。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional


@dataclass
class SearchResultItem:
    """表示单条检索结果。"""

    title: str
    snippet: str
    url: str
    score: Optional[float] = None


@dataclass
class SearchResult:
    """封装 DeepSearch 工具的响应。"""

    items: List[SearchResultItem]
    metadata: Dict[str, Any]
    usage: Dict[str, Any]


class DeepSearchMCPClient:
    """对 MCP 传输层进行封装，便于调用 DeepSearch 工具。"""

    def __init__(self, transport: Any, *, tool_name: str = "deepsearch") -> None:
        self._transport = transport
        self._tool_name = tool_name

    def search(
        self,
        query: str,
        *,
        top_k: int = 5,
        locale: str = "zh-CN",
        filters: Optional[Dict[str, Any]] = None,
    ) -> SearchResult:
        if top_k <= 0:
            raise ValueError("top_k 必须为正整数")

        payload = {
            "query": query,
            "top_k": top_k,
            "locale": locale,
            "filters": filters or {},
        }

        raw_response = self._invoke_tool(payload)

        items = self._parse_items(raw_response.get("items", []))
        metadata = raw_response.get("metadata", {}) or {}
        usage = self._normalize_usage(raw_response.get("usage"))

        return SearchResult(items=items, metadata=metadata, usage=usage)

    def _invoke_tool(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        response = self._transport.invoke_tool(self._tool_name, payload)
        if not isinstance(response, dict):
            raise TypeError("DeepSearch MCP 响应必须为字典类型")
        return response

    @staticmethod
    def _parse_items(items_payload: Iterable[Dict[str, Any]]) -> List[SearchResultItem]:
        parsed: List[SearchResultItem] = []
        for item in items_payload or []:
            parsed.append(
                SearchResultItem(
                    title=item.get("title", ""),
                    snippet=item.get("snippet", ""),
                    url=item.get("url", ""),
                    score=item.get("score"),
                )
            )
        return parsed

    @staticmethod
    def _normalize_usage(raw_usage: Optional[Dict[str, Any]]) -> Dict[str, int]:
        raw_usage = raw_usage or {}
        return {
            "input_tokens": int(raw_usage.get("input_tokens", 0)),
            "output_tokens": int(raw_usage.get("output_tokens", 0)),
        }

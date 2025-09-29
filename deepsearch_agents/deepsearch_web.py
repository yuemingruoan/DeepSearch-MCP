"""DeepSearch 网站定向检索代理。"""

from __future__ import annotations

from typing import Any, Dict, Optional

from deepsearch_mcp.client import DeepSearchMCPClient, SearchResult
from source.api import DeepSearchTransport


class DeepSearchWebAgent:
    """封装站点定向检索逻辑。"""

    def __init__(
        self,
        *,
        client: Optional[DeepSearchMCPClient] = None,
        transport: Optional[DeepSearchTransport] = None,
    ) -> None:
        self._client = client
        self._transport = transport
        if self._client is None:
            if self._transport is None:
                self._transport = DeepSearchTransport.from_env()
            self._client = DeepSearchMCPClient(self._transport, tool_name="deepsearch-web")

    def search(
        self,
        query: str,
        *,
        top_k: int = 5,
        locale: str = "zh-CN",
        filters: Optional[Dict[str, Any]] = None,
    ) -> SearchResult:
        filters = filters or {}
        if not (filters.get("site") or filters.get("time_range")):
            raise ValueError("deepsearch-web 需要提供 site 或 time_range 过滤条件")
        return self._client.search(
            query,
            top_k=top_k,
            locale=locale,
            filters=filters,
        )

    def close(self) -> None:
        if self._transport is not None:
            close = getattr(self._transport, "close", None)
            if callable(close):
                close()

    def __enter__(self) -> "DeepSearchWebAgent":  # pragma: no cover - 便利接口
        return self

    def __exit__(self, *exc_info: Any) -> None:  # pragma: no cover - 便利接口
        self.close()

    @property
    def client(self) -> DeepSearchMCPClient:
        return self._client

# DeepSearch MCP 项目

DeepSearch MCP 提供统一的 Python 客户端与代理层，方便在 MCP（Model Context Protocol）生态中调用可联网的 Deepsearch 模型，实现广域检索与定向站点检索能力。项目采用 TDD 驱动开发，目前已覆盖客户端、传输层与代理封装的核心单元测试。

## 功能特性
- `deepsearch_mcp`：封装通用的 `DeepSearchMCPClient`，负责与 MCP 传输层交互并归一化检索结果。
- `source/api.py`：实现 `DeepSearchTransport`，兼容 OpenAI Chat Completions 风格 API，支持环境变量配置与超时、异常处理。
- `mcp/deepsearch.py` / `mcp/deepsearch_web.py`：分别提供广域检索与站点定向检索代理，开箱即用。
- `tests/`：覆盖客户端、传输层、代理层的 pytest 用例，可作为二次开发的安全网。

## 快速开始
1. 安装依赖（推荐使用 [uv](https://github.com/astral-sh/uv)）：
   ```bash
   uv sync
   ```
2. 配置 `.env`（可参考示例）：
   ```env
   # 基础配置
   API_KEY=sk-xxxxxx
   BASE_URL=https://yunwu.ai/v1/chat/completions
   MODEL_NAME=gemini-2.5-flash-deepsearch
   # 可选：自定义超时（秒）
   DEEPSEARCH_TIMEOUT=400
   ```
3. 运行测试：
   ```bash
   uv run pytest
   ```

## 使用示例
```python
from mcp.deepsearch import DeepSearchAgent

agent = DeepSearchAgent()
try:
    result = agent.search("OpenAI 最新发布", top_k=3)
    for item in result.items:
        print(item.title, item.url)
finally:
    agent.close()
```

如需站点定向检索，可改用 `DeepSearchWebAgent` 并传入 `filters={"site": "example.com"}` 或 `time_range` 等参数。

## 常见问题
- **提示缺少 `DEEPSEARCH_API_KEY`**：确认 `.env` 中已设置 `API_KEY` 或 `DEEPSEARCH_API_KEY`，并在运行前加载（`uv run` 会自动读取）。
- **请求超时或无响应**：Deepsearch 模型可能响应较慢，可提高 `DEEPSEARCH_TIMEOUT`，或使用 `curl` 检查接口可用性。
- **网络代理**：若环境使用 HTTP(S) 代理，`httpx` 会默认读取系统代理变量，可根据需要设置 `trust_env=False` 或调整网络策略。

## 开发计划
- 根据服务端返回格式完善类型校验与错误提示。
- 丰富文档与示例，补充 CLI/服务端示例以展示多代理协作流程。

欢迎提交 Issue 或 PR 与我们一起完善 DeepSearch MCP！

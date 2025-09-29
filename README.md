# DeepSearch MCP 项目

DeepSearch MCP 提供统一的 Python 客户端、代理层与 MCP 服务器入口，方便在 Model Context Protocol (MCP) 生态中调用可联网的 Deepsearch 模型，实现广域检索与定向站点检索能力。项目采用 TDD 驱动开发，目前已覆盖客户端、传输层、代理封装与服务器工具注册的核心单元测试。

## 功能特性
- `deepsearch_mcp`：封装通用的 `DeepSearchMCPClient`，负责与 MCP 传输层交互并归一化检索结果。
- `deepsearch_agents/`：包含 `DeepSearchAgent` 与 `DeepSearchWebAgent`，分别提供广域和站点定向检索能力。
- `source/api.py`：实现 `DeepSearchTransport`，兼容 OpenAI Chat Completions 风格 API，支持环境变量配置、超时控制与异常处理。
- `main.py`：MCP 服务器入口，通过 STDIO 注册 `deepsearch` 与 `deepsearch-web` 工具，供上游 AI 调用。
- `tests/`：覆盖客户端、传输层、代理层与服务器的 pytest 用例，可作为二次开发的安全网。

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
3. 启动 MCP 服务器（STDIO 模式）：
   ```bash
   uv run python main.py
   ```
   或者使用项目内置的 Node.js 包装脚本：
   ```bash
   npm run deepsearch
   ```
4. 运行测试：
   ```bash
   uv run pytest
   ```

## 使用示例
```python
from deepsearch_agents import DeepSearchAgent

agent = DeepSearchAgent()
try:
    result = agent.search("OpenAI 最新发布", top_k=3)
    for item in result.items:
        print(item.title, item.url)
finally:
    agent.close()
```

如需站点定向检索，可改用 `DeepSearchWebAgent` 并传入 `filters={"site": "example.com"}` 或 `time_range` 等参数；通过 MCP 调用时可直接向工具传递相同字段。

## 集成到 Codex 客户端
以 Codex 为例，可在其配置文件 `~/.codex/config.toml` 中新增一个 STDIO 类型的 MCP 服务器条目，让 Codex 在需要时自动启动本项目暴露的工具：

```toml
[mcp_servers.deepsearch]
command = "uv"
args = ["run", "--project", "/absolute/path/to/DeepSearch-MCP", "python", "main.py"]
env = {
  "API_KEY" = "<你的 Deepsearch API Key>",
  "BASE_URL" = "https://yunwu.ai/v1/chat/completions",
  "MODEL_NAME" = "gemini-2.5-flash-deepsearch",
  # 可选：覆盖默认超时
  "DEEPSEARCH_TIMEOUT" = "400"
}
# 可按需调整 Codex 等待服务器启动或工具执行的超时时间
startup_timeout_sec = 30
tool_timeout_sec = 120
```

配置完成后，可使用 Codex CLI 的实验性命令对服务器进行管理：

```bash
codex mcp list          # 查看已注册服务器
codex mcp get deepsearch
codex mcp remove deepsearch
```

若使用其他 MCP 客户端（如 Claude Desktop、Cursor 等），可按其配置方式指定启动命令，关键是让宿主在本仓库根目录下执行 `uv run python main.py`（或通过 `--project` 指定仓库路径），同时提供相同的环境变量即可。

## Node.js 启动脚本
仓库根目录下的 `bin/deepsearch.js` 封装了 `uv run --project <repo> python main.py`，并在 `package.json` 中暴露为 `npm run deepsearch` / `npx deepsearch`。它会继承当前进程的环境变量，因此在 MCP 配置中设定的 `API_KEY`、`BASE_URL` 等会自动生效。

若你希望直接在终端启动，可执行：

```bash
npm run deepsearch -- --top_k 3
# 或者
node ./bin/deepsearch.js
```

附加参数会透传给 `main.py`（目前主程序未解析自定义参数，因此一般无需额外参数）。确保 `uv` 命令位于 `PATH` 中，否则脚本会提示错误。

## 常见问题
- **提示缺少 `DEEPSEARCH_API_KEY`**：确认 `.env` 中已设置 `API_KEY` 或 `DEEPSEARCH_API_KEY`，并在运行前加载（`uv run` 会自动读取）。
- **请求超时或无响应**：Deepsearch 模型可能响应较慢，可提高 `DEEPSEARCH_TIMEOUT`，或使用 `curl` 检查接口可用性。
- **网络代理**：若环境使用 HTTP(S) 代理，`httpx` 会默认读取系统代理变量，可根据需要设置 `trust_env=False` 或调整网络策略。

## 开发计划
- 根据服务端返回格式完善类型校验与错误提示。
- 丰富文档与示例，补充 CLI/服务端示例以展示多代理协作流程。

欢迎提交 Issue 或 PR 与我们一起完善 DeepSearch MCP！

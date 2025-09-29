# DeepSearch MCP 项目

DeepSearch MCP 采用 TypeScript 实现，提供统一的客户端、代理层与 MCP 服务器入口，方便在 Model Context Protocol (MCP) 生态中调用可联网的 Deepsearch 模型，实现广域检索与站点定向检索能力。项目通过 Vitest 驱动的 TDD 保证核心逻辑的可测试性。

## 功能特性
- `deepsearch_mcp/`：导出 `DeepSearchMCPClient` 类型及搜索结果模型，负责与传输层交互并归一化响应。
- `deepsearch_agents/`：包含 `DeepSearchAgent` 与 `DeepSearchWebAgent`，分别处理通用检索与站点定向检索场景。
- `source/api.ts`：封装 DeepSearch HTTP 传输层，支持环境变量配置、超时控制与错误处理。
- `main.ts`：MCP 服务器入口，通过 STDIO 暴露 `deepsearch` 与 `deepsearch-web` 工具，可直接被 Codex、Claude Desktop 等 MCP 客户端调用。
- `tests/`：基于 Vitest 的单元测试，覆盖客户端、传输层、代理层与服务器工具注册流程。

## 快速开始
1. 安装依赖（Node.js ≥ 18）：
   ```bash
   npm install
   ```
2. 配置 `.env`（示例）：
   ```env
   API_KEY=sk-xxxxxx
   BASE_URL=https://yunwu.ai/v1/chat/completions
   MODEL_NAME=gemini-2.5-flash-deepsearch
   # 可选：覆盖默认超时（秒）
   DEEPSEARCH_TIMEOUT=400
   ```
3. 启动 MCP 服务器（STDIO）：
   ```bash
   # 开发模式（依赖 tsx）
   npm run deepsearch
   ```
   生产环境或打包后，可执行：
   ```bash
   npm run build
   node dist/main.js
   ```
4. 运行测试：
   ```bash
   npm test
   ```

## 使用示例（TypeScript）
```ts
import { DeepSearchAgent } from "deepsearch-mcp/deepsearch_agents/deepsearch";

const agent = new DeepSearchAgent();

const result = await agent.search("OpenAI 最新发布", { top_k: 3 });
for (const item of result.items) {
  console.log(item.title, item.url);
}

agent.close();
```

站点定向检索可使用 `DeepSearchWebAgent` 并传入 `filters: { site: "example.com" }` 或 `time_range` 等参数；通过 MCP 工具调用时同样使用这些字段。

## 集成到 Codex 客户端
在 `~/.codex/config.toml` 中新增 STDIO 类型服务器，让 Codex 自动启动 DeepSearch MCP：

```toml
[mcp_servers.deepsearch]
command = "node"
args = ["/absolute/path/to/DeepSearch-MCP/bin/deepsearch.js"]
env = {
  "API_KEY" = "<你的 Deepsearch API Key>",
  "BASE_URL" = "https://yunwu.ai/v1/chat/completions",
  "MODEL_NAME" = "gemini-2.5-flash-deepsearch",
  "DEEPSEARCH_TIMEOUT" = "400"
}
startup_timeout_sec = 30
tool_timeout_sec = 120
```

常用 CLI（实验性）：
```bash
codex mcp list
codex mcp get deepsearch
codex mcp remove deepsearch
```

若使用其他 MCP 客户端（Claude Desktop、Cursor 等），只需在其配置中运行 `node /path/bin/deepsearch.js`（或构建后的 `node /path/dist/main.js`），并传入相同的环境变量即可。

## Node.js 启动脚本
`bin/deepsearch.js` 会优先执行构建产物 `dist/main.js`；若未构建，则回退到本地 `tsx main.ts`。脚本继承当前终端环境变量，因此在 MCP 配置中设置的 `API_KEY`、`BASE_URL` 等会自动生效。

```bash
npm run deepsearch -- --top_k 3
# 或者直接调用脚本
node ./bin/deepsearch.js
```

命令行参数会透传给 `main.ts`（当前主程序未解析额外参数，通常无需传入）。

## 发布流程
- `npm run build`：输出 `dist/` 目录供分发或发布。
- `npm publish`：依赖 `prepublishOnly` 钩子自动构建。
- `.github/workflows/publish.yml`：在 GitHub Release 发布时自动运行测试并上传至 npm，需要在仓库中配置 `NPM_TOKEN` secrets。

## 常见问题
- **缺少凭证**：确认 `.env` 或宿主环境中已设置 `API_KEY`/`DEEPSEARCH_API_KEY`。
- **请求超时或无响应**：Deepsearch 模型响应较慢，可提升 `DEEPSEARCH_TIMEOUT` 或使用 `curl` 检查接口连通性。
- **网络代理**：若处于代理环境，可通过系统变量或 `global-agent` 等方式自定义 `fetch` 行为。

欢迎提交 Issue 或 PR 与我们一起完善 DeepSearch MCP！

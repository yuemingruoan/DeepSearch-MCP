# DeepSearch-MCP 代理与项目说明

## 项目总览
- `deepsearch_agents/deepsearch.ts`：通用 Deepsearch 代理入口，负责封装联网检索、结果整理与安全策略。
- `deepsearch_agents/deepsearch_web.ts`：站点定向检索代理，扩展参数过滤能力，聚焦网站级资料。
- `deepsearch_mcp/client.ts`：MCP 客户端封装，负责调用工具并归一化结果。
- `source/api.ts`：底层 API/HTTP 传输层，提供请求构造、响应解析与错误处理能力。
- `main.ts`：MCP 服务器入口，通过 STDIO 暴露 `deepsearch` 与 `deepsearch-web` 工具。
- `tests/*.test.ts`：Vitest 单元测试，覆盖客户端、传输层、代理层与服务器行为。
- `.env`：存放 Deepsearch 相关凭证（API Key、Endpoint 等），运行时由代理加载。

## 代理角色说明

### deepsearch
- **代码位置**：`deepsearch_agents/deepsearch.ts`
- **角色定位**：通过联网 Deepsearch 模型执行广域检索，输出结构化结果并给出可信度提示。
- **调用入口**：工具名称 `deepsearch`
- **输入参数**：
  - `query` (string)：检索问题或关键词，建议使用中文完整句式描述需求。
  - `top_k` (number，可选)：结果条数，默认 5，范围 1-10。
  - `locale` (string，可选)：内容语言，默认 `zh-CN`。
  - `filters` (Record<string, unknown>，可选)：附加条件，如 `{ "time_range": "7d", "site": "example.com" }`。
- **输出结构**：
  - `items`：包含 `title`、`snippet`、`url`、`score`（可选）的列表，按相关度排序。
  - `metadata`：记录 `source`、`latency_ms` 等追踪信息。
  - `usage`：统计 `input_tokens`、`output_tokens`，便于成本监控。
- **响应要求**：默认使用中文，突出核心结论并引用关键链接；说明置信度或可靠性；异常时给出原因与建议。

### deepsearch-web
- **代码位置**：`deepsearch_agents/deepsearch_web.ts`
- **角色定位**：面向特定站点与时间范围的精准检索，适用于定向资料挖掘。
- **调用入口**：工具名称 `deepsearch-web`
- **输入参数**：与 `deepsearch` 一致，但 `filters` 中至少需包含 `site` 或 `time_range`。
- **输出要求**：提供命中站点摘要，说明筛选条件是否生效，并给出对应链接。
- **异常处理**：若筛选条件无效或命中结果为空，要返回原因及下一步建议。

## 公共模块
- `source/api.ts` 提供统一的请求封装、重试策略、响应解析及错误类型，供两个代理与客户端复用。
- `deepsearch_mcp/client.ts` 定义搜索结果模型，确保代理与服务器返回结构一致。

## 环境与运行
- 在 `.env` 配置 `DEEPSEARCH_API_KEY` / `API_KEY`、`DEEPSEARCH_BASE_URL` / `BASE_URL`、`MODEL_NAME` 等变量，由 `dotenv` 自动加载。
- 启动 MCP 服务器：`npm run deepsearch`（开发模式）或 `node dist/main.js`（构建后）。
- 运行测试：`npm test`。

## 使用建议
1. 在对话中明确检索目标（背景、趋势、数据等），有助于获得更高质量的结果。
2. 多轮检索时，可在上下文中携带上一轮的 `metadata` 与 `items`，实现增量搜索或重点跟进。
3. 结合 `deepsearch` 的广域结果与 `deepsearch-web` 的定向数据，可快速构建覆盖广度与深度的报告。

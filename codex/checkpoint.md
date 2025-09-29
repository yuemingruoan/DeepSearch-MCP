## 需知 ##
- 本文件为ai的操作日志，可以更方便的得知先前的AI都进行过哪些操作，方便新ai快速了解项目和进行回溯

## 2025-09-29 16:56:38 CST
- 重构项目为 TypeScript：新增 `main.ts`、`source/api.ts`、`deepsearch_mcp/client.ts`、`deepsearch_agents/deepsearch*.ts` 等文件，并删除对应 Python 实现。
- 配置 Node.js 工程：更新 `package.json`、创建 `tsconfig.json`、`vitest.config.ts`、安装 npm 依赖并生成 `package-lock.json`。
- 编写 Vitest 测试 (`tests/*.test.ts`) 覆盖客户端、传输层、代理与服务器，运行 `npm test` 全部通过。
- 更新启动脚本 `bin/deepsearch.js` 支持构建产物，新增 GitHub workflow (`.github/workflows/publish.yml`) 实现 release 时自动 `npm publish`。
- 调整文档 (`README.md`、`AGENTS.md`) 说明新的 TypeScript 架构、启动方式与发布流程; 扩充 `.gitignore`。
- 移除旧的 Python 依赖文件（`pyproject.toml`、`uv.lock` 等）并提交 `refactor: migrate project to TypeScript MCP server`。

## 2025-09-29 17:27:29 CST
- 根据更新后的 `API_Docs.md` 改写 `source/api.ts`，改用 Google Gemini `generateContent` 接口，新增检索提示构建与响应解析逻辑。
- 调整 Vitest 测试（`tests/transport.test.ts` 等）以匹配新接口格式，并再次执行 `npm test`，12 项用例全部通过。

## 2025-09-29 18:00:09 CST
- 强化 googleSearch 提示词与 JSON 清洗逻辑，避免模型返回 Markdown 或额外文本导致解析失败。
- 更新 `sanitizeJsonContent` 去除 Markdown/列表并提取首个 JSON 块，对应调整 `tests/transport.test.ts`，Vitest 12 项用例全部通过。
- 执行 `npx tsx scripts/test-call.ts` 实际调用 Google Search API，成功返回 3 条结果并打印元数据。

## 2025-09-29 20:48:12 CST
- 引入统一日志模块 `source/logger.ts`，在服务器、代理、客户端与传输层接入结构化日志，同步输出至控制台与 `log/<timestamp>.log`。
- 更新 `.gitignore` 忽略日志目录；`DEEPSEARCH_LOG_LEVEL` 控制调试输出级别。
- 复跑 `npm test` 验证新增日志不影响既有行为；使用 `npx tsx scripts/test-call.ts` 自检实际 API 调用，定位 401 原因为示例 API Key 并确认更换有效 key 后检索成功。

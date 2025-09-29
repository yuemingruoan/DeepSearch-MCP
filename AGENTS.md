# DeepSearch-MCP 代理与项目说明

## 项目总览
- `mcp/deepsearch.py`：实现主力 Deepsearch 代理入口，负责封装联网检索、结果整理与安全策略。
- `mcp/deepsearch_web.py`：实现定向站点检索代理，扩展参数过滤能力，聚焦网站级资料。
- `source/api.py`：存放可复用的底层 API/HTTP 调用与数据模型，供多个代理共享。
- `tests/test_client.py`：TDD 首轮测试，约束客户端请求参数、默认值与结果归一化。
- `.env`：用于存储 Deepsearch 相关凭证（如 API Key、Endpoint 等），运行时由代理加载。

## 代理角色说明

### deepsearch
- **代码位置**：`mcp/deepsearch.py`
- **角色定位**：通过联网 Deepsearch 模型执行广域检索，输出结构化结果并给出可信度提示。
- **调用入口**：工具名称 `deepsearch`
- **输入参数**：
  - `query` (str)：检索问题或关键词；建议使用中文完整句式描述需求。
  - `top_k` (int，可选)：结果条数，默认 5，范围 1-10。
  - `locale` (str，可选)：内容语言，默认 `zh-CN`。
  - `filters` (dict，可选)：附加条件，如 `{ "time_range": "7d", "site": "example.com" }`。
- **输出结构**：
  - `items`：`title`、`snippet`、`url`、`score`（可选）等字段列表，按相关度排序。
  - `metadata`：记录 `source`、`latency_ms` 等追踪信息。
  - `usage`：统计 `input_tokens`、`output_tokens`，便于成本监控。
- **响应要求**：默认使用中文，突出核心结论并引用关键链接；说明置信度或可靠性；出现异常要返回明确原因与建议。
- **安全注意事项**：严禁输出违法/侵权信息，不杜撰未检索到的事实；涉及医疗、金融、法律等敏感主题时需强调仅供参考。

### deepsearch-web
- **代码位置**：`mcp/deepsearch_web.py`
- **角色定位**：面向特定站点与时间范围的精准检索，适用于定向资料挖掘。
- **调用入口**：工具名称 `deepsearch-web`
- **输入参数**：与 `deepsearch` 一致，但 `filters` 中至少包含 `site` 或 `time_range`。
- **输出要求**：提供命中站点的摘要，明确筛选条件是否生效，并给出对应链接。
- **异常处理**：若筛选条件无效或命中结果为空，要返回原因及下一步建议。

## 公共模块
- `source/api.py` 应提供统一的请求封装、重试策略、响应解析及错误类型，供两个代理复用。
- 若在 `tests/test_client.py` 中定义的数据模型（如 `SearchResultItem`）可抽离，此处也可集中定义，保持类型一致性。

## 环境与运行
- 在 `.env` 配置 `DEEPSEARCH_API_KEY`、`DEEPSEARCH_ENDPOINT` 等变量，开发运行时通过 `python-dotenv` 或自定义加载逻辑注入。
- 使用 `uv run pytest` 执行现有测试（当前因实现缺失会失败，TDD 下需先补齐代码再验证）。

## 使用建议
1. 对话中明确检索目标（背景、趋势、数据等）以提高命中质量。
2. 需要多轮检索时，可在上下文中携带上一轮的 `metadata` 与 `items`，实现增量搜索或重点跟进。
3. 结合 `deepsearch` 的广域结果与 `deepsearch-web` 的定向结果，可快速构建覆盖广度与深度的报告。

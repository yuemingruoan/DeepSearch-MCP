import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { DeepSearchAgent } from "./deepsearch_agents/deepsearch.js";
import { DeepSearchWebAgent } from "./deepsearch_agents/deepsearch_web.js";
import { logger } from "./source/logger.js";

const searchItemShape = {
  title: z.string(),
  snippet: z.string(),
  url: z.string(),
  score: z.number().nullable(),
};

const searchResultShape = {
  items: z.array(z.object(searchItemShape)),
  metadata: z.record(z.any()),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
  }),
};

const deepSearchInputShape = {
  query: z.string().min(1, "query 不能为空"),
  top_k: z.number().int().min(1).max(10).optional(),
  locale: z.string().optional(),
  filters: z.record(z.any()).default({}),
};

const deepSearchWebInputShape = {
  ...deepSearchInputShape,
  filters: z
    .record(z.any())
    .refine((filters) => typeof filters.site === "string" || typeof filters.time_range === "string", {
      message: "filters 需要包含 site 或 time_range 字段",
    }),
};

const deepSearchInputSchema = z.object(deepSearchInputShape);
const deepSearchWebInputSchema = z.object(deepSearchWebInputShape);
const searchResultSchema = z.object(searchResultShape);

interface ServerInitOptions {
  deepsearchAgent?: DeepSearchAgent;
  deepsearchWebAgent?: DeepSearchWebAgent;
}

export function createServer(options: ServerInitOptions = {}) {
  logger.info("创建 DeepSearch MCP 服务器实例");
  const managedAgents: Array<{ close: () => void }> = [];

  const deepsearchAgent = options.deepsearchAgent ?? new DeepSearchAgent();
  const deepsearchWebAgent = options.deepsearchWebAgent ?? new DeepSearchWebAgent();

  if (!options.deepsearchAgent) {
    managedAgents.push({ close: () => deepsearchAgent.close() });
  }
  if (!options.deepsearchWebAgent) {
    managedAgents.push({ close: () => deepsearchWebAgent.close() });
  }

  const server = new McpServer({
    name: "deepsearch-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "deepsearch",
    {
      title: "DeepSearch 通用检索",
      description: "使用 DeepSearch 模型执行广域检索并返回结构化结果,拥有比AI Agent内置搜索更好的搜索效果但更耗时，需要平衡需求",
      inputSchema: deepSearchInputShape,
      outputSchema: searchResultShape,
    },
    async (args) => {
      const toolLogger = logger.child({ tool: "deepsearch" });
      toolLogger.info("收到工具调用", args);
      const result = await deepsearchAgent.search(args.query, {
        top_k: args.top_k,
        locale: args.locale,
        filters: args.filters,
      });

      const structured = searchResultSchema.parse(result);
      toolLogger.info("完成工具调用", { itemCount: structured.items.length });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(structured, null, 2),
          },
        ],
        structuredContent: structured,
      };
    },
  );

  server.registerTool(
    "deepsearch-web",
    {
      title: "DeepSearch 定向检索",
      description: "针对站点或时间范围的 DeepSearch 定向检索，拥有比AI Agent内置搜索更好的搜索效果但更耗时，需要平衡需求",
      inputSchema: deepSearchWebInputShape,
      outputSchema: searchResultShape,
    },
    async (args) => {
      const toolLogger = logger.child({ tool: "deepsearch-web" });
      toolLogger.info("收到工具调用", args);
      const result = await deepsearchWebAgent.search(args.query, {
        top_k: args.top_k,
        locale: args.locale,
        filters: args.filters,
      });

      const structured = searchResultSchema.parse(result);
      toolLogger.info("完成工具调用", { itemCount: structured.items.length });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(structured, null, 2),
          },
        ],
        structuredContent: structured,
      };
    },
  );

  const close = async () => {
    logger.info("开始关闭服务器与代理");
    for (const agent of managedAgents) {
      try {
        agent.close();
      } catch (error) {
        logger.error("关闭代理时出错", error);
      }
    }
    logger.info("代理关闭完成");
  };

  return { server, close };
}

export async function main() {
  const { server, close } = createServer();
  const transport = new StdioServerTransport();

  const teardown = async () => {
    await server.close().catch((error) => {
      logger.error("关闭 MCP 服务器时出错", error);
    });
    await close();
  };

  process.on("SIGINT", async () => {
    logger.warn("接收到 SIGINT，准备退出");
    await teardown();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    logger.warn("接收到 SIGTERM，准备退出");
    await teardown();
    process.exit(0);
  });

  logger.info("正在通过 STDIO 启动 MCP 服务器");
  await server.connect(transport);
  logger.info("MCP 服务器启动完成，等待客户端连接");
}

const isDirectRun = fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  main().catch((error) => {
    logger.error("DeepSearch MCP 服务器启动失败", error);
    process.exit(1);
  });
}

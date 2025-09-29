import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { DeepSearchAgent } from "./deepsearch_agents/deepsearch.js";
import { DeepSearchWebAgent } from "./deepsearch_agents/deepsearch_web.js";

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
      const result = await deepsearchAgent.search(args.query, {
        top_k: args.top_k,
        locale: args.locale,
        filters: args.filters,
      });

      const structured = searchResultSchema.parse(result);

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
      const result = await deepsearchWebAgent.search(args.query, {
        top_k: args.top_k,
        locale: args.locale,
        filters: args.filters,
      });

      const structured = searchResultSchema.parse(result);

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
    for (const agent of managedAgents) {
      try {
        agent.close();
      } catch (error) {
        console.error("关闭代理时出错", error);
      }
    }
  };

  return { server, close };
}

export async function main() {
  const { server, close } = createServer();
  const transport = new StdioServerTransport();

  const teardown = async () => {
    await server.close().catch((error) => {
      console.error("关闭 MCP 服务器时出错", error);
    });
    await close();
  };

  process.on("SIGINT", async () => {
    await teardown();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await teardown();
    process.exit(0);
  });

  await server.connect(transport);
}

const isDirectRun = fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  main().catch((error) => {
    console.error("DeepSearch MCP 服务器启动失败", error);
    process.exit(1);
  });
}

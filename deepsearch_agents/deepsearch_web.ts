import { DeepSearchMCPClient, type SearchOptions, type SearchResult } from "../deepsearch_mcp/client.js";
import { DeepSearchTransport } from "../source/api.js";
import { logger, type Logger } from "../source/logger.js";

interface AgentOptions {
  client?: DeepSearchMCPClient;
  transport?: DeepSearchTransport;
}

export class DeepSearchWebAgent {
  private readonly client: DeepSearchMCPClient;
  private readonly transport?: DeepSearchTransport;
  private readonly logger: Logger;

  constructor(options: AgentOptions = {}) {
    const agentLogger = logger.child({ agent: "deepsearch-web" });
    agentLogger.debug("初始化 DeepSearchWebAgent", { providedClient: Boolean(options.client) });

    if (options.client) {
      this.client = options.client;
      this.transport = options.transport;
    } else {
      const transport = options.transport ?? DeepSearchTransport.fromEnv();
      this.client = new DeepSearchMCPClient(transport, { toolName: "deepsearch-web" });
      this.transport = transport;
    }
    this.logger = agentLogger;
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult> {
    const filters = options.filters ?? {};
    if (!filters.site && !filters.time_range) {
      this.logger.error("缺少必要过滤条件", { query, options });
      throw new Error("deepsearch-web 需要提供 site 或 time_range 过滤条件");
    }

    this.logger.info("执行定向检索", { query, options });
    return this.client.search(query, { ...options, filters });
  }

  close(): void {
    this.logger.debug("关闭代理");
    this.transport?.close();
  }
}

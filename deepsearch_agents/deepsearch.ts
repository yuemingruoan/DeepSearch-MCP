import { DeepSearchMCPClient, type SearchOptions, type SearchResult } from "../deepsearch_mcp/client.js";
import { DeepSearchTransport } from "../source/api.js";
import { logger, type Logger } from "../source/logger.js";

interface AgentOptions {
  client?: DeepSearchMCPClient;
  transport?: DeepSearchTransport;
}

export class DeepSearchAgent {
  private readonly client: DeepSearchMCPClient;
  private readonly transport?: DeepSearchTransport;
  private readonly logger: Logger;

  constructor(options: AgentOptions = {}) {
    const agentLogger = logger.child({ agent: "deepsearch" });
    agentLogger.debug("初始化 DeepSearchAgent", { providedClient: Boolean(options.client) });

    if (options.client) {
      this.client = options.client;
      this.transport = options.transport;
    } else {
      const transport = options.transport ?? DeepSearchTransport.fromEnv();
      this.client = new DeepSearchMCPClient(transport, { toolName: "deepsearch" });
      this.transport = transport;
    }
    this.logger = agentLogger;
  }

  search(query: string, options: SearchOptions = {}): Promise<SearchResult> {
    this.logger.info("执行检索", { query, options });
    return this.client.search(query, options);
  }

  close(): void {
    this.logger.debug("关闭代理");
    this.transport?.close();
  }
}

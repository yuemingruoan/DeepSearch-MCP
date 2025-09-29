import { DeepSearchMCPClient, type SearchOptions, type SearchResult } from "../deepsearch_mcp/client.js";
import { DeepSearchTransport } from "../source/api.js";

interface AgentOptions {
  client?: DeepSearchMCPClient;
  transport?: DeepSearchTransport;
}

export class DeepSearchWebAgent {
  private readonly client: DeepSearchMCPClient;
  private readonly transport?: DeepSearchTransport;

  constructor(options: AgentOptions = {}) {
    if (options.client) {
      this.client = options.client;
      this.transport = options.transport;
    } else {
      const transport = options.transport ?? DeepSearchTransport.fromEnv();
      this.client = new DeepSearchMCPClient(transport, { toolName: "deepsearch-web" });
      this.transport = transport;
    }
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult> {
    const filters = options.filters ?? {};
    if (!filters.site && !filters.time_range) {
      throw new Error("deepsearch-web 需要提供 site 或 time_range 过滤条件");
    }

    return this.client.search(query, { ...options, filters });
  }

  close(): void {
    this.transport?.close();
  }
}

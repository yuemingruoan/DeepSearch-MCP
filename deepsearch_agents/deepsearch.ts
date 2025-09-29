import { DeepSearchMCPClient, type SearchOptions, type SearchResult } from "../deepsearch_mcp/client.js";
import { DeepSearchTransport } from "../source/api.js";

interface AgentOptions {
  client?: DeepSearchMCPClient;
  transport?: DeepSearchTransport;
}

export class DeepSearchAgent {
  private readonly client: DeepSearchMCPClient;
  private readonly transport?: DeepSearchTransport;

  constructor(options: AgentOptions = {}) {
    if (options.client) {
      this.client = options.client;
      this.transport = options.transport;
    } else {
      const transport = options.transport ?? DeepSearchTransport.fromEnv();
      this.client = new DeepSearchMCPClient(transport, { toolName: "deepsearch" });
      this.transport = transport;
    }
  }

  search(query: string, options: SearchOptions = {}): Promise<SearchResult> {
    return this.client.search(query, options);
  }

  close(): void {
    this.transport?.close();
  }
}

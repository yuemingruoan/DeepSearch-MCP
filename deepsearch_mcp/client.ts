import type { DeepSearchResponsePayload, DeepSearchTransport } from "../source/api.js";
import { logger, type Logger } from "../source/logger.js";

export interface SearchResultItem {
  title: string;
  snippet: string;
  url: string;
  score: number | null;
}

export interface SearchResult {
  items: SearchResultItem[];
  metadata: Record<string, unknown>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface SearchOptions {
  top_k?: number;
  locale?: string;
  filters?: Record<string, unknown>;
}

export class DeepSearchMCPClient {
  private readonly transport: DeepSearchTransport;
  private readonly toolName: string;
  private readonly logger: Logger;

  constructor(transport: DeepSearchTransport, options: { toolName?: string } = {}) {
    this.transport = transport;
    this.toolName = options.toolName ?? "deepsearch";
    this.logger = logger.child({ module: "DeepSearchMCPClient", tool: this.toolName });
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult> {
    const topK = options.top_k ?? 5;
    if (topK <= 0) {
      throw new Error("top_k 必须为正整数");
    }

    const payload = {
      query,
      top_k: topK,
      locale: options.locale ?? "zh-CN",
      filters: options.filters ?? {},
    };

    this.logger.info("发起工具调用", payload);
    const response = await this.transport.invokeTool(this.toolName, payload);
    return this.toSearchResult(response);
  }

  private toSearchResult(response: DeepSearchResponsePayload): SearchResult {
    this.logger.debug("解析响应", response);
    return {
      items: (response.items ?? []).map((item) => ({
        title: item.title ?? "",
        snippet: item.snippet ?? "",
        url: item.url ?? "",
        score: item.score ?? null,
      })),
      metadata: response.metadata ?? {},
      usage: {
        input_tokens: Number(response.usage?.input_tokens ?? 0),
        output_tokens: Number(response.usage?.output_tokens ?? 0),
      },
    };
  }
}

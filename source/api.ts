import { config as loadEnv } from "dotenv";

loadEnv();

export class DeepSearchAPIError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DeepSearchAPIError";
  }
}

export interface DeepSearchUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface DeepSearchItem {
  title: string;
  snippet?: string;
  url: string;
  score?: number | null;
}

export interface DeepSearchResponsePayload {
  items: DeepSearchItem[];
  metadata: Record<string, unknown>;
  usage: DeepSearchUsage;
}

export interface InvokePayload {
  query: string;
  top_k?: number;
  locale?: string;
  filters?: Record<string, unknown>;
}

export class DeepSearchConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly timeoutMs: number;

  constructor(params: { apiKey: string; baseUrl?: string; model?: string; timeoutMs?: number }) {
    this.apiKey = params.apiKey;
    this.baseUrl = params.baseUrl ? normalizeBaseUrl(params.baseUrl) : "https://yunwu.ai";
    this.model = params.model ?? "gemini-2.5-pro";
    this.timeoutMs = params.timeoutMs ?? 400_000;
  }

  static fromEnv(): DeepSearchConfig {
    const apiKey = getFirstEnv(["DEEPSEARCH_API_KEY", "API_KEY", "DEEPSEARCH_TOKEN"]);
    if (!apiKey) {
      throw new DeepSearchAPIError("缺少 DEEPSEARCH_API_KEY 配置");
    }

    const rawBase = getFirstEnv(["DEEPSEARCH_BASE_URL", "BASE_URL"]) ?? "https://yunwu.ai";
    const model = getFirstEnv(["DEEPSEARCH_MODEL", "MODEL_NAME", "MODEL"]) ?? "gemini-2.5-pro";
    const timeoutRaw = getFirstEnv(["DEEPSEARCH_TIMEOUT", "TIMEOUT"]) ?? "400";

    const timeoutValue = Number(timeoutRaw);
    if (Number.isNaN(timeoutValue)) {
      throw new DeepSearchAPIError("DEEPSEARCH_TIMEOUT 必须为数字");
    }

    return new DeepSearchConfig({
      apiKey,
      baseUrl: rawBase,
      model,
      timeoutMs: timeoutValue * 1000,
    });
  }
}

function getFirstEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeBaseUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.protocol}//${url.host}`;
  } catch (error) {
    throw new DeepSearchAPIError("DEEPSEARCH_BASE_URL 配置无效", { cause: error as Error });
  }
}

export interface DeepSearchTransportOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

export class DeepSearchTransport {
  private readonly config: DeepSearchConfig;
  private readonly endpoint: string;

  constructor(options: DeepSearchTransportOptions | DeepSearchConfig) {
    this.config = options instanceof DeepSearchConfig ? options : new DeepSearchConfig(options);
    this.endpoint = new URL("/v1/chat/completions", this.config.baseUrl).toString();
  }

  static fromEnv(): DeepSearchTransport {
    return new DeepSearchTransport(DeepSearchConfig.fromEnv());
  }

  async invokeTool(toolName: string, payload: InvokePayload): Promise<DeepSearchResponsePayload> {
    const body = this.buildRequest(toolName, payload);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = `DeepSearch API 返回错误状态: ${response.status}`;
        throw new DeepSearchAPIError(message);
      }

      const data = (await response.json()) as Record<string, unknown>;
      return this.parseResponse(data);
    } catch (error) {
      if (error instanceof DeepSearchAPIError) {
        throw error;
      }

      if ((error as Error).name === "AbortError") {
        throw new DeepSearchAPIError("DeepSearch API 请求超时", { cause: error as Error });
      }

      throw new DeepSearchAPIError(`DeepSearch API 请求失败: ${(error as Error).message}`, {
        cause: error as Error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildRequest(toolName: string, payload: InvokePayload): Record<string, unknown> {
    const systemPrompt = this.systemPrompt(toolName);
    return {
      model: this.config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(payload, null, 2) },
      ],
      temperature: 0.1,
      top_p: 0.9,
      stream: false,
      response_format: { type: "json_object" },
      tools: [this.toolSchema()],
      tool_choice: {
        type: "function",
        function: { name: "format_deepsearch_response" },
      },
    };
  }

  private parseResponse(data: Record<string, unknown>): DeepSearchResponsePayload {
    const choices = data?.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new DeepSearchAPIError("DeepSearch API 响应缺少有效的消息内容");
    }

    const first = choices[0] as Record<string, unknown>;
    const message = first?.message as Record<string, unknown> | undefined;
    const content = message?.content;

    if (typeof content !== "string") {
      throw new DeepSearchAPIError("DeepSearch API 响应内容不是合法的 JSON");
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new DeepSearchAPIError("DeepSearch API 响应内容不是合法的 JSON", { cause: error as Error });
    }

    const itemsRaw = Array.isArray(parsed.items) ? (parsed.items as DeepSearchItem[]) : [];
    const metadata = (parsed.metadata as Record<string, unknown>) ?? {};
    let usage = parsed.usage as DeepSearchUsage | undefined;

    if (!usage) {
      const apiUsage = (data.usage ?? {}) as Record<string, unknown>;
      usage = {
        input_tokens: Number(apiUsage.prompt_tokens ?? 0),
        output_tokens: Number(apiUsage.completion_tokens ?? 0),
      };
    }

    return {
      items: itemsRaw.map((item) => ({
        title: item.title,
        snippet: item.snippet ?? "",
        url: item.url,
        score: item.score ?? null,
      })),
      metadata,
      usage,
    };
  }

  private toolSchema(): Record<string, unknown> {
    return {
      type: "function",
      function: {
        name: "format_deepsearch_response",
        description: "格式化 DeepSearch 的结构化响应",
        parameters: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  snippet: { type: "string" },
                  url: { type: "string", format: "uri" },
                  score: { type: ["number", "null"] },
                },
                required: ["title", "url"],
              },
            },
            metadata: { type: "object" },
            usage: { type: "object" },
          },
          required: ["items"],
        },
      },
    };
  }

  private systemPrompt(toolName: string): string {
    if (toolName === "deepsearch-web") {
      return "你是 DeepSearch-Website 工具，必须返回 JSON，其中 items 为命中网站结果，metadata 至少包含 source 字段；确保 filters 中 site/time_range 限制生效。";
    }

    return "你是 DeepSearch 通用检索工具，必须返回 JSON，其中 items 为查询相关结果列表，metadata 包含来源与延迟信息，usage 提供 token 统计。";
  }

  close(): void {
    // 当前实现使用无状态 HTTP 请求，无需保留连接
  }
}

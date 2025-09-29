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
    this.model = params.model ?? "gemini-2.5-flash";
    this.timeoutMs = params.timeoutMs ?? 400_000;
  }

  static fromEnv(): DeepSearchConfig {
    const apiKey = getFirstEnv(["DEEPSEARCH_API_KEY", "API_KEY", "DEEPSEARCH_TOKEN"]);
    if (!apiKey) {
      throw new DeepSearchAPIError("缺少 DEEPSEARCH_API_KEY 配置");
    }

    const rawBase = getFirstEnv(["DEEPSEARCH_BASE_URL", "BASE_URL"]) ?? "https://yunwu.ai";
    const model = getFirstEnv(["DEEPSEARCH_MODEL", "MODEL_NAME", "MODEL"]) ?? "gemini-2.5-flash";
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
  private readonly endpoint: URL;

  constructor(options: DeepSearchTransportOptions | DeepSearchConfig) {
    this.config = options instanceof DeepSearchConfig ? options : new DeepSearchConfig(options);
    this.endpoint = new URL("/v1beta/models/gemini-2.5-flash:generateContent", this.config.baseUrl);
    this.endpoint.searchParams.set("key", this.config.apiKey);
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
    const prompt = this.buildUserPrompt(toolName, payload);
    return {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      tools: [{ googleSearch: {} }],
    };
  }

  private parseResponse(data: Record<string, unknown>): DeepSearchResponsePayload {
    const candidates = data?.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      throw new DeepSearchAPIError("DeepSearch API 响应缺少有效的消息内容");
    }

    const content = extractTextFromCandidate(candidates[0] as Record<string, unknown>);
    if (!content) {
      throw new DeepSearchAPIError("DeepSearch API 响应内容不是合法的 JSON");
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(sanitizeJsonContent(content));
    } catch (error) {
      throw new DeepSearchAPIError("DeepSearch API 响应内容不是合法的 JSON", { cause: error as Error });
    }

    const itemsRaw = Array.isArray(parsed.items) ? (parsed.items as DeepSearchItem[]) : [];
    const metadata = (parsed.metadata as Record<string, unknown>) ?? {};
    let usage = parsed.usage as DeepSearchUsage | undefined;

    if (!usage) {
      const usageMetadata = (data.usageMetadata ?? {}) as Record<string, unknown>;
      usage = {
        input_tokens: Number(usageMetadata.promptTokenCount ?? 0),
        output_tokens: Number(usageMetadata.candidatesTokenCount ?? usageMetadata.cachedContentTokenCount ?? 0),
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

  private buildUserPrompt(toolName: string, payload: InvokePayload): string {
    const topK = payload.top_k ?? 5;
    const locale = payload.locale ?? "zh-CN";
    const filters = payload.filters ?? {};
    const filterInstruction =
      toolName === "deepsearch-web"
        ? "必须使用 filters 中的 site/time_range 限制，确保返回结果满足条件。"
        : "可结合 filters 中提供的约束优化检索。";

    return [
      "任务: 调用 googleSearch 工具检索并汇总最新的权威信息。",
      `查询: ${payload.query}`,
      `语言: ${locale}`,
      `返回条数: ${topK}`,
      `附加筛选: ${JSON.stringify(filters)}`,
      filterInstruction,
      "输出格式要求: 必须返回合法 JSON，不能包含 Markdown、注释、额外文本或代码块标记。",
      "最终只输出以下结构: {\"items\":[{\"title\":string,\"snippet\":string,\"url\":string,\"score\":number|null}],\"metadata\":{\"source\":string,\"locale\":string,\"top_k\":number,\"filters\":object},\"usage\":{\"input_tokens\":number,\"output_tokens\":number}}。",
      "items 按相关度降序，snippet 使用中文简洁总结，score 为可信度(0-1)，无法给出则为 null。",
      "metadata.source 固定为 'google-search'，并补充 locale/top_k/filters 信息。",
      "⚠️ 严禁输出任何额外字符（包括 ```、解释文字、列表、粗体等）。",
    ].join("\n");
  }

  close(): void {
    // 当前实现使用无状态 HTTP 请求，无需保留连接
  }
}

function extractTextFromCandidate(candidate: Record<string, unknown>): string | undefined {
  const content = candidate?.content as Record<string, unknown> | undefined;
  const parts = content?.parts;
  if (!Array.isArray(parts)) {
    return undefined;
  }

  for (const part of parts) {
    const text = (part as Record<string, unknown>)?.text;
    if (typeof text === "string" && text.trim().length > 0) {
      return text;
    }
  }

  return undefined;
}

function sanitizeJsonContent(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    const lines = trimmed.split(/\r?\n/);
    // remove first fence
    lines.shift();
    // remove closing fence if present at end
    if (lines.length > 0 && lines[lines.length - 1].trim().startsWith("```")) {
      lines.pop();
    }
    return lines.join("\n").trim();
  }
  // 去除常见的 Markdown 前缀（如 **、- 、序号等）
  const withoutMarkdown = trimmed
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\*\*(.*?)\*\*/gm, "$1");

  const match = withoutMarkdown.match(/\{[\s\S]*\}/);
  if (match) {
    return match[0];
  }

  return withoutMarkdown;
}

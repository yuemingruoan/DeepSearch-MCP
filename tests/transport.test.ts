import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DeepSearchAPIError,
  DeepSearchTransport,
  DeepSearchConfig,
} from "../source/api.js";

const originalFetch = globalThis.fetch;

describe("DeepSearchTransport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
  });

  afterAll(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
  });

  it("invokes google search endpoint and parses payload", async () => {
    const mockPayload = {
      items: [
        {
          title: "结果标题",
          snippet: "结果摘要",
          url: "https://example.com/result",
          score: 0.95,
        },
      ],
      metadata: { source: "deepsearch", latency_ms: 42 },
      usage: { input_tokens: 12, output_tokens: 18 },
    };

    const responseBody = {
      candidates: [
        {
          content: {
            parts: [
              { text: JSON.stringify(mockPayload) },
            ],
          },
        },
      ],
      usageMetadata: {
        promptTokenCount: 9,
        candidatesTokenCount: 11,
        totalTokenCount: 20,
      },
    };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    globalThis.fetch = fetchMock;

    const transport = new DeepSearchTransport({
      apiKey: "test-key",
      baseUrl: "https://yunwu.ai",
      model: "gemini-2.5-pro",
      timeoutMs: 5_000,
    });

    const result = await transport.invokeTool("deepsearch", {
      query: "pytest 查询",
      top_k: 3,
      locale: "zh-CN",
      filters: { time_range: "7d" },
    });

    expect(result.items[0].title).toBe("结果标题");
    expect(result.usage.output_tokens).toBe(18);
    expect(result.metadata.source).toBe("deepsearch");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [urlValue, init] = fetchMock.mock.calls[0] as [string | URL, RequestInit];
    const href = urlValue instanceof URL ? urlValue.href : urlValue;
    expect(href).toBe("https://yunwu.ai/v1beta/models/gemini-2.5-flash:generateContent?key=test-key");
    expect(init?.method).toBe("POST");

    const parsedBody = JSON.parse(init?.body as string);
    expect(parsedBody.contents[0].parts[0].text).toContain("pytest 查询");
    expect(parsedBody.tools).toEqual([{ googleSearch: {} }]);
  });

  it("throws on invalid JSON content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: "不是合法 JSON" }],
              },
            },
          ],
          usageMetadata: {},
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    globalThis.fetch = fetchMock;

    const transport = new DeepSearchTransport({ apiKey: "test-key" });

    await expect(
      transport.invokeTool("deepsearch", { query: "bad json" }),
    ).rejects.toThrow(DeepSearchAPIError);
  });

  it("wraps transport errors", async () => {
    const abortError = Object.assign(new Error("timeout"), { name: "AbortError" });
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    globalThis.fetch = fetchMock;

    const transport = new DeepSearchTransport({ apiKey: "test-key" });

    await expect(
      transport.invokeTool("deepsearch", { query: "timeout" }),
    ).rejects.toThrow(/超时/);
  });

  it("constructs config from environment variables", () => {
    const originalApiKey = process.env.API_KEY;
    const originalBase = process.env.BASE_URL;
    const originalModel = process.env.MODEL_NAME;
    const originalTimeout = process.env.DEEPSEARCH_TIMEOUT;

    process.env.API_KEY = "env-key";
    process.env.BASE_URL = "https://example.com/v1/chat/completions";
    process.env.MODEL_NAME = "gemini-web";
    process.env.DEEPSEARCH_TIMEOUT = "12";

    const config = DeepSearchConfig.fromEnv();

    expect(config.apiKey).toBe("env-key");
    expect(config.baseUrl).toBe("https://example.com");
    expect(config.model).toBe("gemini-web");
    expect(config.timeoutMs).toBe(12_000);

    process.env.API_KEY = originalApiKey;
    process.env.BASE_URL = originalBase;
    process.env.MODEL_NAME = originalModel;
    process.env.DEEPSEARCH_TIMEOUT = originalTimeout;
  });
});

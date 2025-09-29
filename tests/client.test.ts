import { describe, expect, it, vi } from "vitest";

import { DeepSearchMCPClient } from "../deepsearch_mcp/client.js";
import type { DeepSearchTransport, DeepSearchResponsePayload } from "../source/api.js";

function createMockTransport(response: DeepSearchResponsePayload) {
  const invokeTool = vi.fn().mockResolvedValue(response);
  return {
    transport: { invokeTool } as unknown as DeepSearchTransport,
    invokeTool,
  };
}

describe("DeepSearchMCPClient", () => {
  it("invokes transport with expected payload", async () => {
    const response: DeepSearchResponsePayload = {
      items: [
        {
          title: "示例标题",
          snippet: "示例摘要",
          url: "https://example.com/article",
          score: 0.88,
        },
      ],
      metadata: { source: "deepsearch" },
      usage: { input_tokens: 10, output_tokens: 15 },
    };

    const { transport, invokeTool } = createMockTransport(response);
    const client = new DeepSearchMCPClient(transport, { toolName: "deepsearch-web" });

    const result = await client.search("测试查询", {
      top_k: 3,
      locale: "zh-CN",
      filters: { site: "example.com" },
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      title: "示例标题",
      snippet: "示例摘要",
      url: "https://example.com/article",
      score: 0.88,
    });

    expect(invokeTool).toHaveBeenCalledWith("deepsearch-web", {
      query: "测试查询",
      top_k: 3,
      locale: "zh-CN",
      filters: { site: "example.com" },
    });
  });

  it("normalizes missing fields and defaults", async () => {
    const response: DeepSearchResponsePayload = {
      items: [
        {
          title: "只有标题",
          url: "https://example.com/only-title",
        },
      ],
      metadata: {},
      usage: { input_tokens: 0, output_tokens: 0 },
    };

    const { transport, invokeTool } = createMockTransport(response);
    const client = new DeepSearchMCPClient(transport);

    const result = await client.search("默认配置");

    expect(invokeTool).toHaveBeenCalledWith("deepsearch", {
      query: "默认配置",
      top_k: 5,
      locale: "zh-CN",
      filters: {},
    });

    expect(result.items[0]).toMatchObject({
      title: "只有标题",
      snippet: "",
      score: null,
    });
  });

  it("throws when top_k is not positive", async () => {
    const { transport } = createMockTransport({
      items: [],
      metadata: {},
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const client = new DeepSearchMCPClient(transport);

    await expect(client.search("无效的数量", { top_k: 0 })).rejects.toThrow("top_k 必须为正整数");
    await expect(client.search("无效的数量", { top_k: -3 })).rejects.toThrow("top_k 必须为正整数");
  });
});

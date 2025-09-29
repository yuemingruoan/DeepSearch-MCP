import { describe, expect, it, vi } from "vitest";

import { createServer } from "../main.js";
import type { SearchResult } from "../deepsearch_mcp/client.js";

const sampleResult: SearchResult = {
  items: [
    {
      title: "测试标题",
      snippet: "测试摘要",
      url: "https://example.com/item",
      score: 0.9,
    },
  ],
  metadata: { source: "deepsearch" },
  usage: { input_tokens: 5, output_tokens: 7 },
};

describe("createServer", () => {
  it("registers deepsearch tools and delegates to agents", async () => {
    const deepAgent = {
      search: vi.fn().mockResolvedValue(sampleResult),
      close: vi.fn(),
    };
    const webAgent = {
      search: vi.fn().mockResolvedValue(sampleResult),
      close: vi.fn(),
    };

    const { server, close } = createServer({
      deepsearchAgent: deepAgent as any,
      deepsearchWebAgent: webAgent as any,
    });

    const tools = (server as any)._registeredTools;
    expect(Object.keys(tools)).toEqual(expect.arrayContaining(["deepsearch", "deepsearch-web"]));

    const generalResult = await tools.deepsearch.callback(
      { query: "最新资讯", top_k: 3, locale: "zh-CN", filters: {} },
      {} as any,
    );

    expect(deepAgent.search).toHaveBeenCalledWith("最新资讯", {
      top_k: 3,
      locale: "zh-CN",
      filters: {},
    });
    expect(generalResult.structuredContent.items[0].title).toBe("测试标题");

    const webResult = await tools["deepsearch-web"].callback(
      { query: "定向查询", top_k: 2, locale: "zh-CN", filters: { site: "example.com" } },
      {} as any,
    );

    expect(webAgent.search).toHaveBeenCalledWith("定向查询", {
      top_k: 2,
      locale: "zh-CN",
      filters: { site: "example.com" },
    });
    expect(webResult.structuredContent.metadata.source).toBe("deepsearch");

    await close();
    expect(deepAgent.close).not.toHaveBeenCalled();
    expect(webAgent.close).not.toHaveBeenCalled();
  });
});

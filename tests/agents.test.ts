import { describe, expect, it, vi } from "vitest";

import { DeepSearchAgent } from "../deepsearch_agents/deepsearch.js";
import { DeepSearchWebAgent } from "../deepsearch_agents/deepsearch_web.js";
import type { SearchResult } from "../deepsearch_mcp/client.js";

const sampleResult: SearchResult = {
  items: [
    {
      title: "示例标题",
      snippet: "示例摘要",
      url: "https://example.com",
      score: 0.8,
    },
  ],
  metadata: { source: "deepsearch" },
  usage: { input_tokens: 10, output_tokens: 12 },
};

describe("DeepSearchAgent", () => {
  it("delegates search to client", async () => {
    const client = { search: vi.fn().mockResolvedValue(sampleResult) };
    const agent = new DeepSearchAgent({ client } as any);

    const result = await agent.search("最新 AI 动态", { top_k: 4 });

    expect(client.search).toHaveBeenCalledWith("最新 AI 动态", { top_k: 4 });
    expect(result.items[0].title).toBe("示例标题");
  });

  it("closes managed transport when not injected", () => {
    const close = vi.fn();
    const agent = new DeepSearchAgent({
      client: {
        search: vi.fn().mockResolvedValue(sampleResult),
      } as any,
      transport: { close } as any,
    });

    agent.close();
    expect(close).toHaveBeenCalled();
  });
});

describe("DeepSearchWebAgent", () => {
  it("requires site or time_range filter", async () => {
    const agent = new DeepSearchWebAgent({
      client: { search: vi.fn().mockResolvedValue(sampleResult) } as any,
    });

    await expect(agent.search("定向检索", { filters: {} })).rejects.toThrow(
      "deepsearch-web 需要提供 site 或 time_range 过滤条件",
    );
  });

  it("delegates to client when filters valid", async () => {
    const client = { search: vi.fn().mockResolvedValue(sampleResult) };
    const agent = new DeepSearchWebAgent({ client } as any);

    await agent.search("定向检索", { filters: { site: "example.com" }, top_k: 2 });

    expect(client.search).toHaveBeenCalledWith("定向检索", {
      filters: { site: "example.com" },
      top_k: 2,
    });
  });
});

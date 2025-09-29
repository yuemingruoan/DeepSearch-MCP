import { config as loadEnv } from "dotenv";
import { DeepSearchAgent } from "../deepsearch_agents/deepsearch.js";

async function main() {
  loadEnv();

  const agent = new DeepSearchAgent();
  const query = process.argv[2] ?? "OpenAI 最新发布";
  const topK = Number(process.argv[3] ?? 3);

  console.log(`开始调用 DeepSearchAgent，查询="${query}"，top_k=${topK}`);

  const start = Date.now();
  try {
    const result = await agent.search(query, { top_k: topK });
    const duration = ((Date.now() - start) / 1000).toFixed(2);

    console.log(`调用成功，耗时 ${duration}s，命中条数：${result.items.length}`);
    result.items.forEach((item, index) => {
      console.log(`\n[${index + 1}] ${item.title}`);
      console.log(`  URL: ${item.url}`);
      console.log(`  Score: ${item.score}`);
      console.log(`  Snippet: ${item.snippet}`);
    });
    console.log(`\nmetadata:`, result.metadata);
    console.log(`usage:`, result.usage);
  } catch (error) {
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.error(`调用失败，耗时 ${duration}s`);
    console.error(error);
    if (error instanceof Error && error.cause) {
      console.error("cause:", error.cause);
    }
  } finally {
    agent.close();
  }
}

main().catch((error) => {
  console.error("脚本执行异常:", error);
  process.exit(1);
});

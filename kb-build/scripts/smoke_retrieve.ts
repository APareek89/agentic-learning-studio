import "dotenv/config";
import { rawPool } from "../../src/lib/db";
import { retrieve } from "../../src/rag/retrieve";

const queries = [
  "how does LangGraph handle state",
  "RAG chunking strategies",
  "MCP server lifecycle tools resources prompts",
  "vLLM paged attention KV cache",
  "prompt injection defense for tools",
  "LoRA QLoRA preference tuning",
  "vector database pgvector qdrant pinecone",
  "LLM evaluation with Ragas and promptfoo",
];

async function main() {
  const pool = rawPool();
  if (!pool) throw new Error("DATABASE_URL is required.");
  const count = await pool.query("select count(*)::int as chunks from chunks");
  console.log(`chunks=${count.rows[0].chunks}`);

  for (const query of queries) {
    const result = await retrieve(query, 5);
    console.log(`\nQUERY: ${query}`);
    console.log(`coverage=${result.coverage}`);
    for (const [index, chunk] of result.chunks.entries()) {
      console.log(`${index + 1}. ${chunk.title ?? "(untitled)"} | ${chunk.category ?? ""} | ${chunk.url ?? ""}`);
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
